#!/usr/bin/env bun
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { loadContract, programBlock } from './lib/contract-source.ts'
import { derivedConditions, PHASES, requiredDocuments } from './lib/reading-policy.ts'
import {
  append,
  called,
  elapsed,
  everAssumed,
  everRequired,
  ledgers,
  outOfOrder,
  mintRun,
  readJournal,
  startJournal,
  validRunId,
  type JournalEntry
} from './lib/run-journal.ts'
import { validate, type Schema } from './lib/schema.ts'
import { evaluate as evaluateReceipt } from './reading-receipt.ts'
import { type Item } from './facts/repository.ts'
import {
  checkRepositoryFacts,
  packageDirectories,
  repositoryRoot,
  resolveManagers,
  toolchainPins,
  walk
} from './repo-facts.ts'

/**
 * Lifecycle hooks for authoring runs. The four events are the points where an authoring session
 * either learns something it cannot derive on its own or is about to commit to something it cannot
 * cheaply undo, and each one answers with facts the session should use rather than guess.
 *
 * Two rules shape every hook here:
 *
 * 1. **The payload is a claim, never a fact.** A language model writes it, so each field is either
 *    something only the session knows (the user's request, the path it intends to write, the phase
 *    it believes it is entering) or a claim that this file re-derives from the repository and
 *    compares. A hook that believed its input would only launder a guess into a record.
 * 2. **The answer goes back to the session.** A hook that only records is a write-only log, and the
 *    behaviour that needs changing is the session's. So every result carries `facts` — what the
 *    repository actually says — and `next`, which names what must happen before the run continues.
 *
 * `next.must_echo` is the part with teeth: strings the session is required to reproduce verbatim in
 * its reply, because each was being lost between being derivable and being said.
 */
const ROOT = resolve(import.meta.dir, '..')
/** create-sdd owns the document validator; it is invoked as a CLI so this hook reports its verdict. */
const VALIDATE = resolve(ROOT, 'scripts', 'validate.ts')
/**
 * Runs this skill's validator over a leaf document as a CLI, so the hook reports its verdict rather
 * than a second reading of the contract.
 *
 * A program root carries an index of documents, not a contract. Its structural check lived in the
 * retired delivery skill, so a root is disclosed as not validated here — never counted as a pass;
 * `repo-facts` and `reading-receipt` still check it on `done`.
 */
async function runValidate(
  sdd: string
): Promise<{ ran: boolean; ok: boolean; diagnostics: Finding[]; skipped?: string }> {
  // A program root carries an index of documents, not a contract, and is checked with a different
  // command — the validator says so itself, as `SDD_PROGRAM_ROOT`. Sending every document to the
  // leaf validator turned that answer into a blocking diagnostic against a root that was correct: a
  // fault in this hook, not in the document it refused.
  const program = programBlock(readFileSync(sdd, 'utf8')).value !== null
  if (program)
    return {
      ran: false,
      ok: false,
      diagnostics: [],
      skipped:
        'program roots are not leaf contracts; their structural check retired with the delivery skill'
    }
  const proc = Bun.spawn(
    [
      'bun',
      VALIDATE,
      'validate',
      '--sdd',
      sdd,
      '--document-policy',
      'current',
      '--design-policy',
      'current'
    ],
    { stdout: 'pipe', stderr: 'pipe' }
  )
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ])
  await proc.exited
  try {
    const parsed = JSON.parse(out) as {
      valid?: boolean
      diagnostics?: { code?: string; detail?: string; message?: string }[]
    }
    return {
      ran: true,
      ok: parsed.valid === true,
      diagnostics: (parsed.diagnostics ?? []).map((item) =>
        finding(item.code ?? 'VALIDATE_DIAGNOSTIC', item.detail ?? item.message ?? '')
      )
    }
  } catch {
    // A validator that produced no JSON has failed in a way its own codes cannot describe; passing
    // its stderr through is more use than reporting a parse error about it.
    return {
      ran: true,
      ok: false,
      diagnostics: [finding('VALIDATE_UNREADABLE', (err || out).trim().slice(0, 400))]
    }
  }
}
const EVENTS = ['initial', 'evidence', 'generate', 'process', 'amend', 'done'] as const
type Event = (typeof EVENTS)[number]

type Finding = { code: string; detail: string }
type Result = {
  protocol: 'create-sdd-lifecycle/v1'
  event: Event
  ok: boolean
  /** Violations that stop the run. The session must resolve each before continuing. */
  blocking: Finding[]
  /** Observations worth acting on that do not by themselves stop anything. */
  advisory: Finding[]
  /** What the repository says, for the session to use instead of inferring. */
  facts: Record<string, unknown>
  next: { must_do: string[]; must_echo: string[]; echo_token?: string }
  /** The run this call was recorded against, echoed so the session can carry it forward. */
  run?: string
}

/**
 * Identifies the exact set of strings a reply must contain. Passing it back on the next call proves
 * the session read this result — the same standard, and the same limit, as a reading receipt: it
 * identifies content, not an authenticated echo. What it changes is that a forgotten echo leaves the
 * run with no `ok` terminal state, and a claimed one is an explicit claim rather than a silence.
 */
const echoToken = (strings: readonly string[]) =>
  createHash('sha256').update(strings.join('\n')).digest('hex').slice(0, 8)

