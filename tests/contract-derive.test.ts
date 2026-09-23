import { expect, test } from 'bun:test'
import {
  contractDrift,
  deriveContract,
  deriveDesignDetail,
  deriveLegacySurfaces,
  derivePresentationItems,
  deriveRequirements,
  readPath,
  replaceContractBlock,
  resolveDerivable,
  reverseTables,
  sectionAnchors,
  writeDerived
} from '../scripts/validator/domain/derive/contract'

const TABLE = [
  '## 交付事项',
  '',
  '| ID | description | requirement_ids | acceptance_ids | batch_ids | gate |',
  '| --- | --- | --- | --- | --- | --- |',
  '| PC01 | Do the work | XQ01 | YS01 | | |',
  '| BH01 | Close the behaviour | XQ01 | YS01 | PC01 | |',
  '| MJ01 | Verify everything | XQ01 | YS01 | | SHIP |',
  '| ZJ01 | Evidence of the probe | | | | |',
  ''
].join('\n')

const SECTIONS = [
  '### Breaking Changes',
  '',
  '### New/Changed API & Typing',
  '',
  '### New/Changed Entities & Tools',
  '',
  '### 6.2 Implementation Flow & Pseudocode',
  '',
  '### Delivery & Verification',
  ''
].join('\n')

/**
 * The paths a contract drifts on, for tests that fix one field and leave the rest unwritten.
 *
 * A fixture that omits `design_detail` entirely still derives one from the headings, which is
 * correct for a real document and noise for a unit test about some other field.
 */
const driftPaths = (contract: unknown, text: string) =>
  contractDrift(contract, text, 'self').map((entry) => entry.path)

test('the presentation index is rebuilt from the tables that define the objects', () => {
  const items = derivePresentationItems(TABLE, 'self')
  expect(items.map((item) => item.id)).toEqual(['PC01', 'BH01', 'MJ01'])
  expect(items.map((item) => item.kind)).toEqual(['batch', 'closure', 'gate'])
  // Evidence rows are real objects but are not required to be indexed, so they are not invented.
  expect(items.some((item) => item.id === 'ZJ01')).toBe(false)
  expect(items[0]!.source).toEqual({ document: 'self', heading: '交付事项', table: 1 })
})

test('an author may index more than the minimum without that reading as drift', () => {
  const contract = {
    presentation: {
      items: [
        { id: 'PC01', kind: 'batch', source: { document: 'self', heading: '交付事项', table: 1 } },
        {
          id: 'BH01',
          kind: 'closure',
          source: { document: 'self', heading: '交付事项', table: 1 }
        },
        { id: 'MJ01', kind: 'gate', source: { document: 'self', heading: '交付事项', table: 1 } },
        {
          id: 'ZJ01',
          kind: 'evidence',
          source: { document: 'self', heading: '交付事项', table: 1 }
        }
      ]
    }
  }
  expect(contractDrift(contract, TABLE, 'self')).toEqual([])
})

test('a required index entry that the document omits is reported', () => {
  const contract = {
    presentation: {
      items: [
        { id: 'PC01', kind: 'batch', source: { document: 'self', heading: '交付事项', table: 1 } }
      ]
    }
  }
  const drift = contractDrift(contract, TABLE, 'self')
  expect(drift).toHaveLength(1)
  expect(drift[0]!.path).toBe('presentation.items')
  expect(drift[0]!.missing_from_document!.map((item) => (item as { id: string }).id)).toEqual([
    'BH01',
    'MJ01'
  ])
})

test('a collection in a different order is not a defect', () => {
  const contract = {
    delivery_plan: {
      batches: [
        { id: 'PC01', modification_packages: ['@scope/b', '@scope/a'] },
        { id: 'PC02', modification_packages: ['@scope/a'] }
      ]
    },
    ownership: { packages: ['@scope/b', '@scope/a'] }
  }
  expect(driftPaths(contract, SECTIONS)).not.toContain('ownership.packages')
})

test('an ownership set that omits a package some batch writes is reported', () => {
  const contract = {
    delivery_plan: { batches: [{ id: 'PC01', modification_packages: ['@scope/a', '@scope/b'] }] },
    ownership: { packages: ['@scope/a'] }
  }
  expect(driftPaths(contract, SECTIONS)).toContain('ownership.packages')
})

test('a scan root the migration used but the inventory never declared is reported', () => {
  const contract = {
    migration: {
      inventory_roots: ['packages/a/src', 'packages/a/test'],
      legacy_surfaces: [{ id: 'YL01' }]
    },
    inventory_authorities: { SOURCE_INVENTORY: { roots: ['packages/a/src'] } },
    migration_applicability: 'REQUIRED'
  }
  const entry = contractDrift(contract, SECTIONS, 'self').find((item) =>
    item.path.endsWith('SOURCE_INVENTORY.roots')
  )!
  expect(entry).toBeDefined()
  expect(entry.missing_from_document).toEqual(['packages/a/test'])
  // The inventory may legitimately declare more than the migration scanned; only the reverse is a
  // claim the document cannot support.
  const wider = {
    ...contract,
    inventory_authorities: {
      SOURCE_INVENTORY: { roots: ['packages/a/src', 'packages/a/test', 'packages/b/src'] }
    }
  }
  expect(driftPaths(wider, SECTIONS)).not.toContain('inventory_authorities.SOURCE_INVENTORY.roots')
})

