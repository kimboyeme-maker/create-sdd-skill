import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { V2Result } from './v2-document.ts'
import { list, object, text, type Item, type Report } from './v2-meta.ts'

/**
 * Convergence status. `CLOSED`: every must-ship acceptance has a PASS with evidence against the
 * current revision. `FAILED`: some result is FAIL, so the SDD or the implementation must change.
 * `OPEN`: anything else missing, stale or blocked.
 */
export type ClosureStatus = 'CLOSED' | 'OPEN' | 'FAILED'

/**
 * Compare a host's evidence report (`sdd-evidence/v1`, kept outside the SDD) with one leaf's
 * acceptance: spec-kit's converge, made mechanical. The report names the SDD id and revision it
 * ran against and one `{acceptance, status, evidence}` row per case. A path-like `evidence` must
 * exist in the repository; a URL or free text is taken as written.
 */
export function checkClosure(
  result: V2Result,
  index: Item,
  evidence: unknown,
  repository: string | null
) {
  const findings: { code: string; message: string }[] = []
  const report: Report = (code, detail, subtype) =>
    findings.push({ code, message: subtype ? `${subtype}: ${detail}` : detail })
  const input = object(evidence) ? evidence : {}
  if (input.protocol !== 'sdd-evidence/v1' || !Array.isArray(input.results))
    report('SDD_V2_CLOSURE_OPEN', 'not sdd-evidence/v1', 'evidence-invalid')
  else if (input.sdd !== index.id || input.revision !== index.revision)
    report(
      'SDD_V2_CLOSURE_OPEN',
      `${String(input.sdd)}@${String(input.revision)} != ${String(index.id)}@${String(index.revision)}`,
      'evidence-stale'
    )
  const required = new Set(
    list(index.requirements).flatMap((value) =>
      object(value) && value.kind === 'must-ship' ? list(value.acceptance).filter(text) : []
    )
  )
  const known = new Set(list(index.acceptance).filter(text))
  const rows = new Map<string, Item>()
  for (const row of list(input.results))
    if (object(row) && text(row.acceptance)) {
      if (!known.has(row.acceptance))
        report('SDD_V2_CLOSURE_OPEN', row.acceptance, 'evidence-unknown-acceptance')
      else rows.set(row.acceptance, row)
    }
  const status = new Map<string, string>()
  const unsupported = new Set<string>()
  for (const id of known) {
    const row = rows.get(id)
    const value =
      row && ['PASS', 'FAIL', 'BLOCKED'].includes(String(row.status))
        ? String(row.status)
        : 'MISSING'
    status.set(id, value)
    if (value === 'FAIL') report('SDD_V2_CLOSURE_FAILED', id, 'acceptance-failed')
    else if (value === 'PASS') {
      const ref = row!.evidence
      const local = text(ref) && !/^[a-z]+:\/\//i.test(ref) && !/\s/.test(ref) && ref.includes('/')
      if (!text(ref)) report('SDD_V2_CLOSURE_OPEN', id, 'pass-without-evidence')
      else if (repository && local && !existsSync(resolve(repository, ref)))
        report('SDD_V2_CLOSURE_OPEN', `${id}: ${ref}`, 'evidence-path-missing')
      else continue
      unsupported.add(id)
    } else if (required.has(id))
      report('SDD_V2_CLOSURE_OPEN', id, value === 'BLOCKED' ? 'blocked' : 'evidence-missing')
  }
  const pass = (id: string) => status.get(id) === 'PASS' && !unsupported.has(id)
  const slice = result.handoff.execution_slice
  const entries = (slice?.entries ?? []).map((entry) => ({
    id: entry.id,
    closed: entry.acceptance.length > 0 && entry.acceptance.every(pass)
  }))
  const mvp = slice?.mvp ?? []
  return {
    protocol: 'create-sdd-closure/v1',
    status: findings.some((item) => item.code === 'SDD_V2_CLOSURE_FAILED')
      ? 'FAILED'
      : findings.length || !result.valid
        ? 'OPEN'
        : 'CLOSED',
    findings,
    acceptance: [...known].map((id) => ({
      id,
      required: required.has(id),
      status: status.get(id)!
    })),
    entries,
    mvp_closed: mvp.length ? mvp.every((id) => entries.find((e) => e.id === id)?.closed) : null,
    evidence_limits: [
      'The report is the host’s claim: this check compares IDs, revision and evidence locations, not whether the evidence proves the behaviour.'
    ]
  }
}
