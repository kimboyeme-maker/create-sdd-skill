/**
 * Compose a worked example from one base document and a small overlay.
 *
 * The four worked examples were the same 130-line document written four times, differing in one
 * contract shape each: 2035 lines carrying maybe 400 lines of distinct teaching. Each copy had to be
 * a whole document because `check-examples` validates whole documents, so the duplication was not
 * laziness — it was the price of keeping every variant checked.
 *
 * An overlay pays a smaller price for the same guarantee. The base stays one complete, validated
 * document; a variant states only what it changes, and the checker composes the two and validates
 * the result exactly as before. A reader who wants the whole document reads the base; a reader who
 * came for the variant sees its difference instead of having to diff by hand.
 */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

const isObject = (value: Json): value is { [key: string]: Json } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** An array overlay that edits members by id instead of replacing the whole array. */
type ByIdOverlay = { merge_by_id: Json[]; remove?: Json[] }

const isByIdOverlay = (value: Json): value is ByIdOverlay =>
  isObject(value) && Array.isArray(value.merge_by_id)

/**
 * Apply one overlay to one base value.
 *
 * Objects merge key by key and an explicit `null` deletes a key, as in JSON Merge Patch. An array is
 * replaced wholesale unless the overlay is `{merge_by_id}`, which edits the members whose `id`
 * matches and appends the rest; `remove` drops members by id. Replacement is the default because an
 * array without ids has no member identity to merge on, and guessing one would silently corrupt an
 * ordered list.
 */
export function applyOverlay(base: Json, overlay: Json): Json {
  if (isByIdOverlay(overlay)) {
    if (!Array.isArray(base)) throw Error('EXAMPLE_OVERLAY_MERGE_TARGET_NOT_ARRAY')
    const removed = new Set((overlay.remove ?? []).map((id) => JSON.stringify(id)))
    const edits = new Map(
      overlay.merge_by_id
        .filter(isObject)
        .map((entry) => [JSON.stringify(entry.id), entry] as const)
    )
    const result = base
      .filter((member) => !(isObject(member) && removed.has(JSON.stringify(member.id))))
      .map((member) => {
        if (!isObject(member)) return member
        const edit = edits.get(JSON.stringify(member.id))
        if (!edit) return member
        edits.delete(JSON.stringify(member.id))
        return applyOverlay(member, edit)
      })
    return [...result, ...edits.values()]
  }
  if (!isObject(overlay) || !isObject(base)) return overlay
  const result: { [key: string]: Json } = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    if (value === null) delete result[key]
    else result[key] = applyOverlay(base[key] ?? null, value)
  }
  return result
}

const CONTRACT = /<!-- sdd-contract:start -->\n```json\n([\s\S]*?)\n```\n<!-- sdd-contract:end -->/

/** The contract block of a worked document, as parsed JSON. */
export function contractOf(document: string): Json {
  const match = CONTRACT.exec(document)
  if (!match) throw Error('EXAMPLE_CONTRACT_BLOCK_MISSING')
  return JSON.parse(match[1]!) as Json
}

/** The same document with a different contract block, indented as the examples are. */
export function withContract(document: string, contract: Json): string {
  return document.replace(
    CONTRACT,
    `<!-- sdd-contract:start -->\n\`\`\`json\n${JSON.stringify(contract, null, 2)}\n\`\`\`\n<!-- sdd-contract:end -->`
  )
}
