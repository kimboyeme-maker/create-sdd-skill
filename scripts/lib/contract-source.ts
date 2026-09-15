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

/** The program index JSON of a multi-SDD root; null when absent or unparseable. */
export function rawProgram(text: string): Record<string, any> | null {
  const block =
    /<!-- sdd-program:start -->[\s\S]*?```json\s*([\s\S]*?)```[\s\S]*?<!-- sdd-program:end -->/.exec(
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
 * The contract as written in the SDD. create-sdd never imports the delivery controller's code:
 * the controller judges the contract through its own `validate` command, and a contract it would
 * reject still declares the facts these checks need, so parsing the raw JSON never narrows a check.
 */
export async function loadContract(
  _sdd: string,
  text: string
): Promise<{ contract: Record<string, any> | null }> {
  return { contract: rawContract(text) }
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
