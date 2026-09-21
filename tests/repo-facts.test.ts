import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { checkRepositoryFacts, lockManagers } from '../scripts/repo-facts'

/** A throwaway repository with the given files; returns its root. */
function repository(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'repo-facts-'))
  mkdirSync(join(root, '.git'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

/** An SDD whose contract block is `contract` and whose prose is `body`. */
const sdd = (body: string, contract: Record<string, unknown>) =>
  `# Change\n\n${body}\n\n<!-- sdd-contract:start -->\n\`\`\`json\n${JSON.stringify(contract)}\n\`\`\`\n<!-- sdd-contract:end -->\n`

const workspace = {
  'pnpm-workspace.yaml': 'packages:\n  - apps/*\n',
  'pnpm-lock.yaml':
    "lockfileVersion: '9.0'\n\nimporters:\n\n  .: {}\n\n  apps/web:\n    dependencies: {}\n\npackages: {}\n",
  'package.json': JSON.stringify({ name: 'root' }),
  'apps/web/package.json': JSON.stringify({ name: 'web' }),
  'apps/web/bun.lock': '{}',
  'tools/cli/package.json': JSON.stringify({ name: 'cli' }),
  'tools/cli/yarn.lock': '# web is mentioned here but not managed\n'
}

test('lockfiles manage a package only through its directory or a declared workspace membership', () => {
  const root = repository(workspace)
  try {
    expect(lockManagers(root, 'apps/web').sort()).toEqual(['apps/web/bun.lock', 'pnpm-lock.yaml'])
    expect(lockManagers(root, 'tools/cli')).toEqual(['tools/cli/yarn.lock'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a dependency edit declares every lockfile that manages the edited package', async () => {
  const root = repository(workspace)
  const path = join(root, 'docs/change.sdd.md')
  const write = (points: string[]) =>
    writeFileSync(
      path,
      sdd(
        'Background: the web app mentions `apps/web/package.json` in prose.\n\n## BZ01 Add the dependency\n\n**Location:** apps/web/package.json dependencies',
        {
          ownership: { packages: ['web'] },
          shared_mechanism_writes: [
            {
              mechanism: 'lockfile',
              target: 'web dependencies',
              managers: ['pnpm', 'bun'],
              write_points: points,
              owners: ['web']
            }
          ]
        }
      )
    )
  try {
    mkdirSync(join(root, 'docs'))
    write(['apps/web/bun.lock'])
    const partial = await checkRepositoryFacts(path)
    expect(partial.issues).toEqual([
      { code: 'SHARED_MECHANISM_WRITE_POINT_UNDECLARED', detail: 'pnpm-lock.yaml manages apps/web' }
    ])
    write(['apps/web/bun.lock', 'pnpm-lock.yaml importer apps/web'])
    expect((await checkRepositoryFacts(path)).valid).toBe(true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('acceptance runtimes agree with repository pins unless an exception is declared', async () => {
  const root = repository({
    'mise.toml': '[tools]\nbun = "1.3.14"\n',
    'package.json': JSON.stringify({ name: 'svc' })
  })
  const path = join(root, 'change.sdd.md')
  const write = (extra: Record<string, unknown>) =>
    writeFileSync(
      path,
      sdd('', {
        ownership: { packages: ['svc'] },
        acceptance: [{ id: 'YS01', method: 'bun test', environment: 'bun 1.4.2 on macOS' }],
        ...extra
      })
    )
  try {
    write({})
    expect((await checkRepositoryFacts(path)).issues).toEqual([
      { code: 'TOOLCHAIN_VERSION_CONFLICT', detail: 'bun 1.4.2 vs 1.3.14 pinned by mise.toml' }
    ])
    write({
      environment_exceptions: [{ tool: 'bun', reason: 'controller runtime, not product toolchain' }]
    })
    expect((await checkRepositoryFacts(path)).valid).toBe(true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('every scan candidate of a legacy symbol has a disposition, and symbols are searchable literals', async () => {
  const root = repository({
    'package.json': JSON.stringify({ name: 'svc' }),
    'src/store.ts': "const LEGACY_KEY = 'v1'\n",
    'test/store.test.ts': 'expect(source).toMatch(/LEGACY_KEY/)\n'
  })
  const path = join(root, 'change.sdd.md')
  const write = (surface: Record<string, unknown>, dismissed: unknown[] = []) =>
    writeFileSync(
      path,
      sdd('', {
        migration_applicability: 'REQUIRED',
        migration: {
          inventory_roots: ['src', 'test'],
          legacy_surfaces: [{ id: 'YL01', ...surface }],
          readers: [{ module: 'src/store.ts' }],
          dismissed_candidates: dismissed
        }
      })
    )
  try {
    write({ symbols: ['LEGACY_KEY'] })
    expect((await checkRepositoryFacts(path)).issues).toEqual([
      { code: 'MIGRATION_CANDIDATE_UNDISPOSED', detail: 'test/store.test.ts (LEGACY_KEY)' }
    ])
    write({ symbols: ['LEGACY_KEY'] }, [
      { module: 'test/store.test.ts', reason: 'asserts source text; migrated with the reader' }
    ])
    expect((await checkRepositoryFacts(path)).valid).toBe(true)
    write({ symbols: ['direct storage writes in the store'] })
    expect((await checkRepositoryFacts(path)).issues).toEqual([
      { code: 'MIGRATION_SYMBOL_UNSCANNABLE', detail: 'direct storage writes in the store' }
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a legacy symbol that matches most of the repository is reported once as too generic', async () => {
  // Thirty modules, every one of them mentioning the word `plugin`. A real removal surface never
  // looks like this; an ordinary word that slipped into a symbol list always does.
  const files: Record<string, string> = { 'package.json': JSON.stringify({ name: 'svc' }) }
  for (let index = 0; index < 30; index += 1)
    files[`src/mod-${index}.ts`] = 'export const plugin = () => undefined\n'
  const root = repository(files)
  const path = join(root, 'change.sdd.md')
  /** Writes one migration contract whose single legacy surface carries `symbols`. */
  const write = (symbols: string[]) =>
    writeFileSync(
      path,
      sdd('', {
        migration_applicability: 'REQUIRED',
        migration: {
          inventory_roots: ['src'],
          legacy_surfaces: [{ id: 'YL01', symbols }],
          readers: [],
          dismissed_candidates: []
        }
      })
    )
  try {
    write(['plugin'])
    const saturated = await checkRepositoryFacts(path)
    // One narrowing instruction, not thirty identical findings that would bury every other issue.
    expect(saturated.issues).toHaveLength(1)
    expect(saturated.issues[0]!.code).toBe('MIGRATION_SYMBOL_TOO_GENERIC')
    expect(saturated.issues[0]!.detail).toContain('matches 30 of 30 scanned files')
    // A symbol that names an actual surface still reports its undisposed readers one by one.
    writeFileSync(join(root, 'src/mod-0.ts'), 'export const legacyPluginBridge = 1\n')
    write(['legacyPluginBridge'])
    expect((await checkRepositoryFacts(path)).issues).toEqual([
      { code: 'MIGRATION_CANDIDATE_UNDISPOSED', detail: 'src/mod-0.ts (legacyPluginBridge)' }
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('external interfaces in the API section without persisted evidence are reported as review candidates', async () => {
  const root = repository({ 'package.json': JSON.stringify({ name: 'svc' }) })
  const path = join(root, 'change.sdd.md')
  const api =
    "## New/Changed API & Typing\n\n```ts\nimport { open } from '@vendor/db/pool'\nimport { local } from './local.js'\n```\n"
  try {
    writeFileSync(path, sdd(api, {}))
    const missing = await checkRepositoryFacts(path)
    expect(missing.valid).toBe(true)
    expect(missing.facts.grounding_candidates).toEqual(['@vendor/db/pool'])
    // Probes may run in a temporary directory; what matters is the persisted record next to the SDD.
    writeFileSync(
      join(root, 'change.evidence.md'),
      'Probe in $TMPDIR: `@vendor/db/pool` 4.2.0 exports `open`; tsc exit 0.\n'
    )
    expect((await checkRepositoryFacts(path)).facts.grounding_candidates).toEqual([])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a program root records a sourced split decision and checks every execution SDD', async () => {
  const root = repository({
    'mise.toml': '[tools]\nbun = "1.3.14"\n',
    'package.json': JSON.stringify({ name: 'svc' })
  })
  const path = join(root, 'root.sdd.md')
  // A program root states how to launch it, in its own body: see the launch test below.
  const launch = (target: string) => `使用 sdd-loop-delivery 启动 ${target} 的完整 workflow\n\n`
  const program = (decision?: unknown, body = launch(path)) =>
    `# Program\n\n${body}<!-- sdd-program:start -->\n\`\`\`json\n${JSON.stringify({
      protocol: 'sdd-program/v1',
      id: 'PG01',
      nodes: [
        { id: 'root', parent: null, kind: 'group', sdd: 'root.sdd.md' },
        { id: 'a', parent: 'root', kind: 'execution', sdd: 'a.sdd.md' }
      ],
      ...(decision ? { split_decision: decision } : {})
    })}\n\`\`\`\n<!-- sdd-program:end -->\n`
  try {
    writeFileSync(
      join(root, 'a.sdd.md'),
      sdd('', { acceptance: [{ id: 'YS01', method: 'bun test', environment: 'bun 1.4.2' }] })
    )
    const conflict = {
      code: 'TOOLCHAIN_VERSION_CONFLICT',
      detail: 'a.sdd.md: bun 1.4.2 vs 1.3.14 pinned by mise.toml'
    }
    writeFileSync(path, program())
    expect((await checkRepositoryFacts(path)).issues).toEqual([
      { code: 'SPLIT_DECISION_UNRECORDED', detail: path },
      conflict
    ])
    // The author's own judgment is not a decision source.
    writeFileSync(path, program({ source: 'INFERRED', reference: 'the work looked independent' }))
    expect((await checkRepositoryFacts(path)).issues[0]!.code).toBe('SPLIT_DECISION_UNRECORDED')
    const sourced = { source: 'USER_STATED', reference: 'user reply: split it' }
    writeFileSync(path, program(sourced))
    const sourcedReport = await checkRepositoryFacts(path)
    expect(sourcedReport.issues).toEqual([conflict])
    // The launch instruction is the agent's to say, not the document's to store, so the check hands
    // it back rather than demanding it: it was being lost between deriving it and writing the reply.
    expect(sourcedReport.facts.launch).toBe(`使用 sdd-loop-delivery 启动 ${path} 的完整 workflow`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('prose that only mentions a manifest does not trigger the lockfile check', async () => {
  const root = repository(workspace)
  const path = join(root, 'change.sdd.md')
  try {
    writeFileSync(
      path,
      sdd('The web app keeps `apps/web/package.json` unchanged in this design.', {
        ownership: { packages: ['web'] }
      })
    )
    expect((await checkRepositoryFacts(path)).valid).toBe(true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a step whose write location is outside every declared owner is reported', async () => {
  const root = repository({
    'packages/core/package.json': JSON.stringify({ name: '@demo/core' }),
    'docs/contracts/error-codes.md': '# Registry\n'
  })
  const step =
    '## BZ01 Write the code\n\n**Location:** `packages/core/src/entry.ts`\n\n## BZ02 Update the registry\n\n**Location:** `docs/contracts/error-codes.md`\n'
  const narrow = join(root, 'narrow.sdd.md')
  try {
    // Only the package is declared, so BZ02 has no admissible write location.
    writeFileSync(narrow, sdd(step, { ownership: { packages: ['@demo/core'] } }))
    const result = await checkRepositoryFacts(narrow, root)
    expect(result.issues).toContainEqual({
      code: 'STEP_WRITE_OUTSIDE_AUTHORITY',
      detail: 'docs/contracts/error-codes.md'
    })

    // Declaring the registry root as its own approved identity closes it.
    writeFileSync(narrow, sdd(step, { ownership: { packages: ['@demo/core', 'docs/contracts'] } }))
    const widened = await checkRepositoryFacts(narrow, root)
    expect(widened.issues.filter((issue) => issue.code === 'STEP_WRITE_OUTSIDE_AUTHORITY')).toEqual(
      []
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a challenge closed on reading is asked about, and a fixture-backed one is not', async () => {
  const root = repository({
    'package.json': JSON.stringify({ name: 'root' }),
    'packages/core/package.json': JSON.stringify({ name: '@demo/core' }),
    'packages/core/src/entry.ts': 'export const depth = 256\n'
  })
  const path = join(root, 'change.sdd.md')
  const challenge = (extra: Record<string, unknown>) => ({
    premise: 'the replaced predicate agrees with the incumbent',
    method: 'compare the two forms',
    failure_condition: 'they disagree on a reachable value',
    observed_result: 'the truth sets are identical',
    implementation_resolution: 'unify the constant',
    result: 'CLOSED',
    ...extra
  })
  const contract = (challenges: unknown[]) => ({
    ownership: { packages: ['@demo/core'] },
    implementation_logic: { paths: [{ id: 'LJ01', challenges }] }
  })
  try {
    // Evidence that names only the product source cites the subject of the reasoning, not a run.
    writeFileSync(
      path,
      sdd(
        '## BZ01 Unify the threshold\n\n**Location:** packages/core/src/entry.ts',
        contract([challenge({ evidence: ['packages/core/src/entry.ts:1'] })])
      )
    )
    const cited = await checkRepositoryFacts(path, root)
    expect(cited.candidates).toContainEqual({
      code: 'CHALLENGE_EVIDENCE_CITES_SUBJECT_ONLY',
      detail: 'LJ01: the replaced predicate agrees with the incumbent'
    })

    // A fixture file is source too, and it is a record of something happening.
    writeFileSync(
      path,
      sdd(
        '## BZ01 Unify the threshold\n\n**Location:** packages/core/src/entry.ts',
        contract([challenge({ evidence: ['docs/evidence/fixture-threshold.ts'] })])
      )
    )
    const ran = await checkRepositoryFacts(path, root)
    expect(
      ran.candidates.filter((item) => item.code === 'CHALLENGE_EVIDENCE_CITES_SUBJECT_ONLY')
    ).toEqual([])

    // Declaring the conclusion as reasoned while closing it is the other shape worth asking about.
    writeFileSync(
      path,
      sdd(
        '## BZ01 Unify the threshold\n\n**Location:** packages/core/src/entry.ts',
        contract([challenge({ provenance: 'REASONED', evidence: ['docs/evidence/notes.md'] })])
      )
    )
    const reasoned = await checkRepositoryFacts(path, root)
    expect(reasoned.candidates).toContainEqual({
      code: 'CHALLENGE_REASONED_BUT_CLOSED',
      detail: 'LJ01: the replaced predicate agrees with the incumbent'
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a REQUIRED sensitivity is asked what its perturbation writes', async () => {
  const root = repository({
    'package.json': JSON.stringify({ name: 'root' }),
    'packages/core/package.json': JSON.stringify({ name: '@demo/core' })
  })
  const path = join(root, 'change.sdd.md')
  const sensitivity = (extra: Record<string, unknown>) => ({
    ownership: { packages: ['@demo/core'] },
    acceptance: [
      {
        id: 'YS01',
        oracle_sensitivity: {
          applicability: 'REQUIRED',
          fault_model: 'the guard is removed',
          perturbation_method: 'temporarily edit the guard in packages/core/src/entry.ts',
          restoration_method: 'restore the guard',
          expected_flip: 'PASS_TO_FAIL_TO_PASS',
          implementation_timing: 'IMPLEMENTATION_REQUIRED',
          ...extra
        }
      }
    ]
  })
  try {
    // The paths are known while the case is written; leaving them in prose hides an operation.
    writeFileSync(
      path,
      sdd('## BZ01 Add the guard\n\n**Location:** packages/core/src', sensitivity({}))
    )
    const undeclared = await checkRepositoryFacts(path, root)
    expect(undeclared.candidates).toContainEqual({
      code: 'SENSITIVITY_WRITES_UNDECLARED',
      detail: 'YS01'
    })

    // An empty list is a real answer: this perturbation touches no tracked file.
    writeFileSync(
      path,
      sdd(
        '## BZ01 Add the guard\n\n**Location:** packages/core/src',
        sensitivity({ perturbation_writes: [] })
      )
    )
    const declared = await checkRepositoryFacts(path, root)
    expect(
      declared.candidates.filter((item) => item.code === 'SENSITIVITY_WRITES_UNDECLARED')
    ).toEqual([])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
