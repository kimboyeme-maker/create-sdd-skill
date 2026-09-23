/**
 * Derive the machine contract from the prose that already states it.
 *
 * `references/loop-ready.md:7` says the contract block "duplicates no prose". Measured against two
 * real documents it is 57% and 63% of the file, and `presentation` is a JSON transcript of the
 * markdown headings — `document-presentation.ts:186-194` already forces it to match the tables word
 * for word, so its net information content is zero. Fields in that state should be computed, not
 * maintained: an author cannot drift from a value they never wrote.
 *
 * This module derives only the fields the current document shape already determines. Fields that
 * need new markdown structure (requirement tables, acceptance label sections) are left to the author
 * until that structure exists — deriving them from nothing would be inventing them.
 */
import {
  cellReferences,
  documentTables,
  plainCell,
  type DocumentTable
} from '../../utils/document-tables.ts'

/** Prefixes the controller assigns a meaning to; an author may register more in `presentation`. */
const DEFAULT_KINDS: Readonly<Record<string, string>> = {
  PC: 'batch',
  JZ: 'matrix',
  BH: 'closure',
  MJ: 'gate',
  XQ: 'requirement',
  YS: 'acceptance',
  JC: 'decision',
  FX: 'risk',
  LJ: 'implementation_path',
  BZ: 'implementation_step',
  DL: 'claim',
  SP: 'design_review',
  YL: 'legacy_surface',
  DY: 'reader',
  ZJ: 'evidence'
}

/** Only these kinds are indexed; the rest are ordinary document objects. */
const INDEXED = new Set(['batch', 'closure', 'gate'])

export type DerivedField = Readonly<{
  /** Dotted path into the contract object. */
  path: string
  value: unknown
  /** Where in the document the value came from, so a mismatch is actionable. */
  source: string
  /**
   * How the derived value is meant to relate to the written one.
   *
   * `exact` is for values where order carries meaning. `set` is for collections where it does not —
   * demanding an order the document never promised would report a difference that is not a defect.
   * `superset` is for a value the document may legitimately widen but must not narrow: it catches
   * the case where one list grew and its twin did not, without forcing the two to be identical.
   */
  comparison: 'exact' | 'set' | 'superset'
}>

type Contract = Record<string, unknown>

const item = (value: unknown): Contract =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Contract) : {}

