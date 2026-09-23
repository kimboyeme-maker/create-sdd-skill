/**
 * Read the API section of an SDD as code, not as prose.
 *
 * The design template (`references/complete-design.md`) requires a `New/Changed API & Typing`
 * section whose `**Signatures:**` field carries the proposed public surface and whose
 * `**Examples:**` field carries valid and invalid caller code. Every other check in this skill
 * treats those fences as text. This module is the first one that hands them to a compiler, so it
 * owns exactly one question: which bytes of the document are the proposed API, and where did each
 * byte come from in the original file.
 *
 * Line provenance is carried through because a diagnostic that cannot name the line of the SDD it
 * came from is not actionable — the author reads the SDD, never the synthesized program.
 */
import { markdownSections } from '../utils/markdown-sections'

/** The canonical heading of the API section; documents may prefix it with their own numbering. */
const API_SECTION = 'New/Changed API & Typing'

/** Languages whose fences this probe understands; anything else is reported, never silently read. */
const TYPESCRIPT_FENCE = /^(ts|tsx|typescript)$/i

export type ApiCodeBlock = Readonly<{
  /** Which labelled field the fence was found under, or `Declarations` for the whole-document read. */
  field: 'Signatures' | 'Examples' | 'Declarations'
  /** Fence info string exactly as written, for reporting a non-TypeScript surface. */
  language: string
  /** Fence body without the surrounding fence lines. */
  code: string
  /** 1-based line of the first body line inside the original SDD. */
  startLine: number
}>

export type ApiSection = Readonly<{
  /** Absent when the document has no API section at all. */
  found: boolean
  /** The exact heading text, for reporting. */
  heading?: string
  /** 1-based line of the heading inside the original SDD. */
  headingLine?: number
  /** Declared applicability, when the section states one. */
  applicability?: string
  blocks: readonly ApiCodeBlock[]
  /** Fence languages seen under the read fields that this probe does not understand. */
  foreignLanguages: readonly string[]
  /**
   * Where the blocks were read from.
   *
   * `section` is the canonical API section. `document` means the document has no such section and
   * the declarations were gathered from its TypeScript fences wherever they sit — 28 of 83 documents
   * in the corpus that first motivated this probe declare an exported surface without ever using the
   * canonical heading, so reading only the section skipped three quarters of the real declarations.
   */
  readFrom?: 'section' | 'document'
}>

/** Locate the API section by its canonical name, tolerating a numbering prefix such as `4.2 `. */
function findApiSection(text: string) {
  const sections = markdownSections(text)
  return sections.find(
    (section) => section.heading === API_SECTION || section.heading.endsWith(` ${API_SECTION}`)
  )
}

/**
 * Split a section body into labelled fields.
 *
 * Deliberately a separate, smaller reader than `design-detail.ts`'s `fields()`: that one collapses
 * a field to its trimmed text, which loses the offset every diagnostic here needs. The fence-state
 * machine is the same shape so the two agree on what counts as a label outside code.
 */
function* labelledLines(body: string, firstLine: number) {
  // `markdownSections` slices from the end of the heading text, so the body's first line is the
  // remainder of the heading's own line — the caller passes that line, not the one after it.
  let field: string | undefined
  let fence: string | undefined
  let line = firstLine
  for (const raw of body.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(raw)
    if (marker) {
      if (!fence) fence = marker[1]!
      else if (
        marker[1]![0] === fence[0] &&
        marker[1]!.length >= fence.length &&
        !marker[2]!.trim()
      )
        fence = undefined
      yield { raw, line, field, fenceOpen: marker, inFence: true as const }
      line += 1
      continue
    }
    if (!fence) {
      const label = /^\*\*([^*：:]+?)[:：]\*\*/.exec(raw)
      if (label) field = label[1]!.trim()
    }
    yield { raw, line, field, fenceOpen: undefined, inFence: fence !== undefined }
    line += 1
  }
}