const SPLIT_SOURCES = ['USER_STATED', 'USER_APPROVED', 'USER_INSTRUCTED'] as const
/** Phase 1's fact ledger. Only the first two may carry a normative claim. */
const CLASSIFICATIONS = ['USER_STATED', 'OBSERVED', 'INFERRED', 'ASSUMED'] as const
const NORMATIVE_CLASSIFICATIONS = ['USER_STATED', 'OBSERVED']
const MODES = ['create', 'refactor', 'merge', 'audit', 'migration', 'program'] as const

/**
 * What each event's payload must contain. Every field is either unknowable from outside the session
 * or is checked against the repository below; nothing is recorded on the session's word alone.
 */
const SCHEMAS: Readonly<Record<Event, Schema>> = {
  initial: {
    // The user's own words. Nothing derives this, and a run that cannot restate its own request has
    // not finished reading it.
    request: { type: 'string' },
    repository: { type: 'string' },
    // Output location is independent of the repository being described, so it is stated, not assumed.
    output_root: { type: 'string' },
    mode: { type: 'string', enum: MODES },
    archetype: { type: 'string' },
    owned_packages: { type: 'string[]', min: 1 },
    split: {
      type: 'object',
      nullable: true,
      fields: {
        source: { type: 'string', enum: SPLIT_SOURCES },
        reference: { type: 'string' }
      }
    }
  },
  evidence: {
    // The run this call belongs to, from `initial`. Without it nothing can tell a run that
    // skipped a phase from one that performed it and simply did not say so.
    run: { type: 'string', pattern: /^[0-9a-f]{12}$/ },
    // The ledger Phase 1 produces. It belongs to the run, not to a document: one harvest reads the
    // repository once, and the facts it yields are the same facts whatever is written from them.
    //
    // This field used to name a single `sdd`, which left a program-wide ledger with two bad shapes —
    // submit it once per document, identical each time, or hang it on one document arbitrarily. The
    // first is what a real run chose, and the result was three documents whose fact census matched
    // byte for byte while one of the facts was an editorial assumption irrelevant to two of them.
    // Every document looked independently grounded and none of them was.
    repository: { type: 'string' },
    facts: {
      type: 'object[]',
      min: 1,
      fields: {
        id: { type: 'string' },
        claim: { type: 'string' },
        classification: { type: 'string', enum: CLASSIFICATIONS },
        // What the claim rests on: a repository path for OBSERVED, the user's words for USER_STATED,
        // the facts it was derived from for INFERRED, the reason it is unverified for ASSUMED.
        reference: { type: 'string' },
        // Whether this fact backs a requirement, an acceptance oracle or a constraint.
        normative: { type: 'boolean' }
      }
    },
    // Which facts each document actually rests on. Required, and required per document, because
    // that is the question the old shape could not answer: a ledger shared by three documents says
    // nothing about which of them any one fact grounds.
    documents: {
      type: 'object[]',
      min: 1,
      fields: {
        sdd: { type: 'string' },
        fact_ids: { type: 'string[]', min: 1 }
      }
    }
  },
  amend: {
    // The run this call belongs to, from `initial`. Without it nothing can tell a run that
    // skipped a phase from one that performed it and simply did not say so.
    run: { type: 'string', pattern: /^[0-9a-f]{12}$/ },
    // A document changed after it was reported. Convergence is a claim about a moment, and nothing
    // reset it when that moment passed.
    sdd: { type: 'string' },
    reason: { type: 'string' },
    normative: { type: 'boolean' }
  },
  generate: {
    // The run this call belongs to, from `initial`. Without it nothing can tell a run that
    // skipped a phase from one that performed it and simply did not say so.
    run: { type: 'string', pattern: /^[0-9a-f]{12}$/ },
    // Before writing, the payload is a plan and the answer is what to read; after writing, it is a
    // path and the answer is whether the document holds up. One event, two different questions.
    phase: { type: 'string', enum: ['before', 'after'] },
    sdd: { type: 'string' },
    title: { type: 'string', optional: true },
    node_id: { type: 'string', optional: true },
    owned_packages: { type: 'string[]', optional: true },
    estimate_minutes: { type: 'number[]', optional: true, length: 2 }
  },
  process: {
    // The run this call belongs to, from `initial`. Without it nothing can tell a run that
    // skipped a phase from one that performed it and simply did not say so.
    run: { type: 'string', pattern: /^[0-9a-f]{12}$/ },
    sdd: { type: 'string' },
    phase: { type: 'string', enum: PHASES.map((phase) => phase.toLowerCase()) },
    // Entering a phase is checked against what the document must already carry; leaving it is
    // checked against what it must now carry. The same phase name means two different gates.
    entering: { type: 'boolean' },
    note: { type: 'string' }
  },
  done: {
    // The run this call belongs to, from `initial`. Without it nothing can tell a run that
    // skipped a phase from one that performed it and simply did not say so.
    run: { type: 'string', pattern: /^[0-9a-f]{12}$/ },
    program: { type: 'string', optional: true },
    documents: { type: 'string[]', min: 1 },
    // The token from this run's first `done`, sent back after the reply has been written. Absent on
    // the first call by construction: the token does not exist until the first call produces it.
    echoed: { type: 'string', optional: true, pattern: /^[0-9a-f]{8}$/ }
  }
}

const finding = (code: string, detail: string): Finding => ({ code, detail })

