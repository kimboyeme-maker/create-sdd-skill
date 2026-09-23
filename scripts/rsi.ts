/**
 * The rule ledger and its health report.
 *
 * Every rule in this skill costs prose to state, code to enforce and tests to hold in place, and
 * every one of them arrived because something went wrong once. Nothing has ever measured which of
 * them still catches anything, so the only available move has been to add another — thirteen
 * commits, +14000 lines, -730. `audit` is the first thing here that can answer "does this rule earn
 * its keep", and `catalog` is what gives it something to answer about.
 *
 * The ledger is derived from the sources, not hand-maintained: a hand-written list of 227 codes
 * would be stale within a week, and a stale ledger is worse than none because it reads as evidence.
 *
 *   rsi.ts catalog [--render]      derive the rule ledger; --render writes rsi/rules.json
 *   rsi.ts audit   [--window <n>]  report rule health from the telemetry ledger
 *
 * Exit codes: 0 clean, 1 the ledger on disk disagrees with the sources, 2 usage.
 */
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
  mkdirSync
} from 'node:fs'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { readTelemetry, type TelemetryEntry } from './lib/telemetry.ts'
import { applyOverlay, contractOf, withContract, type Json } from './lib/example-overlay.ts'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const ROOT = join(import.meta.dir, '..')
const RULES_FILE = join(ROOT, 'rsi', 'rules.json')
const CASES_FILE = join(ROOT, 'cases', 'defect-cases.json')
const HELD_OUT = join(ROOT, 'cases', 'held-out')
const OPEN_ROUND = join(ROOT, 'rsi', 'open-round.json')
const ROUNDS = join(ROOT, 'rsi', 'rounds')
const BUDGET_FILE = join(ROOT, 'rsi', 'budget.json')
const SUPERSESSION = join(ROOT, 'rsi', 'supersession.json')
const USAGE = [
  'usage:',
  '  rsi.ts catalog [--render]            derive the rule ledger',
  '  rsi.ts audit   [--window <n>]        rule health from the telemetry ledger',
  '  rsi.ts health                        debt level and the round kinds it still admits',
  '  rsi.ts update                        self-check and the ordered agenda for the next round',
  '  rsi.ts suite                         run every mechanical defect case',
  '  rsi.ts open --kind <k> --goal <t>    start a round and commit to its case files',
  '  rsi.ts baseline                      record the champion result for the open round',
  '  rsi.ts evaluate                      re-run the suite and compare against the baseline',
  '  rsi.ts prune                         check supersession and the budget ceilings',
  '  rsi.ts close --confirm <token>       record the verdict and end the round',
  '  rsi.ts ingest --files a.json,b.json  read loop retrospectives into calibration rows and candidates'
].join('\n')

/**
 * Round kinds. Only `improvement` may claim a gain; the others exist so the two cannot be mixed.
 * `consolidation` is the only kind that must leave the skill smaller than it found it.
 */
const KINDS = ['improvement', 'case-amendment', 'budget-change', 'consolidation'] as const
type Kind = (typeof KINDS)[number]

/** Retention decisions for dormant rules, so a consolidation can keep a guard without re-arguing it. */
const DISPOSITIONS = join(ROOT, 'rsi', 'dispositions.json')

/** How many recent runs a health figure looks back over. */
const DEFAULT_WINDOW = 50

/** Codes reach the ledger either as a reported issue or as a thrown contract violation. */
const CODE_PATTERNS = [/code: '([A-Z][A-Z0-9_]{3,})'/g, /Error\('([A-Z][A-Z0-9_]{3,})/g]

export type Rule = Readonly<{
  id: string
  /** Where the rule lives, in the form the supersession record refers to it by. */
  asset: string
  kind: 'issue-code'
  /** Files that raise it, repository-relative to the skill root. */
  sites: readonly string[]
  /** Lines of implementation and test that exist to serve it, as a first-order cost estimate. */
  weight: Readonly<{ sites: number; mentions: number; test_mentions: number }>
}>

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (full.endsWith('.ts')) yield full
  }
}

/** Derive the current rule set from the sources that raise the codes. */
export function catalog(root = ROOT): readonly Rule[] {
  const sites = new Map<string, Set<string>>()
  const mentions = new Map<string, number>()
  const testMentions = new Map<string, number>()
  for (const dir of ['scripts', 'tests']) {
    let entries: Generator<string>
    try {
      entries = walk(join(root, dir))
    } catch {
      continue
    }
    for (const file of entries) {
      const text = readFileSync(file, 'utf8')
      const relativePath = relative(root, file)
      for (const pattern of CODE_PATTERNS)
        for (const match of text.matchAll(pattern)) {
          const code = match[1]!
          if (dir === 'scripts') {
            if (!sites.has(code)) sites.set(code, new Set())
            sites.get(code)!.add(relativePath)
          }
          const bucket = dir === 'scripts' ? mentions : testMentions
          bucket.set(code, (bucket.get(code) ?? 0) + 1)
        }
    }
  }
  const codes = [...new Set([...sites.keys(), ...testMentions.keys()])].sort()
  return codes.map((code, index) => ({
    id: `RL-${String(index + 1).padStart(4, '0')}`,
    asset: `code:${code}`,
    kind: 'issue-code' as const,
    sites: [...(sites.get(code) ?? [])].sort(),
    weight: {
      sites: sites.get(code)?.size ?? 0,
      mentions: mentions.get(code) ?? 0,
      test_mentions: testMentions.get(code) ?? 0
    }
  }))
}

export type RuleHealth = Readonly<{
  asset: string
  fires_window: number
  documents_window: number
  last_seen?: string
  age_without_fire: number
  cost_per_fire: number | null
  redundant_with: readonly string[]
}>

/**
 * Turn the telemetry ledger into per-rule health.
 *
 * `fires_window` counts runs, `documents_window` counts distinct documents: a code that fires fifty
 * times on one document is not the same evidence as one that fires on fifty. `redundant_with` pairs
 * codes whose document sets are near-identical, which is where two rules are probably one.
 */
