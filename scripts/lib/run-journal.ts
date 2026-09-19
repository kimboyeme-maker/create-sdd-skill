import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * What an authoring run actually did, as opposed to what its final reply says it did.
 *
 * Each hook is a separate process, so "was `initial` called" cannot be answered by a wrapper in
 * memory: the record has to outlive the process. It lives outside the repository and outside the
 * output directory — a run's bookkeeping is not a deliverable and must not appear in a diff — and
 * is keyed by a run id the first hook mints and every later hook carries.
 *
 * Be exact about what a journal entry proves: that a hook was called with a payload that passed its
 * own checks. It does not prove the work behind the call happened. What it removes is the cheapest
 * failure — a run that skipped a phase entirely and reported as though it had not.
 */
export type JournalEntry = {
  event: string
  at: string
  /** Whichever document the event concerned, when it concerned one. */
  sdd?: string
  /** The event's own discriminator: `before`/`after` for generate, the phase name for process. */
  detail?: string
  /**
   * Documents this call told the session to load. Recorded because the reverse question — is the
   * final receipt claiming documents nothing ever asked for — has no other way to be asked.
   */
  required?: string[]
  /** Assumptions this call recorded, so the terminal report can surface what was never verified. */
  assumptions?: string[]
  /**
   * The shape of a submitted fact ledger: how many facts, how they were classified, how many carry
   * a requirement. Recorded because `evidence` passing says only that the payload was well formed
   * and internally consistent — an empty shell of three plausible facts passes exactly as a real
   * ledger does, and afterwards nothing could tell them apart. Counts, never content: this is
   * forensics about a submission, not a second copy of the document.
   */
  ledger?: {
    total: number
    normative: number
    by_classification: Record<string, number>
    /** How many documents declared which of these facts they rest on. */
    documents: number
  }
  ok: boolean
}
export type Journal = {
  protocol: 'create-sdd-run/v1'
  run: string
  started: string
  repository?: string
  output_root?: string
  entries: JournalEntry[]
}

/** Runs live beside the session's temporary files, never in the repository being described. */
const HOME = join(tmpdir(), 'create-sdd-runs')
const RUN_ID = /^[0-9a-f]{12}$/
/**
 * How long a journal is worth keeping. Nothing ever deleted these: every run this tool has served,
 * real or test, was still on disk. An authoring run lasts hours at most, so a week is far past any
 * session that could still be reading one, and this directory holds nothing but this protocol's own
 * bookkeeping — the record is evidence during a run and litter afterwards.
 */
const RETAIN_DAYS = 7

export const runPath = (run: string) => join(HOME, `${run}.json`)

/** A short, collision-resistant id. Short because an agent has to carry it through every call. */
export function mintRun(): string {
  return createHash('sha256').update(randomUUID()).digest('hex').slice(0, 12)
}

export function validRunId(run: string): boolean {
  return RUN_ID.test(run)
}

export function readJournal(run: string): Journal | null {
  if (!validRunId(run) || !existsSync(runPath(run))) return null
  try {
    return JSON.parse(readFileSync(runPath(run), 'utf8')) as Journal
  } catch {
    return null
  }
}

/**
 * Drop journals past the retention window. Swept when a run starts rather than on a schedule: this
 * is the only moment the tool is guaranteed to be running, and a sweep that never happens is how the
 * directory grew unbounded in the first place. Failures are ignored — a journal that cannot be
 * removed is litter, and refusing to start a run over it would be worse.
 */
function prune(): void {
  const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000
  let names: string[]
  try {
    names = readdirSync(HOME)
  } catch {
    return
  }
  for (const name of names) {
    if (!RUN_ID.test(name.replace(/\.json$/, ''))) continue
    try {
      if (statSync(join(HOME, name)).mtimeMs < cutoff) rmSync(join(HOME, name), { force: true })
    } catch {
      /* Litter, not a failure. */
    }
  }
}

/** Remove one journal. A caller that knows a run is finished need not wait for the sweep. */
export function discardRun(run: string): void {
  if (!validRunId(run)) return
  try {
    rmSync(runPath(run), { force: true })
  } catch {
    /* Litter, not a failure. */
  }
}

export function startJournal(run: string, repository?: string, output_root?: string): Journal {
  const journal: Journal = {
    protocol: 'create-sdd-run/v1',
    run,
    started: new Date().toISOString(),
    ...(repository ? { repository } : {}),
    ...(output_root ? { output_root } : {}),
    entries: []
  }
  mkdirSync(HOME, { recursive: true })
  prune()
  writeFileSync(runPath(run), JSON.stringify(journal))
  return journal
}

/**
 * Appends one call. A failed call is recorded too: a run that tried `handoff` three times and was
 * refused each time is a different run from one that never tried, and only the journal can tell
 * them apart afterwards.
 */
export function append(run: string, entry: Omit<JournalEntry, 'at'>): Journal | null {
  const journal = readJournal(run)
  if (!journal) return null
  journal.entries.push({ ...entry, at: new Date().toISOString() })
  writeFileSync(runPath(run), JSON.stringify(journal))
  return journal
}