/** Absolute paths only: a relative path means something different to the session than to this file. */
function absolute(value: string, label: string, blocking: Finding[]): string | null {
  if (!isAbsolute(value)) {
    blocking.push(finding('LIFECYCLE_PATH_NOT_ABSOLUTE', `${label}: ${value}`))
    return null
  }
  return resolve(value)
}

/** Repository-derived facts about the roots this work claims to own. */
function ownershipFacts(root: string, owned: readonly string[]) {
  const directories = packageDirectories(root, walk(root))
  return owned.map((name) => {
    const dir = directories.get(name) ?? (existsSync(resolve(root, name)) ? name : null)
    return {
      package: name,
      dir,
      // The manager the package itself declares, so a command is never written from the repository
      // root's choice. This is the fact whose absence produced a `pnpm install` in a bun package.
      managers: dir ? resolveManagers(root, dir) : {}
    }
  })
}

async function onInitial(payload: Record<string, unknown>): Promise<Result> {
  const blocking: Finding[] = []
  const advisory: Finding[] = []
  const repository = absolute(String(payload.repository), 'repository', blocking)
  const output = absolute(String(payload.output_root), 'output_root', blocking)
  const facts: Record<string, unknown> = {}
  const must: string[] = []
  if (repository) {
    if (!existsSync(repository))
      blocking.push(finding('LIFECYCLE_REPOSITORY_NOT_FOUND', repository))
    else if (!existsSync(resolve(repository, '.git')))
      // Not fatal: a directory can be described without being a checkout. But every fact below is
      // then about a directory, not a project, and the session should know which it got.
      advisory.push(finding('LIFECYCLE_REPOSITORY_NOT_A_CHECKOUT', repository))
    else if (repositoryRoot(repository) !== repository)
      advisory.push(
        finding(
          'LIFECYCLE_REPOSITORY_NOT_ROOT',
          `nearest checkout is ${repositoryRoot(repository)}`
        )
      )
    if (existsSync(repository)) {
      const owned = (payload.owned_packages as string[]) ?? []
      const ownership = ownershipFacts(repository, owned)
      for (const entry of ownership)
        if (!entry.dir)
          blocking.push(
            finding(
              'LIFECYCLE_OWNED_PACKAGE_UNRESOLVED',
              `${entry.package} names no package or directory in ${repository}`
            )
          )
      facts.ownership = ownership
      facts.toolchain = toolchainPins(repository)
      must.push(
        'Write every command for a package with the manager in its `managers` entry, never the repository root’s.'
      )
    }
  }
  if (output && repository && existsSync(repository)) {
    const inside = !relative(repository, output).startsWith('..')
    facts.output_inside_repository = inside
    if (inside)
      advisory.push(
        finding(
          'LIFECYCLE_OUTPUT_INSIDE_REPOSITORY',
          `${output} is inside ${repository}; writing there changes the repository being described`
        )
      )
  }
  if (payload.mode === 'program' && !payload.split)
    blocking.push(
      finding(
        'LIFECYCLE_SPLIT_DECISION_REQUIRED',
        'program mode records the user decision that produced the split, with its source'
      )
    )
  if (payload.mode !== 'program' && payload.split)
    advisory.push(finding('LIFECYCLE_SPLIT_DECISION_UNUSED', `mode is ${String(payload.mode)}`))
  // The run id is minted here and nowhere else: a later hook that carries one the journal does not
  // know about is a call from a run that never initialised, which is the shape this whole record
  // exists to name.
  const run = mintRun()
  if (blocking.length === 0) startJournal(run, repository ?? undefined, output ?? undefined)
  must.push(`Pass "run": "${run}" on every later lifecycle call.`)
  return {
    protocol: 'create-sdd-lifecycle/v1',
    event: 'initial',
    run,
    ok: blocking.length === 0,
    blocking,
    advisory,
    facts,
    next: { must_do: must, must_echo: [] }
  }
}

