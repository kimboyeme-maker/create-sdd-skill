/** Phase order and conditional reading requirements applied by reading-receipt checks. */
export const PHASES = ['HARVEST', 'ADMIT', 'DESIGN', 'VERIFY', 'DECOMPOSE', 'HANDOFF'] as const
export type Phase = (typeof PHASES)[number]
export type ReadingConditions = {
  languages?: string[]
  ui?: boolean
  typescriptToolchain?: boolean
  multipleSurfaces?: boolean
  program?: boolean
  authority?: boolean
  artifacts?: boolean
  continuation?: boolean
  retrospectives?: boolean
  firstContract?: boolean
}
type ReadingContract = {
  experience_contract?: unknown
  product_archetype?: unknown
  delivery_platforms?: string[]
  shared_mechanism_writes?: unknown[]
  migration_applicability?: unknown
  delivery_plan?: {
    batches?: { test_budget?: { minutes?: number; max_new_test_files?: number } }[]
    prepared_checks?: unknown
    final_verification_shards?: unknown
  }
}
const BASE: Record<Phase, string[]> = {
  HARVEST: [
    'phases/1-harvest.md',
    'product/archetypes.md',
    'product/platforms.md',
    'planning/program-split.md'
  ],
  ADMIT: ['phases/2-admit.md'],
  DESIGN: ['phases/3-design.md', 'complete-design.md', 'writing.md', 'document-presentation.md'],
  VERIFY: ['phases/4-verify.md', 'product/acceptance-standards.md'],
  DECOMPOSE: ['work-decomposition.md'],
  HANDOFF: ['loop-ready.md', 'design/agent-context-map.md']
}
const PLATFORMS: Record<string, string[]> = {
  'mini-program': ['mini-program'],
  ios: ['mobile-native'],
  android: ['mobile-native'],
  flutter: ['flutter', 'mobile-native'],
  harmonyos: ['harmonyos-arkts'],
  desktop: ['desktop'],
  'native-sdk': ['native-sdk']
}
const LANGUAGES: Record<string, string> = {
  rust: 'rust',
  go: 'go',
  python: 'python',
  java: 'jvm',
  kotlin: 'jvm',
  javascript: 'bun-node',
  typescript: 'bun-node',
  bun: 'bun-node',
  node: 'bun-node'
}
/** Cumulative requirements grow with discovered facts; author-supplied facts cannot unset start conditions. */
export function requiredDocuments(
  phase: Phase,
  contract: ReadingContract | null,
  conditions: ReadingConditions = {}
): string[] {
  const docs: string[] = []
  const through = PHASES.indexOf(phase)
  for (const current of PHASES.slice(0, through + 1)) docs.push(...BASE[current])
  const add = (from: number, applies: unknown, ...paths: string[]) => {
    if (through >= from && applies) docs.push(...paths)
  }
  add(0, conditions.ui || contract?.experience_contract, 'product/experience-contract.md')
  add(0, contract?.product_archetype === 'content-publication', 'product/content-site.md')
  for (const platform of contract?.delivery_platforms ?? [])
    for (const guide of PLATFORMS[platform] ?? []) docs.push(`product/platforms/${guide}.md`)
  for (const language of conditions.languages ?? []) {
    const guide = LANGUAGES[language.toLowerCase()]
    if (guide) docs.push(`product/languages/${guide}.md`)
  }
  add(0, conditions.authority, 'design/decision-authority.md')
  add(
    0,
    conditions.artifacts || contract?.shared_mechanism_writes?.length,
    'design/artifacts-and-dependencies.md'
  )
  add(1, conditions.continuation, 'design/continuation-lineage.md')
  add(1, contract?.migration_applicability === 'REQUIRED', 'migration.md')
  add(2, conditions.typescriptToolchain, 'design/typescript-toolchain.md')
  add(2, conditions.multipleSurfaces, 'product/architecture/core-adapters.md')
  const batches = contract?.delivery_plan?.batches ?? []
  add(4, batches.length >= 2, 'planning/conflicts-and-lanes.md')
  add(
    3,
    batches.some(
      (b) => (b.test_budget?.minutes ?? 0) > 0 || (b.test_budget?.max_new_test_files ?? 0) > 0
    ),
    'planning/test-budget.md'
  )
  add(
    4,
    contract?.delivery_plan?.prepared_checks || contract?.delivery_plan?.final_verification_shards,
    'planning/verification-planning.md'
  )
  add(4, conditions.retrospectives, 'planning/estimate-calibration.md')
  add(5, conditions.firstContract, 'examples/loop-ready-example.md')
  return [...new Set(docs.map((path) => `references/${path}`))].sort()
}
