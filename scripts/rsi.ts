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
  '  rsi.ts suite                         run every mechanical defect case',
  '  rsi.ts open --kind <k> --goal <t>    start a round and commit to its case files',
  '  rsi.ts baseline                      record the champion result for the open round',
  '  rsi.ts evaluate                      re-run the suite and compare against the baseline',
  '  rsi.ts prune                         check supersession and the budget ceilings',
  '  rsi.ts close --confirm <token>       record the verdict and end the round',
  '  rsi.ts ingest --files a.json,b.json  read loop retrospectives into calibration rows and candidates'
].join('\n')

/** Round kinds. Only `improvement` may claim a gain; the others exist so the two cannot be mixed. */
const KINDS = ['improvement', 'case-amendment', 'budget-change'] as const

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
  const run = Bun.spawnSync([process.execPath, ...argv.slice(1)], {
    cwd: ROOT,
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

/** The four dimensions the skill is not allowed to grow along without saying so. */
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
    behavior_cases: behaviour
  }
}

type Round = {
  id: string
  kind: (typeof KINDS)[number]
  goal: string
  opened_at: string
  head: string
  commitments: Record<string, string>
  budget: Record<string, number>
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
    const kind = rest[kindIndex + 1] as (typeof KINDS)[number]
    if (kindIndex < 0 || !KINDS.includes(kind) || goalIndex < 0) {
      console.error(USAGE)
      return 2
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
      budget: measure()
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
    const blocking = round.kind === 'budget-change' ? [] : over
    round.prune = { over_budget: over, unjustified_additions: unjustified }
    saveRound(round)
    console.log(
      JSON.stringify(
        {
          protocol: 'skill-rsi-prune/v1',
          round: round.id,
          measured: now,
          over_budget: over,
          unjustified_additions: unjustified,
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
    }
    const open = [
      ...(round.kind === 'budget-change' ? [] : (prune.over_budget ?? [])),
      ...(prune.unjustified_additions ?? [])
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
    const closed = {
      ...round,
      closed_at: new Date().toISOString(),
      verdict: round.candidate.regressions.length ? 'REJECTED' : 'ACCEPTED',
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
