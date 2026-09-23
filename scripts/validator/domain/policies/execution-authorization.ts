/**
 * Which commands the user has authorized this delivery to execute.
 *
 * A contract's acceptance `method` says what *would* run; nothing said that anyone had agreed it
 * may. That permission lived only in whatever message granted it, so it could not be cited, could
 * not be audited, and — the case that produced this — could not survive being relayed: a host that
 * refuses to take one agent's word for another's authorization has no record to read instead.
 *
 * Declaring it in the admission puts the permission where the scope already is: signed by the
 * Coordinator, bound to the contract revision it was granted against, and ended by the same
 * rotation that ends the admission. A continuing user grant can be rebound at readmission for the
 * same operations; the admission's lifetime is not the user's permission lifetime. The list narrows
 * and never widens — every command in it must
 * be a method the contract declares, so an admission cannot authorize something the delivery was
 * never going to run.
 *
 * What it does not do is satisfy another host's risk gate. That gate reads its own session, not
 * this journal. Current role context carries the signed grant as evidence, not a bypass. Ask for a
 * new user decision only for an actual authority delta or explicit expiry/revocation.
 */

import { isAbsolute } from 'node:path'

type Item = Record<string, unknown>

const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim()

/** The authorized command list, when this admission declares one. */
export function executionAuthorization(admission: Item): Readonly<{
  commands: readonly string[]
  reference: string
  runtime_write_paths?: readonly string[]
}> | null {
  const value = admission.execution_authorization
  if (value === undefined || value === null) return null
  const record = value as Item
  return {
    commands: (record.commands ?? []) as string[],
    reference: String(record.reference ?? ''),
    ...(record.runtime_write_paths === undefined
      ? {}
      : { runtime_write_paths: record.runtime_write_paths as string[] })
  }
}

/**
 * Validate the declaration against the contract it was granted for. Every authorized command is a
 * method some acceptance declares: a list that names anything else is authorizing a command this
 * delivery has no reason to run, which is the shape a circumvention takes.
 */
export function assertExecutionAuthorization(contract: Item, admission: Item): void {
  const value = admission.execution_authorization
  if (value === undefined) return
  const record = value as Item
  const commands = record?.commands
  if (
    !record ||
    typeof record !== 'object' ||
    Array.isArray(record) ||
    !Array.isArray(commands) ||
    !commands.length ||
    !commands.every(text) ||
    new Set(commands).size !== commands.length ||
    !text(record.reference)
  )
    throw new Error(
      'EXECUTION_AUTHORIZATION_INVALID: declare it as {commands: [<declared acceptance methods>], reference: <how the user granted it>}'
    )
  const declared = new Set(
    (Array.isArray(contract.acceptance) ? (contract.acceptance as Item[]) : [])
      .map((item) => (text(item.method) ? item.method.trim() : null))
      .filter((method): method is string => method !== null)
  )
  if (
    record.runtime_write_paths !== undefined &&
    (!Array.isArray(record.runtime_write_paths) ||
      !record.runtime_write_paths.every((path) => text(path) && isAbsolute(path)) ||
      new Set(record.runtime_write_paths).size !== record.runtime_write_paths.length)
  )
    throw new Error(
      'EXECUTION_AUTHORIZATION_INVALID: runtime_write_paths must be unique absolute paths'
    )
  const unknown = (commands as string[]).filter((command) => !declared.has(command.trim()))
  if (unknown.length)
    throw new Error(
      `EXECUTION_AUTHORIZATION_UNDECLARED: ${unknown.join(', ')} is not a method this contract declares; an authorization narrows what the delivery may run and cannot add to it`
    )
}

/** An exact bound path survives role/round changes; absence preserves historical admissions. */
export function runtimeWriteAuthorized(admission: Item, path: string): boolean {
  const paths = executionAuthorization(admission)?.runtime_write_paths
  return paths === undefined || paths.includes(path)
}

/** Required controller artifacts fail before creation when the resolved path has drifted. */
export function assertAuthorizedRuntimeWrites(admission: Item, paths: readonly string[]): void {
  if (paths.some((path) => !runtimeWriteAuthorized(admission, path)))
    throw new Error(
      'EXECUTION_AUTHORIZATION_INVALID: required controller runtime write path is outside runtime_write_paths; retain the approved path or resolve the authority delta'
    )
}

/** Refuse a run whose declared method this delivery was never authorized to execute. */
export function assertAuthorizedMethod(
  admission: Item,
  methods: readonly { id: string; method?: unknown }[]
): void {
  const authorization = executionAuthorization(admission)
  if (!authorization) return
  const allowed = new Set(authorization.commands.map((command) => command.trim()))
  for (const item of methods) {
    const method = text(item.method) ? item.method.trim() : ''
    if (!allowed.has(method))
      throw new Error(
        `TEST_RUN_METHOD_UNAUTHORIZED: ${item.id} declares ${method || '(no method)'}, which is not among the commands this admission records as authorized (${authorization.commands.join(', ')}; granted as: ${authorization.reference}). Ask the user, then admit again with the method included.`
      )
  }
}

/**
 * Declared acceptance commands, read from the contract before delivery starts.
 *
 * A `test-run` binds to an acceptance method. This projection inventories those methods only;
 * implementation commands, formatting and other delivery gates may live elsewhere in the SDD.
 * The Coordinator includes those required operations and their write scope in the initial user
 * request separately; their absence here grants no permission. An acceptance settled by judgment
 * appears separately because it declares no executable method.
 */
export function executionRequests(contract: Item): Readonly<{
  commands: readonly Readonly<{ command: string; acceptance_ids: readonly string[] }>[]
  judged_acceptance_ids: readonly string[]
}> {
  const acceptance = Array.isArray(contract.acceptance) ? (contract.acceptance as Item[]) : []
  const byCommand = new Map<string, string[]>()
  const judged: string[] = []
  for (const item of acceptance) {
    const id = String(item.id)
    if (item.oracle_kind === 'judgment') {
      judged.push(id)
      continue
    }
    if (!text(item.method)) continue
    const command = item.method.trim()
    byCommand.set(command, [...(byCommand.get(command) ?? []), id])
  }
  return {
    commands: [...byCommand].map(([command, acceptance_ids]) => ({ command, acceptance_ids })),
    judged_acceptance_ids: judged
  }
}
