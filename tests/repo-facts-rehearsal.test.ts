import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { checkRepositoryFacts } from '../scripts/repo-facts'

/** A throwaway repository with the given files; returns its root. */
function repository(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'repo-facts-rehearsal-'))
  mkdirSync(join(root, '.git'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const base = {
  'package.json': JSON.stringify({ name: 'root' }),
  'packages/logger/package.json': JSON.stringify({ name: '@demo/logger' }),
  'packages/logger/src/batch.ts': 'export function batch() {}\nexport function createBatcher() {}\n'
}

/** Run the check over a contract, in a repository that has the symbols real pseudocode would use. */
async function issues(
  contract: Record<string, unknown>,
  files: Record<string, string> = {}
): Promise<string[]> {
  const root = repository({ ...base, ...files })
  try {
    const path = join(root, 'change.sdd.md')
    writeFileSync(
      path,
      `# Change\n\n<!-- sdd-contract:start -->\n\`\`\`json\n${JSON.stringify(contract)}\n\`\`\`\n<!-- sdd-contract:end -->\n`
    )
    const report = await checkRepositoryFacts(path)
    // Every observation these checks make is a candidate, so none of them may decide validity.
    expect(report.issues).toEqual([])
    expect(report.valid).toBe(true)
    return report.candidates.map((issue: { code: string }) => issue.code)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const acceptance = (method: string) => ({
  id: 'YS01',
  requirement_ids: ['XQ01'],
  method,
  oracle: 'the case passes',
  environment: 'repository root',
  packages: ['@demo/logger']
})

test('a Must-Ship requirement that promises two things on one acceptance case is reported', async () => {
  const requirement = (title: string, linked: string[]) => ({
    ownership: { packages: ['@demo/logger'] },
    requirements: [{ id: 'XQ01', kind: 'must-ship', title, acceptance: linked }]
  })
  // The rehearsal admitted exactly this shape and a PASS closed the half nothing observed.
  expect(
    await issues(requirement('The code is covered and the registry says so truthfully', ['YS01']))
  ).toContain('CONJUNCTIVE_REQUIREMENT_SINGLE_ORACLE')
  expect(await issues(requirement('覆盖闭合，且注册表如实陈述', ['YS01']))).toContain(
    'CONJUNCTIVE_REQUIREMENT_SINGLE_ORACLE'
  )
  // Two oracles for two facts is the fix, so it is not reported.
  expect(
    await issues(
      requirement('The code is covered and the registry says so truthfully', ['YS01', 'YS02'])
    )
  ).not.toContain('CONJUNCTIVE_REQUIREMENT_SINGLE_ORACLE')
  // A single observable fact whose title merely contains the word is not a conjunction of promises,
  // but this check cannot tell them apart, so it stays a candidate the author answers.
  expect(await issues(requirement('The guard rejects a saturated window', ['YS01']))).not.toContain(
    'CONJUNCTIVE_REQUIREMENT_SINGLE_ORACLE'
  )
})

test('an acceptance method that selects by name without asserting a count is reported', async () => {
  const contract = (method: string) => ({
    ownership: { packages: ['@demo/logger'] },
    requirements: [{ id: 'XQ01', kind: 'must-ship', title: 'guard rejects', acceptance: ['YS01'] }],
    acceptance: [acceptance(method)]
  })
  // Exit 0 from a filter that matched nothing is what the rehearsal recorded as a signed PASS.
  expect(
    await issues(contract('vitest run --root packages/logger test/x.test.ts -t "CASE"'))
  ).toContain('ACCEPTANCE_METHOD_ZERO_OBSERVATION')
  expect(await issues(contract('pytest -k overflow'))).toContain(
    'ACCEPTANCE_METHOD_ZERO_OBSERVATION'
  )
  // Asserting the observed count is the fix; --passWithNoTests is not, and is not accepted as one.
  expect(
    await issues(contract('vitest run -t "CASE" --reporter=json | node -e "check(numPassedTests)"'))
  ).not.toContain('ACCEPTANCE_METHOD_ZERO_OBSERVATION')
  // An unfiltered run observes whatever the file holds, so it cannot pass on an absent case.
  expect(await issues(contract('vitest run --root packages/logger test/x.test.ts'))).not.toContain(
    'ACCEPTANCE_METHOD_ZERO_OBSERVATION'
  )
})

test('pseudocode resolves a name against the repository or its own declarations', async () => {
  const contract = (pseudocode: string) => ({
    ownership: { packages: ['@demo/logger'] },
    requirements: [{ id: 'XQ01', kind: 'must-ship', title: 'guard rejects', acceptance: ['YS01'] }],
    implementation_logic: { paths: [{ id: 'LJ01', steps: [{ id: 'BZ01', pseudocode }] }] }
  })
  const reported = await issues(
    contract('const logger = makeLoggerWithBatch({ maxPendingBatches: 1 })')
  )
  expect(reported).toContain('PSEUDOCODE_SYMBOL_UNRESOLVED')
  // Real symbols resolve anywhere in the repository, and harness names are not inventions.
  expect(
    await issues(
      contract('const batcher = createBatcher()\nexpect(batcher).toBeInstanceOf(Object)')
    )
  ).not.toContain('PSEUDOCODE_SYMBOL_UNRESOLVED')
})
