import { join } from 'node:path'

/** Root of the create-sdd skill; scripts live one level below it. */
export const SKILL_ROOT = join(import.meta.dir, '..', '..')

/**
 * A block read from an SDD. `value` is null when the document declares none at all, which is a
 * legitimate state. A structural fault is never silently null: it returns `error`, because a check
 * that quietly fell back to "no contract" would certify facts about a document it could not read.
 */
export type SourceBlock = Readonly<{ value: Record<string, any> | null; error?: string }>

/**
 * Every line with its original offset and whether it sits inside a fenced block, fence lines
 * included. A longer fence keeps a shorter one inside it as an example rather than closing it.
 */
function* scanLines(text: string): Generator<{ text: string; offset: number; fenced: boolean }> {
  let offset = 0
  let fence: { character: string; length: number } | undefined
  for (const raw of text.split(/(?<=\n)/)) {
    const line = raw.replace(/\r?\n$/, '')
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    const opening = !fence && marker
    if (fence) {
      if (
        marker &&
        marker[1]![0] === fence.character &&
        marker[1]!.length >= fence.length &&
        !marker[2]!.trim()
      )
        fence = undefined
      yield { text: line, offset, fenced: true }
    } else {
      if (opening) fence = { character: marker[1]![0]!, length: marker[1]!.length }
      yield { text: line, offset, fenced: !!opening }
    }
    offset += raw.length
  }
}

/**
 * Prose lines only. A marker inside a fenced example is documentation, not a block: the delivery
 * controller reads markers the same way, and a reader that ignored fences would parse an
 * illustration as the normative contract.
 */
function* proseLines(text: string): Generator<{ text: string; offset: number }> {
  for (const line of scanLines(text))
    if (!line.fenced) yield { text: line.text, offset: line.offset }
}

/** One marker pair holding one JSON fence, or a named structural fault. */
function extractBlock(text: string, marker: string, code: string): SourceBlock {
  const markers = [...proseLines(text)].flatMap((line) =>
    [...line.text.matchAll(new RegExp(`<!--\\s*${marker}:(start|end)\\s*-->`, 'g'))].map(
      (match) => ({ kind: match[1], index: line.offset + match.index!, length: match[0].length })
    )
  )
  const starts = markers.filter((item) => item.kind === 'start')
  const ends = markers.filter((item) => item.kind === 'end')
  if (!starts.length && !ends.length) return { value: null }
  if (starts.length !== 1 || ends.length !== 1 || ends[0]!.index < starts[0]!.index)
    return { value: null, error: `${code}_BLOCK_COUNT` }
  const content = text.slice(starts[0]!.index + starts[0]!.length, ends[0]!.index)
  const fence = /^\s*```json\s*\r?\n([\s\S]*?)\r?\n```\s*$/.exec(content)
  if (!fence) return { value: null, error: `${code}_JSON_INVALID` }
  let value: unknown
  try {
    value = JSON.parse(fence[1]!)
  } catch {
    return { value: null, error: `${code}_JSON_INVALID` }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { value: null, error: `${code}_JSON_INVALID` }
  return { value: value as Record<string, any> }
}

/** The contract JSON as written, without loop validation. */
export function contractBlock(text: string): SourceBlock {
  return extractBlock(text, 'sdd-contract', 'CONTRACT')
}

/** The program index JSON of a multi-SDD root. */
export function programBlock(text: string): SourceBlock {
  return extractBlock(text, 'sdd-program', 'PROGRAM')
}

/**
 * The contract as written in the SDD. create-sdd never imports the delivery controller's code:
 * the controller judges the contract through its own `validate` command, and a contract it would
 * reject still declares the facts these checks need, so parsing the raw JSON never narrows a check.
 * The block rules above are kept equivalent to the controller's on purpose — the two skills must
 * never read different JSON out of one document.
 */
export async function loadContract(
  _sdd: string,
  text: string
): Promise<{ contract: Record<string, any> | null; error?: string }> {
  const block = contractBlock(text)
  return { contract: block.value, ...(block.error ? { error: block.error } : {}) }
}

/**
 * Lines under every heading whose text matches `heading`, up to the next heading of the same or
 * a higher level. Numbering prefixes such as `4.2 ` are part of the heading text and still match.
 */
export function sectionText(text: string, heading: RegExp): string {
  const chunks: string[] = []
  let level = 0
  let inside = false
  // Fenced lines belong to the section body — the API scan reads its code blocks — but a heading
  // shown inside an example never opens or closes one.
  for (const line of scanLines(text)) {
    const match = !line.fenced && /^(#{1,6})\s+(.*)$/.exec(line.text)
    if (match) {
      if (inside && match[1]!.length <= level) inside = false
      if (!inside && heading.test(match[2]!)) {
        inside = true
        level = match[1]!.length
        continue
      }
    }
    if (inside) chunks.push(line.text)
  }
  return chunks.join('\n')
}
