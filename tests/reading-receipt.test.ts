import { expect, test } from 'bun:test'
import { receiptEntries } from '../scripts/reading-receipt'

/** An authoring-receipt section holding one row per document. */
function receipt(rows: string): string {
  return `# Design\n\n## Authoring receipt\n\n${rows}\n`
}

test('a receipt row is read whatever column the token sits in', () => {
  const tokenLast = receipt(
    '| description | document | token |\n| --- | --- | --- |\n' +
      '| explains the phase table | `references/loading.md` | `b006bd2f` |'
  )
  const documentFirst = receipt(
    '| document | description | token |\n| --- | --- | --- |\n' +
      '| `references/loading.md` | explains the phase table | `b006bd2f` |'
  )
  for (const text of [tokenLast, documentFirst])
    expect(receiptEntries(text).get('references/loading.md')).toBe('b006bd2f')
})

test('a hex-looking description never shadows the row token', () => {
  const text = receipt(
    '| document | description | token |\n| --- | --- | --- |\n' +
      '| `references/loading.md` | supersedes deadbeef | `b006bd2f` |'
  )
  expect(receiptEntries(text).get('references/loading.md')).toBe('b006bd2f')
})

test('rows outside the authoring receipt section are ignored', () => {
  const text = '# Design\n\n## Evidence\n\n| `references/loading.md` | `b006bd2f` |\n'
  expect(receiptEntries(text).size).toBe(0)
})
