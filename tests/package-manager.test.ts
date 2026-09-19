import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  checkRepositoryFacts,
  commandManagers,
  declaredManager,
  declaredManagers,
  lockManagers,
  packageDirectories,
  resolveManagers,
  toolchainPins,
  workspaceMembers
} from '../scripts/repo-facts'

type Item = Record<string, unknown>

/** A pnpm workspace that also lists a package declaring bun for itself — a real repository shape. */
function repository(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'package-manager-'))
  mkdirSync(join(root, '.git'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const WORKSPACE = {
  'package.json': JSON.stringify({ name: 'root', packageManager: 'pnpm@9.0.0' }),
  'pnpm-workspace.yaml': 'packages:\n  - site\n',
  'pnpm-lock.yaml':
    "lockfileVersion: '9.0'\n\nimporters:\n\n  .: {}\n\n  site:\n    dependencies: {}\n\npackages: {}\n",
  'site/package.json': JSON.stringify({ name: 'site', packageManager: 'bun@1.4.2' }),
  'site/bun.lock': '{}'
}

async function check(contract: Item, extra: Record<string, string> = {}) {
  const root = repository({ ...WORKSPACE, ...extra })
  try {
    const path = join(root, 'change.sdd.md')
    writeFileSync(
      path,
      `# Change\n\n<!-- sdd-contract:start -->\n\`\`\`json\n${JSON.stringify(contract)}\n\`\`\`\n<!-- sdd-contract:end -->\n`
    )
    return await checkRepositoryFacts(path)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const base = (method: string) => ({
  ownership: { packages: ['site'] },
  requirements: [{ id: 'XQ01', kind: 'must-ship', title: 'core', acceptance: ['YS01'] }],
  acceptance: [{ id: 'YS01', requirement_ids: ['XQ01'], packages: ['site'], method }]
})

test('the package s own manifest decides its manager, not the workspace that lists it', () => {
  const root = repository(WORKSPACE)
  try {
    expect(declaredManager(root, 'site')).toBe('bun')
    expect(declaredManager(root, '.')).toBe('pnpm')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a workspace listing does not outweigh the package s own declaration', async () => {
  // Not a tie to hand back: a packageManager field plus the package's own lockfile speaks about
  // this package, while a workspace list speaks about the workspace. The skill resolves it, because
  // an author given two supported answers picks whichever file they read first.
  const report = await check(base('bun test'))
  expect(report.issues.map((issue) => issue.code)).not.toContain('PACKAGE_MANAGER_AMBIGUOUS')
  expect(report.valid).toBe(true)
  const site = (report.facts.packages as Item[]).find((entry) => entry.dir === 'site')!
  expect(site.declared_manager).toBe('bun')
  // The losing claim is still recorded: a lockfile that exists still exists.
  expect(site.superseded_managers).toEqual(['pnpm'])
})

test('a declared command using the wrong manager fails by name', async () => {
  const wrong = (await check(base('pnpm install --ignore-scripts && pnpm test'))).issues
  expect(wrong.map((issue) => issue.code)).toContain('COMMAND_PACKAGE_MANAGER_MISMATCH')
  expect(wrong.find((i) => i.code === 'COMMAND_PACKAGE_MANAGER_MISMATCH')!.detail).toContain(
    'runs pnpm against site, which declares bun'
  )
  // The declared manager passes, and so does its bunx form.
  const right = (await check(base('bunx vitest run'))).issues.map((issue) => issue.code)
  expect(right).not.toContain('COMMAND_PACKAGE_MANAGER_MISMATCH')
  // A command that names no package manager is not second-guessed.
  const plain = (await check(base('node_modules/.bin/vitest run'))).issues.map((i) => i.code)
  expect(plain).not.toContain('COMMAND_PACKAGE_MANAGER_MISMATCH')
})

/** A uv workspace whose member declares poetry for itself — the same shape in another ecosystem. */
const PYTHON = {
  'pyproject.toml': '[tool.uv.workspace]\nmembers = ["svc"]\n',
  'uv.lock': 'version = 1\n',
  'svc/pyproject.toml': '[project]\nname = "svc"\n\n[tool.poetry]\nname = "svc"\n',
  'svc/poetry.lock': '# poetry\n'
}

async function checkPython(method: string, extra: Record<string, string> = {}) {
  const root = repository({ ...PYTHON, ...extra })
  try {
    const path = join(root, 'change.sdd.md')
    const contract = {
      ownership: { packages: ['svc'] },
      requirements: [{ id: 'XQ01', kind: 'must-ship', title: 'core', acceptance: ['YS01'] }],
      acceptance: [{ id: 'YS01', requirement_ids: ['XQ01'], packages: ['svc'], method }]
    }
    writeFileSync(
      path,
      `# Change\n\n<!-- sdd-contract:start -->\n\`\`\`json\n${JSON.stringify(contract)}\n\`\`\`\n<!-- sdd-contract:end -->\n`
    )
    return await checkRepositoryFacts(path)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('precedence is not JavaScript-specific: a Python package s own tool table wins too', async () => {
  const report = await checkPython('poetry run pytest')
  const svc = (report.facts.packages as Item[]).find((entry) => entry.dir === 'svc')!
  expect(svc.declared_manager).toBe('poetry')
  // Both lockfiles are named by their own tool; collapsing them to "unknown" hid the conflict.
  expect(svc.manager_tools).toEqual(['poetry', 'uv'])
  expect(svc.superseded_managers).toEqual(['uv'])
  expect(report.issues.map((issue) => issue.code)).not.toContain('COMMAND_PACKAGE_MANAGER_MISMATCH')
  const wrong = await checkPython('uv run pytest')
  expect(wrong.issues.find((i) => i.code === 'COMMAND_PACKAGE_MANAGER_MISMATCH')!.detail).toContain(
    'runs uv against svc, which declares poetry'
  )
})

test('a manager name after the head of a command is its subcommand, not a second manager', () => {
  // `uv pip install` is uv installing. Reading every manager-shaped word called that a pip run.
  expect(commandManagers('uv pip install -r requirements.txt')).toEqual(['uv'])
  expect(commandManagers('poetry run pip list')).toEqual(['poetry'])
  expect(commandManagers('python -m pip install -e .')).toEqual(['pip'])
  expect(commandManagers('NPM_CONFIG_USERCONFIG=/x/.npmrc pnpm install')).toEqual(['pnpm'])
  expect(commandManagers('./gradlew :app:test')).toEqual(['gradle'])
  expect(commandManagers('pytest -q')).toEqual([])
})

test('ecosystems that do not compete for the same install are not compared', async () => {
  // A Rust crate whose acceptance drives a JS harness is doing a different job, not the wrong one.
  const report = await checkPython('bun run bench.ts', {
    'svc/Cargo.toml': '[package]\nname = "svc"\n'
  })
  expect(report.issues.map((issue) => issue.code)).not.toContain('COMMAND_PACKAGE_MANAGER_MISMATCH')
  const svc = (report.facts.packages as Item[]).find((entry) => entry.dir === 'svc')!
  // Two ecosystems declared, so no single answer — but each is still stated.
  expect(svc.declared_managers).toEqual({ python: 'poetry', rust: 'cargo' })
  expect(svc.declared_manager).toBeNull()
})

test('a build file is a real choice on the JVM, where Rust and Go have nothing to choose', async () => {
  // Rust and Go declare truthfully, but their ecosystem holds one tool, so nothing can disagree.
  const rust = repository({
    'Cargo.toml': '[workspace]\nmembers = ["crates/engine"]\n',
    'Cargo.lock': 'version = 3\n',
    'crates/engine/Cargo.toml': '[package]\nname = "engine"\nversion = "0.1.0"\n'
  })
  try {
    expect(declaredManagers(rust, 'crates/engine')).toEqual({ rust: 'cargo' })
  } finally {
    rmSync(rust, { recursive: true, force: true })
  }
  // A module carrying its own pom.xml under a Gradle settings file is the bun-inside-pnpm shape.
  const jvm = {
    'settings.gradle': "rootProject.name = 'root'\ninclude 'svc'\n",
    'build.gradle': 'plugins { id "java" }\n',
    'svc/pom.xml': '<project><artifactId>svc</artifactId></project>\n'
  }
  const root = repository(jvm)
  try {
    expect(declaredManagers(root, 'svc')).toEqual({ jvm: 'mvn' })
    expect(resolveManagers(root, 'svc')).toEqual({ jvm: 'mvn' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
  // Both build files in one directory is undecided, and the root does not get to break that tie:
  // asserting gradle there would flag a correct `mvn` command on a module that never chose.
  const both = repository({ ...jvm, 'svc/build.gradle': 'plugins { id "java" }\n' })
  try {
    expect(declaredManagers(both, 'svc')).toEqual({})
    expect(resolveManagers(both, 'svc')).toEqual({})
    // Silence is different: a package that states nothing still inherits the root's answer.
    expect(resolveManagers(both, 'other')).toEqual({ jvm: 'gradle' })
  } finally {
    rmSync(both, { recursive: true, force: true })
  }
  expect(commandManagers('mvn -pl svc test')).toEqual(['mvn'])
  expect(commandManagers('./mvnw verify')).toEqual(['mvn'])
})

/** Runs the check against a scratch repository and returns the one owned package's facts. */
async function facts(files: Record<string, string>, pkg: string, method: string) {
  const root = repository(files)
  try {
    const path = join(root, 'change.sdd.md')
    const contract = {
      ownership: { packages: [pkg] },
      requirements: [{ id: 'XQ01', kind: 'must-ship', title: 'core', acceptance: ['YS01'] }],
      acceptance: [{ id: 'YS01', requirement_ids: ['XQ01'], packages: [pkg], method }]
    }
    writeFileSync(
      path,
      `# Change\n\n<!-- sdd-contract:start -->\n\`\`\`json\n${JSON.stringify(contract)}\n\`\`\`\n<!-- sdd-contract:end -->\n`
    )
    const report = await checkRepositoryFacts(path)
    return {
      package: (report.facts.packages as Item[])[0],
      codes: report.issues.map((issue) => issue.code)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const MAVEN_UNDER_GRADLE = {
  'settings.gradle': "rootProject.name = 'platform'\ninclude 'svc'\n",
  'build.gradle': 'plugins { id "java" }\n',
  'svc/pom.xml':
    '<project><parent><artifactId>platform</artifactId></parent><artifactId>payments-core</artifactId></project>\n'
}

test('Maven and Gradle carry their claim in a member list, having no lockfile to carry it', async () => {
  const seen = await facts(MAVEN_UNDER_GRADLE, 'payments-core', 'mvn -pl svc test')
  // The module is named by its own artifactId, with the parent block's stripped first.
  expect(seen.package!.dir).toBe('svc')
  expect(seen.package!.declared_managers).toEqual({ jvm: 'mvn' })
  // The overridden claim is still a claim: without the member list it would be invisible, because
  // there is no gradle.lockfile in `svc` to record it the way a pnpm lockfile would.
  expect(seen.package!.claimed_by).toEqual(['./settings.gradle:gradle'])
  expect(seen.package!.superseded_managers).toEqual(['gradle'])
  expect(seen.codes).not.toContain('COMMAND_PACKAGE_MANAGER_MISMATCH')
  const wrong = await facts(MAVEN_UNDER_GRADLE, 'payments-core', './gradlew :svc:test')
  expect(wrong.codes).toContain('COMMAND_PACKAGE_MANAGER_MISMATCH')
})

test('a subproject declared only in its parent s build file is still a package that can be owned', async () => {
  // sbt and Gradle subprojects hold no manifest. Resolving the name to nothing would not fail the
  // check — it would skip the package the contract asked about, and report valid.
  const seen = await facts(
    {
      'build.sbt': 'lazy val core = project.in(file("modules/core"))\n',
      'project/build.properties': 'sbt.version=1.10.0\n',
      'modules/core/src/main/scala/A.scala': 'object A\n'
    },
    'core',
    'sbt core/test'
  )
  expect(seen.package!.dir).toBe('modules/core')
  expect(seen.package!.declared_managers).toEqual({ jvm: 'sbt' })
  const root = repository({ 'settings.gradle': "include ':api:http', 'web'\n" })
  try {
    expect(workspaceMembers(root, '.', 'settings.gradle')).toEqual(['api/http', 'web'])
    expect(packageDirectories(root).get('http')).toBe('api/http')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('Bazel is recorded without being asserted over the ecosystems it drives', async () => {
  // rules_js really does consume a pnpm lockfile, so `bazel test` against a pnpm package is not a
  // wrong installer. Its own ecosystem records the fact and compares it only with itself.
  const seen = await facts(
    {
      'MODULE.bazel': 'module(name = "app")\n',
      'package.json': JSON.stringify({ name: 'root', packageManager: 'pnpm@9.0.0' }),
      'pnpm-workspace.yaml': 'packages:\n  - site\n',
      'pnpm-lock.yaml':
        "lockfileVersion: '9.0'\n\nimporters:\n\n  .: {}\n\n  site:\n    dependencies: {}\n\npackages: {}\n",
      'site/package.json': JSON.stringify({ name: 'site' }),
      'site/BUILD.bazel': 'js_library(name = "site")\n'
    },
    'site',
    'bazel test //site:test'
  )
  expect(seen.package!.declared_managers).toEqual({ bazel: 'bazel', node: 'pnpm' })
  expect(seen.codes).not.toContain('COMMAND_PACKAGE_MANAGER_MISMATCH')
  expect(commandManagers('bazelisk build //x')).toEqual(['bazel'])
  expect(commandManagers('mill __.test')).toEqual(['mill'])
  expect(commandManagers('sbt core/test')).toEqual(['sbt'])
})

test('a build output directory does not declare a Bazel module on a case-insensitive filesystem', () => {
  // macOS resolves `BUILD` to `build/`, and `existsSync` is satisfied by a directory either way.
  const root = repository({ 'site/package.json': JSON.stringify({ name: 'site' }) })
  try {
    mkdirSync(join(root, 'site/build'))
    expect(declaredManagers(root, 'site')).toEqual({})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a package s own lockfile declares it when its manifest names no manager', async () => {
  // The `packageManager` field is not the only way a directory chooses: a package carrying its own
  // bun.lock under a pnpm workspace has chosen bun just as plainly, and inheriting the workspace's
  // pnpm reproduces exactly the failure this rule exists to stop.
  const own = await facts(
    {
      'package.json': JSON.stringify({ name: 'root', packageManager: 'pnpm@9.0.0' }),
      'pnpm-workspace.yaml': 'packages:\n  - site\n',
      'pnpm-lock.yaml':
        "lockfileVersion: '9.0'\n\nimporters:\n\n  .: {}\n\n  site:\n    dependencies: {}\n\npackages: {}\n",
      'site/package.json': JSON.stringify({ name: 'site' }),
      'site/bun.lock': '{}'
    },
    'site',
    'pnpm --filter site test'
  )
  expect(own.package!.declared_managers).toEqual({ node: 'bun' })
  expect(own.package!.superseded_managers).toEqual(['pnpm'])
  expect(own.codes).toContain('COMMAND_PACKAGE_MANAGER_MISMATCH')
  // Two lockfiles of one ecosystem in one directory is a stray, not a choice. It stays contested,
  // and a contested ecosystem is not checked rather than being decided by whichever file sorts first.
  const stray = await facts(
    {
      'package.json': JSON.stringify({ name: 'root', packageManager: 'pnpm@9.0.0' }),
      'site/package.json': JSON.stringify({ name: 'site' }),
      'site/bun.lock': '{}',
      'site/package-lock.json': '{}'
    },
    'site',
    'pnpm --filter site test'
  )
  expect(stray.package!.declared_managers).toEqual({})
  expect(stray.codes).not.toContain('COMMAND_PACKAGE_MANAGER_MISMATCH')
})

test('each of the four primary ecosystems is read the way it actually declares itself', async () => {
  // Python: pdm keeps no tool table in a plain `[project]` manifest, so its lockfile is the choice.
  const python = await facts(
    {
      'pyproject.toml': '[tool.uv.workspace]\nmembers = ["svc"]\n',
      'uv.lock': 'version = 1\n',
      'svc/pyproject.toml': '[project]\nname = "svc"\n',
      'svc/pdm.lock': '# pdm\n'
    },
    'svc',
    'uv run pytest'
  )
  expect(python.package!.declared_managers).toEqual({ python: 'pdm' })
  expect(python.codes).toContain('COMMAND_PACKAGE_MANAGER_MISMATCH')
  // A setuptools package predating pyproject still names itself, in setup.cfg.
  const legacy = repository({
    'setup.cfg': '[metadata]\nname = legacy_pkg\n',
    Pipfile: '[packages]\n'
  })
  try {
    expect(packageDirectories(legacy).get('legacy_pkg')).toBe('.')
    expect(declaredManagers(legacy, '.')).toEqual({ python: 'pipenv' })
  } finally {
    rmSync(legacy, { recursive: true, force: true })
  }
  // Rust: `exclude` carves a directory back out of a `members` glob, so the two cannot be compared
  // pattern by pattern — `crates/scratch` is excluded by name while `crates/*` includes it by shape.
  const rust = repository({
    'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\nexclude = ["crates/scratch"]\n',
    'Cargo.lock': 'version = 3\n',
    'crates/engine/Cargo.toml': '[package]\nname = "engine"\nversion = "0.1.0"\n',
    'crates/scratch/Cargo.toml': '[package]\nname = "scratch"\nversion = "0.1.0"\n'
  })
  try {
    expect(lockManagers(rust, 'crates/engine')).toEqual(['Cargo.lock'])
    expect(lockManagers(rust, 'crates/scratch')).toEqual([])
  } finally {
    rmSync(rust, { recursive: true, force: true })
  }
  // Go: the parenthesised `use` block carries no keyword per line, and `./` is conventional only.
  const go = repository({ 'go.work': 'go 1.22\n\nuse (\n\t./a\n\tb/c\n)\n\nuse ./d\n' })
  try {
    expect(workspaceMembers(go, '.', 'go.work')).toEqual(['a', 'b/c', 'd'])
  } finally {
    rmSync(go, { recursive: true, force: true })
  }
})

test('Deno is recorded beside node rather than competing with it', async () => {
  // A `deno.json` next to a `package.json` is a real hybrid; reporting `pnpm test` as the wrong
  // manager there would be a false one.
  const seen = await facts(
    {
      'package.json': JSON.stringify({ name: 'root', packageManager: 'pnpm@9.0.0' }),
      'pnpm-lock.yaml': "lockfileVersion: '9.0'\n\nimporters:\n\n  .: {}\n\npackages: {}\n",
      'deno.json': JSON.stringify({ name: '@scope/app' }),
      'deno.lock': '{}'
    },
    'root',
    'pnpm test && deno task check'
  )
  expect(seen.package!.declared_managers).toEqual({ node: 'pnpm', deno: 'deno' })
  expect(seen.codes).not.toContain('COMMAND_PACKAGE_MANAGER_MISMATCH')
})

test('the JVM pins its toolchain in the wrapper the build actually downloads', () => {
  // `.java-version` says what a shell selects; the wrapper properties say what the build fetches,
  // and a repository commonly carries both at different granularity. Both are recorded.
  const maven = repository({
    'pom.xml': '<project><artifactId>billing</artifactId></project>\n',
    '.java-version': '21\n',
    '.sdkmanrc': 'java=21.0.3-tem\nmaven=3.9.6\n',
    '.mvn/wrapper/maven-wrapper.properties':
      'distributionUrl=https://x/apache-maven-3.9.6-bin.zip\n'
  })
  try {
    const pins = toolchainPins(maven).map((pin) => `${pin.tool}=${pin.version}`)
    expect(pins).toContain('java=21')
    // SDKMAN spells Maven by its product name; every command and every other source says `mvn`.
    expect(pins).toContain('mvn=3.9.6')
    expect(packageDirectories(maven).get('billing')).toBe('.')
  } finally {
    rmSync(maven, { recursive: true, force: true })
  }
  const gradle = repository({
    'settings.gradle': "rootProject.name = 'platform'\ninclude ':app'\nincludeBuild 'tooling'\n",
    'build.gradle': 'plugins { id "java" }\n',
    'gradle/wrapper/gradle-wrapper.properties': 'distributionUrl=https\\://x/gradle-8.7-bin.zip\n',
    'app/build.gradle': '\n'
  })
  try {
    expect(toolchainPins(gradle).map((pin) => `${pin.tool}=${pin.version}`)).toContain('gradle=8.7')
    // A composite build claims its directory the same way an included subproject does.
    expect(workspaceMembers(gradle, '.', 'settings.gradle')).toEqual(['app', 'tooling'])
    expect(declaredManagers(gradle, 'app')).toEqual({ jvm: 'gradle' })
  } finally {
    rmSync(gradle, { recursive: true, force: true })
  }
})

test('ecosystems below the primary four are read well enough to be true', () => {
  const cases: [string, Record<string, string>, Record<string, string>, string | undefined][] = [
    ['ruby', { Gemfile: "source 'x'\n", 'billing.gemspec': 'x\n' }, { ruby: 'bundler' }, 'billing'],
    [
      'php',
      { 'composer.json': JSON.stringify({ name: 'acme/site' }) },
      { php: 'composer' },
      'acme/site'
    ],
    ['dotnet', { 'Api.csproj': '<Project/>\n' }, { dotnet: 'dotnet' }, 'Api'],
    [
      'swift',
      { 'Package.swift': 'let package = Package(name: "Networking")\n' },
      { swift: 'swift' },
      'Networking'
    ],
    // A pubspec depending on the Flutter SDK is driven by `flutter pub`, not `dart pub`.
    [
      'flutter',
      { 'pubspec.yaml': 'name: my_app\ndependencies:\n  flutter:\n    sdk: flutter\n' },
      { dart: 'flutter' },
      'my_app'
    ],
    ['dart', { 'pubspec.yaml': 'name: cli\n' }, { dart: 'dart' }, 'cli'],
    [
      'elixir',
      { 'mix.exs': 'defmodule X do\n  def project, do: [app: :my_app]\nend\n' },
      { elixir: 'mix' },
      'my_app'
    ],
    ['haskell', { 'billing.cabal': 'name: billing\n' }, { haskell: 'cabal' }, 'billing'],
    // `Project.toml` is a common name, so Julia's own marker is required before claiming it.
    ['julia', { 'Project.toml': 'name = "Solver"\nuuid = "1234"\n' }, { julia: 'julia' }, 'Solver'],
    ['not julia', { 'Project.toml': 'title = "docs"\n' }, {}, undefined],
    ['zig', { 'build.zig.zon': '.{ .name = .app }\n' }, { zig: 'zig' }, 'app']
  ]
  for (const [label, files, declared, name] of cases) {
    const root = repository(files)
    try {
      expect(`${label}: ${JSON.stringify(declaredManagers(root, '.'))}`).toBe(
        `${label}: ${JSON.stringify(declared)}`
      )
      if (name) expect(packageDirectories(root).get(name)).toBe('.')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
  for (const [command, tool] of [
    ['bundle exec rspec', 'bundler'],
    ['composer install', 'composer'],
    ['dotnet test', 'dotnet'],
    ['swift test', 'swift'],
    ['flutter test', 'flutter'],
    ['mix test', 'mix'],
    ['stack test', 'stack'],
    ['zig build test', 'zig']
  ])
    expect(commandManagers(command!)).toEqual([tool!])
})

test('Nix drives the other ecosystems rather than competing with them', async () => {
  // A flake that builds a pnpm package does not make `pnpm install` the wrong manager.
  const seen = await facts(
    {
      'flake.nix': '{}\n',
      'flake.lock': '{}',
      'package.json': JSON.stringify({ name: 'app', packageManager: 'pnpm@9.0.0' })
    },
    'app',
    'nix develop -c pnpm test'
  )
  expect(seen.package!.declared_managers).toEqual({ node: 'pnpm', nix: 'nix' })
  expect(seen.codes).not.toContain('COMMAND_PACKAGE_MANAGER_MISMATCH')
})