async function onEvidence(payload: Record<string, unknown>): Promise<Result> {
  const blocking: Finding[] = []
  const advisory: Finding[] = []
  const facts: Record<string, unknown> = {}
  const repository = absolute(String(payload.repository), 'repository', blocking)
  const entries = (payload.facts ?? []) as {
    id: string
    claim: string
    classification: string
    reference: string
    normative: boolean
  }[]
  const seen = new Set<string>()
  for (const entry of entries) {
    if (seen.has(entry.id))
      blocking.push(finding('LIFECYCLE_FACT_ID_DUPLICATE', `${entry.id} is used twice`))
    seen.add(entry.id)
    // The rule the whole ledger exists for: only what the user stated or the repository showed may
    // carry a requirement. An inference promoted to normative is the failure this catches, and it
    // is exactly the shape a confident model produces.
    if (entry.normative && !NORMATIVE_CLASSIFICATIONS.includes(entry.classification))
      blocking.push(
        finding(
          'LIFECYCLE_NORMATIVE_FACT_NOT_GROUNDED',
          `${entry.id} is ${entry.classification} and cannot be normative; state it as an assumption or observe it`
        )
      )
    // An observation names something the repository can be asked about. If the path is not there,
    // the fact is an inference wearing an observation's label.
    if (entry.classification === 'OBSERVED' && repository) {
      const target = entry.reference.replace(/:[0-9]+(-[0-9]+)?$/, '').trim()
      const resolved = isAbsolute(target) ? target : resolve(repository, target)
      if (!existsSync(resolved))
        blocking.push(
          finding(
            'LIFECYCLE_OBSERVATION_UNRESOLVED',
            `${entry.id}: ${entry.reference} is not in the repository`
          )
        )
    }
    if (entry.classification === 'ASSUMED')
      // The reference on an ASSUMED fact is why it is unverified, which is the half a reader needs;
      // the claim alone reads as a statement of fact.
      advisory.push(
        finding(
          'LIFECYCLE_ASSUMPTION_RECORDED',
          `${entry.id}: ${entry.claim} — unverified: ${entry.reference}`
        )
      )
  }
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const documents = (payload.documents ?? []) as { sdd: string; fact_ids: string[] }[]
  const relied = new Set<string>()
  const reliance: Record<string, unknown>[] = []
  for (const document of documents) {
    const path = absolute(document.sdd, 'documents[].sdd', blocking)
    const unknown = document.fact_ids.filter((id) => !byId.has(id))
    if (unknown.length)
      blocking.push(
        finding(
          'LIFECYCLE_FACT_ID_UNKNOWN',
          `${document.sdd} rests on ${unknown[0]}, which this ledger does not contain`
        )
      )
    for (const id of document.fact_ids) relied.add(id)
    const own = document.fact_ids.map((id) => byId.get(id)).filter((entry) => entry !== undefined)
    const normative = own.filter((entry) => entry!.normative)
    // Asked per document because that is where it means something: one document resting entirely on
    // what was stated is a fact about that document, and a run-wide count hides it behind the others.
    if (normative.length && !normative.some((entry) => entry!.classification === 'OBSERVED'))
      advisory.push(
        finding(
          'LIFECYCLE_DOCUMENT_UNOBSERVED',
          `${document.sdd}: ${normative.length} normative fact(s) and not one observation among them`
        )
      )
    reliance.push({
      ...(path ? { sdd: path } : { sdd: document.sdd }),
      facts: document.fact_ids.length,
      normative: normative.length
    })
  }
  // A harvested fact no document rests on was read and used by nothing. That is not an error — a
  // harvest legitimately reads more than it needs — but it is the shape a padded ledger takes.
  const unused = entries.filter((entry) => !relied.has(entry.id)).map((entry) => entry.id)
  if (unused.length)
    advisory.push(
      finding(
        'LIFECYCLE_FACT_UNUSED',
        `${unused.length} fact(s) no document rests on, first ${unused[0]}`
      )
    )
  const counts: Record<string, number> = {}
  for (const entry of entries)
    counts[entry.classification] = (counts[entry.classification] ?? 0) + 1
  facts.ledger = {
    total: entries.length,
    // How many facts carry a requirement, an acceptance oracle or a constraint. A ledger of twenty
    // observations backing nothing is a different submission from three backing the whole design.
    normative: entries.filter((entry) => entry.normative).length,
    by_classification: counts,
    documents: documents.length
  }
  facts.reliance = reliance
  return {
    protocol: 'create-sdd-lifecycle/v1',
    event: 'evidence',
    ok: blocking.length === 0,
    blocking,
    advisory,
    facts,
    next: {
      must_do: [
        'Carry every ASSUMED fact into the document as a stated assumption with its limit, never as a requirement.'
      ],
      must_echo: []
    }
  }
}

async function onAmend(payload: Record<string, unknown>): Promise<Result> {
  const blocking: Finding[] = []
  const advisory: Finding[] = []
  const facts: Record<string, unknown> = {}
  const must: string[] = []
  const sdd = absolute(String(payload.sdd), 'sdd', blocking)
  if (sdd) {
    if (!existsSync(sdd)) blocking.push(finding('LIFECYCLE_DOCUMENT_NOT_WRITTEN', sdd))
    else {
      const text = readFileSync(sdd, 'utf8')
      const { contract, error } = await loadContract(sdd, text)
      if (error) blocking.push(finding('LIFECYCLE_CONTRACT_UNREADABLE', error))
      const convergence = (contract as { design_convergence?: Record<string, unknown> } | null)
        ?.design_convergence
      const repositoryFacts = await checkRepositoryFacts(sdd)
      // `CONVERGED` plus `stable_after_last_normative_change` is a claim about a moment that has
      // now passed. Nothing reset it, so a document could be edited after converging and still
      // present itself as settled — and the delivery controller would admit it on that claim.
      //
      // The boolean alone cannot carry that check. Clearing it to report the amendment makes the
      // document unstable, which `repo-facts` then blocks on as `DESIGN_GATE_UNSTABLE`; leaving it
      // set is blocked here. Both endings refuse a session that did re-review, which is the one
      // case this event exists to record. The evidence that distinguishes them already exists:
      // review lens passes carry the revision they were run against, and `repo-facts` reports a
      // lens whose newest pass predates the current revision. Staleness is that finding, not the
      // boolean, so an author who re-reviewed and recorded passes at the amended revision may
      // report the amendment with convergence intact.
      const lensStale = repositoryFacts.issues.some(
        (issue) => issue.code === 'DESIGN_GATE_LENS_NOT_CURRENT'
      )
      if (
        payload.normative === true &&
        convergence?.status === 'CONVERGED' &&
        convergence?.stable_after_last_normative_change === true &&
        lensStale
      )
        blocking.push(
          finding(
            'LIFECYCLE_CONVERGENCE_STALE',
            'a normative change after CONVERGED invalidates every review lens pass recorded before it; re-run the three lenses, record one PASS each at the amended revision, then report the amendment'
          )
        )
      blocking.push(...repositoryFacts.issues)
      facts.repo_facts = { valid: repositoryFacts.valid }
      facts.convergence = convergence ?? null
      must.push(
        payload.normative === true
          ? 'Re-run the three review lenses against the amended design and record the new passes before claiming CONVERGED again.'
          : 'A non-normative amendment leaves convergence intact; say which it was in the reply.'
      )
    }
  }
  return {
    protocol: 'create-sdd-lifecycle/v1',
    event: 'amend',
    ok: blocking.length === 0,
    blocking,
    advisory,
    facts,
    next: { must_do: must, must_echo: [] }
  }
}

