import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { requiredDocuments } from '../scripts/lib/reading-policy'

const SKILL = join(import.meta.dir, '..')

test('required documents accumulate by phase and grow with contract facts, never shrink', () => {
  const harvest = requiredDocuments('HARVEST', null)
  expect(harvest).toContain('references/planning/program-split.md')
  expect(harvest).not.toContain('references/loop-ready.md')
  const handoff = requiredDocuments('HANDOFF', null)
  expect(harvest.every((path) => handoff.includes(path))).toBe(true)
  const contract = {
    migration_applicability: 'REQUIRED',
    shared_mechanism_writes: [{ mechanism: 'lockfile' }],
    delivery_platforms: ['ios'],
    delivery_plan: { batches: [{ test_budget: { minutes: 5 } }, {}] }
  }
  const grown = requiredDocuments('HANDOFF', contract)
  for (const path of [
    'references/migration.md',
    'references/design/artifacts-and-dependencies.md',
    'references/product/platforms/mobile-native.md',
    'references/planning/test-budget.md',
    'references/planning/conflicts-and-lanes.md'
  ])
    expect(grown).toContain(path)
  expect(handoff.every((path) => grown.includes(path))).toBe(true)
})

/** Run the receipt CLI on an SDD and return its parsed report. */
function receipt(sdd: string): Record<string, unknown> {
  const run = Bun.spawnSync([
    process.execPath,
    join(SKILL, 'scripts/reading-receipt.ts'),
    'check',
    '--sdd',
    sdd
  ])
  return JSON.parse(run.stdout.toString())
}

/** An authoring receipt section with the current token of each path. */
const section = (paths: string[]) =>
  `## Authoring receipt\n\n${paths
    .map((path) => {
      const token = /<!-- reading-receipt: ([0-9a-f]{8}) -->/.exec(
        readFileSync(join(SKILL, path), 'utf8')
      )![1]
      return `- ${path} ${token}`
    })
    .join('\n')}\n`

test('receipts must be current, and a program root checks every node', () => {
  const root = mkdtempSync(join(tmpdir(), 'receipt-'))
  try {
    const required = requiredDocuments('HANDOFF', null)
    const leaf = join(root, 'a.sdd.md')
    writeFileSync(leaf, `# A\n\n${section(required)}`)
    expect(receipt(leaf).valid).toBe(true)
    writeFileSync(leaf, `# A\n\n${section(required).replace(/ [0-9a-f]{8}\n/, ' 00000000\n')}`)
    expect((receipt(leaf).stale as string[]).length).toBe(1)
    const program = JSON.stringify({
      nodes: [
        { id: 'root', sdd: 'root.sdd.md' },
        { id: 'a', sdd: 'a.sdd.md' }
      ]
    })
    const top = join(root, 'root.sdd.md')
    writeFileSync(
      top,
      `# Root\n\n<!-- sdd-program:start -->\n\`\`\`json\n${program}\n\`\`\`\n<!-- sdd-program:end -->\n\n${section(required)}`
    )
    // The root's own receipt is current, but a stale child fails the program.
    const report = receipt(top)
    expect(report.valid).toBe(false)
    expect((report.children as { valid: boolean }[]).map((child) => child.valid)).toEqual([false])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
