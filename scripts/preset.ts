/**
 * Package a repository's preset so other repositories can share it.
 *
 *   preset.ts pack --repository <absolute root> --out <absolute directory> [--name <n>] [--version <v>]
 *
 * The pack is a directory with `pack.json` (the preset's merged rules, including any packs it
 * extends) and the templates it names under `templates/`. Another repository vendors the directory
 * and lists it in its own `.create-sdd/preset.json` under `extends`. An existing target is never
 * overwritten.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { loadPreset } from './validator/domain/v2-preset.ts'

/** Write the pack; returns what it contains. */
export function pack(options: {
  repository: string
  out: string
  name?: string
  version?: string
}) {
  const { repository, out } = options
  if (!isAbsolute(repository) || !isAbsolute(out)) throw new Error('PRESET_PATH_ABSOLUTE_REQUIRED')
  if (existsSync(out)) throw new Error(`PRESET_PACK_TARGET_EXISTS:${out}`)
  const problems: string[] = []
  const preset = loadPreset(repository, (_code, detail) => problems.push(detail))
  if (!preset)
    throw new Error(`PRESET_NOT_PACKABLE:${problems.join('; ') || 'no .create-sdd/preset.json'}`)
  const templates = Object.fromEntries(
    Object.keys(preset.templates).map((kind) => [kind, `templates/${kind}.md`])
  )
  mkdirSync(join(out, 'templates'), { recursive: true })
  for (const [kind, path] of Object.entries(preset.templates))
    copyFileSync(join(repository, path!), join(out, 'templates', `${kind}.md`))
  const manifest = {
    protocol: 'create-sdd-preset/v1',
    name: options.name ?? 'preset',
    version: options.version ?? '1',
    principles: preset.principles,
    sections: Object.fromEntries(
      Object.entries(preset.sections).filter(([, list]) => list?.length)
    ),
    blocking_candidates: preset.blocking_candidates,
    runners: preset.runners,
    templates
  }
  writeFileSync(join(out, 'pack.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return { protocol: 'create-sdd-preset-pack/v1', out, manifest }
}

if (import.meta.main) {
  const argv = Bun.argv.slice(2)
  const value = (flag: string) => {
    const at = argv.indexOf(flag)
    return at >= 0 ? argv[at + 1] : undefined
  }
  try {
    if (argv[0] !== 'pack') throw new Error('usage: preset.ts pack --repository <root> --out <dir>')
    const result = pack({
      repository: value('--repository') ?? '',
      out: value('--out') ?? '',
      name: value('--name'),
      version: value('--version')
    })
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error))
    process.exit(2)
  }
}
