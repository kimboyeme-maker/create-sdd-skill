import { expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

/** Run the link checker over a throwaway reference tree by pointing it at this skill's root. */
function links() {
  const run = Bun.spawnSync([process.execPath, 'scripts/check-links.ts'], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe'
  })
  const out = run.stdout.toString()
  return { exitCode: run.exitCode, report: JSON.parse(out.slice(out.indexOf('{'))) }
}

test('the shipped references resolve every relative link', () => {
  const { exitCode, report } = links()
  expect(exitCode).toBe(0)
  expect(report.broken).toEqual([])
  expect(report.links).toBeGreaterThan(0)
})

test('a broken relative link is reported and an external scheme is skipped', () => {
  const dir = join(ROOT, 'references', '__link_probe__')
  mkdirSync(dir, { recursive: true })
  try {
    writeFileSync(
      join(dir, 'probe.md'),
      '# Probe\n\n[absent](./absent.md)\n[external](https://example.invalid/page)\n'
    )
    const { exitCode, report } = links()
    expect(exitCode).toBe(1)
    const broken = report.broken.map((entry: { target?: string } | string) =>
      typeof entry === 'string' ? entry : (entry.target ?? JSON.stringify(entry))
    )
    expect(broken.some((value: string) => value.includes('absent.md'))).toBe(true)
    expect(broken.some((value: string) => value.includes('example.invalid'))).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a link inside a fenced example is not followed', () => {
  const dir = join(ROOT, 'references', '__link_probe__')
  mkdirSync(dir, { recursive: true })
  try {
    writeFileSync(
      join(dir, 'probe.md'),
      '# Probe\n\n```markdown\n[shown but absent](./never-created.md)\n```\n'
    )
    const { exitCode, report } = links()
    expect(exitCode).toBe(0)
    expect(report.broken).toEqual([])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
