#!/usr/bin/env bun
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyOverlay, contractOf, withContract, type Json } from './lib/example-overlay.ts'

/**
 * Validate every worked example against the delivery controller. An example is what an author
 * copies, so a stale one teaches a shape the controller rejects. Each fenced document is extracted
 * and passed to `validate-draft`, which reads it in memory and creates no state.
 *
 * Reference prose shows the markers inside a fence on purpose, and the controller ignores fenced
 * markers, so the block must be unwrapped before it can be validated at all.
 *
 * A variant is not a document. It states a delivery index and a contract overlay against the base
 * worked SDD, and is composed here into a whole document before validation, so folding four copies
 * of one document into one copy plus two overlays cost nothing in coverage.
 */
const ROOT = join(import.meta.dir, '..')
/** create-sdd owns the document validator; the worked examples are checked against it directly. */
const VALIDATE = join(ROOT, 'scripts', 'validate.ts')

/** Every outer ````-fenced document in one reference file. */
function documents(text: string): string[] {
  return [...text.matchAll(/^````(?:markdown)?\n([\s\S]*?)\n````$/gm)]
    .map((match) => match[1]!)
    .filter((body) => body.includes('<!-- sdd-contract:start -->'))
}

/** The base worked SDD: the one file that carries a complete document. */
const BASE = join(ROOT, 'references', 'examples', 'loop-ready-example.md')
/** Variants stated as a delivery index plus a contract overlay on that base. */
const VARIANTS = join(ROOT, 'references', 'examples', 'variants.md')

/**
 * Compose one variant into a whole document.
 *
 * The base splits at the last top-level heading before the contract block: everything above it is
 * the design body the variants share word for word, and everything below is the delivery index the
 * variant replaces.
 */
function compose(base: string, index: string, overlay: Json): string {
  const cut = base.indexOf('<!-- sdd-contract:start -->')
  const headings = [...base.slice(0, cut).matchAll(/^# /gm)].map((match) => match.index!)
  const design = base.slice(0, headings.at(-1)!).trimEnd()
  const composed = `${design}\n\n${index.trim()}\n\n${base.slice(cut)}`
  return withContract(composed, applyOverlay(contractOf(base), overlay))
}

/** Each `## ` section of the variants file, with its index block and its overlay. */
function variants(text: string): { name: string; index: string; overlay: Json }[] {
  // A fence-aware split: the delivery index itself contains a `## ` heading, so a plain split on the
  // marker would cut each variant in half.
  const sections: string[] = []
  let fence: string | undefined
  for (const line of text.split('\n')) {
    const marker = /^(`{3,})/.exec(line)
    if (marker) {
      if (!fence) fence = marker[1]!
      else if (marker[1]!.length >= fence.length && !line.slice(marker[0].length).trim())
        fence = undefined
    }
    if (!fence && line.startsWith('## ')) sections.push(line.slice(3))
    else if (sections.length) sections[sections.length - 1] += `\n${line}`
  }
  return sections.map((section) => {
    const name = section.split('\n', 1)[0]!.trim()
    const index = /\*\*Delivery index:\*\*\s*\n+````markdown\n([\s\S]*?)\n````/.exec(section)
    const overlay = /\*\*Contract overlay:\*\*\s*\n+```json\n([\s\S]*?)\n```/.exec(section)
    if (!index || !overlay) throw Error(`EXAMPLE_VARIANT_INCOMPLETE:${name}`)
    return { name, index: index[1]!, overlay: JSON.parse(overlay[1]!) as Json }
  })
}

const results: { example: string; document: number; valid: boolean; diagnostics: unknown[] }[] = []
const scratch = mkdtempSync(join(tmpdir(), 'check-examples-'))
try {
  for (const path of [...new Bun.Glob('references/examples/**/*.md').scanSync(ROOT)].sort()) {
    // Variants are composed below; on their own they are deliberately not whole documents.
    if (path.endsWith('variants.md')) continue
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
        [process.execPath, VALIDATE, 'validate-draft', '--draft-file', file],
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
  const base = documents(readFileSync(BASE, 'utf8'))[0]!
  for (const variant of variants(readFileSync(VARIANTS, 'utf8'))) {
    const file = join(scratch, `variant-${variant.name.replace(/[^\w]/g, '_')}.md`)
    writeFileSync(file, compose(base, variant.index, variant.overlay))
    const run = Bun.spawnSync(
      [process.execPath, VALIDATE, 'validate-draft', '--draft-file', file],
      {
        stdout: 'pipe',
        stderr: 'pipe'
      }
    )
    const out = run.stdout.toString()
    let parsed: { valid?: boolean; diagnostics?: unknown[] } = {}
    try {
      parsed = JSON.parse(out.slice(out.indexOf('{')))
    } catch {
      parsed = { valid: false, diagnostics: [run.stderr.toString().trim() || 'NO_OUTPUT'] }
    }
    results.push({
      example: `references/examples/variants.md#${variant.name}`,
      document: 0,
      valid: parsed.valid === true,
      diagnostics: parsed.diagnostics ?? []
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
