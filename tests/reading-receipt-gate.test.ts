import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { evaluate } from '../scripts/reading-receipt'
import { derivedConditions, requiredDocuments } from '../scripts/lib/reading-policy'

const ROOT = join(import.meta.dir, '..')

/** The token the gate derives for one reference, computed the same way the gate does. */
function token(path: string): string {
  const text = readFileSync(join(ROOT, path), 'utf8')
  const body = text
    .replace(/\n*<!-- reading-receipt: [0-9a-f]{8} -->\s*$/, '')
    .replace(/\s*$/, '\n')
  return createHash('sha256').update(body).digest('hex').slice(0, 8)
}

/** An SDD whose contract is `contract` and whose receipt lists `rows`. */
function document(contract: object, rows: readonly (readonly [string, string])[]): string {
  const json = JSON.stringify({ protocol: 'sdd-loop-delivery/v1', revision: 'R1', ...contract })
  const receipt = rows.map(([path, value]) => `- \`${path}\` ${value}`).join('\n')
  return `# Task\n\n<!-- sdd-contract:start -->\n\`\`\`json\n${json}\n\`\`\`\n<!-- sdd-contract:end -->\n\n## Authoring receipt\n\n${receipt}\n`
}

/** Write an SDD into a throwaway directory and evaluate it. */
async function gate(text: string, extraFiles: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'receipt-gate-'))
  const sdd = join(dir, 'task.sdd.md')
  try {
    writeFileSync(sdd, text)
    for (const [name, content] of Object.entries(extraFiles))
      writeFileSync(join(dirname(sdd), name), content)
    return await evaluate(sdd)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const baseline = requiredDocuments('HANDOFF', null)

test('a receipt listing every required document with current tokens passes', async () => {
  const rows = baseline.map((path) => [path, token(path)] as const)
  const result = await gate(document({}, rows))
  expect(result).toMatchObject({ valid: true, missing: [], stale: [], unknown: [] })
})

test('an omitted document is missing and a wrong token is stale', async () => {
  const rows = baseline.map((path) => [path, token(path)] as const)
  const omitted = await gate(document({}, rows.slice(1)))
  expect(omitted.missing).toEqual([baseline[0]!])
  expect(omitted.valid).toBe(false)

  const wrong = await gate(document({}, [[baseline[0]!, 'deadbeef'], ...rows.slice(1)]))
  expect(wrong.stale).toEqual([baseline[0]!])
  expect(wrong.valid).toBe(false)
})

test('a row naming a document this skill does not ship is unknown', async () => {
  const rows = [
    ...baseline.map((path) => [path, token(path)] as const),
    ['references/absent.md', 'aaaaaaaa'] as const
  ]
  const result = await gate(document({}, rows))
  expect(result.unknown).toEqual(['references/absent.md'])
  expect(result.valid).toBe(false)
})

test('a contract the reader cannot parse fails instead of reporting no contract', async () => {
  const broken =
    '# Task\n\n<!-- sdd-contract:start -->\n```json\n{"revision": ,}\n```\n<!-- sdd-contract:end -->\n\n## Authoring receipt\n\n'
  const result = await gate(broken)
  expect(result.valid).toBe(false)
  expect(result).toMatchObject({ error: 'CONTRACT_JSON_INVALID' })
})

test('a decision requirement pulls in the authority documents', async () => {
  const contract = { requirements: [{ id: 'JC01', requirement_type: 'decision' }] }
  const required = requiredDocuments('HANDOFF', contract, derivedConditions(contract))
  expect(required).toContain('references/design/decision-authority.md')
  expect(required).toContain('references/examples/decision-example.md')
  const rows = required.map((path) => [path, token(path)] as const)
  expect((await gate(document(contract, rows))).valid).toBe(true)
})

test('a continuation lineage pulls in the continuation documents', async () => {
  const contract = { lineage: { mode: 'continuation' } }
  const required = requiredDocuments('HANDOFF', contract, derivedConditions(contract))
  expect(required).toContain('references/design/continuation-lineage.md')
  expect(required).toContain('references/examples/continuation-example.md')
})

test('a sibling retrospective pulls in estimate calibration', async () => {
  expect(requiredDocuments('HANDOFF', null, derivedConditions(null, []))).not.toContain(
    'references/planning/estimate-calibration.md'
  )
  expect(
    requiredDocuments('HANDOFF', null, derivedConditions(null, ['task.sdd.md.retrospective.json']))
  ).toContain('references/planning/estimate-calibration.md')
})