/** Read a dotted path out of a contract, returning undefined rather than throwing on a gap. */
export function readPath(contract: unknown, path: string): unknown {
  let current: unknown = contract
  for (const key of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/**
 * Rebuild `presentation.items` from the document's own tables.
 *
 * Every field of an item is already pinned to the table by the validator, so this is a transcript,
 * not an interpretation. The one thing an author still declares is `prefixes`: a two-letter prefix
 * outside the defaults cannot be guessed from a row that uses it.
 */
export function derivePresentationItems(
  text: string,
  document: string,
  prefixes: Readonly<Record<string, string>> = {}
): readonly Contract[] {
  const kinds = { ...DEFAULT_KINDS, ...prefixes }
  const items: Contract[] = []
  const seen = new Set<string>()
  for (const table of documentTables(text, document)) {
    if (!table.headers.includes('id')) continue
    for (const row of table.rows) {
      const id = plainCell(row.values.id ?? '')
      if (!/^[A-Z]{2}[0-9]{2,4}$/.test(id) || seen.has(id)) continue
      const kind = kinds[id.slice(0, 2)]
      if (!kind || !INDEXED.has(kind)) continue
      seen.add(id)
      items.push({
        id,
        kind,
        source: { document: 'self', heading: table.heading, table: table.table }
      })
    }
  }
  return items
}

/**
 * The columns a table must carry before the field it defines can be rebuilt from it.
 *
 * A table that lacks them is not broken — it is a prose view, and the contract still holds the only
 * copy of the missing facts. Deriving from it anyway would mean inventing `kind` and `status` for
 * every requirement, which is worse than the duplication it would remove.
 */
const REQUIREMENT_COLUMNS = ['id', 'description', 'kind', 'status', 'acceptance_ids'] as const
const LEGACY_COLUMNS = [
  'id',
  'owner',
  'symbols',
  'final_disposition',
  'requirement_ids',
  'acceptance_ids'
] as const

/** The one table whose rows define objects of a prefix and that carries every needed column. */
function definingTable(
  text: string,
  document: string,
  prefix: string,
  columns: readonly string[]
): DocumentTable | undefined {
  const candidates = documentTables(text, document).filter(
    (table) =>
      columns.every((column) => table.headers.includes(column)) &&
      table.rows.some((row) =>
        new RegExp(`^${prefix}[0-9]{2,4}$`).test(plainCell(row.values.id ?? ''))
      )
  )
  // Two tables defining the same prefix is an authoring defect the derivation must not paper over by
  // silently picking one; leaving the field authored keeps the existing checks in charge of it.
  return candidates.length === 1 ? candidates[0] : undefined
}

/** Rows of a defining table, in document order, with their cells already unframed. */
function definedRows(table: DocumentTable, prefix: string) {
  return table.rows.filter((row) =>
    new RegExp(`^${prefix}[0-9]{2,4}$`).test(plainCell(row.values.id ?? ''))
  )
}

/**
 * Rebuild `requirements` from a requirement table that carries its machine columns.
 *
 * `dependencies` is optional on purpose: an empty list and an absent column are indistinguishable in
 * markdown, so the derivation emits `[]` only when the column exists to say so.
 */
export function deriveRequirements(
  text: string,
  document: string
): readonly Contract[] | undefined {
  const table = definingTable(text, document, 'XQ', REQUIREMENT_COLUMNS)
  if (!table) return undefined
  const hasDependencies = table.headers.includes('dependencies')
  return definedRows(table, 'XQ').map((row) => ({
    id: plainCell(row.values.id!),
    title: plainCell(row.values.description!),
    kind: plainCell(row.values.kind!),
    status: plainCell(row.values.status!),
    ...(hasDependencies ? { dependencies: cellReferences(row.values.dependencies ?? '') } : {}),
    acceptance: cellReferences(row.values.acceptance_ids!)
  }))
}

/** Rebuild `migration.legacy_surfaces` from a legacy-surface table that carries its machine columns. */
export function deriveLegacySurfaces(
  text: string,
  document: string
): readonly Contract[] | undefined {
  const table = definingTable(text, document, 'YL', LEGACY_COLUMNS)
  if (!table) return undefined
  const hasZeroReader = table.headers.includes('zero_reader_acceptance_ids')
  return definedRows(table, 'YL').map((row) => ({
    id: plainCell(row.values.id!),
    owner: plainCell(row.values.owner!),
    symbols: cellReferences(row.values.symbols!),
    final_disposition: plainCell(row.values.final_disposition!),
    requirement_ids: cellReferences(row.values.requirement_ids!),
    acceptance_ids: cellReferences(row.values.acceptance_ids!),
    ...(hasZeroReader
      ? { zero_reader_acceptance_ids: cellReferences(row.values.zero_reader_acceptance_ids ?? '') }
      : {})
  }))
}

/**
 * Section anchors, which bind a design section without depending on its heading text.
 *
 * `resolveDesignDetail` matches the heading string and requires it to occur exactly once, so
 * renaming or renumbering a heading silently breaks the binding — in a Chinese document that is one
 * ordinary edit away. An anchor comment on the line above the heading survives both.
 */
export function sectionAnchors(text: string): Readonly<Record<string, string>> {
  const bindings: Record<string, string> = {}
  const lines = text.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    const anchor = /^<!--\s*sdd-section:\s*([a-z_]+)\s*-->\s*$/.exec(line.trim())
    if (!anchor) continue
    const next = lines.slice(index + 1).find((candidate) => candidate.trim())
    const heading = next && /^#{1,6}[ \t]+(.+?)[ \t]*$/.exec(next)
    if (heading) bindings[anchor[1]!] = heading[1]!.trim()
  }
  return bindings
}

/**
 * The five design sections, bound to the headings that carry them.
 *
 * The binding is a lookup table with five fixed keys; an author writing it by hand is transcribing
 * their own headings, which is how `design_detail` bindings go stale when a heading is renumbered.
 */
export function deriveDesignDetail(text: string, existing: unknown): Contract | undefined {
  const sections: Readonly<Record<string, string>> = {
    breaking_changes: 'Breaking Changes',
    api_typing: 'New/Changed API & Typing',
    entities_tools: 'New/Changed Entities & Tools',
    implementation_flow: 'Implementation Flow & Pseudocode',
    delivery_verification: 'Delivery & Verification'
  }
  const headings = [...text.matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*$/gm)].map((match) =>
    match[1]!.trim()
  )
  const anchored = sectionAnchors(text)
  const bindings: Contract = {}
  for (const [key, canonical] of Object.entries(sections)) {
    if (anchored[key]) {
      bindings[key] = { document: 'self', heading: anchored[key] }
      continue
    }
    const matches = headings.filter(
      (heading) => heading === canonical || heading.endsWith(` ${canonical}`)
    )
    if (matches.length !== 1) return item(existing).sections ? item(existing) : undefined
    bindings[key] = { document: 'self', heading: matches[0]! }
  }
  return { protocol: 'design-detail/v1', sections: bindings }
}

