import { expect, test } from 'bun:test'
import { derivedConditions, requiredDocuments } from '../scripts/lib/reading-policy'

test('the repository answers the conditions an author must never be asked to declare', () => {
  // Before these were derived, three conditions could not become true at all, so 47KB of the
  // reference corpus — the worked example most of all — was unreachable to every author.
  const none = derivedConditions(null, [])
  expect(none.languages).toBeUndefined()
  expect(none.typescriptToolchain).toBe(false)
  // Absent facts leave the question open: "no repository" is not the claim "no contract yet".
  expect(none.firstContract).toBeUndefined()

  const derived = derivedConditions(null, [], {
    extensions: ['.ts', '.go', '.md'],
    typescriptConfig: true,
    existingContracts: 0
  })
  expect(derived.languages?.sort()).toEqual(['go', 'typescript'])
  expect(derived.typescriptToolchain).toBe(true)
  expect(derived.firstContract).toBe(true)
  // A repository that already holds a contract is past its first one.
  expect(derivedConditions(null, [], { extensions: [], existingContracts: 2 }).firstContract).toBe(
    false
  )
  // A Node package is not a TypeScript package: only sources and a configuration say that.
  const plainJs = derivedConditions(null, [], { extensions: ['.js', '.json'] })
  expect(plainJs.languages).toEqual(['javascript'])
  expect(plainJs.typescriptToolchain).toBe(false)
})

test('each derived condition routes the documents it exists to make reachable', () => {
  const docs = (conditions: Parameters<typeof requiredDocuments>[2]) =>
    requiredDocuments('HANDOFF', null, conditions)
  const baseline = docs({})
  expect(baseline).not.toContain('references/examples/loop-ready-example.md')
  expect(baseline).not.toContain('references/design/typescript-toolchain.md')

  const facts = derivedConditions(null, [], {
    extensions: ['.ts', '.go'],
    typescriptConfig: true,
    existingContracts: 0
  })
  const routed = docs(facts)
  expect(routed).toContain('references/examples/loop-ready-example.md')
  expect(routed).toContain('references/design/typescript-toolchain.md')
  expect(routed).toContain('references/product/languages/bun-node.md')
  expect(routed).toContain('references/product/languages/go.md')
  // A language the repository shows no sign of is not routed.
  expect(routed).not.toContain('references/product/languages/rust.md')
})
