import type { Contract } from '../contract'

type Item = Record<string, unknown>
const object = (value: unknown): Item | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Item) : undefined
const open = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)) : []

/** The lists a converged design has emptied, in the order an author is asked to close them. */
const OPEN_LISTS = [
  'blocking_findings',
  'route_critical_unknowns',
  'unresolved_information_questions',
  'pending_authority_confirmations',
  'material_findings'
] as const
const LENSES = ['SYNTHESIS', 'ADVERSARIAL', 'ACCEPTANCE_TOPOLOGY'] as const

/**
 * Why this contract is not yet admissible, in the author's terms.
 *
 * `validate` deliberately leaves a draft alone: a document being written is allowed to be
 * unfinished, and constraining it would make the command useless during authoring. The cost is that
 * a clean `validate` says nothing about whether the delivery loop would accept the document — the
 * Coordinator refuses a contract whose convergence is not `CONVERGED`, and the author discovers
 * that only after a run has been initialised. Reporting it here turns "green but unrunnable" into a
 * list of the exact things still open, without making an unfinished draft invalid.
 */
export function admissibilityBlockers(contract: Contract): string[] {
  const convergence = object((contract as Item).design_convergence)
  if (!convergence) return ['design_convergence is absent; admission requires a CONVERGED design']
  const blockers: string[] = []
  if (convergence.status !== 'CONVERGED')
    blockers.push(
      `design_convergence.status is ${String(convergence.status)}; admission requires CONVERGED`
    )
  for (const key of OPEN_LISTS) {
    const entries = open(convergence[key])
    if (entries.length) blockers.push(`${key} still has ${entries.length}: ${entries.join('; ')}`)
  }
  if (convergence.stable_after_last_normative_change !== true)
    blockers.push('stable_after_last_normative_change is not true')
  const passes = Array.isArray(convergence.review_passes)
    ? (convergence.review_passes as Item[])
    : []
  for (const lens of LENSES) {
    const latest = passes.findLast((pass) => object(pass)?.lens === lens)
    if (!latest) blockers.push(`no review pass recorded for ${lens}`)
    else if (latest.result !== 'PASS')
      blockers.push(`latest ${lens} pass is ${String(latest.result)}, not PASS`)
  }
  return blockers
}