/**
 * Compute the fields the contract's own contents already determine.
 *
 * Each entry names the document evidence it came from. A `--check` run that reports a mismatch
 * without naming that evidence would leave the author unable to tell a wrong document from a wrong
 * generator, so the source string is part of the result, not a nicety.
 */
export function deriveContract(
  contract: unknown,
  text: string,
  document: string
): readonly DerivedField[] {
  const root = item(contract)
  const fields: DerivedField[] = []
  const presentation = item(root.presentation)

  const items = derivePresentationItems(
    text,
    document,
    item(presentation.prefixes) as Record<string, string>
  )
  if (items.length)
    fields.push({
      path: 'presentation.items',
      value: items,
      source:
        'every table row whose ID prefix denotes a batch, closure or gate; an author may index further kinds, so this is the minimum the index must carry, not the whole of it',
      comparison: 'superset'
    })

  const requirements = deriveRequirements(text, document)
  if (requirements?.length)
    fields.push({
      path: 'requirements',
      value: requirements,
      source:
        'the requirement table, which carries id, description, kind, status and acceptance_ids as columns',
      comparison: 'set'
    })

  const legacy = deriveLegacySurfaces(text, document)
  if (legacy?.length)
    fields.push({
      path: 'migration.legacy_surfaces',
      value: legacy,
      source:
        'the legacy-surface table, which carries owner, symbols, final_disposition and the requirement and acceptance references as columns',
      comparison: 'set'
    })

  const detail = deriveDesignDetail(text, root.design_detail)
  if (detail)
    fields.push({
      path: 'design_detail',
      value: detail,
      source: 'the five required design section headings',
      comparison: 'exact'
    })

  const batches = readPath(root, 'delivery_plan.batches')
  if (Array.isArray(batches)) {
    const packages = [
      ...new Set(
        batches.flatMap((batch) => {
          const list = item(batch).modification_packages
          return Array.isArray(list) ? list.map(String) : []
        })
      )
    ].sort()
    if (packages.length)
      fields.push({
        path: 'ownership.packages',
        value: packages,
        source: 'the union of every batch modification_packages in delivery_plan',
        comparison: 'set'
      })
  }

  const migration = item(root.migration)
  // Gated on the migration block, not on the applicability already being written. Gating on the
  // field itself made it underivable for the documents that hand it over, and because an absent
  // value reads as NOT_APPLICABLE downstream, that silently switched the migration checks off —
  // the worst possible failure for a resolution step, since it makes a document look cleaner.
  if (Object.keys(migration).length || root.migration_applicability !== undefined)
    fields.push({
      path: 'migration_applicability',
      value:
        Array.isArray(migration.legacy_surfaces) && migration.legacy_surfaces.length
          ? 'REQUIRED'
          : 'NOT_APPLICABLE',
      source: 'whether migration.legacy_surfaces names any surface',
      comparison: 'exact'
    })

  const roots = migration.inventory_roots
  const authorities = item(root.inventory_authorities)
  // Gated on the authority existing, not on its `roots` — same reason as above. It is not derived
  // when the whole `inventory_authorities` block is absent, because writing one authority into an
  // empty block would state a shape the document never claimed.
  if (Array.isArray(roots) && roots.length && authorities.SOURCE_INVENTORY !== undefined)
    fields.push({
      path: 'inventory_authorities.SOURCE_INVENTORY.roots',
      value: [...roots].map(String),
      source:
        'migration.inventory_roots: a root that was scanned for readers but is absent from the declared source inventory means the inventory understates the universe it actually covered',
      comparison: 'superset'
    })

  const convergence = item(root.design_convergence)
  // Gated on the block existing, not on the status already being written: gating on the status made
  // the field underivable for exactly the documents that hand it over, which is the case this field
  // exists for.
  if (Object.keys(convergence).length) {
    const lists = [
      'unresolved_information_questions',
      'pending_authority_confirmations',
      'route_critical_unknowns',
      'blocking_findings',
      'material_findings'
    ]
    const clear = lists.every((key) => {
      const value = convergence[key]
      return Array.isArray(value) && value.length === 0
    })
    const passes = Array.isArray(convergence.review_passes) ? convergence.review_passes : []
    const lenses = new Set(
      passes.filter((pass) => item(pass).result === 'PASS').map((pass) => String(item(pass).lens))
    )
    const allLenses = ['SYNTHESIS', 'ADVERSARIAL', 'ACCEPTANCE_TOPOLOGY'].every((lens) =>
      lenses.has(lens)
    )
    const decisionOnly =
      Array.isArray(convergence.pending_authority_confirmations) &&
      convergence.pending_authority_confirmations.length > 0
    fields.push({
      path: 'design_convergence.status',
      value:
        clear && allLenses && convergence.stable_after_last_normative_change === true
          ? 'CONVERGED'
          : decisionOnly
            ? 'IN_REVIEW'
            : 'IN_REVIEW',
      source: 'the convergence lists, the review lenses and the stability flag',
      comparison: 'exact'
    })
  }

  return fields
}