export function health(
  rules: readonly Rule[],
  entries: readonly TelemetryEntry[],
  window = DEFAULT_WINDOW
): readonly RuleHealth[] {
  const runs = [...new Set(entries.map((entry) => entry.run_id))]
  const recentRuns = new Set(runs.slice(-window))
  const recent = entries.filter((entry) => recentRuns.has(entry.run_id))
  const firesByCode = new Map<string, number>()
  const docsByCode = new Map<string, Set<string>>()
  const lastByCode = new Map<string, string>()
  for (const entry of recent)
    for (const code of [...entry.codes, ...entry.candidate_codes]) {
      firesByCode.set(code, (firesByCode.get(code) ?? 0) + 1)
      if (!docsByCode.has(code)) docsByCode.set(code, new Set())
      docsByCode.get(code)!.add(entry.sdd_sha)
      lastByCode.set(code, entry.ts)
    }
  const jaccard = (a: Set<string>, b: Set<string>) => {
    if (!a.size || !b.size) return 0
    let shared = 0
    for (const value of a) if (b.has(value)) shared += 1
    return shared / (a.size + b.size - shared)
  }
  return rules.map((rule) => {
    const code = rule.asset.slice('code:'.length)
    const fires = firesByCode.get(code) ?? 0
    const docs = docsByCode.get(code) ?? new Set<string>()
    const cost = rule.weight.mentions + rule.weight.test_mentions
    const redundant = rules
      .filter((other) => other.asset !== rule.asset)
      .filter((other) => {
        const otherDocs = docsByCode.get(other.asset.slice('code:'.length))
        return otherDocs ? jaccard(docs, otherDocs) > 0.9 : false
      })
      .map((other) => other.asset)
    return {
      asset: rule.asset,
      fires_window: fires,
      documents_window: docs.size,
      ...(lastByCode.get(code) ? { last_seen: lastByCode.get(code)! } : {}),
      age_without_fire: fires ? 0 : recentRuns.size,
      cost_per_fire: fires ? Number((cost / fires).toFixed(2)) : null,
      redundant_with: redundant
    }
  })
}

/* ------------------------------------------------------------------ debt gate */

/**
 * How much unconsolidated growth the skill carries, lowest first.
 *
 * The ledger could always say which rules never fire and how often a ceiling was raised, and nothing
 * ever acted on it: six rounds in a row were accepted, four of them raising a ceiling, none removing
 * anything. A level turns those figures into what the next round is allowed to be.
 */
export const DEBT_LEVELS = ['NONE', 'NOTICE', 'REQUIRED', 'FREEZE'] as const
export type DebtLevel = (typeof DEBT_LEVELS)[number]

/**
 * Thresholds per signal as `[NOTICE, REQUIRED, FREEZE]`; a signal reaches a level when its value is
 * at least that threshold, and the skill's level is the highest any signal reaches. Every signal but
 * the last counts since the most recent accepted consolidation, so consolidating is what resets it.
 * The last counts dormant rules nobody has decided about, so deciding — deleting, merging or
 * retaining with a reason — is what lowers it.
 */
export const DEBT_THRESHOLDS = {
  rounds_since_consolidation: [3, 6, 9],
  budget_raises_since_consolidation: [1, 2, 3],
  exempt_additions_since_consolidation: [5, 10, 15],
  undisposed_dormant_rules: [25, 50, 100]
} as const satisfies Record<string, readonly [number, number, number]>
export type DebtSignalName = keyof typeof DEBT_THRESHOLDS

/**
 * Round kinds each level still admits. Debt blocks the skill from changing itself in any direction
 * but smaller; it never blocks authoring a document, which does not change the skill.
 */
export const ADMITTED_KINDS: Readonly<Record<DebtLevel, readonly Kind[]>> = {
  NONE: KINDS,
  NOTICE: KINDS,
  REQUIRED: ['case-amendment', 'consolidation'],
  FREEZE: ['consolidation']
}

/**
 * A rule becomes a dormancy candidate only after it has had a chance to fire: its introduction must
 * be older than this many days, and the telemetry must hold a full audit window of runs.
 */
export const DORMANCY_MIN_AGE_DAYS = 14

/** Share of a measured dimension a consolidation may keep as headroom when its ceiling ratchets. */
export const RATCHET_MARGIN = 0.01

export type ClosedRound = Readonly<{
  id: string
  kind: Kind
  verdict: string
  closed_at?: string
  snapshot?: Readonly<{ supersession_additions: number }>
}>

export type Addition = Readonly<{
  asset: string
  added_at?: string
  supersedes?: readonly string[]
  supersedes_nothing_because?: string
}>

export type Disposition = Readonly<{
  asset: string
  disposition: 'retain'
  category: string
  reason: string
  decided_in: string
  runs_at_decision: number
  review_after_runs: number
}>

export type DebtSignal = Readonly<{
  signal: DebtSignalName
  value: number
  thresholds: readonly number[]
  level: DebtLevel
}>

/** Level a value reaches against `[NOTICE, REQUIRED, FREEZE]` thresholds. */
export function levelOf(value: number, thresholds: readonly number[]): DebtLevel {
  let index = 0
  thresholds.forEach((threshold, at) => {
    if (value >= threshold) index = at + 1
  })
  return DEBT_LEVELS[index]!
}

/** The higher of two levels. */
const maxLevel = (a: DebtLevel, b: DebtLevel): DebtLevel =>
  DEBT_LEVELS.indexOf(a) >= DEBT_LEVELS.indexOf(b) ? a : b

/**
 * Dormant rules no one has decided about.
 *
 * Dormant means: never fired in the audit window, older than the minimum age, and pinned by no
 * mechanical or held-out case — a pinned rule has evidence of a defect it catches. A `retain`
 * disposition takes a rule off the list until its review is due, measured in runs, not days, so a
 * rule is re-examined only after the corpus has had the chance to exercise it.
 */
export function undisposedDormant(input: {
  health: readonly RuleHealth[]
  pinned: ReadonlySet<string>
  additions: readonly Addition[]
  dispositions: readonly Disposition[]
  runs: number
  window: number
  now: Date
}): readonly string[] {
  if (input.runs < input.window) return []
  const youngest = new Map(input.additions.map((entry) => [entry.asset, entry.added_at]))
  const cutoff = input.now.getTime() - DORMANCY_MIN_AGE_DAYS * 86_400_000
  const decided = new Map(input.dispositions.map((entry) => [entry.asset, entry]))
  return input.health
    .filter((rule) => rule.fires_window === 0)
    .filter((rule) => !input.pinned.has(rule.asset.slice('code:'.length)))
    .filter((rule) => {
      const added = youngest.get(rule.asset)
      return !added || Date.parse(added) <= cutoff
    })
    .filter((rule) => {
      const entry = decided.get(rule.asset)
      return !entry || input.runs >= entry.runs_at_decision + entry.review_after_runs
    })
    .map((rule) => rule.asset)
}

/**
 * Debt signals and the level they put the skill at.
 *
 * Rounds are read in id order; everything accepted after the latest accepted consolidation counts
 * against the skill. The consolidation's snapshot says how many supersession additions existed when
 * it closed, so an addition is "since" exactly when it sits past that index.
 */
