import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { validateV2Document } from '../scripts/validator/domain/v2-document'

/** A throwaway directory with the given files; `git` adds the marker repository detection reads. */
function workspace(files: Record<string, string>, git = true): string {
  const root = mkdtempSync(join(tmpdir(), 'v2-document-'))
  if (git) mkdirSync(join(root, '.git'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

/** An sdd/v2 leaf whose prose is `body` and whose index is `index`. */
const leaf = (body: string, index: Record<string, unknown>) =>
  `# Change\n\n${body}\n\n<!-- sdd-contract:start -->\n\`\`\`json\n${JSON.stringify(index)}\n\`\`\`\n<!-- sdd-contract:end -->\n`

const body = [
  '- E1 Story one.',
  '- E2 Story two.',
  '- R1 First requirement.',
  '- R2 Second requirement.',
  '- C1 Foundation batch.',
  '- C2 Story batch.',
  '- S1 Build the base.',
  '- S2 Build the story.',
  '- A1 Base works.',
  '- A2 Story works.'
].join('\n')

const index = {
  protocol: 'sdd/v2',
  id: 'change',
  revision: '1',
  requirements: [
    { id: 'R1', kind: 'must-ship', implementation: ['S1'], acceptance: ['A1'] },
    { id: 'R2', kind: 'must-ship', implementation: ['S2'], acceptance: ['A2'] }
  ],
  batches: [
    { id: 'C1', steps: ['S1'], requirements: ['R1'], depends_on: [] },
    { id: 'C2', steps: ['S2'], requirements: ['R2'], depends_on: ['C1'] }
  ],
  steps: ['S1', 'S2'],
  acceptance: ['A1', 'A2'],
  writes: ['packages/change'],
  unresolved_user_decisions: []
}

test('a one-document leaf without metas derives its Meta graph from the index', () => {
  const root = workspace({ 'change.sdd.md': leaf(body, index) })
  try {
    const path = join(root, 'change.sdd.md')
    const result = validateV2Document(path, leaf(body, index))!
    expect(result.diagnostics).toEqual([])
    expect(result.handoff.meta_source).toBe('derived')
    expect(result.handoff.execution_slice?.chunks.map((chunk) => chunk.id)).toEqual([
      'K:C1',
      'K:C2'
    ])
    expect(result.handoff.execution_slice?.waves).toEqual([['K:C1'], ['K:C2']])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('declared Entry priorities order the entries, name the MVP and may use derived Modules', () => {
  const declared = {
    ...index,
    batches: index.batches.map((batch) => ({ ...batch, depends_on: [] })),
    metas: [
      { id: 'E2', kind: 'Entry', priority: 'P2', members: ['M:R1'] },
      { id: 'E1', kind: 'Entry', priority: 'P1', members: ['M:R2'] }
    ]
  }
  const root = workspace({})
  try {
    const result = validateV2Document(join(root, 'change.sdd.md'), leaf(body, declared))!
    expect(result.diagnostics).toEqual([])
    expect(result.handoff.meta_source).toBe('mixed')
    const slice = result.handoff.execution_slice!
    expect(slice.entries.map((entry) => entry.id)).toEqual(['E1', 'E2'])
    expect(slice.mvp).toEqual(['E1'])
    expect(slice.waves).toEqual([['K:C2', 'K:C1']])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('repository location: detected optional, explicit verified, missing only limits the checks', () => {
  const plain = workspace({}, false)
  try {
    const text = leaf(body, index)
    const detached = validateV2Document(join(plain, 'change.sdd.md'), text)!
    expect(detached.handoff.maturity).toBe('STRUCTURALLY_READY')
    expect(detached.handoff.repository).toBeNull()
    expect(detached.handoff.evidence_limits.join('\n')).toContain(
      'Repository location is unverified'
    )
    const explicit = validateV2Document(join(plain, 'change.sdd.md'), text, [], plain)!
    expect(explicit.handoff.repository).not.toBeNull()
    expect(explicit.diagnostics).toEqual([])
    const wrong = validateV2Document(join(plain, 'change.sdd.md'), text, [], join(plain, 'nope'))!
    expect(wrong.diagnostics.map((item) => item.code)).toEqual(['REPOSITORY_NOT_FOUND'])
  } finally {
    rmSync(plain, { recursive: true, force: true })
  }
})

test('declared principles must exist and be checked in the body', () => {
  const root = workspace({ '.specify/memory/constitution.md': '# Constitution\n' })
  try {
    const withPrinciples = { ...index, principles: ['.specify/memory/constitution.md'] }
    const path = join(root, 'change.sdd.md')
    const unchecked = validateV2Document(path, leaf(body, withPrinciples))!
    expect(unchecked.diagnostics.map((item) => item.code)).toEqual(['SDD_V2_SECTION_MISSING'])
    const checked = validateV2Document(
      path,
      leaf(`${body}\n\n## Principle Check\n\nNo deviation.`, withPrinciples)
    )!
    expect(checked.diagnostics).toEqual([])
    expect(checked.handoff.principles).toEqual([
      join(realpathSync(root), '.specify/memory/constitution.md')
    ])
    expect(checked.handoff.read_order[0]).toBe(checked.handoff.principles[0])
    const missing = validateV2Document(path, leaf(body, { ...index, principles: ['AGENTS.md'] }))!
    expect(missing.diagnostics.map((item) => item.code)).toContain('SDD_V2_PATH_NOT_FOUND')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
