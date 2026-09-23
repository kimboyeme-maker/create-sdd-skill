import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TELEMETRY_FILE } from '../scripts/lib/telemetry'
import {
  ADMITTED_KINDS,
  consolidationFindings,
  debt,
  levelOf,
  ratchet,
  undisposedDormant,
  updateAgenda,
  type ClosedRound,
  type RuleHealth,
  type SkillHealth
} from '../scripts/rsi'

const round = (id: string, kind: ClosedRound['kind'], extra: Partial<ClosedRound> = {}) =>
  ({ id, kind, verdict: 'ACCEPTED', ...extra }) as ClosedRound

test('a signal reaches NOTICE, REQUIRED and FREEZE at 3, 6 and 9', () => {
  expect([2, 3, 5, 6, 8, 9, 40].map((value) => levelOf(value, [3, 6, 9]))).toEqual([
    'NONE',
    'NOTICE',
    'NOTICE',
    'REQUIRED',
    'REQUIRED',
    'FREEZE',
    'FREEZE'
  ])
})

test('the skill level is the highest any signal reaches, counted since the last consolidation', () => {
  const rounds = [
    round('R-1', 'improvement'),
    round('R-2', 'budget-change'),
    round('R-3', 'consolidation', { snapshot: { supersession_additions: 1 } }),
    round('R-4', 'improvement'),
    round('R-5', 'budget-change'),
    round('R-6', 'improvement', { verdict: 'REJECTED' })
  ]
  const additions = [
    { asset: 'code:A' },
    { asset: 'code:B' },
    { asset: 'code:C', supersedes: ['code:A'] }
  ]
  const result = debt({ rounds, additions, undisposed: 0 })
  const byName = Object.fromEntries(result.signals.map((signal) => [signal.signal, signal.value]))
  // A rejected round and everything before the consolidation do not count.
  expect(byName.rounds_since_consolidation).toBe(2)
  expect(byName.budget_raises_since_consolidation).toBe(1)
  // Only additions past the snapshot index that supersede nothing count as exempt.
  expect(byName.exempt_additions_since_consolidation).toBe(1)
  expect(result.level).toBe('NOTICE')
  expect(debt({ rounds, additions, undisposed: 120 }).level).toBe('FREEZE')
})

test('debt narrows the round kinds a level admits, down to consolidation alone', () => {
  expect(ADMITTED_KINDS.NOTICE).toContain('improvement')
  expect(ADMITTED_KINDS.REQUIRED).not.toContain('improvement')
  expect(ADMITTED_KINDS.REQUIRED).not.toContain('budget-change')
  expect(ADMITTED_KINDS.FREEZE).toEqual(['consolidation'])
})

test('a consolidation must shrink the skill and may not grow any dimension', () => {
  const before = {
    measured: { 'scripts.lines': 100, 'references.lines': 50, behavior_cases: 4 },
    rules: 10
  }
  expect(
    consolidationFindings(before, {
      measured: { ...before.measured, 'scripts.lines': 90 },
      rules: 10
    })
  ).toEqual([])
  expect(consolidationFindings(before, { measured: before.measured, rules: 9 })).toEqual([])
  // Recording decisions alone removes nothing.
  expect(consolidationFindings(before, before)).toEqual([
    'neither the rule count nor the measured lines went down'
  ])
  // Moving growth from one dimension to another is still growth.
  expect(
    consolidationFindings(before, {
      measured: { ...before.measured, 'scripts.lines': 80, 'references.lines': 60 },
      rules: 9
    })
  ).toEqual(['references.lines grew from 50 to 60'])
})

test('ceilings ratchet down to the new measurement and never up', () => {
  expect(ratchet({ a: 1000, b: 100 }, { a: 800, b: 150 })).toEqual({ a: 808, b: 100 })
})

test('a dormant rule counts until someone decides, and again once its review is due', () => {
  const rule = (asset: string, fires = 0): RuleHealth => ({
    asset,
    fires_window: fires,
    documents_window: fires,
    age_without_fire: fires ? 0 : 50,
    cost_per_fire: null,
    redundant_with: []
  })
  const base = {
    health: [
      rule('code:OLD'),
      rule('code:FIRED', 3),
      rule('code:PINNED'),
      rule('code:YOUNG'),
      rule('code:KEPT')
    ],
    pinned: new Set(['PINNED']),
    additions: [{ asset: 'code:YOUNG', added_at: '2026-09-20' }],
    dispositions: [
      {
        asset: 'code:KEPT',
        disposition: 'retain' as const,
        category: 'structural-guard',
        reason: 'rejects malformed contract JSON',
        decided_in: 'R-1',
        runs_at_decision: 60,
        review_after_runs: 100
      }
    ],
    window: 50,
    now: new Date('2026-09-23T00:00:00Z')
  }
  expect(undisposedDormant({ ...base, runs: 100 })).toEqual(['code:OLD'])
  expect(undisposedDormant({ ...base, runs: 160 })).toEqual(['code:OLD', 'code:KEPT'])
  // Without a full window of telemetry, silence is not evidence of anything.
  expect(undisposedDormant({ ...base, runs: 10 })).toEqual([])
})

test('update puts consolidation first under debt and withholds enhancement until it is paid', () => {
  const health = (level: SkillHealth['level']): SkillHealth => ({
    protocol: 'skill-rsi-health/v1',
    level,
    signals: [],
    admitted_kinds: ADMITTED_KINDS[level],
    undisposed_dormant: [],
    redundant_pairs: [],
    measured: {},
    over_budget: [],
    limits: []
  })
  const steps = (level: SkillHealth['level']) =>
    updateAgenda({ health: health(level), catalog_drifted: false }).map((entry) => entry.step)
  expect(steps('FREEZE')).toEqual(['consolidate'])
  expect(steps('NOTICE')).toEqual(['consider-consolidation', 'consider-enhancement'])
  expect(steps('NONE')).toEqual(['consider-enhancement'])
  expect(
    updateAgenda({ health: health('NONE'), open_round: 'R-9', catalog_drifted: true }).map(
      (entry) => entry.step
    )
  ).toEqual(['finish-open-round', 'reconcile-ledger', 'consider-enhancement'])
})

test('running the test suite leaves the telemetry ledger untouched', () => {
  // The suite spawns real checks; before this guard each run filled the dormancy window with fixtures.
  const before = readFileSync(TELEMETRY_FILE, 'utf8')
  const validate = join(import.meta.dir, '..', 'scripts', 'validate.ts')
  Bun.spawnSync([process.execPath, validate, 'validate', '--sdd', validate], { stdout: 'pipe' })
  expect(readFileSync(TELEMETRY_FILE, 'utf8')).toBe(before)
})
