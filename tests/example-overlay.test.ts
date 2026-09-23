import { expect, test } from 'bun:test'
import { applyOverlay, contractOf, withContract } from '../scripts/lib/example-overlay'

test('an object overlay merges by key and an explicit null deletes one', () => {
  expect(applyOverlay({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 9 }, e: 4 })).toEqual({
    a: 1,
    b: { c: 9, d: 3 },
    e: 4
  })
  expect(applyOverlay({ a: 1, b: 2 }, { b: null })).toEqual({ a: 1 })
})

test('an array without member identity is replaced rather than merged', () => {
  // Merging positionally would silently reorder an ordered list, which is worse than replacing it.
  expect(applyOverlay({ xs: [1, 2, 3] }, { xs: [9] })).toEqual({ xs: [9] })
})

test('a merge_by_id overlay edits members in place, appends new ones and drops removed ones', () => {
  const base = {
    steps: [
      { id: 'BZ01', kind: 'BEHAVIOR', note: 'keep' },
      { id: 'BZ02', kind: 'BEHAVIOR', note: 'change me' }
    ]
  }
  expect(
    applyOverlay(base, {
      steps: {
        merge_by_id: [
          { id: 'BZ02', note: 'changed' },
          { id: 'BZ03', kind: 'MECHANICAL' }
        ]
      }
    })
  ).toEqual({
    steps: [
      { id: 'BZ01', kind: 'BEHAVIOR', note: 'keep' },
      { id: 'BZ02', kind: 'BEHAVIOR', note: 'changed' },
      { id: 'BZ03', kind: 'MECHANICAL' }
    ]
  })
  expect(applyOverlay(base, { steps: { merge_by_id: [], remove: ['BZ01'] } })).toEqual({
    steps: [{ id: 'BZ02', kind: 'BEHAVIOR', note: 'change me' }]
  })
})

test('a merge overlay aimed at something that is not an array is refused, not guessed at', () => {
  expect(() => applyOverlay({ steps: 'nope' }, { steps: { merge_by_id: [] } })).toThrow(
    'EXAMPLE_OVERLAY_MERGE_TARGET_NOT_ARRAY'
  )
})

test('a contract block round-trips through read and rewrite', () => {
  const document = [
    '# Example',
    '',
    '<!-- sdd-contract:start -->',
    '```json',
    '{\n  "protocol": "sdd-loop-delivery/v1"\n}',
    '```',
    '<!-- sdd-contract:end -->',
    ''
  ].join('\n')
  expect(contractOf(document)).toEqual({ protocol: 'sdd-loop-delivery/v1' })
  const rewritten = withContract(document, { protocol: 'x', revision: 'SDD-v2' })
  expect(contractOf(rewritten)).toEqual({ protocol: 'x', revision: 'SDD-v2' })
  expect(rewritten.startsWith('# Example')).toBe(true)
})

test('a document with no contract block is reported rather than silently skipped', () => {
  expect(() => contractOf('# Example\n')).toThrow('EXAMPLE_CONTRACT_BLOCK_MISSING')
})