async function onGenerate(payload: Record<string, unknown>): Promise<Result> {
  const blocking: Finding[] = []
  const advisory: Finding[] = []
  const facts: Record<string, unknown> = {}
  const must: string[] = []
  const phase = String(payload.phase)
  const sdd = absolute(String(payload.sdd), 'sdd', blocking)
  if (sdd) {
    if (phase === 'before') {
      // The only thing worth gating before a document exists is where it goes and what must be read
      // to write it. Both are cheap now and expensive to discover afterwards.
      if (!existsSync(dirname(sdd)))
        blocking.push(finding('LIFECYCLE_OUTPUT_DIRECTORY_MISSING', dirname(sdd)))
      if (existsSync(sdd)) {
        if (statSync(sdd).isDirectory())
          blocking.push(finding('LIFECYCLE_TARGET_IS_DIRECTORY', sdd))
        else
          advisory.push(
            finding(
              'LIFECYCLE_TARGET_EXISTS',
              `${sdd} will be revised in place; replacement needs the user’s instruction`
            )
          )
      }
      const estimate = payload.estimate_minutes as number[] | undefined
      if (estimate && (estimate[0]! > estimate[1]! || estimate[0]! < 0))
        blocking.push(
          finding('LIFECYCLE_ESTIMATE_INVALID', `[${estimate.join(', ')}] is not a low-high range`)
        )
      // The reading policy answers "what must this author load", and it answers it from the
      // document's own conditions. Handing the list over now is the difference between a receipt
      // that is assembled and one that is reconstructed afterwards.
      const required = requiredDocuments('HANDOFF', null)
      facts.reading_baseline = required
      must.push(
        'Load every document in `reading_baseline`, plus whatever the contract’s own conditions add, before writing normative content.'
      )
    } else {
      if (!existsSync(sdd)) {
        blocking.push(finding('LIFECYCLE_DOCUMENT_NOT_WRITTEN', sdd))
      } else {
        // After writing, the question is no longer a plan: run the document's own checks.
        const repositoryFacts = await checkRepositoryFacts(sdd)
        const receipt = await evaluateReceipt(sdd)
        facts.repo_facts = { valid: repositoryFacts.valid, issues: repositoryFacts.issues }
        facts.reading_receipt = {
          valid: receipt.valid,
          missing: receipt.missing,
          stale: receipt.stale
        }
        blocking.push(...repositoryFacts.issues)
        for (const path of receipt.missing)
          blocking.push(finding('LIFECYCLE_RECEIPT_MISSING', path))
        for (const path of receipt.stale) blocking.push(finding('LIFECYCLE_RECEIPT_STALE', path))
        const validation = await runValidate(sdd)
        facts.validate = validation.skipped
          ? { skipped: validation.skipped }
          : { valid: validation.ok }
        blocking.push(...validation.diagnostics)
        if (validation.skipped)
          advisory.push(finding('LIFECYCLE_VALIDATE_SKIPPED', validation.skipped))
      }
    }
  }
  return {
    protocol: 'create-sdd-lifecycle/v1',
    event: 'generate',
    ok: blocking.length === 0,
    blocking,
    advisory,
    facts,
    next: { must_do: must, must_echo: [] }
  }
}

/**
 * What a document must already carry to enter each phase. These are the preconditions the phase
 * cards state in prose; naming them here is what makes "I am in Design now" checkable rather than
 * announced.
 */
