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
/** Whether `ref` names a commit in `repository`; read-only `git cat-file`. */
const commit = (repository: string, ref: string) =>
  Bun.spawnSync(['git', '-C', repository, 'cat-file', '-e', `${ref}^{commit}`]).exitCode === 0

/**
 * How strongly one PASS row proves behaviour. `verified`: the same `command` failed at `baseline`
 * and passed at `commit`, both commits exist and the baseline is an ancestor (checked with
 * read-only git). `claimed`: a FAIL-then-PASS pair with the command but without checkable commits.
 * `none`: a PASS alone, which may never have been able to fail.
 */
function proofOf(row: Item, repository: string | null): { level: string; reason?: string } {
  const base = object(row.baseline) ? row.baseline : null
  if (!text(row.command) || !base || base.status !== 'FAIL' || !text(base.evidence))
    return { level: 'none', reason: 'no failing baseline run of the same command' }
  if (!text(row.commit) || !text(base.commit)) return { level: 'claimed' }
  if (!repository || !commit(repository, row.commit) || !commit(repository, base.commit))
    return { level: 'none', reason: 'baseline or change commit not found' }
  const ordered = Bun.spawnSync([
    'git',
    '-C',
    repository,
    'merge-base',
    '--is-ancestor',
    base.commit,
    row.commit
  ]).exitCode
  return ordered === 0 && base.commit !== row.commit
    ? { level: 'verified' }
    : { level: 'none', reason: 'baseline is not an earlier commit of the change' }
}

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
  // One row per acceptance: a repeated ID is ambiguous (FAIL then PASS must not close by order),
  // so it blocks and neither row counts.
  const rows = new Map<string, Item>()
  const repeated = new Set<string>()
  for (const row of list(input.results))
    if (object(row) && text(row.acceptance)) {
      if (!known.has(row.acceptance))
        report('SDD_V2_CLOSURE_OPEN', row.acceptance, 'evidence-unknown-acceptance')
      else if (rows.has(row.acceptance)) repeated.add(row.acceptance)
      else rows.set(row.acceptance, row)
    }
  for (const id of repeated) {
    rows.delete(id)
    report('SDD_V2_CLOSURE_OPEN', id, 'evidence-duplicate')
  }
  const status = new Map<string, string>()
  const unsupported = new Set<string>()
  const proof: { acceptance: string; level: string; reason?: string }[] = []
  const regression = new Set(list(index.regression).filter(text))
  for (const id of known) {
    const row = rows.get(id)
    const value =
      row && ['PASS', 'FAIL', 'BLOCKED'].includes(String(row.status))
        ? String(row.status)
        : repeated.has(id)
          ? 'DUPLICATE'
          : 'MISSING'
    status.set(id, value)
    if (value === 'FAIL') report('SDD_V2_CLOSURE_FAILED', id, 'acceptance-failed')
    else if (value === 'PASS') {
      const ref = row!.evidence
      const local = text(ref) && !/^[a-z]+:\/\//i.test(ref) && !/\s/.test(ref) && ref.includes('/')
      if (!text(ref)) report('SDD_V2_CLOSURE_OPEN', id, 'pass-without-evidence')
      else if (repository && local && !existsSync(resolve(repository, ref)))
        report('SDD_V2_CLOSURE_OPEN', `${id}: ${ref}`, 'evidence-path-missing')
      else {
        const found = proofOf(row!, repository)
        proof.push({ acceptance: id, ...found })
        // A regression case must show it could fail; otherwise the fix proves nothing.
        if (found.level !== 'none' || !regression.has(id)) continue
        report('SDD_V2_CLOSURE_OPEN', `${id}: ${found.reason}`, 'regression-unproven')
      }
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
    proof,
    behaviour_proven: [...required].every((id) =>
      proof.some((p) => p.acceptance === id && p.level !== 'none')
    ),
    mvp_closed: mvp.length ? mvp.every((id) => entries.find((e) => e.id === id)?.closed) : null,
    evidence_limits: [
      'The report is the host’s claim. `verified` proof checks that the commits exist and are ordered, not that the command tests the requirement or that the logs are genuine.'
    ]
  }
}
