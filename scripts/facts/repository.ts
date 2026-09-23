import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

/**
 * What a repository shows about itself before any document is read: where the checkout is, which
 * files are product source, and which directories are packages. Everything here answers a question
 * the `initial` lifecycle event asks, and nothing here reads an SDD.
 */
export type Item = Record<string, any>
export type IIssue = { readonly code: string; readonly detail: string }

/** Directories that hold dependencies, VCS data or build output, never product sources. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '.venv',
  'venv',
  '__pycache__',
  // `vendor/` is Go's checked-in dependency tree; Python's tool caches and tox environments are
  // dependency copies for the same reason.
  'vendor',
  '.tox',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.eggs',
  '.react-router',
  'coverage',
  'out',
  '.gradle',
  '.next',
  '.turbo',
  // Dependency trees and build output of the ecosystems below the primary four. `deps` and
  // `_build` are Elixir's by convention and generic by name; a repository that keeps product
  // source under either of those names loses it from the scan, the same trade `build` already makes.
  '.idea',
  'obj',
  'Pods',
  '.dart_tool',
  '_build',
  'deps',
  '.stack-work',
  '.bundle',
  'dist-newstyle',
  'zig-out',
  '.zig-cache'
])

/** A manifest path declared as a write point, or edited in a `BZ` step section, triggers manager checks. */
export const MANIFESTS = [
  'package.json',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'build.gradle',
  'build.gradle.kts',
  'pom.xml',
  'build.sbt',
  'build.sc',
  'build.mill',
  'MODULE.bazel',
  'BUILD.bazel',
  'Gemfile',
  'composer.json',
  'Package.swift',
  'pubspec.yaml',
  'mix.exs',
  'build.zig.zon',
  'flake.nix'
]

/** Nearest ancestor holding `.git`, else the starting directory. */
export function repositoryRoot(start: string): string {
  let cursor = resolve(start)
  while (true) {
    if (existsSync(join(cursor, '.git'))) return cursor
    const parent = dirname(cursor)
    if (parent === cursor) return resolve(start)
    cursor = parent
  }
}