export function debt(input: {
  rounds: readonly ClosedRound[]
  additions: readonly Addition[]
  undisposed: number
}): { level: DebtLevel; signals: readonly DebtSignal[] } {
  const accepted = [...input.rounds]
    .filter((round) => round.verdict === 'ACCEPTED')
    .sort((a, b) => a.id.localeCompare(b.id))
  let last = -1
  accepted.forEach((round, index) => {
    if (round.kind === 'consolidation') last = index
  })
  const since = accepted.slice(last + 1)
  const offset = last >= 0 ? (accepted[last]!.snapshot?.supersession_additions ?? 0) : 0
  const values: Record<DebtSignalName, number> = {
    rounds_since_consolidation: since.length,
    budget_raises_since_consolidation: since.filter((round) => round.kind === 'budget-change')
      .length,
    exempt_additions_since_consolidation: input.additions
      .slice(offset)
      .filter((entry) => !(entry.supersedes ?? []).length).length,
    undisposed_dormant_rules: input.undisposed
  }
  const signals = (Object.keys(DEBT_THRESHOLDS) as DebtSignalName[]).map((signal) => ({
    signal,
    value: values[signal],
    thresholds: DEBT_THRESHOLDS[signal],
    level: levelOf(values[signal], DEBT_THRESHOLDS[signal])
  }))
  return { level: signals.reduce<DebtLevel>((a, s) => maxLevel(a, s.level), 'NONE'), signals }
}

/**
 * What a consolidation has to show before it may close: no measured dimension grew, and the skill
 * lost rules or lines. Keeping a rule with a written reason is a disposition, not a consolidation —
 * a round that only records decisions has removed nothing and cannot claim to have converged.
 */
export function consolidationFindings(
  before: Readonly<{ measured: Record<string, number>; rules: number }>,
  after: Readonly<{ measured: Record<string, number>; rules: number }>
): string[] {
  const findings: string[] = []
  for (const [dimension, value] of Object.entries(after.measured))
    if (value > (before.measured[dimension] ?? value))
      findings.push(`${dimension} grew from ${before.measured[dimension]} to ${value}`)
  if (after.rules > before.rules) findings.push(`rules grew from ${before.rules} to ${after.rules}`)
  const lines = (m: Record<string, number>) =>
    Object.entries(m)
      .filter(([key]) => key.endsWith('.lines'))
      .reduce((sum, [, value]) => sum + value, 0)
  if (after.rules >= before.rules && lines(after.measured) >= lines(before.measured))
    findings.push('neither the rule count nor the measured lines went down')
  return findings
}

/**
 * Ceilings after a consolidation: each one moves down to the new measurement plus a small margin and
 * never moves up. This is what stops a consolidation from being a pause between raises.
 */
export function ratchet(
  ceilings: Readonly<Record<string, number>>,
  measured: Readonly<Record<string, number>>
): Record<string, number> {
  const next: Record<string, number> = { ...ceilings }
  for (const [dimension, ceiling] of Object.entries(ceilings)) {
    const value = measured[dimension]
    if (value === undefined) continue
    next[dimension] = Math.min(ceiling, Math.ceil(value * (1 + RATCHET_MARGIN)))
  }
  return next
}

/** Parse a JSON file, or return the fallback when it is absent. */
const readJson = <T>(file: string, fallback: T): T =>
  existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback

/** Every closed round on disk. */
export function closedRounds(dir = ROUNDS): readonly ClosedRound[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as ClosedRound)
}

/** Codes a mechanical or held-out case expects; those rules have evidence of what they catch. */
export function pinnedCodes(): ReadonlySet<string> {
  return new Set([...defectCases(), ...heldOutCases()].map((entry) => entry.detector.expected_code))
}

export type SkillHealth = Readonly<{
  protocol: 'skill-rsi-health/v1'
  level: DebtLevel
  signals: readonly DebtSignal[]
  admitted_kinds: readonly Kind[]
  undisposed_dormant: readonly string[]
  redundant_pairs: readonly (readonly [string, string])[]
  measured: Record<string, number>
  over_budget: readonly { dimension: string; ceiling: number; measured: number }[]
  limits: readonly string[]
}>

/**
 * The skill's current debt, read-only and without an open round. `lifecycle.ts initial` calls this at
 * the start of every authoring run, and `update` builds its agenda from it.
 */
export function skillHealth(now = new Date()): SkillHealth {
  const entries = readTelemetry()
  const rules = catalog()
  const report = health(rules, entries, DEFAULT_WINDOW)
  const additions = readJson<{ additions?: Addition[] }>(SUPERSESSION, {}).additions ?? []
  const dispositions =
    readJson<{ dispositions?: Disposition[] }>(DISPOSITIONS, {}).dispositions ?? []
  const runs = new Set(entries.map((entry) => entry.run_id)).size
  const undisposed = undisposedDormant({
    health: report,
    pinned: pinnedCodes(),
    additions,
    dispositions,
    runs,
    window: DEFAULT_WINDOW,
    now
  })
  const { level, signals } = debt({
    rounds: closedRounds(),
    additions,
    undisposed: undisposed.length
  })
  const ceilings = readJson<{ ceilings?: Record<string, number> }>(BUDGET_FILE, {}).ceilings ?? {}
  const measured = measure()
  const pairs = new Map<string, readonly [string, string]>()
  for (const rule of report)
    for (const other of rule.redundant_with) {
      const pair = [rule.asset, other].sort() as [string, string]
      pairs.set(pair.join('|'), pair)
    }
  return {
    protocol: 'skill-rsi-health/v1',
    level,
    signals,
    admitted_kinds: ADMITTED_KINDS[level],
    undisposed_dormant: undisposed,
    redundant_pairs: [...pairs.values()],
    measured,
    over_budget: Object.entries(ceilings)
      .filter(([key, limit]) => (measured[key] ?? 0) > limit)
      .map(([key, limit]) => ({ dimension: key, ceiling: limit, measured: measured[key] ?? 0 })),
    limits: [
      'dormant means unfired in this corpus, not useless: a structural guard is dormant whenever documents are well formed',
      'the level gates changes to this skill, never the authoring of a document'
    ]
  }
}

/**
 * The ordered agenda a developer gets from `rsi.ts update`: finish what is open, then consolidate
 * when the level demands it, then — only when the level admits it — look for enhancements.
 */
