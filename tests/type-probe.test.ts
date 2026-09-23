import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { probe } from '../scripts/type-probe'
import { readApiSection, readApiSurface } from '../scripts/validator/domain/api-section'

const ROOT = join(import.meta.dir, '..')
const fixture = (name: string) => Bun.file(join(ROOT, 'cases', 'fixtures', name)).text()

/** Write one throwaway document and probe it, so a case can state its own minimal input. */
async function probeText(body: string) {
  const dir = mkdtempSync(join(tmpdir(), 'type-probe-test-'))
  const path = join(dir, 'doc.sdd.md')
  try {
    writeFileSync(path, body)
    return await probe(path, body)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a public surface that admits no value is reported at the line that declares it', async () => {
  const text = await fixture('CSDD-TYPE-001.md')
  const result = await probe('CSDD-TYPE-001.md', text)
  expect(result.applicability).toBe('APPLICABLE')
  expect(result.valid).toBe(false)
  expect(result.issues).toHaveLength(1)
  expect(result.issues[0]!.code).toBe('API_SURFACE_DEGENERATE_INPUT')
  expect(result.issues[0]!.detail).toContain('createHost().use(stage)')
  // The line must point at the declaration inside the document, not at the synthesized program.
  const line = result.issues[0]!.sddLine!
  expect(text.split('\n')[line - 1]).toContain('createHost')
})

test('the repaired surface produces no finding, so the check can detect the repair', async () => {
  const text = await fixture('CSDD-TYPE-001.ok.md')
  const result = await probe('CSDD-TYPE-001.ok.md', text)
  expect(result.applicability).toBe('APPLICABLE')
  expect(result.valid).toBe(true)
  expect(result.issues).toEqual([])
})

test('a document with no API section is not applicable rather than silently clean', async () => {
  const result = await probeText('# A document\n\nProse only.\n')
  expect(result.applicability).toBe('NOT_APPLICABLE')
  expect(result.reason).toContain('no New/Changed API & Typing section')
  expect(result.valid).toBe(true)
})

test('a non-TypeScript surface names its language and states that no gate covers it', async () => {
  const result = await probeText(
    [
      '## New/Changed API & Typing',
      '',
      '**Applicability:** APPLICABLE',
      '',
      '**Signatures:**',
      '',
      '```go',
      'func NewHost(mode Mode) *Host',
      '```',
      ''
    ].join('\n')
  )
  expect(result.applicability).toBe('NOT_APPLICABLE')
  expect(result.facts.foreign_languages).toContain('go')
  expect(result.reason).toContain('No equivalent gate exists')
  expect(result.valid).toBe(true)
})

test('a declared exhaustiveness helper is suppressed only where the author says so', async () => {
  const body = (suppress: boolean) =>
    [
      '## New/Changed API & Typing',
      '',
      '**Applicability:** APPLICABLE',
      '',
      '**Signatures:**',
      '',
      '```ts',
      `export declare function assertNever(value: never): never${suppress ? ' // sdd-allow: never-input exhaustiveness helper' : ''}`,
      '```',
      ''
    ].join('\n')
  const reported = await probeText(body(false))
  expect(reported.issues.map((issue) => issue.code)).toEqual(['API_SURFACE_DEGENERATE_INPUT'])
  const suppressed = await probeText(body(true))
  expect(suppressed.issues).toEqual([])
  expect(suppressed.valid).toBe(true)
})

test('the section reader keeps every fence it read anchored to its line in the document', async () => {
  const text = await fixture('CSDD-TYPE-001.md')
  const section = readApiSection(text)
  expect(section.found).toBe(true)
  expect(section.applicability).toBe('APPLICABLE')
  const fields = section.blocks.map((block) => block.field)
  expect(fields).toEqual(['Signatures', 'Examples'])
  const lines = text.split('\n')
  for (const block of section.blocks)
    expect(lines[block.startLine - 1]).toBe(block.code.split('\n')[0])
})

test('a document with no API section still has its declarations read', () => {
  const document = [
    '# Some design',
    '',
    '## 4. 公开契约',
    '',
    'The heading is not the canonical one, which is the ordinary case in this corpus.',
    '',
    '```ts',
    'export type IThing = { readonly id: string }',
    '```',
    '',
    '## 5. 说明',
    '',
    'A narrative snippet that declares nothing must not be read as surface:',
    '',
    '```ts',
    'thing.use(stage)',
    '```',
    ''
  ].join('\n')
  const surface = readApiSurface(document)
  expect(surface.found).toBe(true)
  expect(surface.readFrom).toBe('document')
  expect(surface.blocks).toHaveLength(1)
  expect(surface.blocks[0]!.field).toBe('Declarations')
  expect(surface.blocks[0]!.code).toContain('export type IThing')
  // Line provenance still points back at the SDD, which is what makes a finding actionable.
  expect(document.split('\n')[surface.blocks[0]!.startLine - 1]).toBe(
    'export type IThing = { readonly id: string }'
  )
})

test('the canonical section wins when the document has one', () => {
  const document = [
    '### New/Changed API & Typing',
    '',
    '**Applicability:** APPLICABLE',
    '',
    '**Signatures:**',
    '',
    '```ts',
    'export declare function fromSection(): void',
    '```',
    '',
    '## Elsewhere',
    '',
    '```ts',
    'export declare function fromElsewhere(): void',
    '```',
    ''
  ].join('\n')
  const surface = readApiSurface(document)
  expect(surface.readFrom).toBe('section')
  expect(surface.blocks.map((block) => block.code).join()).toContain('fromSection')
  expect(surface.blocks.map((block) => block.code).join()).not.toContain('fromElsewhere')
})