/** Repository-relative files under `base`, skipping dependency and build directories. */
export function walk(root: string, base = '.'): string[] {
  const result: string[] = []
  const visit = (dir: string) => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(join(root, dir), { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = dir === '.' ? entry.name : `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(path)
      } else if (entry.isFile()) result.push(path)
    }
  }
  if (existsSync(join(root, base)) && statSync(join(root, base)).isFile()) return [base]
  visit(base)
  return result
}

export const read = (path: string) => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/**
 * Whether a directory holds a regular file with exactly this name. `existsSync` answers neither
 * half: a directory satisfies it, and on a case-insensitive filesystem — the macOS default — a
 * lookup of `BUILD` finds a `build/` output directory, which is how a Vite bundle came to declare
 * a Bazel module. Build-file names are the case-sensitive part of several ecosystems' conventions,
 * so the directory listing is the only honest way to ask.
 *
 * Cached per directory: this command reads the repository once and never writes to it.
 */
const directoryFiles = new Map<string, Set<string>>()
export function filesIn(directory: string): Set<string> {
  let names = directoryFiles.get(directory)
  if (!names) {
    try {
      names = new Set(
        readdirSync(directory, { withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name)
      )
    } catch {
      names = new Set()
    }
    directoryFiles.set(directory, names)
  }
  return names
}
export function hasFile(directory: string, name: string): boolean {
  return filesIn(directory).has(name)
}
/** .NET, Haskell and Ruby name their manifest after the project, so only the suffix is fixed. */
export function hasSuffix(directory: string, suffix: string): boolean {
  for (const name of filesIn(directory)) if (name.endsWith(suffix)) return true
  return false
}

/** `*` matches one path segment, `**` any number; used for workspace member globs. */
export function globMatch(pattern: string, path: string): boolean {
  const clean = pattern.replace(/^\.\//, '').replace(/\/$/, '')
  const expression = clean
    .split('/')
    .map((part) =>
      part === '**' ? '.*' : part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')
    )
    .join('/')
  return new RegExp(`^${expression}$`).test(path)
}

/**
 * Whether a member list admits a directory. A `!pattern` entry removes what an earlier glob swept
 * in — Cargo spells this `exclude`, pnpm and yarn spell it inline — so the patterns cannot be
 * compared one at a time: `crates/scratch` is excluded by name while `crates/*` includes it by
 * shape, and only matching in order resolves that.
 */
export function matchesMembers(patterns: readonly string[], path: string): boolean {
  let admitted = false
  for (const pattern of patterns) {
    const negated = pattern.startsWith('!')
    if (globMatch(negated ? pattern.slice(1) : pattern, path)) admitted = !negated
  }
  return admitted
}

/** Package identity to repository-relative directory, from each ecosystem's manifest. */
export function packageDirectories(
  root: string,
  files = walk(root),
  // Gradle and sbt declare their subprojects in the parent's build file, and those directories hold
  // no manifest of their own. Reading a member list is a manager concern, so it is injected rather
  // than imported: discovery must not depend on precedence.
  members: (root: string, dir: string, manifest: string) => string[] = () => []
): Map<string, string> {
  const map = new Map<string, string>()
  for (const file of files) {
    const dir = dirname(file) === '.' ? '.' : dirname(file)
    const name = basename(file)
    const text = () => read(join(root, file))
    let identity: string | undefined
    if (name === 'package.json') {
      try {
        identity = JSON.parse(text()).name
      } catch {}
    } else if (name === 'Cargo.toml')
      identity = /\[package\][^[]*?\bname\s*=\s*"([^"]+)"/.exec(text())?.[1]
    else if (name === 'go.mod') identity = /^module\s+(\S+)/m.exec(text())?.[1]
    else if (name === 'pyproject.toml')
      identity = /\[(?:project|tool\.poetry)\][^[]*?\bname\s*=\s*"([^"]+)"/.exec(text())?.[1]
    else if (name === 'setup.cfg')
      // A setuptools package predating pyproject still declares its name, in `[metadata]`.
      identity = /\[metadata\][^[]*?^\s*name\s*=\s*(\S+)/m.exec(text())?.[1]
    else if (name === 'setup.py')
      // `setup(name="x")` is a call, not data; only the literal form is read, and a computed name
      // falls back to the directory rather than being guessed at.
      identity =
        /\bname\s*=\s*['"]([^'"]+)['"]/.exec(text())?.[1] ??
        (dir === '.' ? undefined : basename(dir))
    else if (name === 'composer.json')
      try {
        identity = JSON.parse(text()).name
      } catch {}
    else if (name === 'pubspec.yaml') identity = /^name:\s*(\S+)/m.exec(text())?.[1]
    else if (name === 'mix.exs') identity = /\bapp:\s*:(\w+)/.exec(text())?.[1]
    else if (name === 'Package.swift')
      // The first `name:` in a Package.swift is the package's own, ahead of its targets'.
      identity = /name:\s*"([^"]+)"/.exec(text())?.[1]
    else if (name.endsWith('.gemspec')) identity = name.slice(0, -'.gemspec'.length)
    else if (name.endsWith('.cabal')) identity = /^name:\s*(\S+)/m.exec(text())?.[1]
    else if (name.endsWith('.csproj') || name.endsWith('.fsproj'))
      identity = name.replace(/\.[fc]sproj$/, '')
    else if (name === 'build.zig.zon')
      // Zig 0.14 writes `.name = .app`; earlier versions wrote a string.
      identity = /\.name\s*=\s*(?:"([^"]+)"|\.([\w-]+))/.exec(text())?.slice(1).find(Boolean)
    else if (name === 'vcpkg.json')
      try {
        identity = JSON.parse(text()).name
      } catch {}
    else if (name === 'conanfile.py') identity = /^\s*name\s*=\s*"([^"]+)"/m.exec(text())?.[1]
    else if (name === 'Project.toml' && /^\s*uuid\s*=|^\[deps\]/m.test(text()))
      identity = /^\s*name\s*=\s*"([^"]+)"/m.exec(text())?.[1]
    else if (name === 'deno.json' || name === 'deno.jsonc')
      try {
        identity = JSON.parse(text().replace(/^\s*\/\/.*$/gm, '')).name
      } catch {}
    else if (name === 'pom.xml') {
      // `<artifactId>` is the module's declared name, the way every other ecosystem names itself.
      // A parent block carries an artifactId of its own and comes first, so it is removed before
      // reading; a pom that names only its parent falls back to the directory.
      const own = text().replace(/<parent>[\s\S]*?<\/parent>/g, '')
      identity =
        /<artifactId>\s*([^<\s]+)\s*<\/artifactId>/.exec(own)?.[1] ?? basename(resolve(root, dir))
    } else if (name === 'settings.gradle' || name === 'settings.gradle.kts')
      identity = /rootProject\.name\s*=\s*['"]([^'"]+)['"]/.exec(text())?.[1]
    else if (
      name === 'build.gradle' ||
      name === 'build.gradle.kts' ||
      name === 'build.sbt' ||
      name === 'build.sc' ||
      name === 'build.mill' ||
      name === 'MODULE.bazel' ||
      name === 'WORKSPACE.bazel' ||
      name === 'BUILD.bazel' ||
      name === 'BUILD' ||
      name === 'Gemfile' ||
      name === 'Podfile' ||
      name === 'build.zig' ||
      name === 'conanfile.txt' ||
      name === 'flake.nix'
    ) {
      // These name nothing they own: a Gradle subproject is named by the settings file above it, a
      // Bazel package by its path. The directory is the only identity the file itself supplies, and
      // at the repository root there is no such identity — the checkout's own directory name is an
      // accident of where it was cloned, not something the repository declared.
      const settled =
        (name === 'build.gradle' || name === 'build.gradle.kts') &&
        (files.includes(dir === '.' ? 'settings.gradle' : `${dir}/settings.gradle`) ||
          files.includes(dir === '.' ? 'settings.gradle.kts' : `${dir}/settings.gradle.kts`))
      if (!settled && dir !== '.') identity = basename(dir)
    }
    if (identity && !map.has(identity)) map.set(identity, dir)
  }
  // Gradle and sbt declare their subprojects in the parent's build file, and those directories hold
  // no manifest of their own. Without this pass a contract may not name them in `ownership`: the
  // check would resolve the name to nothing and silently skip the package it was asked about.
  for (const file of files) {
    const dir = dirname(file) === '.' ? '.' : dirname(file)
    const under = (path: string) => (dir === '.' ? path : `${dir}/${path}`)
    const name = basename(file)
    if (name === 'settings.gradle' || name === 'settings.gradle.kts')
      for (const member of members(root, dir, name))
        if (!map.has(basename(member))) map.set(basename(member), under(member))
    if (name === 'build.sbt')
      // `lazy val core = project.in(file("modules/core"))`, and the infix `project in file("...")`.
      for (const match of read(join(root, file)).matchAll(
        /\bval\s+(\w+)\s*=\s*project\b[\s\S]{0,160}?\bfile\(\s*"([^"]+)"\s*\)/g
      ))
        if (!map.has(match[1]!)) map.set(match[1]!, under(match[2]!.replace(/^\.\//, '')))
  }
  return map
}

/** Tool versions pinned by the repository, with the file that pins them. */

/** Language and test-harness names that a repository need not declare for pseudocode to be real. */
export const PSEUDOCODE_BUILTINS = new Set([
  'expect',
  'describe',
  'test',
  'await',
  'async',
  'return',
  'require',
  'catch',
  'throw',
  'console',
  'Promise',
  'Array',
  'Object',
  'String',
  'Number',
  'Boolean',
  'JSON',
  'Math',
  'Date',
  'Error',
  'Set',
  'Map',
  'parseInt',
  'parseFloat',
  'toMatchObject',
  'toBeInstanceOf',
  'toEqual',
  'toBe',
  'resolves',
  'rejects',
  'beforeEach',
  'afterEach',
  'push',
  'slice',
  'join',
  'split',
  'filter',
  'includes'
])
