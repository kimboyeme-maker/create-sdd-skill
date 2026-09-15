#!/usr/bin/env bun
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { loadContract, rawProgram } from './lib/contract-source.ts'
import { requiredDocuments } from './lib/reading-policy.ts'

/**
 * Reading receipts make create-sdd's document pointers enforceable without inlining them.
 * Every reference ends with a token derived from its own content; an SDD records the token of
 * each document its author loaded, and `check` derives the required set from the phase table
 * and the SDD's contract. A token identifies content, not an authenticated read or understanding.
 */
const ROOT = join(import.meta.dir, '..')
const TOKEN_LINE = /\n*<!-- reading-receipt: [0-9a-f]{8} -->\s*$/
const RECEIPT_ENTRY = /`?(references\/[\w./-]+\.md)`?\s*[:|-]?\s*`?([0-9a-f]{8})\b/

const body = (text: string) => text.replace(TOKEN_LINE, '').replace(/\s*$/, '\n')
const tokenOf = (text: string) => createHash('sha256').update(body(text)).digest('hex').slice(0, 8)
const references = () => [...new Bun.Glob('references/**/*.md').scanSync(ROOT)].sort()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

/** Receipt entries from the SDD's "Authoring receipt" section. */
function receiptEntries(text: string): Map<string, string> {
  const entries = new Map<string, string>()
  let inside = false
  for (const line of text.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) inside = /authoring receipt/i.test(heading[2]!)
    else if (inside) {
      const entry = RECEIPT_ENTRY.exec(line)
      if (entry) entries.set(entry[1]!, entry[2]!)
    }
  }
  return entries
}

async function evaluate(sdd: string) {
  if (!existsSync(sdd))
    return {
      sdd,
      valid: false,
      contract: false,
      required: [],
      missing: [],
      stale: [],
      unknown: [],
      not_found: true
    }
  const text = readFileSync(sdd, 'utf8')
  // An invalid contract still declares which documents were required, so it never shrinks the receipt.
  const { contract } = await loadContract(sdd, text)
  const required = requiredDocuments('HANDOFF', contract)
  const entries = receiptEntries(text)
  const missing = required.filter((path) => !entries.has(path))
  const unknown = [...entries.keys()].filter((path) => !existsSync(join(ROOT, path)))
  const stale = [...entries]
    .filter(([path, token]) => existsSync(join(ROOT, path)) && tokenOf(read(path)) !== token)
    .map(([path]) => path)
  const valid = !missing.length && !unknown.length && !stale.length
  return { sdd, valid, contract: contract !== null, required, missing, stale, unknown }
}

async function check(sdd: string) {
  const root = await evaluate(sdd)
  // A program root is authored with every document of its tree; each node carries its own receipt.
  const program = existsSync(sdd) ? rawProgram(readFileSync(sdd, 'utf8')) : null
  const children = []
  for (const node of Array.isArray(program?.nodes) ? program.nodes : []) {
    if (typeof node?.sdd !== 'string') continue
    const path = resolve(dirname(sdd), node.sdd)
    if (path !== resolve(sdd)) children.push(await evaluate(path))
  }
  const valid = root.valid && children.every((child) => child.valid)
  console.log(
    JSON.stringify({
      protocol: 'create-sdd-reading-receipt/v1',
      ...root,
      valid,
      ...(program ? { children } : {})
    })
  )
  process.exit(valid ? 0 : 1)
}

const [command, flag, value] = Bun.argv.slice(2)
if (command === 'check' && flag === '--sdd' && value) await check(value)
else if (command === 'stamp') {
  // Maintainers run this after editing references; tokens change only when content changes.
  for (const path of references()) {
    const text = read(path)
    const next = `${body(text)}\n<!-- reading-receipt: ${tokenOf(text)} -->\n`
    if (next !== text) writeFileSync(join(ROOT, path), next)
  }
  console.log(JSON.stringify({ stamped: references().length }))
} else if (command === 'verify') {
  const unstamped = references().filter((path) => {
    const match = /<!-- reading-receipt: ([0-9a-f]{8}) -->\s*$/.exec(read(path))
    return match?.[1] !== tokenOf(read(path))
  })
  console.log(JSON.stringify({ references: references().length, unstamped }))
  process.exit(unstamped.length ? 1 : 0)
} else {
  console.error('usage: reading-receipt.ts check --sdd <path> | stamp | verify')
  process.exit(2)
}
