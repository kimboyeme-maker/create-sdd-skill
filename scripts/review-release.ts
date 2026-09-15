#!/usr/bin/env bun
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Aggregate automated checks for this skill. They prove structure only: that scripts type-check
 * and pass their tests, references carry current receipts, links resolve and behavior cases are
 * well formed. They do not prove that an authoring agent reads, understands or follows the rules.
 */
const ROOT = join(import.meta.dir, '..')
/** The delivery skill owns the behavior-case validator; it is invoked as a CLI, never imported. */
const BEHAVIOR_EVAL = join(ROOT, '..', 'sdd-loop-delivery', 'scripts', 'behavior-eval.ts')

type ReleaseCheck = readonly [name: string, argv: readonly string[]]
const checks: readonly ReleaseCheck[] = [
  ['tests', ['run', 'test']],
  ['format', ['run', 'format:check']],
  ['lint', ['run', 'lint']],
  ['typecheck', ['run', 'typecheck']],
  ['receipts', ['scripts/reading-receipt.ts', 'verify']],
  ['links', ['scripts/check-links.ts']],
  ['behavior-cases', [BEHAVIOR_EVAL, '--suite', 'cases/behavior-cases.json', '--runs', '1']]
]

const results: { check: string; exitCode: number | null; skipped?: string }[] = []
for (const [check, command] of checks) {
  if (command[0] === BEHAVIOR_EVAL && !existsSync(BEHAVIOR_EVAL)) {
    // A missing validator is disclosed, never counted as a pass.
    results.push({
      check,
      exitCode: null,
      skipped: 'sdd-loop-delivery not installed beside create-sdd'
    })
    continue
  }
  const argv =
    command[0] === 'run' ? [process.execPath, ...command] : [process.execPath, ...command]
  const result = Bun.spawnSync(argv, { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' })
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
