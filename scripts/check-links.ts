#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Relative markdown links in the skill resolve to existing files; anchors and URLs are ignored. */
const ROOT = join(import.meta.dir, '..')
const LINK = /\]\(([^)\s#]+)(?:#[^)]*)?\)/g
const files = [...new Bun.Glob('**/*.md').scanSync(ROOT)].filter(
  (path) => !path.startsWith('node_modules/')
)
let total = 0
const broken: string[] = []
for (const file of files) {
  // Fenced examples show link syntax without promising a target.
  const text = readFileSync(join(ROOT, file), 'utf8').replace(/```[\s\S]*?```/g, '')
  for (const match of text.matchAll(LINK)) {
    const target = match[1]!
    if (/^[a-z]+:/i.test(target)) continue
    total += 1
    if (!existsSync(join(ROOT, dirname(file), target))) broken.push(`${file} -> ${target}`)
  }
}
console.log(
  JSON.stringify({ protocol: 'create-sdd-links/v1', files: files.length, links: total, broken })
)
process.exit(broken.length ? 1 : 0)
