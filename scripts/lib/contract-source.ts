import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Root of the create-sdd skill; scripts live one level below it. */
export const SKILL_ROOT = join(import.meta.dir, '..', '..')

/** The contract JSON as written, without loop validation; null when absent or unparseable. */
export function rawContract(text: string): Record<string, any> | null {
  const block =
    /<!-- sdd-contract:start -->[\s\S]*?```json\s*([\s\S]*?)```[\s\S]*?<!-- sdd-contract:end -->/.exec(
      text
    )
  try {
    const value = block ? JSON.parse(block[1]!) : null
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

/**
 * Parse the SDD's contract with the sibling loop controller when it accepts the document, and
 * fall back to the raw JSON otherwise: a contract the loop rejects still declares the facts a
 * create-sdd check needs, so an invalid contract never silently narrows a check.
 */
export async function loadContract(
  sdd: string,
  text = readFileSync(sdd, 'utf8')
): Promise<{ contract: Record<string, any> | null; loopAccepted: boolean }> {
  const loopRoot = process.env.SDD_LOOP_ROOT ?? join(SKILL_ROOT, '..', 'sdd-loop-delivery')
  try {
    const { readContractDocument } = await import(
      join(loopRoot, 'scripts/services/contract-document.ts')
    )
    return { contract: readContractDocument(sdd, text), loopAccepted: true }
  } catch {
    return { contract: rawContract(text), loopAccepted: false }
  }
}

/**
 * Lines under every heading whose text matches `heading`, up to the next heading of the same or
 * a higher level. Numbering prefixes such as `4.2 ` are part of the heading text and still match.
 */
export function sectionText(text: string, heading: RegExp): string {
  const lines = text.split(/\r?\n/)
  const chunks: string[] = []
  let level = 0
  let inside = false
  let fence = false
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    const match = !fence && /^(#{1,6})\s+(.*)$/.exec(line)
    if (match) {
      if (inside && match[1]!.length <= level) inside = false
      if (!inside && heading.test(match[2]!)) {
        inside = true
        level = match[1]!.length
        continue
      }
    }
    if (inside) chunks.push(line)
  }
  return chunks.join('\n')
}
