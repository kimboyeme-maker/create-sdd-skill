import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { init } from '../scripts/init'
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
    const templated = init({ kind: 'assessment', id: 'idea', out: join(root, 'docs/idea.md') })
    expect(templated.validation[0]!.maturity).toBe('UNVALIDATED')
    expect(readFileSync(join(root, 'docs/idea.md'), 'utf8')).toBe(
      '# idea from the repository template\n'
    )
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
    const made = init({ kind: 'feature', out: join(root, 'a.sdd.md') })
    expect(made.validation[0]!.diagnostics.map((d) => (d as { code: string }).code)).toEqual([
      'SDD_V2_PRESET_INVALID'
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