const PHASE_ENTRY: Readonly<Record<string, (text: string, contract: unknown) => string | null>> = {
  harvest: () => null,
  admit: (text) => (/^#/m.test(text) ? null : 'the document has no headings to admit against'),
  design: (_text, contract) =>
    contract ? null : 'Design writes against an admitted contract; none is present yet',
  verify: (_text, contract) =>
    contract ? null : 'Verify reads the contract’s acceptance cases; none is present yet',
  decompose: (_text, contract) =>
    contract ? null : 'Decompose records `delivery_plan` on the contract; none is present yet',
  handoff: (text) =>
    text.includes('<!-- sdd-contract:start -->')
      ? null
      : 'Handoff requires the contract block the delivery controller reads'
}

async function onProcess(payload: Record<string, unknown>): Promise<Result> {
  const blocking: Finding[] = []
  const advisory: Finding[] = []
  const facts: Record<string, unknown> = {}
  const must: string[] = []
  const sdd = absolute(String(payload.sdd), 'sdd', blocking)
  const phase = String(payload.phase)
  if (sdd) {
    if (!existsSync(sdd)) {
      // Harvest legitimately precedes the file; every later phase reads what is already written.
      if (phase !== 'harvest') blocking.push(finding('LIFECYCLE_DOCUMENT_NOT_WRITTEN', sdd))
    } else {
      const text = readFileSync(sdd, 'utf8')
      const { contract, error } = await loadContract(sdd, text)
      if (error) blocking.push(finding('LIFECYCLE_CONTRACT_UNREADABLE', error))
      const problem = payload.entering === true ? PHASE_ENTRY[phase]?.(text, contract) : null
      if (problem)
        blocking.push(finding('LIFECYCLE_PHASE_PRECONDITION_UNMET', `${phase}: ${problem}`))
      // The conditions the reading policy derives change as the contract fills in, so the required
      // set is recomputed at each transition rather than fixed once at the start.
      const conditions = derivedConditions(contract, [], {})
      facts.conditions = conditions
      facts.reading_required = requiredDocuments(
        phase.toUpperCase() as (typeof PHASES)[number],
        contract,
        conditions
      )
      must.push(
        'Load anything in `reading_required` not already receipted before writing this phase’s output.'
      )
    }
  }
  return {
    protocol: 'create-sdd-lifecycle/v1',
    event: 'process',
    ok: blocking.length === 0,
    blocking,
    advisory,
    facts,
    next: { must_do: must, must_echo: [] }
  }
}

async function onDone(payload: Record<string, unknown>): Promise<Result> {
  const blocking: Finding[] = []
  const advisory: Finding[] = []
  const facts: Record<string, unknown> = {}
  const must: string[] = []
  const echo: string[] = []
  const documents = ((payload.documents as string[]) ?? [])
    .map((path) => absolute(path, 'documents', blocking))
    .filter((path): path is string => path !== null)
  const statuses = []
  /** Lines the reply has to carry, each derivable here and lost if it is not said. */
  const surfaced: string[] = []
  /** What each document's receipt says it needed, for the over-claim comparison below. */
  const receipts = new Map<string, string[]>()
  for (const sdd of documents) {
    if (!existsSync(sdd)) {
      blocking.push(finding('LIFECYCLE_DOCUMENT_NOT_WRITTEN', sdd))
      continue
    }
    const repositoryFacts = await checkRepositoryFacts(sdd)
    const receipt = await evaluateReceipt(sdd)
    // A losing manager claim still exists in the repository, and a reader who follows the workspace
    // file instead of the package will install with it. Saying so once in the reply costs a line.
    for (const entry of (repositoryFacts.facts.packages ?? []) as Item[])
      for (const superseded of (entry.superseded_managers ?? []) as string[])
        surfaced.push(
          `${String(entry.package)} is managed by ${String(entry.declared_manager)}; ${superseded} also claims it and loses`
        )
    // A deferred must-ship is work the user agreed to ship and will not get in this delivery. It is
    // recorded in the contract and read by nobody until it is missing.
    const { contract } = await loadContract(sdd, readFileSync(sdd, 'utf8'))
    for (const requirement of ((contract as Item | null)?.requirements ?? []) as Item[])
      if (requirement?.kind === 'must-ship' && requirement?.deferred)
        surfaced.push(
          `${String(requirement.id)} is a deferred must-ship: ${String(requirement.deferred.trigger ?? 'no trigger recorded')}`
        )
    receipts.set(sdd, [...receipt.required])
    statuses.push({
      sdd,
      repo_facts: repositoryFacts.valid,
      reading_receipt: receipt.valid,
      issues: repositoryFacts.issues.map((issue) => issue.code)
    })
    blocking.push(
      ...repositoryFacts.issues.map((issue) => finding(issue.code, `${sdd}: ${issue.detail}`))
    )
    if (!receipt.valid)
      blocking.push(
        finding(
          'LIFECYCLE_RECEIPT_INCOMPLETE',
          `${sdd}: missing ${receipt.missing.length}, stale ${receipt.stale.length}`
        )
      )
  }
  facts.documents = statuses
  const program = payload.program ? absolute(String(payload.program), 'program', blocking) : null
  if (program) {
    if (!existsSync(program)) blocking.push(finding('LIFECYCLE_DOCUMENT_NOT_WRITTEN', program))
    else {
      const block = programBlock(readFileSync(program, 'utf8')).value
      const nodes = (Array.isArray(block?.nodes) ? block.nodes : [])
        .filter((node: { kind?: string; sdd?: string }) => typeof node?.sdd === 'string')
        .map((node: { sdd: string }) => resolve(dirname(program), node.sdd))
      // A program whose reported set does not match its own node list has either lost a document or
      // written one nobody will schedule; both are silent today and both waste the delivery run.
      for (const node of nodes)
        if (!documents.includes(node) && node !== program)
          blocking.push(finding('LIFECYCLE_PROGRAM_NODE_NOT_REPORTED', node))
      for (const sdd of documents)
        if (!nodes.includes(sdd) && sdd !== program)
          advisory.push(finding('LIFECYCLE_DOCUMENT_OUTSIDE_PROGRAM', sdd))
    }
  }
  // A terminal report is the one action no check can observe: this skill cannot see the reply. So
  // the run does not reach `ok` on the strength of the documents alone — it reaches it when the
  // session sends back the token it could only have read here, having written the reply. That is
  // not proof the echo happened; it converts a silent omission into an explicit claim, and a
  // forgotten one into a run with no complete state.
  // What the run actually did, as opposed to what this payload says it produced. A phase that was
  // never called cannot have been checked, and until now a run could skip every hook but this one
  // and still present a finished result.
  const journal = readJournal(String(payload.run))
  if (!journal) {
    blocking.push(
      finding('LIFECYCLE_RUN_UNKNOWN', `${String(payload.run)} was not started by an initial call`)
    )
  } else {
    if (!called(journal, 'evidence'))
      blocking.push(
        finding(
          'LIFECYCLE_PHASE_NEVER_CALLED',
          'evidence: the fact ledger was never submitted, so nothing checked what became normative'
        )
      )
    for (const sdd of documents)
      for (const phase of ['before', 'after'])
        if (
          !journal.entries.some(
            (e) => e.event === 'generate' && e.sdd === sdd && e.detail === phase && e.ok
          )
        )
          blocking.push(
            finding('LIFECYCLE_PHASE_NEVER_CALLED', `generate:${phase} was never called for ${sdd}`)
          )
    // An order the journal shows to be impossible is different from one it merely never saw. The
    // first is a claim about a sequence that cannot have happened; the second may only mean the
    // session did not report a transition, so it is disclosed rather than enforced.
    const order = outOfOrder(journal)
    for (const problem of order.impossible)
      blocking.push(finding('LIFECYCLE_CALL_ORDER_IMPOSSIBLE', problem))
    for (const problem of order.unreported)
      advisory.push(finding('LIFECYCLE_PHASE_ORDER_UNREPORTED', problem))
    // A receipt naming documents this run was never told to load is not proof of anything — reading
    // more than required is honest. It is the signature of a receipt assembled from a template
    // rather than accumulated, which is worth seeing and is not worth blocking on.
    const requested = new Set(everRequired(journal))
    for (const [sdd, required] of receipts) {
      // Only askable where something was asked: a document with no `generate:before` has every
      // receipt entry unrequested by construction, and `LIFECYCLE_PHASE_NEVER_CALLED` already
      // says so. Repeating it here as a second finding would be noise, not a second fact.
      if (!journal.entries.some((e) => e.event === 'generate' && e.sdd === sdd && e.ok)) continue
      const extra = required.filter((path) => !requested.has(path))
      if (extra.length)
        advisory.push(
          finding(
            'LIFECYCLE_RECEIPT_UNREQUESTED',
            `${sdd}: receipt covers ${extra.length} document(s) no call asked for, first ${extra[0]}`
          )
        )
    }
    // Assumptions were recorded when the ledger was submitted and would otherwise reach the user
    // only if someone opened the document. An unverified claim that nobody saw is the failure the
    // classification exists to prevent.
    surfaced.push(
      ...everAssumed(journal).map((assumption) => `未验证的假设 / assumption: ${assumption}`)
    )
    // What `evidence` actually carried. It passing says only that the payload was well formed and
    // internally consistent: an empty shell of three plausible facts passes exactly as a real ledger
    // does. The counts do not make that judgement either — they make it possible to make afterwards.
    const submitted = ledgers(journal)
    const observed = submitted.reduce(
      (sum, item) => sum + (item.by_classification.OBSERVED ?? 0),
      0
    )
    const normative = submitted.reduce((sum, item) => sum + item.normative, 0)
    if (submitted.length && observed === 0 && normative > 0)
      advisory.push(
        finding(
          'LIFECYCLE_LEDGER_UNOBSERVED',
          `${normative} normative fact(s) and not one observation: this design rests entirely on what was stated, with nothing read from the repository`
        )
      )
    facts.run = {
      started: journal.started,
      calls: journal.entries.length,
      ledgers: submitted,
      // Authoring time measured rather than estimated: the calibration figure this skill has never
      // had, because the only elapsed times it could reach before were a delivery's.
      ...elapsed(journal)
    }
  }
  // Everything gathered above is covered by the same token, so acknowledging the echo means having
  // read all of it. Assembled here, after
  // the journal has contributed its assumptions — an echo built earlier would omit them.
  echo.push(...surfaced)
  const token = echo.length ? echoToken(echo) : undefined
  if (token && payload.echoed !== token)
    blocking.push(
      finding(
        'LIFECYCLE_ECHO_PENDING',
        payload.echoed === undefined
          ? `reply with every must_echo string verbatim, then call done again with "echoed": "${token}"`
          : `echoed ${String(payload.echoed)} does not identify this run's strings (${token})`
      )
    )
  if (token)
    must.push(
      payload.echoed === token
        ? 'Nothing further: the echo was acknowledged for this exact set of strings.'
        : 'Reproduce every string in `must_echo` verbatim, on its own line, in the reply, then call done again with `echoed`.'
    )
  return {
    protocol: 'create-sdd-lifecycle/v1',
    event: 'done',
    ok: blocking.length === 0,
    blocking,
    advisory,
    facts,
    next: {
      must_do: must,
      must_echo: payload.echoed === token ? [] : echo,
      ...(token ? { echo_token: token } : {})
    }
  }
}

const HANDLERS: Readonly<Record<Event, (payload: Record<string, unknown>) => Promise<Result>>> = {
  initial: onInitial,
  evidence: onEvidence,
  generate: onGenerate,
  amend: onAmend,
  process: onProcess,
  done: onDone
}

/** Runs one hook against an already-parsed payload. Exported so tests need no subprocess. */
/** What a call is about, for the journal: the document and the event's own discriminator. */
function subject(
  event: Event,
  payload: Record<string, unknown>,
  result: Result
): Omit<JournalEntry, 'at' | 'ok'> {
  const sdd = typeof payload.sdd === 'string' ? resolve(payload.sdd) : undefined
  const detail =
    event === 'generate'
      ? String(payload.phase)
      : event === 'process'
        ? `${String(payload.phase)}:${payload.entering === true ? 'enter' : 'leave'}`
        : undefined
  // What the call told the session to load, and what it recorded as unverified. Both come from the
  // result rather than the payload: they are this tool's answers, not the session's claims, which
  // is exactly what makes them usable to check the session later.
  const required = [
    ...((result.facts.reading_baseline as string[] | undefined) ?? []),
    ...((result.facts.reading_required as string[] | undefined) ?? [])
  ]
  const assumptions = result.advisory
    .filter((issue) => issue.code === 'LIFECYCLE_ASSUMPTION_RECORDED')
    .map((issue) => issue.detail)
  // The shape of a submitted ledger, so "what did `evidence` actually carry" stays answerable after
  // the run. Counts only — the facts themselves belong to the document, not to this bookkeeping.
  const submitted = result.facts.ledger as
    | {
        total: number
        normative: number
        by_classification: Record<string, number>
        documents: number
      }
    | undefined
  return {
    event,
    ...(sdd ? { sdd } : {}),
    ...(detail ? { detail } : {}),
    ...(required.length ? { required } : {}),
    ...(assumptions.length ? { assumptions } : {}),
    ...(submitted
      ? {
          ledger: {
            total: submitted.total,
            normative: submitted.normative,
            by_classification: submitted.by_classification,
            documents: submitted.documents
          }
        }
      : {})
  }
}

export async function runHook(event: Event, payload: unknown): Promise<Result> {
  const problems = validate(payload, SCHEMAS[event])
  if (problems.length)
    return {
      protocol: 'create-sdd-lifecycle/v1',
      event,
      ok: false,
      blocking: problems.map((problem) => finding('LIFECYCLE_PAYLOAD_INVALID', problem)),
      advisory: [],
      facts: {},
      next: { must_do: ['Correct the payload and call this hook again.'], must_echo: [] }
    }
  const input = payload as Record<string, unknown>
  // A run id that names no journal is reported by the handler that cares; recording is skipped
  // rather than inventing a journal, because a fabricated record is worse than a missing one.
  const run = typeof input.run === 'string' && validRunId(input.run) ? input.run : null
  const result = await HANDLERS[event](input)
  if (run && event !== 'initial') {
    // A refused call is recorded too: a run that tried handoff three times and was refused each
    // time is a different run from one that never tried, and only the journal separates them.
    const recorded = append(run, { ...subject(event, input, result), ok: result.ok })
    if (!recorded && !result.blocking.some((issue) => issue.code === 'LIFECYCLE_RUN_UNKNOWN'))
      return {
        ...result,
        ok: false,
        blocking: [
          ...result.blocking,
          finding('LIFECYCLE_RUN_UNKNOWN', `${run} was not started by an initial call`)
        ]
      }
    return { ...result, run }
  }
  return result
}

/** The payload schemas, for an agent that wants to read the shape before writing one. */
export function describe(): object {
  const render = (schema: Schema): Record<string, string> =>
    Object.fromEntries(
      Object.entries(schema).map(([key, field]) => [
        key,
        [
          field.type,
          field.optional ? 'optional' : 'required',
          'enum' in field && field.enum ? `one of ${field.enum.join('|')}` : '',
          'nullable' in field && field.nullable ? 'nullable' : ''
        ]
          .filter(Boolean)
          .join(', ')
      ])
    )
  return {
    protocol: 'create-sdd-lifecycle/v1',
    events: Object.fromEntries(EVENTS.map((event) => [event, render(SCHEMAS[event])])),
    note: 'Payload fields are claims. Every one that the repository can answer is re-derived and compared; the answer comes back in `facts`.'
  }
}

if (import.meta.main) {
  const argv = Bun.argv.slice(2)
  const command = argv[0]
  if (command === 'describe' || argv.length === 0) {
    console.log(JSON.stringify(describe()))
    process.exit(0)
  }
  const event = command as Event
  if (!EVENTS.includes(event)) {
    console.error(
      `usage: lifecycle.ts <${EVENTS.join('|')}> --payload-file <path> | --payload <json>\n` +
        '       lifecycle.ts describe   # every event\u2019s payload fields'
    )
    console.error('       lifecycle.ts describe')
    process.exit(2)
  }
  const flag = argv[1]
  const value = argv[2]
  let raw: string
  if (flag === '--payload-file' && value) raw = readFileSync(resolve(value), 'utf8')
  else if (flag === '--payload' && value) raw = value
  else {
    console.error(
      `usage: lifecycle.ts ${event} --payload-file <path> | --payload <json>\n` +
        `       lifecycle.ts describe   # ${event}\u2019s payload fields`
    )
    process.exit(2)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.log(
      JSON.stringify({
        protocol: 'create-sdd-lifecycle/v1',
        event,
        ok: false,
        blocking: [finding('LIFECYCLE_PAYLOAD_UNPARSEABLE', (error as Error).message)],
        advisory: [],
        facts: {},
        next: { must_do: ['Send valid JSON.'], must_echo: [] }
      })
    )
    process.exit(1)
  }
  const result = await runHook(event, parsed)
  console.log(JSON.stringify(result))
  // stdout stays machine-readable; the strings a reply must carry also go to stderr, because a
  // harness that shows a tool's stderr to its model shows them at the moment they are needed.
  for (const line of result.next.must_echo) console.error(`ECHO VERBATIM: ${line}`)
  process.exit(result.ok ? 0 : 1)
}

export { ROOT }
