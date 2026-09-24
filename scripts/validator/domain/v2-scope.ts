import { list, object, text, type Item } from './v2-meta.ts'
import { PRESERVATION } from './v2-semantics.ts'
import { stepText } from './v2-symbols.ts'

type Candidate = { code: string; detail: string }
/** A quantified claim over every member of a list ("every `use`/`unUse`", "每次 …"). */
const QUANTIFIED = /\b(?:every|each|all)\b|每次|每个|所有/i
/** A requirement that spans a variant set: modes, platforms, variants. */
const VARIANTS = /\b(?:modes?|platforms?|variants?)\b|模式|平台|变体/i
/** A complexity or scaling outcome ("proportional to", "linear", "O(n)", 成正比, 线性). */
const SCALING =
  /\b(?:proportional|linear(?:ly)?|scal(?:e|es|ing)|complexity)\b|O\([^)]*\)|成正比|线性|复杂度/i
/** A measurement of the public operation itself, not an internal counter. */
const END_TO_END = /end[ -]to[ -]end|wall|per[ -](?:call|operation)|mean time|端到端|耗时/i

/** A state vocabulary declared in a design fence: `type XStatus = 'a' | 'b' | 'c'`. */
const STATE = /(?:type|enum)\s+(\w*(?:Status|State|Phase))\s*=?\s*\{?([^\n]*)/g

const ticked = (line: string) =>
  [...line.matchAll(/`([A-Za-z_][\w-]*)(?:\([^`]*\))?`/g)].map((match) => match[1]!)
const heading = (body: string, names: RegExp) =>
  body.split('\n').some((line) => /^#{1,6}\s/.test(line) && names.test(line))

/**
 * Scope gaps a design can leave while every ID resolves (OD-40..OD-43, OD-45):
 * - a must-ship requirement quantified over enumerated operations whose acceptance and inventory
 *   leave some operation unnamed;
 * - a status/state/phase vocabulary of three or more values declared with no state-combination
 *   table (which existing axes it combines with, what each combination projects to);
 * - a claim that behaviour is the same as an earlier revision with no `preserved-branch`
 *   inventory pinning each branch of the replaced code to a test or acceptance;
 * - a requirement spanning a variant set with no capability matrix recording each cell's source;
 * - a scaling outcome measured only by a subsystem counter (OD-45): it needs an end-to-end timing of
 *   the public operation at two or more sizes and a `cost-path` inventory of whole-collection work.
 */
export function scopeCandidates(index: Item, body: string): Candidate[] {
  const found: Candidate[] = []
  const inventories = list(index.inventories).filter(object)
  for (const requirement of list(index.requirements).filter(object)) {
    if (!text(requirement.id)) continue
    const line = stepText(body, requirement.id).split('\n')[0] ?? ''
    const names = ticked(line)
    if (requirement.kind === 'must-ship' && QUANTIFIED.test(line) && names.length >= 2) {
      const cases = list(requirement.acceptance)
        .filter(text)
        .map((id) => stepText(body, id))
        .join('\n')
      const listed = inventories
        .filter((entry) => entry.requirement === requirement.id)
        .flatMap((entry) =>
          list(entry.entry_points).map((point) => (object(point) ? point.name : ''))
        )
      const uncovered = names.filter(
        (name) => !new RegExp(`\\b${name}\\b`).test(cases) && !listed.includes(name)
      )
      if (uncovered.length)
        found.push({
          code: 'SDD_V2_ENUMERATED_OPERATION_UNCOVERED',
          detail: `${requirement.id} covers ${names.join(', ')} but no acceptance or inventory names ${uncovered.join(', ')}`
        })
    }
    if (requirement.kind === 'must-ship' && SCALING.test(line)) {
      const lines = list(requirement.acceptance)
        .filter(text)
        .map((id) => stepText(body, id).split('\n')[0] ?? '')
      const sized = lines.some(
        (item) => END_TO_END.test(item) && new Set(item.match(/\b\d+\b/g)).size >= 2
      )
      const paths = inventories.some(
        (entry) =>
          entry.requirement === requirement.id &&
          entry.kind === 'cost-path' &&
          list(entry.entry_points).length > 0
      )
      if (!sized || !paths)
        found.push({
          code: 'SDD_V2_SCALING_ORACLE_UNSCOPED',
          detail: `${requirement.id} states a scaling outcome; ${[
            sized
              ? ''
              : 'add an acceptance timing the public operation end to end at two or more sizes',
            paths
              ? ''
              : 'list the whole-collection paths (copies, scans, rebuilds) on it in a cost-path inventory'
          ]
            .filter(Boolean)
            .join(' and ')}`
        })
    }
    if (VARIANTS.test(line) && names.length >= 3 && !heading(body, /capability matrix|能力矩阵/i))
      found.push({
        code: 'SDD_V2_VARIANT_MATRIX_MISSING',
        detail: `${requirement.id} spans ${names.join(', ')}; add a Capability Matrix (variant × capability → supported, source) and clarify every inferred or changed cell`
      })
  }
  for (const [, name, values] of body.matchAll(STATE))
    if ((values!.match(/['"][^'"]+['"]|\b\w+\s*:/g) ?? []).length >= 3)
      if (!heading(body, /state (?:combinations|space)|状态组合|状态空间/i))
        found.push({
          code: 'SDD_V2_STATE_SPACE_UNSTATED',
          detail: `${name} changes a state vocabulary; add a State Combinations table (existing axes × new state → reachable, projection, each rule's behaviour)`
        })
  const pinned = inventories.some(
    (entry) =>
      entry.kind === 'preserved-branch' &&
      list(entry.entry_points).some(
        (point) =>
          object(point) &&
          text(point.path) &&
          /:\d+$/.test(point.path) &&
          (list(point.acceptance).length || text(point.test))
      )
  )
  const claims = body
    .split('\n')
    .filter((line) => PRESERVATION.test(line.replace(/^\s*[-*]\s+\S+\s+/, '')))
  if (claims.length && !pinned)
    found.push({
      code: 'SDD_V2_PRESERVATION_UNPINNED',
      detail: `"${claims[0]!.trim().slice(0, 80)}": list each branch of the replaced code (file:line at the base) in a preserved-branch inventory with the test or acceptance that pins it`
    })
  return found
}
