import { basename, join } from 'node:path'
import { read, walk } from './repository.ts'

/**
 * Versions the repository pins for itself, with the file that pins them. A pin is what a build
 * actually uses, which is why a wrapper's distribution URL outranks a `.java-version` beside it:
 * one selects a shell, the other is downloaded and run.
 */
/** Tool versions pinned by the repository, with the file that pins them. */
export function toolchainPins(root: string): { tool: string; version: string; source: string }[] {
  const pins: { tool: string; version: string; source: string }[] = []
  const mise = read(join(root, 'mise.toml'))
  const tools = /\[tools\]([^[]*)/.exec(mise)?.[1] ?? ''
  for (const match of tools.matchAll(/^\s*"?([\w-]+)"?\s*=\s*"([^"]+)"/gm))
    pins.push({ tool: match[1]!, version: match[2]!, source: 'mise.toml' })
  for (const match of read(join(root, '.tool-versions')).matchAll(/^([\w-]+)\s+(\S+)/gm))
    pins.push({ tool: match[1]!, version: match[2]!, source: '.tool-versions' })
  for (const file of walk(root).filter((path) => basename(path) === 'package.json')) {
    try {
      const manifest = JSON.parse(read(join(root, file)))
      const manager = /^([\w-]+)@(.+)$/.exec(String(manifest.packageManager ?? ''))
      if (manager)
        pins.push({ tool: manager[1]!, version: manager[2]!, source: `${file} packageManager` })
    } catch {}
  }
  const rust =
    /channel\s*=\s*"([^"]+)"/.exec(read(join(root, 'rust-toolchain.toml')))?.[1] ??
    read(join(root, 'rust-toolchain')).trim()
  if (rust) pins.push({ tool: 'rust', version: rust, source: 'rust-toolchain' })
  const python = read(join(root, '.python-version')).trim()
  if (python) pins.push({ tool: 'python', version: python, source: '.python-version' })
  const node = read(join(root, '.nvmrc')).trim()
  if (node) pins.push({ tool: 'node', version: node.replace(/^v/, ''), source: '.nvmrc' })
  // The JVM pins its toolchain in four places and none of them is a `.java-version` alone: the
  // wrapper properties are what a build actually downloads, so they are the operative pin even
  // when a version file sits beside them.
  const java = read(join(root, '.java-version')).trim()
  if (java) pins.push({ tool: 'java', version: java, source: '.java-version' })
  const SDKMAN_NAMES: Readonly<Record<string, string>> = { maven: 'mvn' }
  for (const match of read(join(root, '.sdkmanrc')).matchAll(/^\s*([\w-]+)\s*=\s*(\S+)/gm))
    pins.push({
      tool: SDKMAN_NAMES[match[1]!] ?? match[1]!,
      version: match[2]!,
      source: '.sdkmanrc'
    })
  const WRAPPERS: readonly { file: string; tool: string; pattern: RegExp }[] = [
    {
      file: 'gradle/wrapper/gradle-wrapper.properties',
      tool: 'gradle',
      pattern: /gradle-([\d.]+?)-(?:bin|all)\.zip/
    },
    {
      file: '.mvn/wrapper/maven-wrapper.properties',
      tool: 'mvn',
      pattern: /apache-maven-([\d.]+)-/
    }
  ]
  for (const wrapper of WRAPPERS) {
    const version = wrapper.pattern.exec(read(join(root, wrapper.file)))?.[1]
    if (version) pins.push({ tool: wrapper.tool, version, source: wrapper.file })
  }
  // `go.mod` states the language version the module is built against, the way `.nvmrc` does.
  const goDirective = /^go\s+([\d.]+)\s*$/m.exec(read(join(root, 'go.mod')))?.[1]
  if (goDirective) pins.push({ tool: 'go', version: goDirective, source: 'go.mod' })
  const goVersion = read(join(root, '.go-version')).trim()
  if (goVersion) pins.push({ tool: 'go', version: goVersion, source: '.go-version' })
  const ruby = read(join(root, '.ruby-version')).trim()
  if (ruby) pins.push({ tool: 'ruby', version: ruby, source: '.ruby-version' })
  try {
    const sdk = JSON.parse(read(join(root, 'global.json'))).sdk?.version
    if (typeof sdk === 'string') pins.push({ tool: 'dotnet', version: sdk, source: 'global.json' })
  } catch {}
  return pins
}

/**
 * Lockfiles that actually manage a package directory. A lockfile in the package directory
 * manages it; a lockfile higher up manages it only when its workspace declares the package as a
 * member (pnpm importer, bun/npm workspace entry, Cargo or uv workspace members, go.work use).
 * A lockfile that merely mentions the package name does not manage it.
 */
/** Lockfile name → the tool that writes it. A command uses the tool, not the file. */
