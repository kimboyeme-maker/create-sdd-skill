#!/usr/bin/env bun
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Aggregate automated checks for this skill. They prove structure only: that scripts type-check
 * and pass their tests, references carry current receipts, links resolve and behavior cases are
 * well formed. They do not prove that an authoring agent reads, understands or follows the rules.
 */
const ROOT = join(import.meta.dir, '..')
/** The delivery skill owns these; both are invoked as CLIs, never imported. */
const LOOP_ROOT = join(ROOT, '..', 'sdd-loop-delivery')
const BEHAVIOR_EVAL = join(LOOP_ROOT, 'scripts', 'behavior-eval.ts')

/** `needsLoop` marks a check the sibling skill must be installed to run at all. */
type ReleaseCheck = readonly [name: string, argv: readonly string[], needsLoop?: true]
const checks: readonly ReleaseCheck[] = [
  ['tests', ['run', 'test']],
  ['format', ['run', 'format:check']],
  ['lint', ['run', 'lint']],
  ['typecheck', ['run', 'typecheck']],
  ['receipts', ['scripts/reading-receipt.ts', 'verify']],
  ['links', ['scripts/check-links.ts']],
  ['control-plane', ['scripts/check-control-plane.ts'], true],
  ['examples', ['scripts/check-examples.ts'], true],
  ['behavior-cases', [BEHAVIOR_EVAL, '--suite', 'cases/behavior-cases.json', '--runs', '1'], true]
]

export type CheckPlan = Readonly<{ check: string; argv: readonly string[]; skipped?: string }>

/**
 * Decide, per check, whether it runs or is disclosed as skipped. A check that needs the sibling
 * skill and cannot find it is never counted as a pass: the release is invalid with the reason
 * recorded, because a silent skip would read as coverage nobody has.
 */
export function planChecks(loopInstalled: boolean): CheckPlan[] {
  return checks.map(([check, argv, needsLoop]) =>
    needsLoop && !loopInstalled
      ? { check, argv, skipped: 'sdd-loop-delivery not installed beside create-sdd' }
      : { check, argv }
  )
}

// Guarded so tests may import planChecks without running every check.
if (import.meta.main) {
  const results: { check: string; exitCode: number | null; skipped?: string }[] = []
  for (const { check, argv: command, skipped } of planChecks(existsSync(LOOP_ROOT))) {
    if (skipped) {
      results.push({ check, exitCode: null, skipped })
      continue
    }
    const result = Bun.spawnSync([process.execPath, ...command], {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe'
    })
    results.push({ check, exitCode: result.exitCode })
    if (result.exitCode !== 0) {
      if (result.stdout.length) console.error(result.stdout.toString())
      console.error(result.stderr.toString())
      console.error(JSON.stringify({ protocol: 'release-review/v1', valid: false, results }))
      process.exit(result.exitCode || 1)
    }
  }
  const skipped = results.some((result) => result.skipped)
  console.log(
    JSON.stringify({
      protocol: 'release-review/v1',
      valid: !skipped,
      scope: 'automated-checks-only',
      doesNotProve: ['agent-reading', 'agent-understanding', 'document-quality'],
      checks: results
    })
  )
  process.exit(skipped ? 1 : 0)
}
