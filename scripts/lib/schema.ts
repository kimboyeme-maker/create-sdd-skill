/**
 * A declarative shape check for payloads an agent writes by hand. It exists because the lifecycle
 * hooks take their input from a language model: a field that is absent, misspelled or the wrong
 * type has to be named precisely, at the boundary, rather than surfacing later as a confusing
 * failure inside a check that assumed the field was there.
 *
 * Deliberately small. It validates shape, not truth — every claim a payload makes is cross-checked
 * against the repository by the hook itself, because a payload that is merely well-formed is still
 * self-reported.
 */
export type Field =
  | { type: 'string'; optional?: boolean; enum?: readonly string[]; pattern?: RegExp }
  | { type: 'number'; optional?: boolean; integer?: boolean; min?: number }
  | { type: 'boolean'; optional?: boolean }
  | { type: 'string[]'; optional?: boolean; min?: number }
  | { type: 'number[]'; optional?: boolean; length?: number }
  | { type: 'object'; optional?: boolean; nullable?: boolean; fields: Schema }
  | { type: 'object[]'; optional?: boolean; min?: number; fields: Schema }
export type Schema = Readonly<Record<string, Field>>

const typeName = (value: unknown): string =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value

/**
 * Shape violations, as `path: what is wrong`. An empty list means the payload is well-formed —
 * never that it is correct. Unknown keys are reported too: a misspelled field is silently absent
 * otherwise, which reads to the author as "the hook ignored what I told it".
 */
export function validate(payload: unknown, schema: Schema, at = ''): string[] {
  const where = (key: string) => (at ? `${at}.${key}` : key)
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload))
    return [`${at || 'payload'}: expected an object, received ${typeName(payload)}`]
  const record = payload as Record<string, unknown>
  const problems: string[] = []
  for (const key of Object.keys(record))
    if (!(key in schema)) problems.push(`${where(key)}: unknown field`)
  for (const [key, field] of Object.entries(schema)) {
    const value = record[key]
    if (value === undefined || (value === null && field.type !== 'object')) {
      if (!field.optional) problems.push(`${where(key)}: required`)
      continue
    }
    switch (field.type) {
      case 'string':
        if (typeof value !== 'string' || !value.trim())
          problems.push(`${where(key)}: expected a non-empty string, received ${typeName(value)}`)
        else if (field.enum && !field.enum.includes(value))
          problems.push(
            `${where(key)}: expected one of ${field.enum.join(' | ')}, received ${value}`
          )
        else if (field.pattern && !field.pattern.test(value))
          problems.push(`${where(key)}: does not match ${field.pattern.source}`)
        break
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value))
          problems.push(`${where(key)}: expected a number, received ${typeName(value)}`)
        else if (field.integer && !Number.isSafeInteger(value))
          problems.push(`${where(key)}: expected a whole number, received ${value}`)
        else if (field.min !== undefined && value < field.min)
          problems.push(`${where(key)}: expected at least ${field.min}, received ${value}`)
        break
      case 'boolean':
        if (typeof value !== 'boolean')
          problems.push(`${where(key)}: expected a boolean, received ${typeName(value)}`)
        break
      case 'string[]':
        if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim()))
          problems.push(`${where(key)}: expected an array of non-empty strings`)
        else if (field.min !== undefined && value.length < field.min)
          problems.push(`${where(key)}: expected at least ${field.min} entries`)
        break
      case 'number[]':
        if (!Array.isArray(value) || value.some((item) => typeof item !== 'number'))
          problems.push(`${where(key)}: expected an array of numbers`)
        else if (field.length !== undefined && value.length !== field.length)
          problems.push(`${where(key)}: expected exactly ${field.length} numbers`)
        break
      case 'object[]':
        if (!Array.isArray(value)) {
          problems.push(`${where(key)}: expected an array of objects, received ${typeName(value)}`)
        } else if (field.min !== undefined && value.length < field.min) {
          problems.push(`${where(key)}: expected at least ${field.min} entries`)
        } else
          value.forEach((item, index) =>
            problems.push(...validate(item, field.fields, `${where(key)}[${index}]`))
          )
        break
      case 'object':
        if (value === null) {
          if (!field.nullable) problems.push(`${where(key)}: expected an object, received null`)
        } else problems.push(...validate(value, field.fields, where(key)))
        break
    }
  }
  return problems
}
