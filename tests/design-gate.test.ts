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
  revision?: string,
  lineage?: Item,
  packages?: string[]
): Promise<string[]> {
  const root = mkdtempSync(join(tmpdir(), 'design-gate-'))
  try {
    mkdirSync(join(root, '.git'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'root' }))
    const path = join(root, 'change.sdd.md')
    mkdirSync(dirname(path), { recursive: true })
    const contract = {
      ownership: { packages: packages ?? ['.'] },
      ...(lineage ? { lineage } : {}),
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
  // A document at its third revision owes the ledger of what those bumps changed; supplied here so
  // this case measures the lens rule and nothing else.
  const history = {
    mode: 'fresh',
    revision_ledger: [
      { from: 'r1', to: 'r2' },
      { from: 'r2', to: 'r3' }
    ]
  }
  // Two complete rounds, both marked: only the current one counts and the older is history.
  expect(
    await codes(
      { ...converged, review_passes: [...round('r2', 0), ...round('r3', 3)] },
      undefined,
      'r3',
      history
    )
  ).toEqual([])
  // The newest round re-ran two lenses; the third's pass is from before the revision bump.
  const partial = await codes(
    { ...converged, review_passes: [...round('r2', 0), ...round('r3', 3).slice(0, 2)] },
    undefined,
    'r3',
    history
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

/**
 * Scope growth between revisions of the same document.
 *
 * A handed-off design is the next session's raw material. One such session added nine requirements
 * and two owned packages to a converged, loop-ready contract, re-ran the three lenses against its
 * own enlarged version, and every authoring check still reported `valid` — the rule requiring user
 * approval for an added requirement had nowhere to be recorded and nothing to be compared against,
 * because the run that grows a document is never the run that wrote it. The ledger lives in the
 * document for that reason.
 */
const marked = (revision: string) => ({
  ...converged,
  review_passes: converged.review_passes.map((pass) => ({ ...pass, revision }))
})

test('a revision after the first carries a ledger of what each bump added', async () => {
  // No ledger at all: the document cannot say what the bump to v2 changed.
  expect(await codes(marked('SDD-v2'), undefined, 'SDD-v2')).toContain('SCOPE_LEDGER_MISSING')
  // The first revision owes nothing; there is no predecessor to have grown from.
  expect(await codes(marked('SDD-v1'), undefined, 'SDD-v1')).not.toContain('SCOPE_LEDGER_MISSING')
})

test('a bump that adds a requirement or a package needs the authorization recorded with it', async () => {
  const requirements = [
    { id: 'XQ01', kind: 'must-ship', title: 'core' },
    { id: 'XQ02', kind: 'must-ship', title: 'added later' }
  ]
  const grown = (authorization: string | null) => ({
    mode: 'fresh',
    revision_ledger: [
      {
        from: 'SDD-v1',
        to: 'SDD-v2',
        requirements_added: ['XQ02'],
        packages_added: ['@scope/extra'],
        authorization
      }
    ]
  })
  const unauthorized = await codes(marked('SDD-v2'), requirements, 'SDD-v2', grown(null), [
    '.',
    '@scope/extra'
  ])
  expect(unauthorized).toContain('SCOPE_GROWTH_UNAUTHORIZED')
  const authorized = await codes(
    marked('SDD-v2'),
    requirements,
    'SDD-v2',
    grown('user said “also clean up the two base packages” on 2026-09-21'),
    ['.', '@scope/extra']
  )
  expect(authorized).toEqual([])
})

test('a ledger that contradicts the contract it describes is refused', async () => {
  // Claims an id the contract never contained, and a package nobody owns.
  const fabricated = await codes(marked('SDD-v2'), undefined, 'SDD-v2', {
    mode: 'fresh',
    revision_ledger: [
      {
        from: 'SDD-v1',
        to: 'SDD-v2',
        requirements_added: ['XQ99'],
        packages_added: ['@scope/never'],
        authorization: 'recorded'
      }
    ]
  })
  expect(fabricated.filter((code) => code === 'SCOPE_LEDGER_CLAIM_INVALID')).toHaveLength(2)
  // A ledger that stops short of the revision it is attached to describes a different document.
  const behind = await codes(marked('SDD-v3'), undefined, 'SDD-v3', {
    mode: 'fresh',
    revision_ledger: [{ from: 'SDD-v1', to: 'SDD-v2', authorization: null }]
  })
  expect(behind).toContain('SCOPE_LEDGER_NOT_CURRENT')
  // And one whose entries do not join describes no history at all.
  const broken = await codes(marked('SDD-v3'), undefined, 'SDD-v3', {
    mode: 'fresh',
    revision_ledger: [
      { from: 'SDD-v1', to: 'SDD-v2' },
      { from: 'SDD-vX', to: 'SDD-v3' }
    ]
  })
  expect(broken).toContain('SCOPE_LEDGER_BROKEN_CHAIN')
})

test('growth that a later revision withdrew is history, not a standing violation', async () => {
  // A document that took back an unapproved expansion has corrected itself. Holding the record of
  // it against the document forever would make deleting the entry cheaper than keeping it, which is
  // the opposite of what a ledger is for.
  const withdrawn = await codes(marked('SDD-v3'), undefined, 'SDD-v3', {
    mode: 'fresh',
    revision_ledger: [
      {
        from: 'SDD-v1',
        to: 'SDD-v2',
        requirements_added: ['XQ90'],
        packages_added: ['@scope/extra'],
        authorization: null
      },
      {
        from: 'SDD-v2',
        to: 'SDD-v3',
        requirements_removed: ['XQ90'],
        packages_removed: ['@scope/extra'],
        authorization: 'user asked for the expansion to be withdrawn'
      }
    ]
  })
  // Neither the missing authorization nor the ids the contract no longer holds are held against it.
  expect(withdrawn).toEqual([])
})
