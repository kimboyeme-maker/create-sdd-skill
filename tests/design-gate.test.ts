import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { checkRepositoryFacts } from '../scripts/repo-facts'

type Item = Record<string, unknown>

const converged = {
  status: 'CONVERGED',
  unresolved_information_questions: [],
  pending_authority_confirmations: [],
  route_critical_unknowns: [],
  blocking_findings: [],
  material_findings: [],
  stable_after_last_normative_change: true,
  review_passes: [
    { id: 'SP01', lens: 'SYNTHESIS', result: 'PASS', evidence: 'e' },
    { id: 'SP02', lens: 'ADVERSARIAL', result: 'PASS', evidence: 'e' },
    { id: 'SP03', lens: 'ACCEPTANCE_TOPOLOGY', result: 'PASS', evidence: 'e' }
  ]
}

/** A minimal repository holding one SDD whose contract carries `design_convergence`. */
async function codes(
  convergence: unknown,
  requirements?: Item[],
  revision?: string
): Promise<string[]> {
  const root = mkdtempSync(join(tmpdir(), 'design-gate-'))
  try {
    mkdirSync(join(root, '.git'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'root' }))
    const path = join(root, 'change.sdd.md')
    mkdirSync(dirname(path), { recursive: true })
    const contract = {
      ownership: { packages: ['.'] },
      ...(revision ? { revision } : {}),
      requirements: requirements ?? [{ id: 'XQ01', kind: 'must-ship', title: 'core' }],
      design_convergence: convergence
    }
    writeFileSync(
      path,
      `# Change\n\n<!-- sdd-contract:start -->\n\`\`\`json\n${JSON.stringify(contract)}\n\`\`\`\n<!-- sdd-contract:end -->\n`
    )
    return (await checkRepositoryFacts(path)).issues.map((issue) => issue.code)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('a converged design passes the gate', async () => {
  expect(await codes(converged)).toEqual([])
})

test('every line of the phase-2 exit gate is checked, not just written down', async () => {
  // A real handoff violated four of these at once and still passed all three authoring checks; the
  // delivery loop then refused the contract at admission, after a run had been initialised.
  const codesFor = await codes({
    ...converged,
    status: 'IN_REVIEW',
    unresolved_information_questions: ['release evidence not yet gathered'],
    route_critical_unknowns: ['adapter check unfinished'],
    stable_after_last_normative_change: false,
    review_passes: [{ id: 'SP01', lens: 'SYNTHESIS', result: 'PASS', evidence: 'e' }]
  })
  expect(codesFor).toContain('DESIGN_GATE_ITEM_OPEN')
  expect(codesFor).toContain('DESIGN_GATE_LENS_MISSING')
  expect(codesFor).toContain('DESIGN_GATE_UNSTABLE')
  expect(codesFor).toContain('DESIGN_NOT_CONVERGED')
  // A lens that ran and failed is a different statement from one that never ran.
  expect(
    await codes({
      ...converged,
      review_passes: [
        ...converged.review_passes.slice(0, 2),
        { id: 'SP03', lens: 'ACCEPTANCE_TOPOLOGY', result: 'FAIL', evidence: 'e' }
      ]
    })
  ).toContain('DESIGN_GATE_LENS_NOT_PASSED')
})

test('a design blocked only on a decision the user owns stays a legitimate handoff', async () => {
  // Waiting for an answer is not unfinished work, and the loop has a channel for exactly it.
  const blocked = {
    ...converged,
    status: 'IN_REVIEW',
    pending_authority_confirmations: ['which rejection the product keeps']
  }
  const decision = [
    { id: 'JC01', kind: 'must-ship', title: 'which rejection', requirement_type: 'decision' }
  ]
  expect(await codes(blocked, decision)).toEqual([])
  // Without the decision requirement the same document is just unfinished.
  expect(await codes(blocked)).toContain('DESIGN_NOT_CONVERGED')
})

test('a lens needs one current pass, not one somewhere in its history', async () => {
  // A real regenerated document carried six passes — the three from the previous round and the
  // three from this one — and the gate accepted it because each lens had "a" PASS. That shape lets
  // a document which re-reviewed two of three lenses present itself as fully reviewed, because the
  // third lens's stale pass fills the gap.
  const pass = (id: string, lens: string, revision?: string) => ({
    id,
    lens,
    result: 'PASS',
    evidence: 'e',
    ...(revision ? { revision } : {})
  })
  const LENSES = ['SYNTHESIS', 'ADVERSARIAL', 'ACCEPTANCE_TOPOLOGY']
  const round = (revision: string, offset: number) =>
    LENSES.map((lens, index) => pass(`SP0${offset + index + 1}`, lens, revision))
  // Two complete rounds, both marked: only the current one counts and the older is history.
  expect(
    await codes(
      { ...converged, review_passes: [...round('r2', 0), ...round('r3', 3)] },
      undefined,
      'r3'
    )
  ).toEqual([])
  // The newest round re-ran two lenses; the third's pass is from before the revision bump.
  const partial = await codes(
    { ...converged, review_passes: [...round('r2', 0), ...round('r3', 3).slice(0, 2)] },
    undefined,
    'r3'
  )
  expect(partial).toContain('DESIGN_GATE_LENS_NOT_CURRENT')
  expect(partial).not.toContain('DESIGN_GATE_LENS_MISSING')
  // Recording one lens twice in the same round leaves no single answer for that round.
  expect(
    await codes(
      { ...converged, review_passes: [...round('r3', 0), pass('SP04', 'SYNTHESIS', 'r3')] },
      undefined,
      'r3'
    )
  ).toContain('DESIGN_GATE_LENS_DUPLICATED')
  // Unmarked passes cannot be separated into rounds at all, so none can be shown to be current.
  expect(
    await codes(
      {
        ...converged,
        review_passes: [...round('r2', 0), ...LENSES.map((l, i) => pass(`SP1${i}`, l))]
      },
      undefined,
      'r3'
    )
  ).toContain('DESIGN_GATE_LENS_REVISION_MISSING')
  // A contract with no revision cannot be split into rounds either; one entry per lens is then the
  // only shape that reads unambiguously, and that is what the unmarked fixture already is.
  expect(await codes(converged)).toEqual([])
})
