#!/usr/bin/env bun
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadContract } from './lib/contract-source.ts'

/**
 * Reading receipts make create-sdd's document pointers enforceable without inlining them.
 * Every reference ends with a token derived from its own content; an SDD records the token of
 * each document its author loaded, and `check` derives the required set from the phase table
 * and the SDD's contract. A token proves the author opened the current version, not understanding;
 * the loop validators still judge the content.
 */
const ROOT = join(import.meta.dir, '..')
const TOKEN_LINE = /\n*<!-- reading-receipt: [0-9a-f]{8} -->\s*$/
const RECEIPT_ENTRY = /`?(references\/[\w./-]+\.md)`?\s*[:|-]?\s*`?([0-9a-f]{8})\b/

/** Phase documents every implementation-targeting SDD loads (phases 1–6 of loading.md). */
const PHASE_DOCUMENTS = [
  'references/phases/1-harvest.md',
  'references/product/archetypes.md',
  'references/product/platforms.md',
  'references/phases/2-admit.md',
  'references/phases/3-design.md',
  'references/complete-design.md',
  'references/writing.md',
  'references/phases/4-verify.md',
  'references/product/acceptance-standards.md',
  'references/work-decomposition.md',
  'references/loop-ready.md'
] as const

/** Platform guides keyed by the contract's `delivery_platforms` values. */
const PLATFORM_DOCUMENTS: Readonly<Record<string, readonly string[]>> = {
  'mini-program': ['references/product/platforms/mini-program.md'],
  ios: ['references/product/platforms/mobile-native.md'],
  android: ['references/product/platforms/mobile-native.md'],
  flutter: ['references/product/platforms/flutter.md', 'references/product/platforms/mobile-native.md'],
  harmonyos: ['references/product/platforms/harmonyos-arkts.md'],
  desktop: ['references/product/platforms/desktop.md'],
  'native-sdk': ['references/product/platforms/native-sdk.md']
}

const body = (text: string) => text.replace(TOKEN_LINE, '').replace(/\s*$/, '\n')
const tokenOf = (text: string) => createHash('sha256').update(body(text)).digest('hex').slice(0, 8)
const references = () => [...new Bun.Glob('references/**/*.md').scanSync(ROOT)].sort()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

/** Documents the contract makes mandatory, mirroring loading.md's conditional rows. */
function contractDocuments(contract: Record<string, any> | null): string[] {
  if (!contract) return []
  const required: string[] = []
  if (contract.experience_contract !== undefined) required.push('references/product/experience-contract.md')
  if (contract.product_archetype === 'content-publication') required.push('references/product/content-site.md')
  for (const platform of Array.isArray(contract.delivery_platforms) ? contract.delivery_platforms : [])
    required.push(...(PLATFORM_DOCUMENTS[platform] ?? []))
  if (contract.migration_applicability === 'REQUIRED') required.push('references/migration.md')
  const batches: Record<string, any>[] = Array.isArray(contract.delivery_plan?.batches) ? contract.delivery_plan.batches : []
  if (batches.length >= 2) required.push('references/planning/conflicts-and-lanes.md')
  if (batches.some((batch) => Number(batch.test_budget?.minutes) > 0 || Number(batch.test_budget?.max_new_test_files) > 0))
    required.push('references/planning/test-budget.md')
  return required
}

/** Receipt entries from the SDD's "Authoring receipt" section. */
function receiptEntries(text: string): Map<string, string> {
  const entries = new Map<string, string>()
  let inside = false
  for (const line of text.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) inside = /authoring receipt/i.test(heading[2]!)
    else if (inside) {
      const entry = RECEIPT_ENTRY.exec(line)
      if (entry) entries.set(entry[1]!, entry[2]!)
    }
  }
  return entries
}

async function check(sdd: string) {
  const text = readFileSync(sdd, 'utf8')
  // An invalid contract still declares which documents were required, so it never shrinks the receipt.
  const { contract } = await loadContract(sdd, text)
  const required = [...new Set([...PHASE_DOCUMENTS, ...contractDocuments(contract)])]
  const entries = receiptEntries(text)
  const missing = required.filter((path) => !entries.has(path))
  const unknown = [...entries.keys()].filter((path) => !existsSync(join(ROOT, path)))
  const stale = [...entries]
    .filter(([path, token]) => existsSync(join(ROOT, path)) && tokenOf(read(path)) !== token)
    .map(([path]) => path)
  const valid = !missing.length && !unknown.length && !stale.length
  console.log(JSON.stringify({ protocol: 'create-sdd-reading-receipt/v1', sdd, valid, contract: contract !== null, required, missing, stale, unknown }))
  process.exit(valid ? 0 : 1)
}

const [command, flag, value] = Bun.argv.slice(2)
if (command === 'check' && flag === '--sdd' && value) await check(value)
else if (command === 'stamp') {
  // Maintainers run this after editing references; tokens change only when content changes.
  for (const path of references()) {
    const text = read(path)
    const next = `${body(text)}\n<!-- reading-receipt: ${tokenOf(text)} -->\n`
    if (next !== text) writeFileSync(join(ROOT, path), next)
  }
  console.log(JSON.stringify({ stamped: references().length }))
} else if (command === 'verify') {
  const unstamped = references().filter((path) => {
    const match = /<!-- reading-receipt: ([0-9a-f]{8}) -->\s*$/.exec(read(path))
    return match?.[1] !== tokenOf(read(path))
  })
  console.log(JSON.stringify({ references: references().length, unstamped }))
  process.exit(unstamped.length ? 1 : 0)
} else {
  console.error('usage: reading-receipt.ts check --sdd <path> | stamp | verify')
  process.exit(2)
}
