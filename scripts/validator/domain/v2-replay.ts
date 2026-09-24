import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join } from 'node:path'

/** Seconds one oracle run may take before it counts as not passing. */
const TIMEOUT_MS = 120_000

/** Outcome of replaying one oracle: base must fail, head must pass, head without the change must fail. */
export type Replay = Readonly<{
  acceptance: string
  runner: readonly string[] | null
  base: 'FAIL' | 'PASS' | 'ERROR'
  head: 'FAIL' | 'PASS' | 'ERROR'
  ablation: 'FAIL' | 'PASS' | 'ERROR'
  verdict: 'proven' | 'not-proven'
  reason?: string
}>

const git = (repository: string, args: readonly string[]) =>
  Bun.spawnSync(['git', '-C', repository, ...args], { stdout: 'pipe', stderr: 'pipe' })

/** Write `commit`'s tree (or one path of it) into `target`, read-only for the repository. */
function exportTree(repository: string, commit: string, target: string, path?: string): boolean {
  const archive = git(repository, [
    'archive',
    '--format=tar',
    commit,
    ...(path ? ['--', path] : [])
  ])
  if (archive.exitCode !== 0) return false
  mkdirSync(target, { recursive: true })
  return Bun.spawnSync(['tar', '-x', '-C', target], { stdin: archive.stdout }).exitCode === 0
}

/**
 * The command that runs one test file, derived from the file type and the repository's tooling —
 * never taken from the host's report. Returns null when no supported runner applies.
 */
export function runnerFor(tree: string, oracle: string): string[] | null {
  const ext = extname(oracle)
  if (ext === '.py') return ['python3', '-m', 'pytest', '-q', oracle]
  if (ext === '.go') return ['go', 'test', `./${dirname(oracle)}`]
  if (!/^\.[cm]?[jt]sx?$/.test(ext)) return null
  if (['bun.lock', 'bun.lockb', 'bunfig.toml'].some((file) => existsSync(join(tree, file))))
    return ['bun', 'test', `./${oracle}`]
  const manifest = join(tree, 'package.json')
  const deps = existsSync(manifest) ? readFileSync(manifest, 'utf8') : ''
  if (deps.includes('"vitest"')) return ['npx', 'vitest', 'run', oracle]
  if (deps.includes('"jest"')) return ['npx', 'jest', oracle]
  return null
}

/** Run the runner in `tree`; exit status decides PASS or FAIL, a timeout or spawn error is ERROR. */
function run(tree: string, runner: readonly string[]): 'PASS' | 'FAIL' | 'ERROR' {
  try {
    const result = Bun.spawnSync([...runner], {
      cwd: tree,
      env: { ...process.env, CI: '1' },
      stdout: 'ignore',
      stderr: 'ignore',
      timeout: TIMEOUT_MS
    })
    if (result.signalCode) return 'ERROR'
    return result.exitCode === 0 ? 'PASS' : 'FAIL'
  } catch {
    return 'ERROR'
  }
}

/**
 * Replay one acceptance's declared oracle in exported trees: at `base` it must fail, at `head` it
 * must pass, and at `head` with the implementing files put back to their `base` content (removed
 * when `base` lacks them) it must fail again. The third run is the ablation: it shows the pass
 * depends on the requirement's implementation, not on anything else the change did. The oracle
 * file itself is kept at `head` in the ablated tree. Nothing is written to the repository.
 */
export function replay(
  repository: string,
  acceptance: string,
  oracle: string,
  base: string,
  head: string,
  implementing: readonly string[]
): Replay {
  const root = mkdtempSync(join(tmpdir(), 'sdd-replay-'))
  const outcome = (fields: Omit<Replay, 'acceptance'>): Replay => ({ acceptance, ...fields })
  const unrun = (reason: string) =>
    outcome({
      runner: null,
      base: 'ERROR',
      head: 'ERROR',
      ablation: 'ERROR',
      verdict: 'not-proven',
      reason
    })
  try {
    const trees = {
      base: join(root, 'base'),
      head: join(root, 'head'),
      ablation: join(root, 'ablation')
    }
    for (const [name, commit] of [
      ['base', base],
      ['head', head],
      ['ablation', head]
    ] as const)
      if (!exportTree(repository, commit, trees[name]))
        return outcome({
          runner: null,
          base: 'ERROR',
          head: 'ERROR',
          ablation: 'ERROR',
          verdict: 'not-proven',
          reason: `cannot export ${commit}`
        })
    const reverted = implementing.filter((path) => path !== oracle)
    if (!reverted.length) return unrun('no implementing file to revert besides the oracle')
    for (const path of reverted) {
      rmSync(join(trees.ablation, path), { recursive: true, force: true })
      if (git(repository, ['cat-file', '-e', `${base}:${path}`]).exitCode === 0)
        exportTree(repository, base, trees.ablation, path)
    }
    const modules = join(repository, 'node_modules')
    if (existsSync(modules))
      for (const tree of Object.values(trees)) symlinkSync(modules, join(tree, 'node_modules'))
    const runner = runnerFor(trees.head, oracle)
    if (!runner)
      return outcome({
        runner: null,
        base: 'ERROR',
        head: 'ERROR',
        ablation: 'ERROR',
        verdict: 'not-proven',
        reason: `no supported runner for ${oracle}`
      })
    const results = {
      base: run(trees.base, runner),
      head: run(trees.head, runner),
      ablation: run(trees.ablation, runner)
    }
    const proven = results.base === 'FAIL' && results.head === 'PASS' && results.ablation === 'FAIL'
    return outcome({
      runner,
      ...results,
      verdict: proven ? 'proven' : 'not-proven',
      ...(proven
        ? {}
        : {
            reason: `expected base FAIL, head PASS, ablation FAIL; got ${results.base}, ${results.head}, ${results.ablation}`
          })
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
