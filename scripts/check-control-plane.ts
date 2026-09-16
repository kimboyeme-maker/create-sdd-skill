#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Compare the delivery controller's advertised `features` with the ones this skill's handoff
 * depends on. The list is checked in as data so the reference prose and this check cannot drift:
 * `--render` rewrites the reference block from the data, and the default run fails if either the
 * block or the live controller disagrees with it.
 *
 * Superset semantics are deliberate. The controller already advertises far more than this skill
 * requires, and every feature it grows would fail an equality check on the day it ships.
 */
const ROOT = join(import.meta.dir, '..')
const REQUIRED = join(ROOT, 'cases', 'control-plane-features.json')
const REFERENCE = join(ROOT, 'references', 'loop-ready.md')
const LOOP_MAIN = join(ROOT, '..', 'sdd-loop-delivery', 'scripts', 'main.ts')

type Features = Record<string, unknown>
const required = JSON.parse(readFileSync(REQUIRED, 'utf8')) as Features

/** The reference block is a projection of the data; its exact text is what `--render` writes. */
function referenceBlock(): string {
  return '```json\n' + JSON.stringify(required, null, 2) + '\n```'
}

/** The one fenced block in the reference that carries the feature list. */
function locateBlock(text: string): { start: number; end: number } | null {
  const pattern = /```json\n[\s\S]*?\n```/g
  for (const match of text.matchAll(pattern))
    if (match[0].includes('"epoch_public_key_signatures"'))
      return { start: match.index!, end: match.index! + match[0].length }
  return null
}

const diagnostics: string[] = []
const text = readFileSync(REFERENCE, 'utf8')
const block = locateBlock(text)
if (!block) diagnostics.push('CONTROL_PLANE_REFERENCE_BLOCK_MISSING')
else if (Bun.argv.includes('--render')) {
  const next = text.slice(0, block.start) + referenceBlock() + text.slice(block.end)
  if (next !== text) {
    writeFileSync(REFERENCE, next)
    // Rewriting a reference invalidates its reading-receipt trailer; one implementation of that
    // token lives in reading-receipt.ts, so re-stamp through it rather than recomputing here.
    Bun.spawnSync([process.execPath, join(ROOT, 'scripts', 'reading-receipt.ts'), 'stamp'], {
      cwd: ROOT,
      stdout: 'pipe'
    })
  }
  console.log(JSON.stringify({ protocol: 'control-plane/v1', rendered: REFERENCE }))
  process.exit(0)
} else if (text.slice(block.start, block.end) !== referenceBlock())
  diagnostics.push('CONTROL_PLANE_REFERENCE_STALE: run check-control-plane.ts --render')

// The controller is invoked as a CLI; this skill never imports its code.
const probe = Bun.spawnSync([process.execPath, LOOP_MAIN, 'capabilities'], { stdout: 'pipe' })
let advertised: Features = {}
let protocol: unknown
if (probe.exitCode !== 0) diagnostics.push('LOOP_CONTROL_PLANE_INCOMPATIBLE: capabilities failed')
else
  try {
    const value = JSON.parse(probe.stdout.toString()) as { protocol?: unknown; features?: Features }
    protocol = value.protocol
    advertised = value.features ?? {}
  } catch {
    diagnostics.push('LOOP_CONTROL_PLANE_INCOMPATIBLE: capabilities is not JSON')
  }
if (protocol !== undefined && protocol !== 'sdd-loop-delivery/v1')
  diagnostics.push(`LOOP_CONTROL_PLANE_INCOMPATIBLE: protocol ${String(protocol)}`)
for (const [key, value] of Object.entries(required))
  if (JSON.stringify(advertised[key]) !== JSON.stringify(value))
    diagnostics.push(`LOOP_CONTROL_PLANE_INCOMPATIBLE:${key}`)

console.log(
  JSON.stringify({
    protocol: 'control-plane/v1',
    valid: diagnostics.length === 0,
    required: Object.keys(required).length,
    advertised: Object.keys(advertised).length,
    diagnostics
  })
)
process.exit(diagnostics.length ? 1 : 0)
