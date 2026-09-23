#!/usr/bin/env bun
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The worked example must agree with its own prose.
 *
 * The example is what an author copies, so a contract field it states by hand that its tables no
 * longer support teaches exactly the drift this generator exists to remove. Checking it here means
 * the example cannot rot quietly between releases.
 */
const ROOT = join(import.meta.dir, '..')
const BASE = join(ROOT, 'references', 'examples', 'loop-ready-example.md')
const text = readFileSync(BASE, 'utf8')
const document = /^````(?:markdown)?\n([\s\S]*?)\n````$/m.exec(text)?.[1] ?? text
const scratch = mkdtempSync(join(tmpdir(), 'contract-drift-'))
try {
  const file = join(scratch, 'worked-example.md')
  writeFileSync(file, document)
  const run = Bun.spawnSync(
    [process.execPath, join(ROOT, 'scripts', 'validate.ts'), 'contract', '--sdd', file, '--check'],
    { stdout: 'pipe', stderr: 'pipe' }
  )
  const out = run.stdout.toString()
  const parsed = JSON.parse(out.slice(out.indexOf('{'))) as {
    drift?: unknown[]
    derived_fields?: string[]
  }
  console.log(
    JSON.stringify({
      protocol: 'create-sdd-contract-drift/v1',
      valid: (parsed.drift ?? []).length === 0,
      example: 'references/examples/loop-ready-example.md',
      derived_fields: parsed.derived_fields ?? [],
      drift: parsed.drift ?? []
    })
  )
  process.exit((parsed.drift ?? []).length ? 1 : 0)
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
