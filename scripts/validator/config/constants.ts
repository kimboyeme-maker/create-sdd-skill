/**
 * Constants the SDD format itself defines. They live with the validator because create-sdd owns
 * the document format; the delivery loop re-exports them rather than keeping its own copy.
 */

/**
 * Default test thresholds. An acceptance-bound rationale may exceed these defaults at
 * admission; runtime execution remains bounded by the admitted budget and lease deadline.
 */
export const TEST_BUDGET_MAX_MINUTES = 15
export const TEST_BUDGET_MAX_SHARE_DIVISOR = 3
export const MAX_NEW_TEST_FILES_PER_BATCH = 1
/**
 * Largest `estimated_minutes` one delivery-plan batch may declare. A batch is one Operator lease:
 * beyond this the author must cut the work, not widen the lease.
 */
export const MAX_BATCH_MINUTES = 60
/** Default acceptance timeout ceiling; a contract may justify a larger finite timeout. */
export const ACCEPTANCE_TIMEOUT_MAX_SECONDS = 900
/** Stable SDD object identities; runtime event and lease IDs use their own protocols. */
export const SDD_DOCUMENT_ID_PATTERN = '^[A-Z]{2}[0-9]{2,4}$'
export const SDD_DEFAULT_ID_PREFIXES: Readonly<Record<string, string>> = {
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
/** Runtime removal requires an observable behavior/contract/invocation oracle. */
export const RUNTIME_REMOVAL_CLAIM_DIMENSIONS: readonly string[] = [
  'BEHAVIOR',
  'PUBLIC_CONTRACT',
  'RUNTIME_INVOCATION'
]
/** Source inventory evidence closes the reader universe, not runtime behavior. */
export const READER_INVENTORY_EVIDENCE_KINDS: readonly string[] = [
  'SOURCE_INSPECTION',
  'DEPENDENCY_GRAPH'
]