export type DriftEntry = Readonly<{
  /**
   * One code per derived field, so a case can assert this field and no other.
   *
   * A single umbrella code would make every drift report look alike, and a mechanical case asserting
   * it would pass whenever any field drifted — which is a case that cannot fail for the right reason.
   */
  code: string
  path: string
  in_document: unknown
  derived: unknown
  source: string
  /** Members the derivation found that the document does not carry; empty for an exact mismatch. */
  missing_from_document?: readonly unknown[]
}>

/** Stable rendering of a collection member, so set comparison does not depend on key order. */
const member = (value: unknown) =>
  JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as object).sort(([a], [b]) => a.localeCompare(b)))
      : inner
  )

/**
 * Compare what the document carries with what its own prose determines.
 *
 * A reported difference must be one an author can act on. Two lists with the same members in a
 * different order are not a defect, and reporting them as one would train the reader to ignore this
 * check — which is the failure this whole change exists to avoid.
 */
export function contractDrift(
  contract: unknown,
  text: string,
  document: string
): readonly DriftEntry[] {
  const drift: DriftEntry[] = []
  for (const field of deriveContract(contract, text, document)) {
    const present = readPath(contract, field.path)
    // An absent field is not a disagreement. The author handed that field to the prose, and
    // `resolveDerivable` fills it from there before anything is checked; reporting it here would
    // mean reporting a document for doing exactly what this change exists to let it do.
    if (present === undefined) continue
    let differs: boolean
    let missing: readonly string[] = []
    if (field.comparison === 'exact') differs = member(present) !== member(field.value)
    else {
      const written = new Set((Array.isArray(present) ? present : []).map(member))
      const derivedMembers = (Array.isArray(field.value) ? field.value : []).map(member)
      const absent = derivedMembers.filter((value) => !written.has(value))
      missing = absent
      differs =
        field.comparison === 'superset'
          ? absent.length > 0
          : absent.length > 0 || written.size !== derivedMembers.length
    }
    if (differs)
      drift.push({
        code: `CONTRACT_DRIFT_${field.path.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`,
        path: field.path,
        in_document: present,
        derived: field.value,
        source: field.source,
        ...(missing.length
          ? { missing_from_document: missing.map((value) => JSON.parse(value)) }
          : {})
      })
  }
  return drift
}

/** Write one dotted path into a copy of a contract, creating the objects it passes through. */
function writePath(target: Contract, path: string, value: unknown): void {
  const keys = path.split('.')
  let current: Contract = target
  for (const key of keys.slice(0, -1)) {
    const next = current[key]
    if (!next || typeof next !== 'object' || Array.isArray(next)) current[key] = {}
    current = current[key] as Contract
  }
  current[keys.at(-1)!] = value
}

/**
 * The contract with every derived field replaced by its computed value.
 *
 * `contract_source` is set here and nowhere else. It is the whole of the dual track: a document
 * without it keeps its authored block and every check that reads it, and one with it declares that
 * these fields are computed, so a reader knows which copy is the original before editing either.
 */
export function writeDerived(contract: unknown, derived: readonly DerivedField[]): Contract {
  const result = structuredClone(item(contract))
  for (const field of derived) writePath(result, field.path, field.value)
  result.contract_source = 'generated'
  return result
}

