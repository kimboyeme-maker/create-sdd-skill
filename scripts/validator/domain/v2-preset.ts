import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { list, object, pathForm, text, type Item, type Report } from './v2-meta.ts'

/** Document kinds a preset can shape; `assessment` takes templates only (it has no repository). */
export const PRESET_KINDS = ['feature', 'bug', 'assessment', 'program'] as const
export type PresetKind = (typeof PRESET_KINDS)[number]

/**
 * A repository's adaptation of this skill (`.create-sdd/preset.json`), spec-kit's presets:
 * - `principles`: principle files every SDD must list (and check) in `principles`;
 * - `sections`: extra headings each kind requires, alternatives joined by `|`;
 * - `blocking_candidates`: advisory candidate codes this repository treats as blockers;
 * - `runners`: replay commands by oracle extension, with `{oracle}` for the test path;
 * - `templates`: repository skeletons `init` uses instead of the built-in ones;
 * - `extends`: shared packs (directories with a `pack.json` of this shape) applied first.
 */
export type Preset = Readonly<{
  path: string
  /** The shared packs this preset extends, in the order they were applied. */
  packs: readonly string[]
  principles: readonly string[]
  sections: Readonly<Partial<Record<PresetKind, readonly string[]>>>
  blocking_candidates: readonly string[]
  runners: Readonly<Record<string, readonly string[]>>
  templates: Readonly<Partial<Record<PresetKind, string>>>
}>

export const PRESET_FILE = join('.create-sdd', 'preset.json')

const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text)

/** One preset file's rules, or why it is malformed. Template paths are made repository-relative. */
function parse(raw: unknown, templateBase: string): Omit<Preset, 'path' | 'packs'> | string {
  if (!object(raw) || raw.protocol !== 'create-sdd-preset/v1') return 'protocol'
  const principles = raw.principles ?? []
  if (!strings(principles) || !principles.every(pathForm)) return 'principles'
  const byKind = <T>(value: unknown, check: (item: unknown) => item is T) => {
    if (value === undefined) return {}
    if (!object(value)) return null
    for (const [kind, item] of Object.entries(value))
      if (!(PRESET_KINDS as readonly string[]).includes(kind) || !check(item)) return null
    return value as Partial<Record<PresetKind, T>>
  }
  const sections = byKind(raw.sections, strings)
  if (!sections) return 'sections'
  const templates = byKind(raw.templates, (item): item is string => text(item) && pathForm(item))
  if (!templates) return 'templates'
  const blocking = raw.blocking_candidates ?? []
  if (!strings(blocking)) return 'blocking_candidates'
  const runners = raw.runners ?? {}
  if (
    !object(runners) ||
    !Object.entries(runners).every(
      ([ext, command]) =>
        /^\.\w+$/.test(ext) && strings(command) && command.some((part) => part.includes('{oracle}'))
    )
  )
    return 'runners'
  return {
    principles,
    sections,
    blocking_candidates: blocking,
    runners: runners as Record<string, string[]>,
    templates: Object.fromEntries(
      Object.entries(templates).map(([kind, path]) => [kind, join(templateBase, path)])
    )
  }
}

/**
 * Read the repository's preset and the shared packs it `extends` (repository-relative directories
 * holding a `pack.json` of the same shape, templates relative to the pack). Packs apply first; the
 * repository's own entries add to their lists and override their runners and templates. A malformed
 * preset or pack is reported and nothing is applied.
 */
export function loadPreset(repository: string | null, report?: Report): Preset | null {
  if (!repository || !existsSync(join(repository, PRESET_FILE))) return null
  const path = join(repository, PRESET_FILE)
  const bad = (why: string) => {
    if (report) report('SDD_V2_PRESET_INVALID', `${path}: ${why}`)
    return null
  }
  const read = (file: string) => {
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as unknown
    } catch {
      return undefined
    }
  }
  const raw = read(path)
  if (raw === undefined) return bad('not JSON')
  const own = parse(raw, '')
  if (typeof own === 'string') return bad(own)
  const extended = object(raw) ? (raw.extends ?? []) : []
  if (!strings(extended) || !extended.every(pathForm)) return bad('extends')
  const layers: Omit<Preset, 'path' | 'packs'>[] = []
  for (const pack of extended) {
    const file = join(repository, pack, 'pack.json')
    const parsed = existsSync(file) ? parse(read(file), pack) : 'not found'
    if (typeof parsed === 'string') return bad(`extends ${pack}: ${parsed}`)
    layers.push(parsed)
  }
  layers.push(own)
  const union = (lists: readonly (readonly string[])[]) => [...new Set(lists.flat())]
  return {
    path,
    packs: extended,
    principles: union(layers.map((l) => l.principles)),
    sections: Object.fromEntries(
      PRESET_KINDS.map((kind) => [kind, union(layers.map((l) => l.sections[kind] ?? []))])
    ),
    blocking_candidates: union(layers.map((l) => l.blocking_candidates)),
    runners: Object.assign({}, ...layers.map((l) => l.runners)),
    templates: Object.assign({}, ...layers.map((l) => l.templates))
  }
}

/**
 * Apply a preset to one validated document: its required sections and principles are checked, and
 * candidates it promotes become blocking diagnostics (`SDD_V2_PRESET_BLOCKED`).
 */
export function applyPreset(
  preset: Preset,
  kind: PresetKind,
  index: Item,
  hasSection: (names: string) => boolean,
  candidates: readonly { code: string; detail: string }[],
  where: string,
  report: Report
): void {
  for (const names of preset.sections[kind] ?? [])
    if (
      !hasSection(
        names
          .split('|')
          .map((n) => n.replace(/[.*+?^${}()[\]\\]/g, '\\$&'))
          .join('|')
      )
    )
      report('SDD_V2_SECTION_MISSING', `${where}: ${names}`, 'preset-section-missing')
  const listed = new Set(list(index.principles))
  for (const principle of preset.principles)
    if (!listed.has(principle))
      report(
        'SDD_V2_REFERENCE_MISSING',
        `${where}: principles -> ${principle}`,
        'preset-principle-missing'
      )
  for (const candidate of candidates)
    if (preset.blocking_candidates.includes(candidate.code))
      report('SDD_V2_PRESET_BLOCKED', `${candidate.code}: ${candidate.detail}`)
}