/** Every document any call told this run to load, across the whole run. */
export function everRequired(journal: Journal, sdd?: string): string[] {
  return [
    ...new Set(
      journal.entries
        .filter((entry) => sdd === undefined || entry.sdd === sdd || entry.sdd === undefined)
        .flatMap((entry) => entry.required ?? [])
    )
  ]
}

/** Every fact ledger this run submitted, in the order the submissions happened. */
export function ledgers(journal: Journal): {
  sdd?: string
  total: number
  normative: number
  by_classification: Record<string, number>
  documents: number
}[] {
  return journal.entries
    .filter((entry) => entry.ok && entry.ledger)
    .map((entry) => ({ ...(entry.sdd ? { sdd: entry.sdd } : {}), ...entry.ledger! }))
}

/** Assumptions recorded anywhere in this run. */
export function everAssumed(journal: Journal): string[] {
  return [...new Set(journal.entries.flatMap((entry) => entry.assumptions ?? []))]
}

/**
 * Sequences the journal can prove impossible, as opposed to merely unreported. `generate:after`
 * without a prior `generate:before`, and `amend` without a prior `generate:after`, are claims about
 * an order that cannot have happened. A phase entered without an earlier phase ever being entered
 * is a different thing — it may only mean the session did not report that transition — so it is
 * named separately and left to the caller to grade.
 */
export function outOfOrder(journal: Journal): { impossible: string[]; unreported: string[] } {
  const impossible: string[] = []
  const unreported: string[] = []
  // Only calls that were accepted count as having happened. A refused call changed nothing, and
  // counting it would make one misuse of an optional hook poison a run permanently: the entry stays
  // in the journal forever, so `done` could never be reached again. Refusals are recorded for
  // forensics — a run that tried and was refused is not a run that never tried — and that is a
  // different question from the order the work actually went in.
  const at = (event: string, sdd: string, detail?: string) =>
    journal.entries.findIndex(
      (entry) =>
        entry.ok &&
        entry.event === event &&
        entry.sdd === sdd &&
        (detail === undefined || entry.detail === detail)
    )
  const documents = [
    ...new Set(journal.entries.map((entry) => entry.sdd).filter((sdd): sdd is string => !!sdd))
  ]
  const ORDER = ['harvest', 'admit', 'design', 'verify', 'decompose', 'handoff']
  for (const sdd of documents) {
    const before = at('generate', sdd, 'before')
    const after = at('generate', sdd, 'after')
    if (after !== -1 && (before === -1 || before > after))
      impossible.push(`${sdd}: generate:after precedes generate:before`)
    const amend = at('amend', sdd)
    if (amend !== -1 && (after === -1 || after > amend))
      impossible.push(
        `${sdd}: amend precedes the document being reported; a revision made while authoring is another generate:after, and amend is for a document already reported`
      )
    // First entry into each phase, in the order the journal saw them.
    const entered = journal.entries
      .filter(
        (entry) =>
          entry.ok &&
          entry.event === 'process' &&
          entry.sdd === sdd &&
          entry.detail?.endsWith(':enter')
      )
      .map((entry) => entry.detail!.split(':')[0]!)
    const seen = new Set<string>()
    for (const phase of entered) {
      const index = ORDER.indexOf(phase)
      for (const earlier of ORDER.slice(0, index))
        if (!seen.has(earlier))
          unreported.push(`${sdd}: entered ${phase} with no ${earlier} transition recorded`)
      seen.add(phase)
    }
  }
  return { impossible, unreported: [...new Set(unreported)] }
}

/** Whether a given event happened at all, optionally narrowed to one document. */
export function called(journal: Journal, event: string, sdd?: string): boolean {
  return journal.entries.some(
    (entry) => entry.event === event && entry.ok && (sdd === undefined || entry.sdd === sdd)
  )
}

/**
 * Elapsed minutes between the first and last recorded call, and per document between its own first
 * and last. This is authoring time measured rather than estimated — the calibration figure this
 * skill has never had, because the only elapsed times it could reach were a delivery's.
 */
export function elapsed(journal: Journal): {
  total_minutes: number
  per_document: { sdd: string; minutes: number }[]
} {
  const minutes = (from: string, to: string) =>
    Math.round(((Date.parse(to) - Date.parse(from)) / 60_000) * 10) / 10
  const stamps = journal.entries.map((entry) => entry.at)
  const documents = [
    ...new Set(journal.entries.map((entry) => entry.sdd).filter((sdd): sdd is string => !!sdd))
  ]
  return {
    total_minutes: stamps.length ? minutes(journal.started, stamps.at(-1)!) : 0,
    per_document: documents.map((sdd) => {
      const own = journal.entries.filter((entry) => entry.sdd === sdd).map((entry) => entry.at)
      return { sdd, minutes: minutes(own[0]!, own.at(-1)!) }
    })
  }
}
