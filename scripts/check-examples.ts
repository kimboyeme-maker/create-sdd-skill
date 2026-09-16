#!/usr/bin/env bun
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Validate every worked example against the delivery controller. An example is what an author
 * copies, so a stale one teaches a shape the controller rejects. Each fenced document is extracted
 * and passed to `validate-draft`, which reads it in memory and creates no state.
 *
 * Reference prose shows the markers inside a fence on purpose, and the controller ignores fenced
 * markers, so the block must be unwrapped before it can be validated at all.
 */
const ROOT = join(import.meta.dir, '..')
const LOOP_MAIN = join(ROOT, '..', 'sdd-loop-delivery', 'scripts', 'main.ts')

/** Every outer ````-fenced document in one reference file. */
function documents(text: string): string[] {
  return [...text.matchAll(/^````(?:markdown)?\n([\s\S]*?)\n````$/gm)]
    .map((match) => match[1]!)
    .filter((body) => body.includes('<!-- sdd-contract:start -->'))
}

const results: { example: string; document: number; valid: boolean; diagnostics: unknown[] }[] = []
const scratch = mkdtempSync(join(tmpdir(), 'check-examples-'))
try {
  for (const path of [...new Bun.Glob('references/examples/**/*.md').scanSync(ROOT)].sort()) {
    const bodies = documents(readFileSync(join(ROOT, path), 'utf8'))
    if (!bodies.length) {
      results.push({
        example: path,
        document: 0,
        valid: false,
        diagnostics: ['NO_WORKED_DOCUMENT']
      })
      continue
    }
    bodies.forEach((body, index) => {
      const file = join(scratch, `${path.replace(/[^\w]/g, '_')}-${index}.md`)
      writeFileSync(file, body)
      const run = Bun.spawnSync(
        [process.execPath, LOOP_MAIN, 'validate-draft', '--draft-file', file],
        { stdout: 'pipe', stderr: 'pipe' }
      )
      const out = run.stdout.toString()
      let parsed: { valid?: boolean; diagnostics?: unknown[] } = {}
      try {
        parsed = JSON.parse(out.slice(out.indexOf('{')))
      } catch {
        parsed = { valid: false, diagnostics: [run.stderr.toString().trim() || 'NO_OUTPUT'] }
      }
      results.push({
        example: path,
        document: index,
        valid: parsed.valid === true,
        diagnostics: parsed.diagnostics ?? []
      })
    })
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

const failed = results.filter((result) => !result.valid)
console.log(
  JSON.stringify({
    protocol: 'create-sdd-examples/v1',
    valid: failed.length === 0,
    documents: results.length,
    failed
  })
)
process.exit(failed.length ? 1 : 0)