const CONTRACT_BLOCK =
  /(<!--\s*sdd-contract:start\s*-->\s*\n```json\n)([\s\S]*?)(\n```\s*\n<!--\s*sdd-contract:end\s*-->)/

/** Replace the JSON inside the document's contract block, leaving every other byte untouched. */
export function replaceContractBlock(text: string, json: string): string {
  if (!CONTRACT_BLOCK.test(text)) throw Error('CONTRACT_BLOCK_NOT_FOUND')
  return text.replace(
    CONTRACT_BLOCK,
    (_match, open: string, _body: string, close: string) => `${open}${json.trimEnd()}${close}`
  )
}

/** Render one markdown table from a list of objects and an ordered column plan. */
function renderTable(
  rows: readonly Contract[],
  columns: readonly (readonly [header: string, key: string])[]
): string {
  const cell = (value: unknown) =>
    Array.isArray(value) ? value.map(String).join(', ') : String(value ?? '')
  return [
    `| ${columns.map(([header]) => header).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map(([, key]) => cell(row[key])).join(' | ')} |`)
  ].join('\n')
}

/**
 * The markdown a contract's derivable fields imply, for an author migrating an existing document.
 *
 * This is the inverse of the derivation and it is deliberately incomplete: it can render the columns
 * the field needs, and it cannot invent the sentence a reader wants next to them. Whatever it cannot
 * express stays in the JSON, which the round-trip through `contract --check` then reports.
 */
export function reverseTables(contract: unknown): readonly Readonly<{
  field: string
  heading_suggestion: string
  markdown: string
}>[] {
  const root = item(contract)
  const out: { field: string; heading_suggestion: string; markdown: string }[] = []
  const requirements = root.requirements
  if (Array.isArray(requirements) && requirements.length)
    out.push({
      field: 'requirements',
      heading_suggestion: 'Requirements',
      markdown: renderTable(requirements.map(item), [
        ['ID', 'id'],
        ['description', 'title'],
        ['kind', 'kind'],
        ['status', 'status'],
        ['dependencies', 'dependencies'],
        ['acceptance_ids', 'acceptance']
      ])
    })
  const legacy = item(root.migration).legacy_surfaces
  if (Array.isArray(legacy) && legacy.length)
    out.push({
      field: 'migration.legacy_surfaces',
      heading_suggestion: 'Legacy surfaces',
      markdown: renderTable(legacy.map(item), [
        ['ID', 'id'],
        ['description', 'description'],
        ['owner', 'owner'],
        ['symbols', 'symbols'],
        ['final_disposition', 'final_disposition'],
        ['requirement_ids', 'requirement_ids'],
        ['acceptance_ids', 'acceptance_ids'],
        ['zero_reader_acceptance_ids', 'zero_reader_acceptance_ids']
      ])
    })
  return out
}

/**
 * Fill in the derivable fields a contract leaves out, reading them from the prose.
 *
 * `references/complete-design.md` has said since before this module existed that "the human body is
 * authoritative… new output omits those duplicated strings from JSON", and `design-detail.ts` has
 * done exactly that for pseudocode and failure text all along. Everything here is the same move
 * applied to the fields whose markdown now carries them in full: an author who wrote the table does
 * not write the JSON copy too, and cannot drift from a value they never wrote.
 *
 * Only absent fields are filled. A field the author did write is left exactly as written, so the
 * drift check still compares two independently stated things rather than a value against itself.
 */
export function resolveDerivable(
  contract: unknown,
  text: string,
  document = 'self'
): { contract: Contract; resolved: readonly string[] } {
  const result = structuredClone(item(contract))
  const resolved: string[] = []
  for (const field of deriveContract(result, text, document)) {
    if (readPath(result, field.path) !== undefined) continue
    writePath(result, field.path, field.value)
    resolved.push(field.path)
  }
  // `presentation` is the one derived field with a wrapper the tables cannot state: its protocol tag
  // is a constant, and `prefixes` and `retired_ids` stay the author's. Writing only `items` into an
  // absent block would leave it schema-invalid, so the tag comes with it.
  const presentation = item(result.presentation)
  if (Array.isArray(presentation.items) && presentation.protocol === undefined) {
    presentation.protocol = 'sdd-presentation/v1'
    result.presentation = presentation
    resolved.push('presentation.protocol')
  }
  return { contract: result, resolved }
}