test('convergence status is computed from the lists and lenses rather than asserted', () => {
  const converged = {
    design_convergence: {
      status: 'CONVERGED',
      unresolved_information_questions: [],
      pending_authority_confirmations: [],
      route_critical_unknowns: [],
      blocking_findings: [],
      material_findings: [],
      stable_after_last_normative_change: true,
      review_passes: [
        { lens: 'SYNTHESIS', result: 'PASS' },
        { lens: 'ADVERSARIAL', result: 'PASS' },
        { lens: 'ACCEPTANCE_TOPOLOGY', result: 'PASS' }
      ]
    }
  }
  expect(driftPaths(converged, SECTIONS)).not.toContain('design_convergence.status')
  const missingLens = {
    design_convergence: {
      ...converged.design_convergence,
      review_passes: [{ lens: 'SYNTHESIS', result: 'PASS' }]
    }
  }
  const drift = contractDrift(missingLens, SECTIONS, 'self').find(
    (entry) => entry.path === 'design_convergence.status'
  )!
  expect(drift).toBeDefined()
  expect(drift.derived).toBe('IN_REVIEW')
})

test('the design section bindings follow the headings, numbered or not', () => {
  const fields = deriveContract({ design_detail: { sections: {} } }, SECTIONS, 'self')
  const detail = fields.find((field) => field.path === 'design_detail')!
  expect(readPath(detail.value, 'sections.implementation_flow.heading')).toBe(
    '6.2 Implementation Flow & Pseudocode'
  )
  expect(readPath(detail.value, 'sections.breaking_changes.heading')).toBe('Breaking Changes')
})

const REQUIREMENT_TABLE = [
  '## 需求',
  '',
  '| ID | description | kind | status | dependencies | acceptance_ids |',
  '| --- | --- | --- | --- | --- | --- |',
  '| XQ01 | The guard rejects a saturated window | must-ship | pending | | YS01 |',
  '| XQ02 | The registry row agrees with the inventory | must-ship | pending | XQ01 | YS02, YS03 |',
  ''
].join('\n')

test('a requirement table that carries its machine columns replaces the JSON copy', () => {
  const derived = deriveRequirements(REQUIREMENT_TABLE, 'self')!
  expect(derived).toEqual([
    {
      id: 'XQ01',
      title: 'The guard rejects a saturated window',
      kind: 'must-ship',
      status: 'pending',
      dependencies: [],
      acceptance: ['YS01']
    },
    {
      id: 'XQ02',
      title: 'The registry row agrees with the inventory',
      kind: 'must-ship',
      status: 'pending',
      dependencies: ['XQ01'],
      acceptance: ['YS02', 'YS03']
    }
  ])
})

test('a requirement table without the machine columns leaves the field to the author', () => {
  const prose = [
    '## 需求',
    '',
    '| ID | description | acceptance_ids |',
    '| --- | --- | --- |',
    '| XQ01 | Finish the learning path | YS01 |',
    ''
  ].join('\n')
  // Deriving here would mean inventing kind and status for every requirement, which is a worse
  // failure than the duplication it would remove.
  expect(deriveRequirements(prose, 'self')).toBeUndefined()
})

test('two tables defining the same prefix leave the field alone rather than picking one', () => {
  expect(deriveRequirements(`${REQUIREMENT_TABLE}\n${REQUIREMENT_TABLE}`, 'self')).toBeUndefined()
})

test('a legacy-surface table with its machine columns replaces the JSON copy', () => {
  const table = [
    '## 遗留面',
    '',
    '| ID | description | owner | symbols | final_disposition | requirement_ids | acceptance_ids |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| YL01 | Remove the old entry | `src/setup.ts` | `setupHost`, `ISetupHostView` | REMOVE | XQ16 | YS20 |',
    ''
  ].join('\n')
  expect(deriveLegacySurfaces(table, 'self')).toEqual([
    {
      id: 'YL01',
      owner: 'src/setup.ts',
      symbols: ['setupHost', 'ISetupHostView'],
      final_disposition: 'REMOVE',
      requirement_ids: ['XQ16'],
      acceptance_ids: ['YS20']
    }
  ])
})