export function updateAgenda(
  state: Readonly<{
    health: SkillHealth
    open_round?: string
    catalog_drifted: boolean
  }>
): { step: string; command?: string; detail: string }[] {
  const steps: { step: string; command?: string; detail: string }[] = []
  const { health: h } = state
  if (state.open_round)
    steps.push({
      step: 'finish-open-round',
      command: 'bun scripts/rsi.ts evaluate && bun scripts/rsi.ts prune',
      detail: `round ${state.open_round} is still open; close it before starting another`
    })
  if (state.catalog_drifted)
    steps.push({
      step: 'reconcile-ledger',
      command: 'bun scripts/rsi.ts catalog --render',
      detail:
        'the rule ledger disagrees with the sources; every new code also needs a supersession entry'
    })
  const mustConsolidate = h.level === 'REQUIRED' || h.level === 'FREEZE'
  if (mustConsolidate || h.level === 'NOTICE')
    steps.push({
      step: mustConsolidate ? 'consolidate' : 'consider-consolidation',
      command:
        'bun scripts/rsi.ts open --kind consolidation --goal <what is merged, retired or ablated>',
      detail: [
        `level ${h.level}: ${h.signals
          .filter((s) => s.level !== 'NONE')
          .map((s) => `${s.signal}=${s.value}`)
          .join(', ')}`,
        `${h.undisposed_dormant.length} dormant rule(s) to delete, merge or retain with a reason in rsi/dispositions.json`,
        `${h.redundant_pairs.length} rule pair(s) firing on the same documents`,
        'the round closes only when rules or measured lines went down and no dimension grew; ceilings then ratchet down'
      ].join('; ')
    })
  if (!mustConsolidate)
    steps.push({
      step: 'consider-enhancement',
      command: 'bun scripts/rsi.ts open --kind improvement --goal <defect it catches>',
      detail:
        'only for a defect observed in a real run (rsi/observed-defects.md, a retrospective via ingest); add a mechanical case first, and name what the new rule supersedes'
    })
  if (h.over_budget.length)
    steps.push({
      step: 'over-budget',
      detail: `${h.over_budget.map((o) => `${o.dimension} ${o.measured}>${o.ceiling}`).join(', ')}; a raise is admitted only below REQUIRED`
    })
  return steps
}

/* ------------------------------------------------------------------ mechanical suite */

/**
 * A fixture is either a file, or the worked example with one thing broken.
 *
 * The second form exists because a case is only evidence when its two sides differ by one fact. A
 * hand-written pair of 500-line documents drifts apart in a dozen incidental ways, and then a pass
 * no longer says which of them mattered; an overlay on a shared base cannot.
 */
export type Fixture = string | Readonly<{ base: string; overlay: Json }>

export type DefectCase = Readonly<{
  id: string
  fixture: Fixture
  negative_fixture?: Fixture
  /**
   * A fixture workspace this case's detector reads, copied into the scratch directory per run.
   *
   * It is materialised rather than kept ready on disk because the checks that need one require a
   * `.git` marker at its root, and a second git directory inside this repository would read to git
   * as a submodule. `<repository>` in the detector command is replaced with the copy's path.
   */
  repository?: string
  detector: Readonly<{ command: string; expected_code: string; must_fire: boolean }>
  negative_expectation?: Readonly<{ must_fire: boolean }>
}>

export type CaseResult = Readonly<{
  id: string
  fired: boolean
  negative_fired: boolean | null
  pass: boolean
  codes: readonly string[]
}>

/**
 * Every code anywhere in a detector's JSON output.
 *
 * `code` fields are the obvious half. The other half is that `SDD_CONTRACT_INVALID` is an umbrella
 * whose message carries the code that actually fired, so reading only the fields would report one
 * rule where twenty fired — the same undercount that first made 210 rules look dead.
 */
export function codesIn(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) for (const entry of value) codesIn(entry, into)
  else if (value && typeof value === 'object')
    for (const [key, inner] of Object.entries(value)) {
      if (key === 'code' && typeof inner === 'string') into.add(inner)
      else if ((key === 'message' || key === 'detail') && typeof inner === 'string')
        for (const match of inner.matchAll(/\b([A-Z][A-Z0-9_]{3,})\b/g)) into.add(match[1]!)
      else codesIn(inner, into)
    }
  return into
}

/**
 * The document a fixture stands for, as a path on disk; an overlay is composed into `scratch`.
 *
 * A case with a fixture workspace writes its document inside that workspace, because a check that
 * reads a repository resolves it from where the document sits.
 */
function materialise(fixture: Fixture, scratch: string, name: string, repository?: string): string {
  if (typeof fixture === 'string') return join(ROOT, fixture)
  const text = readFileSync(join(ROOT, fixture.base), 'utf8')
  const document = /^````(?:markdown)?\n([\s\S]*?)\n````$/m.exec(text)?.[1] ?? text
  const file = join(repository ?? scratch, `${name}.md`)
  writeFileSync(file, withContract(document, applyOverlay(contractOf(document), fixture.overlay)))
  return file
}

/** Copy a fixture workspace into the scratch directory and give it the `.git` marker checks want. */
function materialiseRepository(source: string, scratch: string, name: string): string {
  const target = join(scratch, `repo-${name}`)
  cpSync(join(ROOT, source), target, { recursive: true })
  mkdirSync(join(target, '.git'), { recursive: true })
  return target
}

/** Run one detector command with its placeholders bound to paths, and collect the codes reported. */
function runDetector(command: string, fixture: string, repository?: string): Set<string> {
  const argv = command
    .replace('<fixture>', fixture)
    .replace('<repository>', repository ?? '')
    .split(/\s+/)
  if (argv[0] !== 'bun') throw Error('DEFECT_CASE_DETECTOR_NOT_BUN')
  // A fixture run is not an observation of the corpus; recording it filled the dormancy window.
  const run = Bun.spawnSync([process.execPath, ...argv.slice(1)], {
    cwd: ROOT,
    env: { ...process.env, CREATE_SDD_TELEMETRY: '0' },
    stdout: 'pipe',
    stderr: 'pipe'
  })
  const out = run.stdout.toString()
  const start = out.indexOf('{')
  if (start < 0) throw Error(`DEFECT_CASE_DETECTOR_NO_OUTPUT:${run.stderr.toString().trim()}`)
  return codesIn(JSON.parse(out.slice(start)) as unknown)
}

/**
 * Decide every mechanical case by running its detector.
 *
 * A case passes when the code fires on the fixture and stays silent on the repaired one. The second
 * half is what makes the result mean anything: a detector that fires on everything would satisfy the
 * first half alone, and that is exactly the shape a rule takes when it is written to be seen passing
 * rather than to catch something.
 */
