import { expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { init } from '../scripts/init'
import { pack } from '../scripts/preset'
import { validateV2Document } from '../scripts/validator/domain/v2-document'
import { runnerFor } from '../scripts/validator/domain/v2-replay'

/** A git-marked workspace with the given files. */
function workspace(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'v2-preset-')))
  mkdirSync(join(root, '.git'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const preset = (value: Record<string, unknown>) =>
  JSON.stringify({ protocol: 'create-sdd-preset/v1', ...value })

test('init writes skeletons for every kind that validate as awaiting the user', () => {
  const root = workspace({})
  try {
    for (const kind of ['feature', 'bug', 'assessment', 'program'] as const) {
      const result = init({ kind, out: join(root, `${kind}.sdd.md`) })
      for (const item of result.validation) {
        expect(item.diagnostics).toEqual([])
        expect(item.maturity).toBe('AWAITING_USER')
      }
    }
    expect(() => init({ kind: 'feature', out: join(root, 'feature.sdd.md') })).toThrow(
      'INIT_TARGET_EXISTS'
    )
    const evidence = init({
      kind: 'evidence',
      sdd: join(root, 'feature.sdd.md'),
      out: join(root, 'evidence.json')
    })
    const report = JSON.parse(readFileSync(evidence.written[0]!, 'utf8'))
    expect(report).toMatchObject({ protocol: 'sdd-evidence/v1', sdd: 'feature', revision: '1' })
    expect(report.results[0].acceptance).toBe('A1')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a preset shapes init and validate: principles, sections, templates, runners', () => {
  const root = workspace({
    'AGENTS.md': '# Rules\n',
    'templates/feature.md': '# {{id}} from the repository template\n',
    '.create-sdd/preset.json': preset({
      principles: ['AGENTS.md'],
      sections: { feature: ['Security Review|安全评审'] },
      templates: { assessment: 'templates/feature.md' },
      runners: { '.ts': ['pnpm', 'vitest', 'run', '{oracle}'] }
    })
  })
  try {
    const made = init({ kind: 'feature', out: join(root, 'docs/a.sdd.md') })
    expect(made.validation[0]!.diagnostics).toEqual([])
    const text = readFileSync(made.written[0]!, 'utf8')
    expect(text).toContain('## Security Review')
    expect(text).toContain('## Principle Check')
    const stripped = text.replace('## Security Review', '## Other').replace('"AGENTS.md"', '"x.md"')
    const found = validateV2Document(made.written[0]!, stripped)!.diagnostics.map((d) => d.message)
    expect(found.some((m) => m.startsWith('preset-section-missing'))).toBe(true)
    expect(found.some((m) => m.startsWith('preset-principle-missing'))).toBe(true)
    // A template init cannot validate is refused before anything is written, so a retry works.
    const out = join(root, 'docs/idea.md')
    expect(() => init({ kind: 'assessment', id: 'idea', out })).toThrow('INIT_PREFLIGHT_FAILED')
    expect(existsSync(out)).toBe(false)
    expect(() => init({ kind: 'assessment', id: 'idea', out })).toThrow('INIT_PREFLIGHT_FAILED')
    expect(
      runnerFor(root, 'src/a.test.ts', { '.ts': ['pnpm', 'vitest', 'run', '{oracle}'] })
    ).toEqual(['pnpm', 'vitest', 'run', 'src/a.test.ts'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a malformed preset is reported and ignored', () => {
  const root = workspace({ '.create-sdd/preset.json': preset({ runners: { '.ts': ['bun'] } }) })
  try {
    expect(() => init({ kind: 'feature', out: join(root, 'a.sdd.md') })).toThrow(
      'SDD_V2_PRESET_INVALID'
    )
    expect(existsSync(join(root, 'a.sdd.md'))).toBe(false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a preset packs into a shareable directory that another repository extends', () => {
  const source = workspace({
    'templates/bug.md': '# {{id}} bug template\n',
    '.create-sdd/preset.json': preset({
      sections: { feature: ['Security Review'] },
      blocking_candidates: ['SDD_V2_PATH_GIT_IGNORED'],
      templates: { bug: 'templates/bug.md' }
    })
  })
  const target = workspace({
    '.create-sdd/preset.json': preset({ extends: ['.create-sdd/packs/shared'] })
  })
  try {
    const out = join(target, '.create-sdd/packs/shared')
    const packed = pack({ repository: source, out, name: 'shared' })
    expect(packed.manifest.templates).toEqual({ bug: 'templates/bug.md' })
    expect(() => pack({ repository: source, out })).toThrow('PRESET_PACK_TARGET_EXISTS')
    const made = init({ kind: 'feature', out: join(target, 'docs/a.sdd.md') })
    expect(readFileSync(made.written[0]!, 'utf8')).toContain('## Security Review')
    expect(readFileSync(join(out, 'templates/bug.md'), 'utf8')).toBe('# {{id}} bug template\n')
    // The shared bug template carries no index block, so init refuses it in the target as well.
    expect(() => init({ kind: 'bug', id: 'b', out: join(target, 'docs/b.md') })).toThrow(
      'INIT_PREFLIGHT_FAILED'
    )
  } finally {
    rmSync(source, { recursive: true, force: true })
    rmSync(target, { recursive: true, force: true })
  }
})

test('init stubs missing oracles with failing tests and can start a branch first', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'v2-init-git-')))
  const git = (...args: string[]) =>
    Bun.spawnSync(['git', '-C', root, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args])
  try {
    git('init', '-q')
    writeFileSync(join(root, 'bun.lock'), '')
    git('add', '.')
    git('commit', '-q', '-m', 'base')
    const made = init({
      kind: 'feature',
      out: join(root, 'docs/greet.sdd.md'),
      branch: true,
      oracleStubs: true
    })
    expect(made.branch).toBe('sdd/greet')
    const head = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.toString().trim()
    expect(head).toBe('sdd/greet')
    const stub = join(root, 'src/greet.test.ts')
    expect(made.written).toContain(stub)
    // The stub fails, which is exactly the baseline convergence expects before implementation.
    expect(Bun.spawnSync(['bun', 'test', './src/greet.test.ts'], { cwd: root }).exitCode).not.toBe(
      0
    )
    expect(() =>
      init({ kind: 'feature', out: join(root, 'docs/other.sdd.md'), id: 'greet', branch: true })
    ).toThrow('INIT_BRANCH_EXISTS')
    expect(existsSync(join(root, 'docs/other.sdd.md'))).toBe(false)
    rmSync(stub)
    const again = init({ kind: 'oracles', out: '', sdd: join(root, 'docs/greet.sdd.md') })
    expect(again.written).toEqual([stub])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