/** Extract the TypeScript fences of the API section together with their source lines. */
export function readApiSection(text: string): ApiSection {
  const section = findApiSection(text)
  if (!section) return { found: false, blocks: [], foreignLanguages: [] }
  const blocks: ApiCodeBlock[] = []
  const foreign = new Set<string>()
  let open: { field: 'Signatures' | 'Examples'; language: string; startLine: number } | undefined
  let buffer: string[] = []
  let applicability: string | undefined
  for (const entry of labelledLines(section.text, section.startLine)) {
    if (!open) {
      const applies = /^\*\*Applicability[:：]\*\*\s*(\S+)/.exec(entry.raw)
      if (applies && !entry.inFence) applicability = applies[1]
    }
    if (entry.fenceOpen) {
      if (open) {
        blocks.push({ ...open, code: buffer.join('\n') })
        open = undefined
        buffer = []
        continue
      }
      const language = entry.fenceOpen[2]!.trim()
      const field = entry.field
      if (field !== 'Signatures' && field !== 'Examples') continue
      if (!TYPESCRIPT_FENCE.test(language)) {
        foreign.add(language || '(none)')
        continue
      }
      open = { field, language, startLine: entry.line + 1 }
      continue
    }
    if (open) buffer.push(entry.raw)
  }
  return {
    found: true,
    heading: section.heading,
    headingLine: section.startLine,
    applicability,
    blocks,
    foreignLanguages: [...foreign]
  }
}

export type SynthesizedProgram = Readonly<{
  /** The concatenated source handed to the compiler. */
  code: string
  /** Maps a 1-based line of `code` to its 1-based line in the original SDD. */
  lineMap: readonly number[]
}>

/**
 * Concatenate the chosen blocks into one compilable unit while keeping a line map back to the SDD.
 *
 * `lineMap[i]` is the SDD line of synthesized line `i + 1`; blank separator lines map to 0 so a
 * diagnostic that lands on one is reported as "synthesized" rather than blamed on real prose.
 */
export function synthesize(blocks: readonly ApiCodeBlock[]): SynthesizedProgram {
  const lines: string[] = []
  const lineMap: number[] = []
  for (const block of blocks) {
    const body = block.code.split('\n')
    for (const [index, line] of body.entries()) {
      lines.push(line)
      lineMap.push(block.startLine + index)
    }
    lines.push('')
    lineMap.push(0)
  }
  return { code: lines.join('\n'), lineMap }
}

/** A fence whose body declares something exported; a pseudocode sketch with no declaration is not. */
const DECLARES = /^\s*export\s+(declare\s+)?(function|type|interface|const|class|abstract)\b/m

/**
 * Every TypeScript fence in the document that declares an exported surface.
 *
 * The fallback for documents with no canonical API section. It reads declarations only: a fence has
 * to say `export …` to be included, which leaves narrative snippets and call-site examples out. A
 * pseudocode block that happens to declare a function is read too, and that is intended — a
 * declaration in a step is still a declaration the design is making.
 */
export function readDeclarations(text: string): ApiSection {
  const blocks: ApiCodeBlock[] = []
  const foreign = new Set<string>()
  let open: { language: string; startLine: number } | undefined
  let buffer: string[] = []
  // Base 1, not 0: `labelledLines` numbers from the first line it is given, and the first line of a
  // whole document is line 1. The section reader passes `section.startLine` for the same reason —
  // `markdownSections` slices from the end of the heading text, so its body starts on the heading's
  // own line.
  for (const entry of labelledLines(text, 1)) {
    if (entry.fenceOpen) {
      if (open) {
        const code = buffer.join('\n')
        if (DECLARES.test(code))
          blocks.push({
            field: 'Declarations',
            language: open.language,
            code,
            startLine: open.startLine
          })
        open = undefined
        buffer = []
        continue
      }
      const language = entry.fenceOpen[2]!.trim()
      if (!TYPESCRIPT_FENCE.test(language)) {
        if (language) foreign.add(language)
        continue
      }
      open = { language, startLine: entry.line + 1 }
      continue
    }
    if (open) buffer.push(entry.raw)
  }
  return {
    found: blocks.length > 0,
    blocks,
    foreignLanguages: [...foreign],
    readFrom: 'document'
  }
}

/** The API section when the document has one, else its exported declarations wherever they sit. */
export function readApiSurface(text: string): ApiSection {
  const section = readApiSection(text)
  if (section.found) return { ...section, readFrom: 'section' }
  return readDeclarations(text)
}
