import { existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { hasFile, hasSuffix, filesIn, matchesMembers, read, type Item } from './repository.ts'

/**
 * Which package manager governs a directory, and which one a command actually invokes. The whole
 * module exists for one rule: a declaration in a package's own manifest speaks about that package,
 * while a workspace file above it speaks about the workspace, so the nearer and more specific one
 * wins. Reading the repository root instead is how a bun package acquires a `pnpm install`.
 */
/** Lockfile name → the tool that writes it. A command uses the tool, not the file. */
export const LOCK_TOOL: Readonly<Record<string, string>> = {
  'pnpm-lock.yaml': 'pnpm',
  'bun.lock': 'bun',
  'bun.lockb': 'bun',
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
  'uv.lock': 'uv',
  'poetry.lock': 'poetry',
  'Pipfile.lock': 'pipenv',
  'pdm.lock': 'pdm',
  // Rye writes `requirements.lock` beside `requirements-dev.lock`; the first is the project's.
  'requirements.lock': 'rye',
  'deno.lock': 'deno',
  'Gemfile.lock': 'bundler',
  'composer.lock': 'composer',
  'packages.lock.json': 'dotnet',
  'paket.lock': 'paket',
  'Package.resolved': 'swift',
  'Podfile.lock': 'pod',
  'pubspec.lock': 'dart',
  'mix.lock': 'mix',
  'cabal.project.freeze': 'cabal',
  'stack.yaml.lock': 'stack',
  'Manifest.toml': 'julia',
  'conan.lock': 'conan',
  'flake.lock': 'nix',
  'Cargo.lock': 'cargo',
  'go.sum': 'go',
  'go.work.sum': 'go',
  'gradle.lockfile': 'gradle'
}

/**
 * Which ecosystem a tool installs for. Precedence is only meaningful inside one: pnpm and bun
 * compete to install the same `node_modules`, while uv and bun do not compete at all. A package
 * that runs `bun run bench` against a Rust crate is doing a different job, not the wrong one, so
 * the mismatch check and the superseded list are both scoped by this map.
 */
export const ECOSYSTEM: Readonly<Record<string, string>> = {
  pnpm: 'node',
  npm: 'node',
  yarn: 'node',
  bun: 'node',
  uv: 'python',
  poetry: 'python',
  pipenv: 'python',
  pip: 'python',
  pdm: 'python',
  rye: 'python',
  hatch: 'python',
  cargo: 'rust',
  go: 'go',
  gradle: 'jvm',
  mvn: 'jvm',
  sbt: 'jvm',
  mill: 'jvm',
  // Deno resolves TypeScript on its own terms. A repository may be Deno-only or may hold a
  // `deno.json` beside a `package.json` and use both, so putting it in the node bucket would
  // report `pnpm install` in a hybrid project as the wrong manager. Its own ecosystem records it
  // and compares it only with itself.
  deno: 'deno',
  // Ecosystems below the four this skill is built around. They are read so their facts are true and
  // a command naming the wrong one is caught, not because their conventions are modelled deeply.
  bundler: 'ruby',
  composer: 'php',
  dotnet: 'dotnet',
  paket: 'dotnet',
  swift: 'swift',
  pod: 'swift',
  dart: 'dart',
  flutter: 'dart',
  mix: 'elixir',
  cabal: 'haskell',
  stack: 'haskell',
  julia: 'julia',
  zig: 'zig',
  conan: 'cpp',
  vcpkg: 'cpp',
  // Nix, like Bazel, drives the others rather than competing with them: a flake that builds a pnpm
  // package does not make `pnpm install` wrong.
  nix: 'nix',
  // Bazel is not a JVM tool that competes with Gradle for one install: it subsumes whole
  // ecosystems, and a Bazel repository legitimately keeps a pnpm lockfile that rules_js consumes.
  // Its own ecosystem means it is recorded and compared only with itself, never asserted over npm
  // or Maven — a precedence this check has no basis to claim.
  bazel: 'bazel'
}

/**
 * How each manifest states the manager for its own directory. JavaScript has a dedicated field;
 * Python has no equivalent, so the tool's own configuration table is the statement it does make —
 * `[tool.uv]` in a `pyproject.toml` is that file saying uv manages this project. Rust and Go have
 * one manager each, so their manifest's presence is the declaration — truthful, but nothing inside
 * those ecosystems can disagree with it. The JVM is where a build file is a real choice: a module
 * carrying a `pom.xml` under a Gradle settings file is the same shape as a bun package inside a
 * pnpm workspace.
 *
 * A directory may carry more than one statement for one ecosystem: a Python project built with the
 * poetry backend and installed with uv is a real shape, not a contradiction, and a module holding
 * both a `pom.xml` and a `build.gradle` is genuinely undecided. Competing statements are broken by
 * the lockfile sitting beside them, and when that does not decide it the directory declares nothing
 * rather than guessing — an ecosystem with no declaration is simply not checked.
 */
const DECLARATIONS: readonly {
  /** Fixed manifest name, or — for ecosystems that name the file after the project — a suffix. */
  manifest?: string
  suffix?: string
  read: (text: string) => string[]
}[] = [
  {
    manifest: 'package.json',
    read: (text) => {
      try {
        const value = (JSON.parse(text) as Item).packageManager
        return typeof value === 'string' ? [value.split('@')[0]!] : []
      } catch {
        return []
      }
    }
  },
  {
    manifest: 'pyproject.toml',
    read: (text) =>
      ['uv', 'poetry', 'pdm', 'rye', 'hatch', 'pipenv'].filter((tool) =>
        new RegExp(`^\\[tool\\.${tool}(?:[.\\]])`, 'm').test(text)
      )
  },
  { manifest: 'deno.json', read: () => ['deno'] },
  { manifest: 'deno.jsonc', read: () => ['deno'] },
  // `Pipfile` is pipenv's manifest; nothing else writes one.
  { manifest: 'Pipfile', read: () => ['pipenv'] },
  { manifest: 'Cargo.toml', read: () => ['cargo'] },
  { manifest: 'go.mod', read: () => ['go'] },
  { manifest: 'pom.xml', read: () => ['mvn'] },
  { manifest: 'build.gradle', read: () => ['gradle'] },
  { manifest: 'build.gradle.kts', read: () => ['gradle'] },
  { manifest: 'build.sbt', read: () => ['sbt'] },
  { manifest: 'build.sc', read: () => ['mill'] },
  { manifest: 'build.mill', read: () => ['mill'] },
  { manifest: 'MODULE.bazel', read: () => ['bazel'] },
  { manifest: 'WORKSPACE.bazel', read: () => ['bazel'] },
  { manifest: 'WORKSPACE', read: () => ['bazel'] },
  { manifest: 'BUILD.bazel', read: () => ['bazel'] },
  { manifest: 'BUILD', read: () => ['bazel'] },
  { manifest: 'Gemfile', read: () => ['bundler'] },
  { suffix: '.gemspec', read: () => ['bundler'] },
  { manifest: 'composer.json', read: () => ['composer'] },
  // .NET names the project file after the project; `paket.dependencies` replaces NuGet restore.
  { suffix: '.csproj', read: () => ['dotnet'] },
  { suffix: '.fsproj', read: () => ['dotnet'] },
  { suffix: '.sln', read: () => ['dotnet'] },
  { manifest: 'paket.dependencies', read: () => ['paket'] },
  { manifest: 'Package.swift', read: () => ['swift'] },
  { manifest: 'Podfile', read: () => ['pod'] },
  // A pubspec that depends on the Flutter SDK is driven by `flutter pub`, not `dart pub`.
  {
    manifest: 'pubspec.yaml',
    read: (text) => [/^\s*sdk:\s*flutter\s*$/m.test(text) ? 'flutter' : 'dart']
  },
  { manifest: 'mix.exs', read: () => ['mix'] },
  { manifest: 'stack.yaml', read: () => ['stack'] },
  { manifest: 'cabal.project', read: () => ['cabal'] },
  { suffix: '.cabal', read: () => ['cabal'] },
  // `Project.toml` is a common enough name that Julia's own marker is required before claiming it.
  {
    manifest: 'Project.toml',
    read: (text) => (/^\s*uuid\s*=|^\[deps\]/m.test(text) ? ['julia'] : [])
  },
  { manifest: 'build.zig.zon', read: () => ['zig'] },
  { manifest: 'build.zig', read: () => ['zig'] },
  { manifest: 'conanfile.txt', read: () => ['conan'] },
  { manifest: 'conanfile.py', read: () => ['conan'] },
  { manifest: 'vcpkg.json', read: () => ['vcpkg'] },
  { manifest: 'flake.nix', read: () => ['nix'] }
]

/**
 * The managers a directory declares for itself, one per ecosystem, from its own manifests. This is
 * the authoritative statement: a workspace lockfile above it may also claim the package, and when
 * the two disagree the nearest declaration is what the package's own commands must obey. Reporting
 * only the lockfiles, as this check used to, hands the author a list where either answer looks
 * supported — which is how a bun package gets a `pnpm install`.
 */
function statements(root: string, packageDir: string): Map<string, string[]> {
  const at = (name: string) => join(root, packageDir === '.' ? name : `${packageDir}/${name}`)
  const holds = (name: string) => hasFile(join(root, packageDir), name)
  // Gather every statement first, grouped by ecosystem: two of them may come from two manifests
  // (`pom.xml` beside `build.gradle`) as readily as from two tables in one (`[tool.uv]` beside
  // `[tool.poetry]`), and both shapes have to reach the same tie-break.
  const stated = new Map<string, string[]>()
  for (const { manifest, suffix, read: parse } of DECLARATIONS) {
    // A suffix declaration is read from the first matching file; its content decides nothing that
    // its existence has not already decided, so which one is read does not matter.
    const file =
      manifest && holds(manifest)
        ? manifest
        : suffix && hasSuffix(join(root, packageDir), suffix)
          ? [...filesIn(join(root, packageDir))].find((name) => name.endsWith(suffix))
          : undefined
    if (!file) continue
    for (const tool of parse(read(at(file)))) {
      const ecosystem = ECOSYSTEM[tool]
      if (!ecosystem) continue
      const tools = stated.get(ecosystem) ?? []
      if (!tools.includes(tool)) tools.push(tool)
      stated.set(ecosystem, tools)
    }
  }
  // The lockfile beside the manifests says which competitor actually ran. An ecosystem whose
  // competitors it does not separate stays contested, which is a different answer from silence.
  for (const [ecosystem, tools] of stated)
    if (tools.length > 1)
      stated.set(
        ecosystem,
        tools.filter((tool) =>
          Object.entries(LOCK_TOOL).some(([lock, owner]) => owner === tool && holds(lock))
        )
      )
  // A lockfile in this directory is also a statement about this directory, and for an ecosystem no
  // manifest here speaks for it is the only one: a package carrying its own `bun.lock` under a pnpm
  // workspace has chosen bun just as plainly as one with a `packageManager` field, and inheriting
  // the workspace's pnpm would reproduce the failure this whole rule exists to stop. A manifest
  // field still wins over it — the field is the declaration, the lockfile is evidence of what ran.
  // Two lockfiles of one ecosystem in one directory is a stray, not a choice, and stays contested.
  const byLock = new Map<string, string[]>()
  for (const [lock, tool] of Object.entries(LOCK_TOOL)) {
    const ecosystem = ECOSYSTEM[tool]
    if (!ecosystem || stated.has(ecosystem) || !holds(lock)) continue
    const tools = byLock.get(ecosystem) ?? []
    if (!tools.includes(tool)) tools.push(tool)
    byLock.set(ecosystem, tools)
  }
  for (const [ecosystem, tools] of byLock) stated.set(ecosystem, tools)
  return stated
}

/** The managers a directory decides for itself: one per ecosystem it states exactly one tool for. */
export function declaredManagers(root: string, packageDir: string): Record<string, string> {
  const declared: Record<string, string> = {}
  for (const [ecosystem, tools] of statements(root, packageDir))
    if (tools.length === 1) declared[ecosystem] = tools[0]!
  return declared
}

/**
 * The manager governing each of a package's ecosystems, after the repository root is consulted for
 * the ecosystems the package says nothing about. A package that *did* speak and failed to decide is
 * not one of those: it stated something contradictory, and the root — a less specific claim — does
 * not get to break its tie. Leaving that ecosystem unresolved means it is not checked, which costs
 * a missed report; letting the root decide it would assert a manager for a module that never
 * declared one, which costs a false one against a correct document.
 */
export function resolveManagers(root: string, packageDir: string): Record<string, string> {
  const own = statements(root, packageDir)
  const resolved = declaredManagers(root, packageDir)
  for (const [ecosystem, tool] of Object.entries(declaredManagers(root, '.')))
    if (!own.has(ecosystem)) resolved[ecosystem] = tool
  return resolved
}

/**
 * The single manager a directory declares, when it declares exactly one. A directory that declares
 * for two ecosystems has no single answer, and saying "bun" about a directory that also declares uv
 * would be a claim about Python that nobody made.
 */
export function declaredManager(root: string, packageDir: string): string | undefined {
  const values = Object.values(declaredManagers(root, packageDir))
  return values.length === 1 ? values[0] : undefined
}

/**
 * Workspace files that list their members, with the ecosystem each speaks for. A workspace file is
 * a claim about a directory made from above it; the directory's own manifest is a claim about
 * itself, and the nearer one governs. Maven and Gradle have no lockfile to carry that claim, so
 * without reading their member lists a parent's choice is invisible and the loser goes unrecorded.
 */
const WORKSPACE_FILES: Readonly<Record<string, string>> = {
  'package.json': 'node',
  'pnpm-workspace.yaml': 'node',
  'Cargo.toml': 'rust',
  'pyproject.toml': 'python',
  'go.work': 'go',
  'pom.xml': 'jvm',
  'settings.gradle': 'jvm',
  'settings.gradle.kts': 'jvm',
  'build.sbt': 'jvm',
  'MODULE.bazel': 'bazel'
}

/** Member patterns one workspace file declares. Patterns, not paths: `packages/*` is a member list. */
export function workspaceMembers(root: string, dir: string, manifest: string): string[] {
  if (!hasFile(join(root, dir), manifest)) return []
  const text = read(join(root, dir === '.' ? manifest : `${dir}/${manifest}`))
  const quoted = (pattern: RegExp) =>
    [...(pattern.exec(text)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((match) => match[1]!)
  switch (manifest) {
    case 'package.json':
      try {
        const workspaces = (JSON.parse(text) as Item).workspaces
        return Array.isArray(workspaces) ? workspaces : (workspaces?.packages ?? [])
      } catch {
        return []
      }
    case 'pnpm-workspace.yaml':
      return [...text.matchAll(/^\s*-\s*['"]?([^'"\n]+?)['"]?\s*$/gm)].map((match) => match[1]!)
    case 'Cargo.toml': {
      // `exclude` carves directories back out of a `members` glob such as `crates/*`.
      return [
        ...quoted(/\[workspace\][\s\S]*?members\s*=\s*\[([^\]]*)\]/),
        ...quoted(/\[workspace\][\s\S]*?exclude\s*=\s*\[([^\]]*)\]/).map((member) => `!${member}`)
      ]
    }
    case 'pyproject.toml':
      return quoted(/\[tool\.uv\.workspace\][\s\S]*?members\s*=\s*\[([^\]]*)\]/)
    case 'go.work':
      // `use ./a`, and the parenthesised block form whose lines carry no `use` keyword. The `./`
      // prefix is conventional, not required, so it is stripped rather than demanded.
      return [...text.matchAll(/^\s*(?:use\s+)?(?!\()([^\s()]+)\s*$/gm)]
        .map((match) => match[1]!.replace(/^\.\//, ''))
        .filter((member) => member !== '.' && member !== 'use' && !/^go\s|^\d/.test(member))
    case 'pom.xml':
      // A reactor pom lists its modules by directory. `<packaging>pom</packaging>` marks it as an
      // aggregator rather than an artifact, but either kind may aggregate, so the list is what counts.
      return [...text.matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)].map((match) =>
        match[1]!.replace(/^\.\//, '')
      )
    case 'settings.gradle':
    case 'settings.gradle.kts':
      // `include ':a:b'` names a project path, not a directory path; the two coincide unless a
      // `projectDir` override says otherwise, which this does not attempt to follow.
      // `includeBuild` attaches a whole separate build; for the purpose of "who claims this
      // directory" it is the same claim as `include`.
      return [...text.matchAll(/^\s*include(?:Build)?\s*\(?([^\n)]*)/gm)].flatMap((statement) =>
        [...statement[1]!.matchAll(/['"]([^'"]+)['"]/g)].map((match) =>
          match[1]!.replace(/^:/, '').replace(/:/g, '/')
        )
      )
    case 'build.sbt':
      // `lazy val core = project.in(file("modules/core"))`
      return [...text.matchAll(/\bfile\(\s*"([^"]+)"\s*\)/g)].map((match) =>
        match[1]!.replace(/^\.\//, '')
      )
    case 'MODULE.bazel':
      // Bazel has no member list: every directory holding a BUILD file is a package of the module.
      return []
    default:
      return []
  }
}

/**
 * Build files above a directory that claim it as a member, with the manager each of them declares.
 * This is the losing side of the precedence rule, and recording it is the point: a claim that is
 * merely overridden still exists, and an author who reads only the repository root would have
 * followed it.
 */
export function workspaceClaims(
  root: string,
  packageDir: string
): { dir: string; file: string; manager: string }[] {
  if (packageDir === '.') return []
  const claims: { dir: string; file: string; manager: string }[] = []
  let dir = dirname(packageDir) === '.' ? '.' : dirname(packageDir)
  while (true) {
    const rel = relative(dir === '.' ? '' : dir, packageDir)
    const declared = declaredManagers(root, dir)
    for (const [file, ecosystem] of Object.entries(WORKSPACE_FILES)) {
      const manager = declared[ecosystem]
      if (!manager) continue
      if (matchesMembers(workspaceMembers(root, dir, file), rel))
        claims.push({ dir, file, manager })
    }
    if (dir === '.') break
    dir = dirname(dir) === '.' ? '.' : dirname(dir)
  }
  return claims
}

export function lockManagers(root: string, packageDir: string): string[] {
  const managers: string[] = []
  const locks = [
    'pnpm-lock.yaml',
    'bun.lock',
    'bun.lockb',
    'package-lock.json',
    'yarn.lock',
    'Cargo.lock',
    'go.sum',
    'go.work.sum',
    'uv.lock',
    'poetry.lock',
    'Pipfile.lock',
    'pdm.lock',
    'requirements.lock',
    'deno.lock',
    'gradle.lockfile',
    'Gemfile.lock',
    'composer.lock',
    'packages.lock.json',
    'paket.lock',
    'Package.resolved',
    'Podfile.lock',
    'pubspec.lock',
    'mix.lock',
    'cabal.project.freeze',
    'stack.yaml.lock',
    'Manifest.toml',
    'conan.lock',
    'flake.lock'
  ]
  let dir = packageDir
  while (true) {
    const rel = relative(dir === '.' ? '' : dir, packageDir === '.' ? '' : packageDir) || '.'
    for (const lock of locks) {
      const path = dir === '.' ? lock : `${dir}/${lock}`
      if (!existsSync(join(root, path))) continue
      if (dir === packageDir) {
        managers.push(path)
        continue
      }
      const text = read(join(root, path))
      let members: string[] = []
      if (lock === 'pnpm-lock.yaml') {
        const importers = /^importers:\n([\s\S]*?)(?:^\S|$(?![\s\S]))/m.exec(text)?.[1] ?? ''
        if (
          new RegExp(`^  ${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*$`, 'm').test(importers)
        )
          managers.push(path)
        continue
      }
      if (lock === 'bun.lock' && text.includes(`"${rel}": {`)) {
        managers.push(path)
        continue
      }
      if (lock === 'package-lock.json' && text.includes(`"${rel}": {`)) {
        managers.push(path)
        continue
      }
      // The lockfile names the manifest whose member list decides whether it reaches down here.
      const OWNER: Readonly<Record<string, string>> = {
        'yarn.lock': 'package.json',
        'bun.lockb': 'package.json',
        'Cargo.lock': 'Cargo.toml',
        'uv.lock': 'pyproject.toml',
        'go.work.sum': 'go.work'
      }
      const owner = OWNER[lock]
      if (owner) members = workspaceMembers(root, dir, owner)
      if (matchesMembers(members, rel)) managers.push(path)
    }
    if (dir === '.') break
    dir = dirname(dir) === '.' ? '.' : dirname(dir)
  }
  return managers
}

/**
 * The package managers a shell command actually invokes. Only the head of each segment counts: in
 * `uv pip install -r req.txt` the manager is uv and `pip` is its subcommand, so scanning for every
 * manager-shaped word anywhere in the line reports a uv project as running pip. Leading environment
 * assignments are stepped over, because the command that broke this was
 * `NPM_CONFIG_USERCONFIG=... pnpm install`.
 */
export function commandManagers(command: string): string[] {
  const ALIAS: Readonly<Record<string, string>> = {
    bunx: 'bun',
    npx: 'npm',
    uvx: 'uv',
    pip3: 'pip',
    gradlew: 'gradle',
    mvnw: 'mvn',
    maven: 'mvn',
    bazelisk: 'bazel',
    millw: 'mill',
    sbtn: 'sbt',
    bundle: 'bundler',
    'dotnet-test': 'dotnet',
    pubspec: 'dart',
    carthage: 'pod',
    nixpkgs: 'nix'
  }
  const found = new Set<string>()
  for (const raw of command.split(/&&|\|\||[;|]/)) {
    let rest = raw.trim().replace(/^[("'`\s]+/, '')
    // `VAR=value cmd` and `VAR="a b" cmd` both name `cmd`.
    while (/^\w+=(?:"[^"]*"|'[^']*'|\S*)\s+/.test(rest))
      rest = rest.replace(/^\w+=(?:"[^"]*"|'[^']*'|\S*)\s+/, '')
    // `python -m pip install` names pip, not python.
    rest = rest.replace(/^python3?\s+-m\s+/, '')
    const head = /^(?:\.\/)?([\w.-]+)/.exec(rest)?.[1]
    if (!head) continue
    const tool = ALIAS[head] ?? head
    if (ECOSYSTEM[tool]) found.add(tool)
  }
  return [...found]
}
