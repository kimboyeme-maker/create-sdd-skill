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
 * - `templates`: repository skeletons `init` uses instead of the built-in ones.
 */
export type Preset = Readonly<{
  path: string
  principles: readonly string[]
  sections: Readonly<Partial<Record<PresetKind, readonly string[]>>>
  blocking_candidates: readonly string[]
  runners: Readonly<Record<string, readonly string[]>>
  templates: Readonly<Partial<Record<PresetKind, string>>>
}>

export const PRESET_FILE = join('.create-sdd', 'preset.json')

const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text)

/** Read and check the repository's preset; a malformed one is reported and ignored. */
export function loadPreset(repository: string | null, report?: Report): Preset | null {
  if (!repository || !existsSync(join(repository, PRESET_FILE))) return null
  const path = join(repository, PRESET_FILE)
  const bad = (why: string) => {
    if (report) report('SDD_V2_PRESET_INVALID', `${path}: ${why}`)
    return null
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return bad('not JSON')
  }
  if (!object(raw) || raw.protocol !== 'create-sdd-preset/v1') return bad('protocol')
  const principles = raw.principles ?? []
  if (!strings(principles) || !principles.every(pathForm)) return bad('principles')
  const byKind = <T>(value: unknown, check: (item: unknown) => item is T) => {
    if (value === undefined) return {}
    if (!object(value)) return null
    for (const [kind, item] of Object.entries(value))
      if (!(PRESET_KINDS as readonly string[]).includes(kind) || !check(item)) return null
    return value as Partial<Record<PresetKind, T>>
  }
  const sections = byKind(raw.sections, strings)
  if (!sections) return bad('sections')
  const templates = byKind(raw.templates, (item): item is string => text(item) && pathForm(item))
  if (!templates) return bad('templates')
  const blocking = raw.blocking_candidates ?? []
  if (!strings(blocking)) return bad('blocking_candidates')
  const runners = raw.runners ?? {}
  if (
    !object(runners) ||
    !Object.entries(runners).every(
      ([ext, command]) =>
        /^\.\w+$/.test(ext) && strings(command) && command.some((part) => part.includes('{oracle}'))
    )
  )
    return bad('runners')
  return {
    path,
    principles,
    sections,
    blocking_candidates: blocking,
    runners: runners as Record<string, string[]>,
    templates
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