test('a section anchor binds a design section that its heading text cannot', () => {
  const renamed = [
    '<!-- sdd-section: api_typing -->',
    '### 4.2 接口与类型',
    '',
    '<!-- sdd-section: breaking_changes -->',
    '### 4.1 破坏性变更',
    '',
    '<!-- sdd-section: entities_tools -->',
    '### 4.3 实体与工具',
    '',
    '<!-- sdd-section: implementation_flow -->',
    '### 6.2 实现流程',
    '',
    '<!-- sdd-section: delivery_verification -->',
    '### 8 交付与验证',
    ''
  ].join('\n')
  expect(sectionAnchors(renamed).api_typing).toBe('4.2 接口与类型')
  const detail = deriveDesignDetail(renamed, undefined)!
  expect(readPath(detail, 'sections.implementation_flow.heading')).toBe('6.2 实现流程')
  // Without the anchors the same document derives nothing: no heading matches the canonical names.
  expect(
    deriveDesignDetail(renamed.replace(/^<!-- sdd-section.*$/gm, ''), undefined)
  ).toBeUndefined()
})

test('writing the derived fields back marks the block as generated', () => {
  const contract = { revision: 'SDD-v1', ownership: { product: 'demo' } }
  const written = writeDerived(contract, [
    {
      path: 'ownership.packages',
      value: ['@scope/a'],
      source: 'the batches',
      comparison: 'set'
    },
    {
      path: 'design_convergence.status',
      value: 'IN_REVIEW',
      source: 'the lists',
      comparison: 'exact'
    }
  ])
  expect(readPath(written, 'ownership.packages')).toEqual(['@scope/a'])
  // A path that does not exist yet is created rather than dropped.
  expect(readPath(written, 'design_convergence.status')).toBe('IN_REVIEW')
  // Untouched fields survive, and the track is declared exactly once.
  expect(readPath(written, 'ownership.product')).toBe('demo')
  expect(written.contract_source).toBe('generated')
  expect(contract).not.toHaveProperty('contract_source')
})

test('replacing the contract block leaves every other byte of the document alone', () => {
  const document = [
    '# Title',
    '',
    'Prose that must survive.',
    '',
    '<!-- sdd-contract:start -->',
    '```json',
    '{\n  "revision": "SDD-v1"\n}',
    '```',
    '<!-- sdd-contract:end -->',
    '',
    'More prose.',
    ''
  ].join('\n')
  const replaced = replaceContractBlock(document, '{\n  "revision": "SDD-v2"\n}')
  expect(replaced).toContain('Prose that must survive.')
  expect(replaced).toContain('More prose.')
  expect(replaced).toContain('"revision": "SDD-v2"')
  expect(replaced).not.toContain('SDD-v1')
  expect(() => replaceContractBlock('# No block\n', '{}')).toThrow('CONTRACT_BLOCK_NOT_FOUND')
})

test('the reverse projection renders a table the derivation reads back unchanged', () => {
  const contract = {
    requirements: [
      {
        id: 'XQ01',
        title: 'The guard rejects a saturated window',
        kind: 'must-ship',
        status: 'pending',
        dependencies: [],
        acceptance: ['YS01']
      }
    ]
  }
  const table = reverseTables(contract).find((entry) => entry.field === 'requirements')!
  expect(table.markdown).toContain('| XQ01 |')
  // The round trip is the point: what the projection prints, the derivation must read back.
  const document = `## 需求\n\n${table.markdown}\n`
  expect(deriveRequirements(document, 'self')).toEqual(contract.requirements)
})

test('a field handed to the prose is still derived, not switched off', () => {
  // The first version of this gated each derivation on the field already being written, which made
  // it underivable exactly for the documents that omit it. For `migration_applicability` that was
  // silent and dangerous: an absent value reads as NOT_APPLICABLE downstream, so omitting the field
  // turned the whole migration check off and made the document look cleaner than it was.
  const handedOver = {
    migration: { legacy_surfaces: [{ id: 'YL01' }], inventory_roots: ['packages/a/src'] },
    design_convergence: { blocking_findings: [{ id: 'SP99' }] }
  }
  const fields = deriveContract(handedOver, SECTIONS, 'self')
  const byPath = new Map(fields.map((field) => [field.path, field.value]))
  expect(byPath.get('migration_applicability')).toBe('REQUIRED')
  expect(byPath.get('design_convergence.status')).toBe('IN_REVIEW')
  const resolved = resolveDerivable(handedOver, SECTIONS).contract
  expect(readPath(resolved, 'migration_applicability')).toBe('REQUIRED')
  // A document with no migration block at all derives nothing for it, rather than asserting absence.
  expect(
    deriveContract({}, SECTIONS, 'self').some((field) => field.path === 'migration_applicability')
  ).toBe(false)
})

test('a resolved presentation carries the protocol tag its schema requires', () => {
  const resolved = resolveDerivable({}, TABLE).contract
  expect(readPath(resolved, 'presentation.protocol')).toBe('sdd-presentation/v1')
  expect((readPath(resolved, 'presentation.items') as unknown[]).length).toBe(3)
  // A field the author did write is left exactly as written, so drift still compares two statements.
  const authored = { presentation: { protocol: 'sdd-presentation/v1', items: [], prefixes: {} } }
  expect(readPath(resolveDerivable(authored, TABLE).contract, 'presentation.items')).toEqual([])
})