export function runSuite(cases: readonly DefectCase[]): readonly CaseResult[] {
  const scratch = mkdtempSync(join(tmpdir(), 'defect-suite-'))
  try {
    return cases.map((entry) => runCase(entry, scratch))
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

function runCase(entry: DefectCase, scratch: string): CaseResult {
  {
    const repository = entry.repository
      ? materialiseRepository(entry.repository, scratch, entry.id)
      : undefined
    const codes = runDetector(
      entry.detector.command,
      materialise(entry.fixture, scratch, `${entry.id}-positive`, repository),
      repository
    )
    const fired = codes.has(entry.detector.expected_code)
    let negativeFired: boolean | null = null
    if (entry.negative_fixture)
      negativeFired = runDetector(
        entry.detector.command,
        materialise(entry.negative_fixture, scratch, `${entry.id}-negative`, repository),
        repository
      ).has(entry.detector.expected_code)
    const wantNegative = entry.negative_expectation?.must_fire ?? false
    return {
      id: entry.id,
      fired,
      negative_fired: negativeFired,
      pass:
        fired === entry.detector.must_fire &&
        (negativeFired === null || negativeFired === wantNegative),
      codes: [...codes].sort()
    }
  }
}

export function defectCases(file = CASES_FILE): readonly DefectCase[] {
  return (JSON.parse(readFileSync(file, 'utf8')) as { cases?: DefectCase[] }).cases ?? []
}

/**
 * Cases kept out of the visible suite.
 *
 * `rsi.ts suite` never reads these, so ordinary work is done without them in view; `evaluate` runs
 * them and reports them apart from the rest. The separation is what gives a round a result the work
 * was not aimed at. It is detection, not prevention: the same account can open these files, and the
 * commitments taken at `open` make that visible rather than impossible.
 */
export function heldOutCases(dir = HELD_OUT): readonly DefectCase[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap(
      (name) =>
        (JSON.parse(readFileSync(join(dir, name), 'utf8')) as { cases?: DefectCase[] }).cases ?? []
    )
}

/* ------------------------------------------------------------------ round protocol */

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

/** Files a round commits to, so a change to any of them during the round is visible afterwards. */
function commitments(): Record<string, string> {
  const files: Record<string, string> = {}
  // Fixture workspaces are directories, so this walks rather than listing: a case whose verdict
  // depends on a lockfile is only committed to if that lockfile is committed to as well.
  const add = (path: string) => {
    if (!existsSync(path)) return
    if (statSync(path).isDirectory()) {
      for (const entry of readdirSync(path).sort()) add(join(path, entry))
      return
    }
    files[relative(ROOT, path)] = sha256(readFileSync(path, 'utf8'))
  }
  add(CASES_FILE)
  add(join(ROOT, 'cases', 'behavior-cases.json'))
  add(join(ROOT, 'cases', 'fixtures'))
  add(HELD_OUT)
  return files
}

/**
 * The dimensions the skill is not allowed to grow along without saying so.
 *
 * `validator.lines` alone once left repo-facts, lifecycle and this file — over half the scripts —
 * outside every ceiling, so growth simply moved there. `scripts.lines` and `tests.lines` cover all of
 * it; the validator figure stays because its ceiling history is recorded against it.
 */
export function measure(): Record<string, number> {
  const lines = (dir: string) => {
    let total = 0
    const walkAll = (base: string, match: (name: string) => boolean) => {
      for (const entry of readdirSync(base)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue
        const full = join(base, entry)
        if (statSync(full).isDirectory()) walkAll(full, match)
        else if (match(entry)) total += readFileSync(full, 'utf8').split('\n').length
      }
    }
    walkAll(dir, (name) => name.endsWith('.md') || name.endsWith('.ts'))
    return total
  }
  const behaviour = existsSync(join(ROOT, 'cases', 'behavior-cases.json'))
    ? ((
        JSON.parse(readFileSync(join(ROOT, 'cases', 'behavior-cases.json'), 'utf8')) as {
          cases?: unknown[]
        }
      ).cases?.length ?? 0)
    : 0
  return {
    'SKILL.md.characters': readFileSync(join(ROOT, 'SKILL.md'), 'utf8').length,
    'references.lines': lines(join(ROOT, 'references')),
    'validator.lines': lines(join(ROOT, 'scripts', 'validator')),
    'scripts.lines': lines(join(ROOT, 'scripts')),
    'tests.lines': existsSync(join(ROOT, 'tests')) ? lines(join(ROOT, 'tests')) : 0,
    behavior_cases: behaviour
  }
}

type Round = {
  id: string
  kind: Kind
  goal: string
  opened_at: string
  head: string
  commitments: Record<string, string>
  budget: Record<string, number>
  /** Rule count when the round opened; a consolidation must end below or at it. */
  rules_at_open?: number
  /** Debt level when the round opened, kept so a refused kind is explainable afterwards. */
  debt_at_open?: DebtLevel
  baseline?: { at: string; results: readonly CaseResult[]; heldOut?: readonly CaseResult[] }
  candidate?: {
    at: string
    results: readonly CaseResult[]
    regressions: string[]
    heldOut?: readonly CaseResult[]
  }
  prune?: unknown
}

const git = (...args: string[]) =>
  Bun.spawnSync(['git', ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' })
    .stdout.toString()
    .trim()

/**
 * Held-out case files whose contents no longer match what the round committed to.
 *
 * This is a real check: the digests were written before the change and the comparison reads the
 * files now. What it is not is prevention — the same account that runs the round can edit these
 * files, and nothing here stops it. It makes the edit visible, and that is the whole claim.
 */
export function heldOutTampering(
  commitments: Readonly<Record<string, string>>,
  root = ROOT
): readonly string[] {
  return Object.entries(commitments)
    .filter(([path]) => path.startsWith('cases/held-out/'))
    .filter(
      ([path, digest]) =>
        !existsSync(join(root, path)) || sha256(readFileSync(join(root, path), 'utf8')) !== digest
    )
    .map(([path]) => path)
}

function openRound(): Round {
  if (!existsSync(OPEN_ROUND)) throw Error('RSI_NO_OPEN_ROUND')
  return JSON.parse(readFileSync(OPEN_ROUND, 'utf8')) as Round
}

const saveRound = (round: Round) => writeFileSync(OPEN_ROUND, `${JSON.stringify(round, null, 2)}\n`)

/**
 * Paths a round may not touch, and why each one is on the list.
 *
 * Changing a held-out case, a completion oracle or a detector's expected code inside the same round
 * that claims an improvement would let the round move the target it is being measured against. The
 * check is real enforcement of *that* — it reads the diff — and it is not enforcement of anything
 * else: an author with write access can still change these in a round of their own, which is what
 * `--kind case-amendment` is for. Say so plainly rather than implying a sandbox exists.
 */
function forbiddenChanges(round: Round): string[] {
  if (round.kind !== 'improvement') return []
  // Untracked files do not appear in a diff, and a new case file is untracked by definition, so the
  // guard reads the working tree as well — reading only the diff once let a round edit a detector's
  // expected code unnoticed.
  const untracked = git('ls-files', '--others', '--exclude-standard', '--', 'cases')
    .split('\n')
    .filter(Boolean)
  const changed = [
    ...git('diff', '--name-only', round.head).split('\n').filter(Boolean),
    ...untracked
  ]
  return weakenings(changed, git('diff', round.head, '--', 'cases'))
}

/**
 * Changes that would move the target a round is measured against.
 *
 * Only a removed or rewritten line counts: adding a case raises the bar, so a purely additive diff
 * is not a finding. A file git has never seen has no prior version to compare against, so nothing in
 * it can be judged here — that is a limit of the check, stated rather than guessed around.
 */
export function weakenings(changed: readonly string[], diff: string): string[] {
  const findings: string[] = []
  // Prose about the directory is not a case; only the cases themselves are held out.
  for (const path of changed)
    if (path.startsWith('cases/held-out/') && !path.endsWith('.md')) findings.push(path)
  const guarded: readonly (readonly [string, string])[] = [
    ['completion_oracle', 'a completion oracle'],
    ['expected_code', "a detector's expected code"]
  ]
  for (const [needle, label] of guarded)
    if (
      diff
        .split('\n')
        .some((line) => line.startsWith('-') && !line.startsWith('---') && line.includes(needle))
    )
      findings.push(`${label} was removed or rewritten inside an improvement round`)
  return findings
}

/* ------------------------------------------------------------------ retrospective ingest */

export type CalibrationRow = Readonly<{
  date: string
  lane: string
  batch: string
  estimated_minutes: number
  actual_minutes: number
  ratio: number
  source: string
}>

type Retrospective = {
  sdd?: string
  metrics?: { estimates?: CalibrationRow[] & Record<string, unknown>[] }
  issues?: { kind?: string; severity?: string; count?: number; details?: string[] }[]
}

/**
 * Read a delivery's retrospective into the two things it can actually settle.
 *
 * The calibration rows are arithmetic the loop already did; copying them by hand is how a ledger
 * gains a row that no delivery produced. The candidates are not findings: an issue the loop recorded
 * says something went differently than planned, not that a rule is missing. Promoting one is a human
 * decision, and this command deliberately stops one step short of it — one incident becoming a
 * universal rule without a minimal contrast is the failure this skill's own invariants name first.
 */
export function ingest(files: readonly string[]): {
  rows: CalibrationRow[]
  candidates: { kind: string; severity: string; count: number; sources: string[] }[]
} {
  const rows: CalibrationRow[] = []
  const byKind = new Map<
    string,
    { kind: string; severity: string; count: number; sources: Set<string> }
  >()
  for (const file of files) {
    const data = JSON.parse(readFileSync(file, 'utf8')) as Retrospective
    const name = file.split('/').pop() ?? file
    const date = statSync(file).mtime.toISOString().split('T')[0] ?? ''
    for (const estimate of data.metrics?.estimates ?? []) {
      const estimated = Number(estimate.estimated_minutes)
      const actual = Number(estimate.actual_minutes)
      if (!Number.isFinite(estimated) || !Number.isFinite(actual)) continue
      rows.push({
        date,
        lane: String(estimate.lane ?? ''),
        batch: String(estimate.batch_id ?? ''),
        estimated_minutes: estimated,
        actual_minutes: actual,
        ratio: Number(estimate.ratio ?? Number((actual / estimated).toFixed(2))),
        source: name
      })
    }
    for (const issue of data.issues ?? []) {
      const kind = String(issue.kind ?? 'UNKNOWN')
      const entry = byKind.get(kind) ?? {
        kind,
        severity: String(issue.severity ?? ''),
        count: 0,
        sources: new Set<string>()
      }
      entry.count += Number(issue.count ?? 1)
      entry.sources.add(name)
      byKind.set(kind, entry)
    }
  }
  return {
    rows,
    candidates: [...byKind.values()]
      .map((entry) => ({ ...entry, sources: [...entry.sources].sort() }))
      .sort((a, b) => b.count - a.count)
  }
}

/** The calibration rows already written into the ledger, parsed back out of its table. */
export function ledgerRows(file = join(ROOT, 'references', 'planning', 'estimate-calibration.md')) {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  return text
    .split('\n')
    .filter((line) => /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(line))
    .map((line) => line.split('|').map((cell) => cell.trim()))
    .map((cells) => ({
      date: cells[1]!,
      lane: cells[2]!,
      batch: cells[3]!,
      estimated_minutes: Number.parseFloat(cells[4]!),
      actual_minutes: Number.parseFloat(cells[5]!),
      ratio: Number.parseFloat(cells[6]!)
    }))
}

function main(argv: readonly string[]): number {
  const [command, ...rest] = argv
  if (command === 'catalog') {
    const rules = catalog()
    if (rest.includes('--render')) {
      mkdirSync(join(ROOT, 'rsi'), { recursive: true })
      writeFileSync(
        RULES_FILE,
        `${JSON.stringify({ protocol: 'skill-rule-ledger/v1', derived_from: 'scripts and tests of this skill', rules }, null, 2)}\n`
      )
      console.log(
        JSON.stringify({
          protocol: 'skill-rule-ledger/v1',
          written: RULES_FILE,
          rules: rules.length
        })
      )
      return 0
    }
    let stored: { rules?: readonly Rule[] } = {}
    try {
      stored = JSON.parse(readFileSync(RULES_FILE, 'utf8')) as { rules?: readonly Rule[] }
    } catch {
      stored = {}
    }
    const drifted = JSON.stringify(stored.rules ?? []) !== JSON.stringify(rules)
    console.log(
      JSON.stringify({
        protocol: 'skill-rule-ledger/v1',
        rules: rules.length,
        stored: stored.rules?.length ?? 0,
        drifted,
        hint: drifted ? 'run rsi.ts catalog --render' : undefined
      })
    )
    return drifted ? 1 : 0
  }
  if (command === 'audit') {
    const windowIndex = rest.indexOf('--window')
    const window = windowIndex >= 0 ? Number(rest[windowIndex + 1]) : DEFAULT_WINDOW
    const entries = readTelemetry()
    const rules = catalog()
    const report = health(rules, entries, window)
    const never = report.filter((rule) => rule.fires_window === 0)
    console.log(
      JSON.stringify(
        {
          protocol: 'skill-rule-audit/v1',
          window,
          observations: entries.length,
          runs: new Set(entries.map((entry) => entry.run_id)).size,
          rules: rules.length,
          never_fired: never.length,
          top_cost_per_fire: [...report]
            .filter((rule) => rule.cost_per_fire !== null)
            .sort((a, b) => (b.cost_per_fire ?? 0) - (a.cost_per_fire ?? 0))
            .slice(0, 5),
          fired: report.filter((rule) => rule.fires_window > 0),
          never_fired_assets: never.map((rule) => rule.asset),
          limits: [
            'a code that never fired may still be correct: this corpus may simply not contain its defect',
            'a fired code is not thereby proven useful; it is proven reachable',
            'redundancy is computed over documents seen in the window, not over the space of documents'
          ]
        },
        null,
        2
      )
    )
    return 0
  }

  if (command === 'health') {
    const current = skillHealth()
    console.log(JSON.stringify(current, null, 2))
    return 0
  }
  if (command === 'update') {
    const current = skillHealth()
    const stored = readJson<{ rules?: readonly Rule[] }>(RULES_FILE, {})
    const drifted = JSON.stringify(stored.rules ?? []) !== JSON.stringify(catalog())
    const open = existsSync(OPEN_ROUND) ? openRound().id : undefined
    console.log(
      JSON.stringify(
        {
          protocol: 'skill-rsi-update/v1',
          level: current.level,
          admitted_kinds: current.admitted_kinds,
          signals: current.signals,
          agenda: updateAgenda({
            health: current,
            ...(open ? { open_round: open } : {}),
            catalog_drifted: drifted
          }),
          undisposed_dormant: current.undisposed_dormant,
          redundant_pairs: current.redundant_pairs,
          limits: current.limits
        },
        null,
        2
      )
    )
    return 0
  }
  if (command === 'suite') {
    const results = runSuite(defectCases())
    const failed = results.filter((result) => !result.pass)
    console.log(
      JSON.stringify(
        {
          protocol: 'skill-defect-suite/v1',
          cases: results.length,
          failed: failed.length,
          results
        },
        null,
        2
      )
    )
    return failed.length ? 1 : 0
  }
  if (command === 'open') {
    if (existsSync(OPEN_ROUND)) {
      console.error(`a round is already open: ${OPEN_ROUND}`)
      return 1
    }
    const kindIndex = rest.indexOf('--kind')
    const goalIndex = rest.indexOf('--goal')
    const kind = rest[kindIndex + 1] as Kind
    if (kindIndex < 0 || !KINDS.includes(kind) || goalIndex < 0) {
      console.error(USAGE)
      return 2
    }
    const current = skillHealth()
    if (!current.admitted_kinds.includes(kind)) {
      console.log(
        JSON.stringify(
          {
            protocol: 'skill-rsi-round/v1',
            refused: true,
            code: 'RSI_ROUND_KIND_REFUSED',
            kind,
            level: current.level,
            admitted_kinds: current.admitted_kinds,
            signals: current.signals.filter((signal) => signal.level !== 'NONE'),
            note: 'Debt blocks this skill from changing itself in any direction but smaller. Run rsi.ts update for the agenda; authoring documents is unaffected.'
          },
          null,
          2
        )
      )
      return 1
    }
    const round: Round = {
      id: `R-${new Date()
        .toISOString()
        .replace(/[^0-9]/g, '')
        .slice(0, 14)}`,
      kind,
      goal: rest.slice(goalIndex + 1).join(' '),
      opened_at: new Date().toISOString(),
      head: git('rev-parse', 'HEAD'),
      commitments: commitments(),
      budget: measure(),
      rules_at_open: catalog().length,
      debt_at_open: current.level
    }
    mkdirSync(join(ROOT, 'rsi'), { recursive: true })
    saveRound(round)
    console.log(
      JSON.stringify({ protocol: 'skill-rsi-round/v1', opened: round.id, round }, null, 2)
    )
    return 0
  }
  if (command === 'baseline') {
    const round = openRound()
    round.baseline = {
      at: new Date().toISOString(),
      results: runSuite(defectCases()),
      heldOut: runSuite(heldOutCases())
    }
    saveRound(round)
    const failed = round.baseline.results.filter((result) => !result.pass)
    console.log(
      JSON.stringify(
        {
          protocol: 'skill-rsi-round/v1',
          round: round.id,
          baseline_cases: round.baseline.results.length,
          baseline_failures: failed.map((result) => result.id),
          note: 'The champion is allowed to fail cases; the comparison is against this record, not against perfection.'
        },
        null,
        2
      )
    )
    return 0
  }
  if (command === 'evaluate') {
    const round = openRound()
    if (!round.baseline) {
      console.error('no baseline: run rsi.ts baseline before changing anything')
      return 1
    }
    const forbidden = forbiddenChanges(round)
    const tampered = heldOutTampering(round.commitments)
    if (forbidden.length || tampered.length) {
      console.log(
        JSON.stringify(
          {
            protocol: 'skill-rsi-round/v1',
            round: round.id,
            refused: true,
            forbidden_changes: forbidden,
            held_out_changed: tampered,
            note: 'A round may not move the target it is measured against. Amend cases in a --kind case-amendment round, which cannot claim an improvement.'
          },
          null,
          2
        )
      )
      return 1
    }
    const results = runSuite(defectCases())
    const heldOut = runSuite(heldOutCases())
    const heldOutFailures = heldOut.filter((result) => !result.pass).map((result) => result.id)
    const before = new Map(round.baseline.results.map((result) => [result.id, result.pass]))
    const regressions = results
      .filter((result) => before.get(result.id) === true && !result.pass)
      .map((result) => result.id)
    const repairs = results
      .filter((result) => before.get(result.id) === false && result.pass)
      .map((result) => result.id)
    round.candidate = { at: new Date().toISOString(), results, regressions, heldOut }
    saveRound(round)
    console.log(
      JSON.stringify(
        {
          protocol: 'skill-rsi-round/v1',
          round: round.id,
          cases: results.length,
          regressions,
          repairs,
          unchanged: results.length - regressions.length - repairs.length,
          held_out_cases: heldOut.length,
          held_out_failures: heldOutFailures,
          note: 'Every case that passed before must still pass. A rule relaxed to admit a new case breaks an old one here, which is the cheapest guard in this loop and the only one that needs no trust.'
        },
        null,
        2
      )
    )
    return regressions.length || heldOutFailures.length ? 1 : 0
  }
  if (command === 'prune') {
    const round = openRound()
    const ceilings = existsSync(BUDGET_FILE)
      ? ((JSON.parse(readFileSync(BUDGET_FILE, 'utf8')) as { ceilings?: Record<string, number> })
          .ceilings ?? {})
      : {}
    const now = measure()
    const over = Object.entries(ceilings)
      .filter(([key, limit]) => (now[key] ?? 0) > limit)
      .map(([key, limit]) => ({ dimension: key, ceiling: limit, measured: now[key] ?? 0 }))
    // What the sources raise now, minus what the blessed ledger already records. `catalog --render`
    // re-blesses the ledger, so an addition stays visible here exactly until it is accounted for.
    const blessed = new Set(
      existsSync(RULES_FILE)
        ? ((JSON.parse(readFileSync(RULES_FILE, 'utf8')) as { rules?: Rule[] }).rules ?? []).map(
            (rule) => rule.asset
          )
        : []
    )
    const added = catalog()
      .map((rule) => rule.asset)
      .filter((asset) => !blessed.has(asset))
    const record = existsSync(SUPERSESSION)
      ? (JSON.parse(readFileSync(SUPERSESSION, 'utf8')) as {
          additions?: {
            asset: string
            supersedes?: string[]
            supersedes_nothing_because?: string
          }[]
        })
      : {}
    const unjustified = added.filter(
      (asset) =>
        !(record.additions ?? []).some(
          (entry) =>
            entry.asset === asset &&
            ((entry.supersedes ?? []).length > 0 || entry.supersedes_nothing_because)
        )
    )
    const net =
      round.kind === 'consolidation'
        ? consolidationFindings(
            { measured: round.budget, rules: round.rules_at_open ?? Number.POSITIVE_INFINITY },
            { measured: now, rules: catalog().length }
          )
        : []
    const blocking = [...(round.kind === 'budget-change' ? [] : over), ...net]
    round.prune = { over_budget: over, unjustified_additions: unjustified, not_net_negative: net }
    saveRound(round)
    console.log(
      JSON.stringify(
        {
          protocol: 'skill-rsi-prune/v1',
          round: round.id,
          measured: now,
          over_budget: over,
          unjustified_additions: unjustified,
          ...(round.kind === 'consolidation'
            ? {
                code: net.length ? 'RSI_CONSOLIDATION_NOT_NET_NEGATIVE' : undefined,
                not_net_negative: net
              }
            : {}),
          note: 'A ceiling is raised only by a --kind budget-change round, so every raise is a recorded decision rather than a drift.'
        },
        null,
        2
      )
    )
    return blocking.length || unjustified.length ? 1 : 0
  }
  if (command === 'close') {
    const round = openRound()
    const confirmIndex = rest.indexOf('--confirm')
    if (!round.candidate || !round.prune) {
      console.error('run rsi.ts evaluate and rsi.ts prune before closing')
      return 1
    }
    // A round that closes over open prune findings would make the pruning gate advisory, which is
    // the state this loop exists to leave. An over-budget dimension is the exception a
    // budget-change round is for; an unjustified addition never is.
    const prune = round.prune as {
      over_budget?: unknown[]
      unjustified_additions?: unknown[]
      not_net_negative?: unknown[]
    }
    const open = [
      ...(round.kind === 'budget-change' ? [] : (prune.over_budget ?? [])),
      ...(prune.unjustified_additions ?? []),
      ...(prune.not_net_negative ?? [])
    ]
    if (open.length) {
      console.error(
        `rsi.ts prune still reports ${open.length} finding(s); resolve them and run prune again`
      )
      return 1
    }
    if (confirmIndex < 0 || rest[confirmIndex + 1] !== round.id) {
      console.error(`close requires a human confirmation: rsi.ts close --confirm ${round.id}`)
      return 1
    }
    mkdirSync(ROUNDS, { recursive: true })
    const verdict = round.candidate.regressions.length ? 'REJECTED' : 'ACCEPTED'
    // An accepted consolidation is the only event that resets debt, so it records where the
    // supersession ledger stood and pulls every ceiling down to what it left behind.
    const additions = readJson<{ additions?: Addition[] }>(SUPERSESSION, {}).additions ?? []
    const snapshot =
      round.kind === 'consolidation' && verdict === 'ACCEPTED'
        ? { supersession_additions: additions.length }
        : undefined
    if (snapshot && existsSync(BUDGET_FILE)) {
      const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8')) as {
        ceilings: Record<string, number>
        ratchets?: unknown[]
      }
      const measured = measure()
      const next = ratchet(budget.ceilings, measured)
      budget.ratchets = [
        ...(budget.ratchets ?? []),
        { at: new Date().toISOString(), round: round.id, from: budget.ceilings, to: next }
      ]
      budget.ceilings = next
      writeFileSync(BUDGET_FILE, `${JSON.stringify(budget, null, 2)}\n`)
    }
    const closed = {
      ...round,
      ...(snapshot ? { snapshot } : {}),
      closed_at: new Date().toISOString(),
      verdict,
      not_proven: [
        'that the change makes the skill better at anything not covered by a mechanical case',
        'that an authoring agent reads, understands or follows any rule involved',
        'that a reader with write access could not have edited a case; the guard makes that visible, not impossible'
      ]
    }
    writeFileSync(join(ROUNDS, `${round.id}.json`), `${JSON.stringify(closed, null, 2)}\n`)
    unlinkSync(OPEN_ROUND)
    console.log(
      JSON.stringify(
        { protocol: 'skill-rsi-round/v1', closed: round.id, verdict: closed.verdict },
        null,
        2
      )
    )
    return closed.verdict === 'ACCEPTED' ? 0 : 1
  }

  if (command === 'ingest') {
    const filesIndex = rest.indexOf('--files')
    if (filesIndex < 0) {
      console.error(USAGE)
      return 2
    }
    const files = rest[filesIndex + 1]!.split(',').filter(Boolean)
    const { rows, candidates } = ingest(files)
    const ledger = ledgerRows()
    const missing = rows.filter(
      (row) =>
        !ledger.some(
          (entry) =>
            entry.batch === row.batch &&
            entry.estimated_minutes === row.estimated_minutes &&
            Math.abs(entry.actual_minutes - row.actual_minutes) < 0.05
        )
    )
    console.log(
      JSON.stringify(
        {
          protocol: 'skill-retrospect-ingest/v1',
          files: files.length,
          rows,
          ledger_rows: ledger.length,
          rows_not_in_ledger: missing,
          candidates,
          limits: [
            'a candidate is an incident, not a rule: promoting one needs a minimal contrast and a human decision',
            'ratios come from the loop, which counts lease time including reading and waiting',
            'fewer than three samples in a lane, or five overall, is not calibration'
          ]
        },
        null,
        2
      )
    )
    return 0
  }
  console.error(USAGE)
  return 2
}

if (import.meta.main) process.exit(main(Bun.argv.slice(2)))
