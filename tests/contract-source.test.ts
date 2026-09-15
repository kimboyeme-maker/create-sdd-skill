import { expect, test } from 'bun:test'
import { contractBlock, programBlock, sectionText } from '../scripts/lib/contract-source'

/** A contract block with the given JSON body. */
const block = (json: string) =>
  `<!-- sdd-contract:start -->\n\`\`\`json\n${json}\n\`\`\`\n<!-- sdd-contract:end -->`

const real = '{"protocol": "sdd-loop-delivery/v1", "revision": "REAL"}'
const example = '{"protocol": "sdd-loop-delivery/v1", "revision": "EXAMPLE"}'

test('a document without any marker declares no block', () => {
  expect(contractBlock('# Design\n\nProse only.\n')).toEqual({ value: null })
})

test('a block shown inside a fenced example is documentation, not the contract', () => {
  const text = `# Meta\n\n\`\`\`\`markdown\n${block(example)}\n\`\`\`\`\n\nThe real one:\n\n${block(real)}\n`
  expect(contractBlock(text).value?.revision).toBe('REAL')
})

test('a fenced example alone leaves the document without a contract', () => {
  expect(contractBlock(`\`\`\`\`markdown\n${block(example)}\n\`\`\`\`\n`)).toEqual({ value: null })
})

test('two real blocks are a fault, never a silent choice of the first', () => {
  expect(contractBlock(`${block(real)}\n${block(example)}\n`).error).toBe('CONTRACT_BLOCK_COUNT')
})

test('an end marker before its start is a fault', () => {
  const text = '<!-- sdd-contract:end -->\n<!-- sdd-contract:start -->\n'
  expect(contractBlock(text).error).toBe('CONTRACT_BLOCK_COUNT')
})

test('malformed JSON is reported, not read as an absent block', () => {
  expect(contractBlock(block('{"revision": ,}')).error).toBe('CONTRACT_JSON_INVALID')
})

test('a block that is not one json fence is reported', () => {
  const text = '<!-- sdd-contract:start -->\nplain prose\n<!-- sdd-contract:end -->'
  expect(contractBlock(text).error).toBe('CONTRACT_JSON_INVALID')
})

test('the program index follows the same rules under its own codes', () => {
  const program = (json: string) =>
    `<!-- sdd-program:start -->\n\`\`\`json\n${json}\n\`\`\`\n<!-- sdd-program:end -->`
  const shown = program('{"id": "EXAMPLE"}')
  const actual = program('{"id": "PG-REAL"}')
  expect(programBlock(`\`\`\`\`markdown\n${shown}\n\`\`\`\`\n${actual}`).value?.id).toBe('PG-REAL')
  expect(programBlock(`${actual}\n${shown}`).error).toBe('PROGRAM_BLOCK_COUNT')
})

test('a section reader skips headings that only appear inside a fenced example', () => {
  const text =
    '# Top\n\n````markdown\n## Breaking Changes\nfenced body\n````\n\n## Breaking Changes\nreal body\n'
  expect(sectionText(text, /^Breaking Changes$/)).toContain('real body')
  expect(sectionText(text, /^Breaking Changes$/)).not.toContain('fenced body')
})
