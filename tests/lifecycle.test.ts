import { expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { validate } from '../scripts/lib/schema'
import { discardRun, mintRun, readJournal, startJournal } from '../scripts/lib/run-journal'
import { outOfOrder } from '../scripts/lib/run-journal'
import { describe as describeEvents, runHook } from '../scripts/lifecycle'

/**
 * Runs minted by this file, so each test can drop its own. A journal outlives the process by design
 * — that is the point of it — which also means a test that mints one and walks away leaves it on
 * disk forever. The retention sweep would eventually take them; a suite that litters for a week
 * first is still a suite that litters.
 */
const minted = new Set<string>()

/** A started run, so a test can exercise one hook without replaying the whole sequence. */
function startedRun(root?: string): string {
  const run = mintRun()
  startJournal(run, root)
  minted.add(run)
  return run
}

/** Every run this file created, whether through `startedRun` or an `initial` hook. */
function discardMinted(...runs: (string | undefined)[]): void {
  for (const run of [...minted, ...runs]) if (run) discardRun(run)
  minted.clear()
}

function repository(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'lifecycle-'))
  mkdirSync(join(root, '.git'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const WORKSPACE = {
  'package.json': JSON.stringify({ name: 'root', packageManager: 'pnpm@9.0.0' }),
  'pnpm-workspace.yaml': 'packages:\n  - site\n',
  'pnpm-lock.yaml':
    "lockfileVersion: '9.0'\n\nimporters:\n\n  .: {}\n\n  site:\n    dependencies: {}\n\npackages: {}\n",
  'site/package.json': JSON.stringify({ name: 'site', packageManager: 'bun@1.4.2' }),
  'site/bun.lock': '{}'
}

const initial = (root: string, patch: Record<string, unknown> = {}) => ({
  request: 'converge the install-unit lifecycle',
  repository: root,
  output_root: '/tmp',
  mode: 'create',
  archetype: 'library',
  owned_packages: ['site'],
  split: null,
  ...patch
})

test('a payload is checked for shape before anything reads it as a fact', async () => {
  // The payload comes from a language model, so a misspelled or missing field has to be named at
  // the boundary; discovering it inside a check that assumed it was there reads as a different bug.
  const bad = await runHook('initial', { request: 'x' })
  minted.add(bad.run!)
  expect(bad.ok).toBe(false)
  expect(bad.blocking.every((issue) => issue.code === 'LIFECYCLE_PAYLOAD_INVALID')).toBe(true)
  expect(bad.blocking.map((issue) => issue.detail)).toContain('repository: required')
  // A misspelled field is silently absent unless unknown keys are reported too.
  expect(validate({ mode: 'create', moed: 'x' }, { mode: { type: 'string' } })).toContain(
    'moed: unknown field'
  )
  expect(validate({ mode: 'audit' }, { mode: { type: 'string', enum: ['create'] } })[0]).toContain(
    'expected one of create'
  )
  const root = repository(WORKSPACE)
  try {
    const wrongEnum = await runHook('initial', initial(root, { mode: 'implement' }))
    minted.add(wrongEnum.run!)
    expect(wrongEnum.ok).toBe(false)
  } finally {
    discardMinted()
    rmSync(root, { recursive: true, force: true })
  }
})

test('initial answers with the managers each owned package declares for itself', async () => {
  // This is the fact whose absence produced a `pnpm install` inside a bun package: the session is
  // handed the answer at the point it starts writing commands, instead of inferring it from the
  // repository root it happens to be standing in.
  const root = repository(WORKSPACE)
  try {
    const result = await runHook('initial', initial(root))
    minted.add(result.run!)
    expect(result.ok).toBe(true)
    expect(result.facts.ownership).toEqual([
      { package: 'site', dir: 'site', managers: { node: 'bun' } }
    ])
    expect(result.next.must_do.join(' ')).toContain('managers')
    // A name the repository cannot resolve is a blocker, not a note: every later check is scoped to
    // these roots, so an unresolved one silently narrows the whole run to nothing.
    const unresolved = await runHook('initial', initial(root, { owned_packages: ['ghost'] }))
    minted.add(unresolved.run!)
    expect(unresolved.ok).toBe(false)
    expect(unresolved.blocking[0]!.code).toBe('LIFECYCLE_OWNED_PACKAGE_UNRESOLVED')
    // Writing the documents into the repository being described changes it; that is worth saying
    // and is not by itself wrong, so it is advisory.
    const inside = await runHook('initial', initial(root, { output_root: join(root, 'docs') }))
    minted.add(inside.run!)
    expect(inside.advisory.map((issue) => issue.code)).toContain(
      'LIFECYCLE_OUTPUT_INSIDE_REPOSITORY'
    )
    // A split is a user decision; program mode without one has nothing to record as its source.
    const program = await runHook('initial', initial(root, { mode: 'program' }))
    minted.add(program.run!)
    expect(program.blocking.map((issue) => issue.code)).toContain(
      'LIFECYCLE_SPLIT_DECISION_REQUIRED'
    )
  } finally {
    discardMinted()
    rmSync(root, { recursive: true, force: true })
  }
})

test('generate fires twice because the two moments answer different questions', async () => {
  // Before the file exists the only checkable things are where it goes and what must be read to
  // write it; after it exists the document itself can be checked. Neither can do the other's job,
  // which is why one event carries a phase rather than two events carrying the same name.
  const root = repository(WORKSPACE)
  const run = startedRun(root)
  const sdd = join(root, 'docs', 'change.sdd.md')
  try {
    mkdirSync(dirname(sdd), { recursive: true })
    const before = await runHook('generate', {
      run,
      phase: 'before',
      sdd,
      title: 'Change',
      estimate_minutes: [30, 45]
    })
    expect(before.ok).toBe(true)
    expect((before.facts.reading_baseline as string[]).length).toBeGreaterThan(0)
    const backwards = await runHook('generate', {
      run,
      phase: 'before',
      sdd,
      estimate_minutes: [45, 30]
    })
    expect(backwards.blocking[0]!.code).toBe('LIFECYCLE_ESTIMATE_INVALID')
    const nowhere = await runHook('generate', {
      run,
      phase: 'before',
      sdd: join(root, 'absent', 'x.sdd.md')
    })
    expect(nowhere.blocking[0]!.code).toBe('LIFECYCLE_OUTPUT_DIRECTORY_MISSING')
    // `after` on a path nothing wrote is the failure mode this phase exists to catch: a run that
    // reports a document it never produced.
    const missing = await runHook('generate', { run, phase: 'after', sdd })
    expect(missing.blocking[0]!.code).toBe('LIFECYCLE_DOCUMENT_NOT_WRITTEN')
  } finally {
    discardMinted()
    rmSync(root, { recursive: true, force: true })
  }
})

test('process checks the precondition of the phase being entered, not that it was announced', async () => {
  const root = repository(WORKSPACE)
  const run = startedRun(root)
  const sdd = join(root, 'change.sdd.md')
  try {
    writeFileSync(sdd, '# Change\n\nNo contract yet.\n')
    const design = await runHook('process', {
      run,
      sdd,
      phase: 'design',
      entering: true,
      note: 'starting the design'
    })
    expect(design.ok).toBe(false)
    expect(design.blocking[0]!.code).toBe('LIFECYCLE_PHASE_PRECONDITION_UNMET')
    // Leaving a phase is a different claim from entering one, and is not gated by entry.
    const leaving = await runHook('process', {
      run,
      sdd,
      phase: 'design',
      entering: false,
      note: 'design written'
    })
    expect(leaving.ok).toBe(true)
    // Harvest legitimately precedes the file; every later phase reads what is already written.
    const harvest = await runHook('process', {
      run,
      sdd: join(root, 'not-yet.sdd.md'),
      phase: 'harvest',
      entering: true,
      note: 'reading the repository'
    })
    expect(harvest.ok).toBe(true)
    const admit = await runHook('process', {
      run,
      sdd: join(root, 'not-yet.sdd.md'),
      phase: 'admit',
      entering: true,
      note: 'admitting'
    })
    expect(admit.blocking[0]!.code).toBe('LIFECYCLE_DOCUMENT_NOT_WRITTEN')
  } finally {
    discardMinted()
    rmSync(root, { recursive: true, force: true })
  }
})

test('done returns the launch instruction as something the reply must contain', async () => {
  // The instruction is derivable and was being lost between being derivable and being said. It is
  // not stored in the document — it belongs to the reply — so the hook hands it back as `must_echo`.
  const root = repository(WORKSPACE)
  const run = startedRun(root)
  const program = join(root, 'root.sdd.md')
  const child = join(root, 'a.sdd.md')
  try {
    writeFileSync(
      program,
      `# Program\n\n<!-- sdd-program:start -->\n\`\`\`json\n${JSON.stringify({
        protocol: 'sdd-program/v1',
        id: 'PG01',
        nodes: [
          { id: 'root', parent: null, kind: 'group', sdd: 'root.sdd.md' },
          { id: 'a', parent: 'root', kind: 'execution', sdd: 'a.sdd.md' }
        ],
        split_decision: { source: 'USER_STATED', reference: 'user reply: split it' }
      })}\n\`\`\`\n<!-- sdd-program:end -->\n`
    )
    writeFileSync(child, '# A\n')
    const result = await runHook('done', { run, program, documents: [child] })
    expect(result.next.must_echo).toEqual([
      `使用 sdd-loop-delivery 启动 ${program} 的完整 workflow`
    ])
    expect(result.next.must_do.join(' ')).toContain('verbatim')
    // A program that reports fewer documents than it scheduled has lost one; a run that reports
    // more has written something nobody will schedule. Both are silent without this comparison.
    const short = await runHook('done', { run, program, documents: [join(root, 'other.sdd.md')] })
    expect(short.blocking.map((issue) => issue.code)).toContain(
      'LIFECYCLE_PROGRAM_NODE_NOT_REPORTED'
    )
  } finally {
    discardMinted()
    rmSync(root, { recursive: true, force: true })
  }
})

test('the schemas are readable without writing a payload first', () => {
  const shape = describeEvents() as { events: Record<string, Record<string, string>> }
  expect(Object.keys(shape.events)).toEqual([
    'initial',
    'evidence',
    'generate',
    'process',
    'amend',
    'done'
  ])
  expect(shape.events.generate!.phase).toContain('before|after')
  expect(shape.events.initial!.owned_packages).toContain('required')
})

test('a terminal report is the one action no check can observe, so it is acknowledged', async () => {
  // This skill cannot see the reply. The run therefore does not reach `ok` on the documents alone:
  // it reaches it when the session returns a token it could only have read here. That is not proof
  // the echo happened — it converts a silent omission into an explicit claim, and a forgotten one
  // into a run with no complete state.
  const root = repository(WORKSPACE)
  const run = startedRun(root)
  const program = join(root, 'root.sdd.md')
  const child = join(root, 'a.sdd.md')
  try {
    writeFileSync(
      program,
      `# Program\n\n<!-- sdd-program:start -->\n\`\`\`json\n${JSON.stringify({
        protocol: 'sdd-program/v1',
        id: 'PG01',
        nodes: [
          { id: 'root', parent: null, kind: 'group', sdd: 'root.sdd.md' },
          { id: 'a', parent: 'root', kind: 'execution', sdd: 'a.sdd.md' }
        ],
        split_decision: { source: 'USER_STATED', reference: 'user reply: split it' }
      })}\n\`\`\`\n<!-- sdd-program:end -->\n`
    )
    writeFileSync(child, '# A\n')
    const first = await runHook('done', { run, program, documents: [child] })
    expect(first.ok).toBe(false)
    expect(first.blocking.map((issue) => issue.code)).toContain('LIFECYCLE_ECHO_PENDING')
    const token = first.next.echo_token!
    expect(token).toMatch(/^[0-9a-f]{8}$/)
    // Scoped to the echo: whether the child document itself is complete is a different question,
    // answered by the other findings in the same result.
    const acknowledged = await runHook('done', { run, program, documents: [child], echoed: token })
    expect(acknowledged.blocking.map((issue) => issue.code)).not.toContain('LIFECYCLE_ECHO_PENDING')
    // Once acknowledged there is nothing left to echo; repeating it would duplicate the line.
    expect(acknowledged.next.must_echo).toEqual([])
    // A token from some other run does not identify these strings.
    const wrong = await runHook('done', { run, program, documents: [child], echoed: 'deadbeef' })
    expect(wrong.blocking.map((issue) => issue.code)).toContain('LIFECYCLE_ECHO_PENDING')
  } finally {
    discardMinted()
    rmSync(root, { recursive: true, force: true })
  }
})

test('evidence refuses an inference wearing an observation s clothes', async () => {
  // Phase 1's ledger decided what could become normative and nothing compared a classification
  // with anything. A confident model promotes its own inference; this is that shape.
  const root = repository(WORKSPACE)
  const run = startedRun(root)
  try {
    const result = await runHook('evidence', {
      run,
      repository: root,
      documents: [{ sdd: join(root, 'x.sdd.md'), fact_ids: ['F1', 'F2', 'F3'] }],
      facts: [
        {
          id: 'F1',
          claim: 'site declares bun',
          classification: 'OBSERVED',
          reference: 'site/package.json',
          normative: true
        },
        {
          id: 'F2',
          claim: 'so the root manager applies too',
          classification: 'INFERRED',
          reference: 'F1',
          normative: true
        },
        {
          id: 'F3',
          claim: 'a legacy directory exists',
          classification: 'OBSERVED',
          reference: 'site/legacy',
          normative: false
        }
      ]
    })
    expect(result.ok).toBe(false)
    const codes = result.blocking.map((issue) => issue.code)
    expect(codes).toContain('LIFECYCLE_NORMATIVE_FACT_NOT_GROUNDED')
    // An observation names something the repository can be asked about; a path that is not there
    // makes the fact an inference with an observation's label.
    expect(codes).toContain('LIFECYCLE_OBSERVATION_UNRESOLVED')
    // A line reference on an existing file is still that file.
    const cited = await runHook('evidence', {
      run,
      repository: root,
      documents: [{ sdd: join(root, 'x.sdd.md'), fact_ids: ['F1'] }],
      facts: [
        {
          id: 'F1',
          claim: 'site declares bun',
          classification: 'OBSERVED',
          reference: 'site/package.json:1',
          normative: true
        }
      ]
    })
    expect(cited.ok).toBe(true)
    expect(cited.facts.ledger).toMatchObject({ total: 1, by_classification: { OBSERVED: 1 } })
  } finally {
    discardMinted()
    rmSync(root, { recursive: true, force: true })
  }
})

test('a normative amendment after CONVERGED invalidates the claim that nothing changed', async () => {
  const root = repository(WORKSPACE)
  const run = startedRun(root)
  const sdd = join(root, 'change.sdd.md')
  const converged = {
    revision: 'SDD-v1',
    design_convergence: {
      status: 'CONVERGED',
      stable_after_last_normative_change: true,
      // Each pass names the revision it was performed against; without that the gate cannot tell a
      // current round from a stale one, and says so.
      review_passes: ['SYNTHESIS', 'ADVERSARIAL', 'ACCEPTANCE_TOPOLOGY'].map((lens, index) => ({
        id: `SP0${index + 1}`,
        lens,
        result: 'PASS',
        revision: 'SDD-v1',
        evidence: 'design review notes'
      }))
    }
  }
  try {
    writeFileSync(
      sdd,
      `# Change\n\n<!-- sdd-contract:start -->\n\`\`\`json\n${JSON.stringify(converged)}\n\`\`\`\n<!-- sdd-contract:end -->\n`
    )
    const normative = await runHook('amend', {
      run,
      sdd,
      reason: 'added an acceptance case',
      normative: true
    })
    expect(normative.ok).toBe(false)
    expect(normative.blocking.map((issue) => issue.code)).toContain('LIFECYCLE_CONVERGENCE_STALE')
    expect(normative.next.must_do.join(' ')).toContain('three review lenses')
    // A typo is not a normative change and leaves the convergence claim standing.
    const cosmetic = await runHook('amend', { run, sdd, reason: 'fixed a typo', normative: false })
    expect(cosmetic.ok).toBe(true)
  } finally {
    discardMinted()
    rmSync(root, { recursive: true, force: true })
  }
})

test('the run journal separates a phase that was performed from one that was never called', async () => {
  // Each hook is its own process, so "was evidence called" cannot be answered in memory: the record
  // has to outlive the process. Until it did, a run could skip every hook but the last and still
  // present a finished result.
  const root = repository(WORKSPACE)
  const sdd = join(root, 'change.sdd.md')
  try {
    const started = await runHook('initial', initial(root))
    minted.add(started.run!)
    expect(started.run).toMatch(/^[0-9a-f]{12}$/)
    const run = started.run!
    expect(started.next.must_do.join(' ')).toContain(run)
    writeFileSync(sdd, '# Change\n')
    const skipped = await runHook('done', { run, documents: [sdd] })
    const reasons = skipped.blocking
      .filter((issue) => issue.code === 'LIFECYCLE_PHASE_NEVER_CALLED')
      .map((issue) => issue.detail)
    expect(reasons.some((detail) => detail.startsWith('evidence'))).toBe(true)
    expect(reasons.some((detail) => detail.startsWith('generate:before'))).toBe(true)
    expect(reasons.some((detail) => detail.startsWith('generate:after'))).toBe(true)
    // A run id nothing minted is a call from a session that never initialised.
    const stranger = await runHook('done', { run: 'ffffffffffff', documents: [sdd] })
    expect(stranger.blocking.map((issue) => issue.code)).toContain('LIFECYCLE_RUN_UNKNOWN')
    // A refused call is still recorded: a run that tried and was refused is not a run that never
    // tried, and only the journal separates them.
    await runHook('process', { run, sdd, phase: 'design', entering: true, note: 'too early' })
    const after = await runHook('done', { run, documents: [sdd] })
    expect((after.facts.run as { calls: number }).calls).toBeGreaterThan(0)
  } finally {
    discardMinted()
    rmSync(root, { recursive: true, force: true })
  }
})

test('done carries everything that would otherwise be lost, not only the launch instruction', async () => {
  // The launch instruction was the first thing found to be lost between being derivable and being
  // said. A superseded manager claim, a deferred must-ship and an unverified assumption travel the
  // same way, and the same token covers all of them: acknowledging means having read them.
  const root = repository(WORKSPACE)
  const sdd = join(root, 'change.sdd.md')
  try {
    const started = await runHook('initial', initial(root))
    minted.add(started.run!)
    const run = started.run!
    writeFileSync(
      sdd,
      `# Change\n\n<!-- sdd-contract:start -->\n\`\`\`json\n${JSON.stringify({
        revision: 'SDD-v1',
        ownership: { packages: ['site'] },
        requirements: [
          {
            id: 'XQ01',
            kind: 'must-ship',
            title: 'core',
            deferred: {
              owner: 'core team',
              trigger: 'after launch',
              impact: 'manual export',
              approved_by: 'user'
            }
          }
        ]
      })}\n\`\`\`\n<!-- sdd-contract:end -->\n`
    )
    await runHook('evidence', {
      run,
      repository: root,
      documents: [{ sdd, fact_ids: ['F1'] }],
      facts: [
        {
          id: 'F1',
          claim: 'the index tolerates a partial shard',
          classification: 'ASSUMED',
          reference: 'no fault injection was run',
          normative: false
        }
      ]
    })
    const result = await runHook('done', { run, documents: [sdd] })
    const echoed = result.next.must_echo.join('\n')
    // A losing manager claim still exists; a reader following the workspace file installs with it.
    expect(echoed).toContain('site is managed by bun')
    // Work the user agreed to ship and will not get, recorded in the contract and read by nobody.
    expect(echoed).toContain('XQ01 is a deferred must-ship')
    // An unverified claim nobody saw is the failure the classification exists to prevent.
    expect(echoed).toContain('no fault injection was run')
  } finally {
    discardMinted()
    rmSync(root, { recursive: true, force: true })
  }
})

test('an order the journal shows to be impossible is separated from one it never saw', async () => {
  // The impossible half is a property of the sequence, so it is checked against a sequence: an
  // end-to-end fixture would need a document complete enough for `generate: after` to be accepted,
  // which is a different subject. The accepted-calls rule is covered end to end below.
  const entry = (event: string, detail: string | undefined, ok = true) => ({
    event,
    at: new Date().toISOString(),
    sdd: '/repo/a.sdd.md',
    ...(detail ? { detail } : {}),
    ok
  })
  const journal = (entries: ReturnType<typeof entry>[]) => ({
    protocol: 'create-sdd-run/v1' as const,
    run: 'aaaaaaaaaaaa',
    started: new Date().toISOString(),
    entries
  })
  // Reporting a document as written before it was ever announced cannot have happened.
  expect(outOfOrder(journal([entry('generate', 'after')])).impossible.join(' ')).toContain(
    'generate:after precedes generate:before'
  )
  // Amending a document that was never reported cannot have happened either, and the message says
  // what to do instead — a revision made while authoring is another `generate: after`.
  const amended = outOfOrder(journal([entry('generate', 'before'), entry('amend', undefined)]))
  expect(amended.impossible.join(' ')).toContain('amend precedes the document being reported')
  expect(amended.impossible.join(' ')).toContain('another generate:after')
  // A refused call changed nothing; counting it would poison a run permanently.
  expect(
    outOfOrder(journal([entry('generate', 'before'), entry('amend', undefined, false)])).impossible
  ).toEqual([])
  // Entering a later phase with no earlier transition recorded may only mean it was not reported,
  // so it is disclosed rather than enforced — the journal cannot tell those two apart.
  const skipped = outOfOrder(journal([entry('process', 'handoff:enter')]))
  expect(skipped.impossible).toEqual([])
  expect(skipped.unreported.join(' ')).toContain('entered handoff with no harvest transition')
})

test('a receipt naming documents nothing asked for is disclosed, never blocked', async () => {
  // Reading more than required is honest. What this names is the signature of a receipt assembled
  // from a template rather than accumulated, and that is worth seeing and not worth blocking on.
  const root = repository(WORKSPACE)
  const sdd = join(root, 'change.sdd.md')
  try {
    const started = await runHook('initial', initial(root))
    minted.add(started.run!)
    const run = started.run!
    await runHook('generate', { run, phase: 'before', sdd })
    writeFileSync(sdd, '# Change\n')
    await runHook('generate', { run, phase: 'after', sdd })
    await runHook('evidence', {
      run,
      repository: root,
      documents: [{ sdd, fact_ids: ['F1'] }],
      facts: [
        {
          id: 'F1',
          claim: 'x',
          classification: 'USER_STATED',
          reference: 'the request',
          normative: true
        }
      ]
    })
    const result = await runHook('done', { run, documents: [sdd] })
    // Whatever the outcome, an over-claim is never among the blocking findings.
    expect(result.blocking.map((issue) => issue.code)).not.toContain(
      'LIFECYCLE_RECEIPT_UNREQUESTED'
    )
  } finally {
    discardMinted()
    rmSync(root, { recursive: true, force: true })
  }
})

test('a journal outlives its process by design, and is litter once the run is over', () => {
  // The record has to survive between hooks — that is the whole point of it — which also means
  // nothing ever removed one. Every run this tool had served, real or test, was still on disk.
  const run = mintRun()
  startJournal(run)
  expect(readJournal(run)).not.toBeNull()
  discardRun(run)
  expect(readJournal(run)).toBeNull()
  // Discarding something that was never started, or a malformed id, is not an error: a caller
  // cleaning up after a failure should not have to know how far the failure got.
  expect(() => discardRun(run)).not.toThrow()
  expect(() => discardRun('not-a-run-id')).not.toThrow()
})

test('the suite leaves no journal behind', () => {
  // Guards the cleanup rather than the code under test: a suite that litters for a week before the
  // retention sweep takes over is still a suite that litters.
  const home = join(tmpdir(), 'create-sdd-runs')
  const before = existsSync(home) ? readdirSync(home).length : 0
  const run = mintRun()
  startJournal(run)
  expect(readdirSync(home).length).toBe(before + 1)
  discardRun(run)
  expect(readdirSync(home).length).toBe(before)
})

test('a program root is validated as a program, not sent to the leaf validator', async () => {
  // A root carries an index of documents, not a contract, and the delivery skill says so itself as
  // SDD_PROGRAM_ROOT. Sending every document to `validate` turned that answer into a blocking
  // diagnostic against a root that was correct — a fault in the hook, not in the document.
  const root = repository(WORKSPACE)
  const sdd = join(root, 'root.sdd.md')
  try {
    const started = await runHook('initial', initial(root))
    minted.add(started.run!)
    writeFileSync(
      sdd,
      `# Program\n\n使用 sdd-loop-delivery 启动 ${sdd} 的完整 workflow\n\n<!-- sdd-program:start -->\n\`\`\`json\n${JSON.stringify(
        {
          protocol: 'sdd-program/v1',
          id: 'PG01',
          nodes: [{ id: 'root', parent: null, kind: 'group', sdd: 'root.sdd.md' }],
          split_decision: { source: 'USER_STATED', reference: 'user reply: split it' }
        }
      )}\n\`\`\`\n<!-- sdd-program:end -->\n`
    )
    const after = await runHook('generate', { run: started.run!, phase: 'after', sdd })
    expect(after.blocking.map((issue) => issue.code)).not.toContain('SDD_PROGRAM_ROOT')
  } finally {
    discardMinted()
    rmSync(root, { recursive: true, force: true })
  }
})

test('a refused call is forensics, never a step in the order the work went in', async () => {
  // Counting one would make a single misuse of an optional hook poison a run permanently: the entry
  // stays in the journal forever, so `done` could never be reached again. That trap fired on the
  // first real authoring run, on an `amend` the controller had already refused.
  const root = repository(WORKSPACE)
  const sdd = join(root, 'change.sdd.md')
  try {
    const started = await runHook('initial', initial(root))
    const run = started.run!
    minted.add(run)
    // Refused: the document does not exist yet, so nothing was amended.
    const refused = await runHook('amend', { run, sdd, reason: 'too early', normative: true })
    expect(refused.ok).toBe(false)
    await runHook('generate', { run, phase: 'before', sdd })
    writeFileSync(sdd, '# Change\n')
    await runHook('generate', { run, phase: 'after', sdd })
    await runHook('evidence', {
      run,
      repository: root,
      documents: [{ sdd, fact_ids: ['F1'] }],
      facts: [
        {
          id: 'F1',
          claim: 'x',
          classification: 'USER_STATED',
          reference: 'the request',
          normative: true
        }
      ]
    })
    const done = await runHook('done', { run, documents: [sdd] })
    expect(done.blocking.map((issue) => issue.code)).not.toContain(
      'LIFECYCLE_CALL_ORDER_IMPOSSIBLE'
    )
  } finally {
    discardMinted()
    rmSync(root, { recursive: true, force: true })
  }
})

test('what the evidence ledger carried stays answerable after the run', async () => {
  // `evidence` passing says the payload was well formed and internally consistent. An empty shell of
  // three plausible facts passes exactly as a real ledger does, and afterwards nothing could tell
  // them apart — the journal recorded that the call happened and nothing about what it held.
  const root = repository(WORKSPACE)
  const sdd = join(root, 'change.sdd.md')
  try {
    const started = await runHook('initial', initial(root))
    const run = started.run!
    minted.add(run)
    await runHook('generate', { run, phase: 'before', sdd })
    writeFileSync(sdd, '# Change\n')
    await runHook('generate', { run, phase: 'after', sdd })
    await runHook('evidence', {
      run,
      repository: root,
      documents: [{ sdd, fact_ids: ['F1', 'F2', 'F3'] }],
      facts: [
        {
          id: 'F1',
          claim: 'A',
          classification: 'USER_STATED',
          reference: 'the request',
          normative: true
        },
        {
          id: 'F2',
          claim: 'B',
          classification: 'USER_STATED',
          reference: 'the request',
          normative: true
        },
        {
          id: 'F3',
          claim: 'probably fine',
          classification: 'ASSUMED',
          reference: 'not verified',
          normative: false
        }
      ]
    })
    const done = await runHook('done', { run, documents: [sdd] })
    const [ledger] = (done.facts.run as { ledgers: Record<string, unknown>[] }).ledgers
    // Counts, never content: this is forensics about a submission, not a second copy of the document.
    expect(ledger).toMatchObject({
      total: 3,
      normative: 2,
      by_classification: { USER_STATED: 2, ASSUMED: 1 }
    })
    // A design resting entirely on what was stated, with nothing read from the repository, is a
    // shape worth seeing. The counts do not make that judgement — they make it possible to make.
    expect(done.advisory.map((issue) => issue.code)).toContain('LIFECYCLE_LEDGER_UNOBSERVED')
    // One observation is enough to make the ledger a reading of the repository rather than a recital.
    const grounded = await runHook('evidence', {
      run,
      repository: root,
      documents: [{ sdd, fact_ids: ['G1'] }],
      facts: [
        {
          id: 'G1',
          claim: 'site declares bun',
          classification: 'OBSERVED',
          reference: 'site/package.json',
          normative: true
        }
      ]
    })
    expect(grounded.ok).toBe(true)
    const after = await runHook('done', { run, documents: [sdd] })
    expect(after.advisory.map((issue) => issue.code)).not.toContain('LIFECYCLE_LEDGER_UNOBSERVED')
  } finally {
    discardMinted()
    rmSync(root, { recursive: true, force: true })
  }
})

test('a ledger belongs to the run, and each document says which of its facts it rests on', async () => {
  // The field used to name one `sdd`, which left a program-wide ledger with two bad shapes: submit
  // it once per document, identical each time, or hang it on one document arbitrarily. A real run
  // chose the first, and three documents ended up with a fact census matching byte for byte while
  // one of those facts was an editorial assumption irrelevant to two of them. Every document looked
  // independently grounded and none of them was.
  const root = repository(WORKSPACE)
  const run = startedRun(root)
  const observed = join(root, 'observed.sdd.md')
  const stated = join(root, 'stated.sdd.md')
  const facts = [
    {
      id: 'F1',
      claim: 'site declares bun',
      classification: 'OBSERVED',
      reference: 'site/package.json',
      normative: true
    },
    {
      id: 'F2',
      claim: 'readers are first-time users',
      classification: 'USER_STATED',
      reference: 'the request',
      normative: true
    },
    {
      id: 'F3',
      claim: 'nobody reads offline',
      classification: 'ASSUMED',
      reference: 'no interviews',
      normative: false
    },
    {
      id: 'F4',
      claim: 'a manifest exists',
      classification: 'OBSERVED',
      reference: 'package.json',
      normative: false
    }
  ]
  try {
    const result = await runHook('evidence', {
      run,
      repository: root,
      facts,
      documents: [
        { sdd: observed, fact_ids: ['F1', 'F3'] },
        { sdd: stated, fact_ids: ['F2'] }
      ]
    })
    expect(result.ok).toBe(true)
    expect(result.facts.ledger).toMatchObject({ total: 4, normative: 2, documents: 2 })
    expect(result.facts.reliance).toEqual([
      { sdd: observed, facts: 2, normative: 1 },
      { sdd: stated, facts: 1, normative: 1 }
    ])
    const advisory = result.advisory.map((issue) => `${issue.code} ${issue.detail}`)
    // Asked per document because that is where it means something: one document resting entirely on
    // what was stated is a fact about that document, and a run-wide count hides it behind the others.
    expect(advisory.some((line) => line.startsWith('LIFECYCLE_DOCUMENT_UNOBSERVED'))).toBe(true)
    expect(advisory.find((line) => line.includes('DOCUMENT_UNOBSERVED'))).toContain(stated)
    // A harvested fact no document rests on was read and used by nothing — not an error, but the
    // shape a padded ledger takes.
    expect(advisory.find((line) => line.startsWith('LIFECYCLE_FACT_UNUSED'))).toContain('F4')
    // A document cannot rest on a fact this ledger never recorded.
    const dangling = await runHook('evidence', {
      run,
      repository: root,
      facts,
      documents: [{ sdd: observed, fact_ids: ['F9'] }]
    })
    expect(dangling.blocking.map((issue) => issue.code)).toContain('LIFECYCLE_FACT_ID_UNKNOWN')
    // A document that names no fact at all is grounded in nothing, and the schema refuses it.
    const empty = await runHook('evidence', {
      run,
      repository: root,
      facts,
      documents: [{ sdd: observed, fact_ids: [] }]
    })
    expect(empty.blocking.map((issue) => issue.code)).toEqual(['LIFECYCLE_PAYLOAD_INVALID'])
  } finally {
    discardMinted()
    rmSync(root, { recursive: true, force: true })
  }
})
