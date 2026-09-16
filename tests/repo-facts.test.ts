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
  const program = (decision?: unknown) =>
    `# Program\n\n<!-- sdd-program:start -->\n\`\`\`json\n${JSON.stringify({
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
    writeFileSync(path, program({ source: 'USER_STATED', reference: 'user reply: split it' }))
    expect((await checkRepositoryFacts(path)).issues).toEqual([conflict])
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
