import { contractBlock } from '../../lib/contract-source.ts'
import type { DocumentDiagnostic } from './document-check.ts'
import {
  checkDecisions,
  checkDefinition,
  checkDocumentNotes,
  prose,
  section
} from './v2-document.ts'
import { list, object, text, type Report } from './v2-meta.ts'

/** Decision outcomes: `open` and `reshape` wait for the user or another pass; `go` seeds an SDD. */
const OUTCOMES = ['go', 'no-go', 'reshape', 'open'] as const

/**
 * Validate an idea assessment (`sdd-assessment/v1`): spec-kit's intake → research → define →
 * shape → decide, placed in Harvest, Admit, Design and Report. It targets no implementation, so it
 * has options and a decision instead of steps and writes. A `go` must name the chosen option and
 * seed prioritized Entries, which the follow-up sdd/v2 keeps by ID and cites through `assessment`.
 */
export function validateAssessment(sdd: string, document: string) {
  const index = contractBlock(document).value
  if (index?.protocol !== 'sdd-assessment/v1') return null
  const diagnostics: DocumentDiagnostic[] = []
  const report: Report = (code, detail, subtype) =>
    diagnostics.push({ code, line: 1, message: subtype ? `${subtype}: ${detail}` : detail })
  const body = prose(document, 'sdd-contract')
  if (!text(index.id) || !text(index.revision))
    report('SDD_V2_INDEX_SHAPE_INVALID', sdd, 'id-revision-required')
  for (const [names, subtype] of [
    ['Intake|输入', 'intake-missing'],
    ['Research|调研', 'research-missing'],
    ['Options|方案', 'options-missing'],
    ['Decision|决策', 'decision-missing']
  ] as const)
    if (!section(body, names)) report('SDD_V2_SECTION_MISSING', sdd, subtype)
  const options = new Set<string>()
  for (const option of list(index.options)) {
    if (!object(option) || !text(option.id)) {
      report('SDD_V2_INDEX_SHAPE_INVALID', sdd, 'option-invalid')
      continue
    }
    if (options.has(option.id)) report('SDD_V2_ID_DUPLICATE', `${sdd}: ${option.id}`, 'option')
    options.add(option.id)
    checkDefinition(body, option.id, `${sdd}: ${option.id}`, report)
  }
  if (!options.size) report('SDD_V2_REQUIRED_FIELD_EMPTY', sdd, 'options-required')
  const decision = object(index.decision) ? index.decision : {}
  const outcome = String(decision.outcome ?? '')
  if (!(OUTCOMES as readonly string[]).includes(outcome))
    report('SDD_V2_INDEX_SHAPE_INVALID', sdd, 'decision-invalid')
  const option = text(decision.option) ? decision.option : null
  const seeds: { id: string; priority: string | null }[] = []
  for (const entry of list(index.proposed_entries)) {
    const priority = object(entry) ? entry.priority : undefined
    if (
      !object(entry) ||
      !text(entry.id) ||
      (priority !== undefined && !/^P[1-9]\d*$/.test(String(priority)))
    ) {
      report('SDD_V2_INDEX_SHAPE_INVALID', sdd, 'proposed-entry-invalid')
      continue
    }
    checkDefinition(body, entry.id, `${sdd}: ${entry.id}`, report)
    seeds.push({ id: entry.id, priority: text(priority) ? priority : null })
  }
  if (outcome === 'go') {
    if (!option || !options.has(option))
      report('SDD_V2_REFERENCE_MISSING', `${sdd}: ${String(option)}`, 'decision-option-missing')
    if (!seeds.length) report('SDD_V2_REQUIRED_FIELD_EMPTY', sdd, 'proposed-entries-required')
  }
  const pending: { id: string; path: string }[] = []
  checkDecisions(index, sdd, body, pending, report)
  checkDocumentNotes({ path: sdd, text: document, index }, 'sdd-contract', null, report)
  const blockers = diagnostics.map((item) => `${item.code}: ${item.message}`)
  const maturity = blockers.length
    ? 'BLOCKED'
    : pending.length || outcome === 'open' || outcome === 'reshape'
      ? 'AWAITING_USER'
      : outcome === 'go'
        ? 'READY_FOR_SDD'
        : 'CLOSED'
  return {
    sdd,
    valid: !diagnostics.length,
    diagnostics,
    handoff: {
      protocol: 'create-sdd-assessment/v1' as const,
      sdd,
      maturity,
      blockers,
      pending_user_decisions: pending,
      decision: { outcome, option },
      seed_entries: seeds,
      next:
        maturity === 'READY_FOR_SDD'
          ? 'Write an sdd/v2 citing this file in `assessment`; start its Entries from seed_entries.'
          : maturity === 'CLOSED'
            ? 'No SDD follows a no-go; the assessment records why.'
            : 'Resolve the blockers or open decisions, then decide again.',
      evidence_limits: [
        'Structure only: whether the research is sufficient and the options fair is a semantic review.'
      ]
    }
  }
}
