type Item = Record<string, unknown>

const record = (value: unknown): Item | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Item) : undefined
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0
const texts = (value: unknown): value is string[] => Array.isArray(value) && value.every(text)

/**
 * How an acceptance decides its own verdict.
 *
 * `mechanical` is the default: the command's exit code is the verdict. `judgment` has no command
 * and is settled by a recorded review. `differential` runs a command whose exit code is an
 * observation rather than a verdict — a gate that is already red for reasons outside this delta
 * can only be judged by comparing what it reports now with a declared baseline, so the acceptance
 * passes when the comparison adds nothing and fails when it does.
 */
export const ORACLE_KINDS = ['mechanical', 'judgment', 'differential'] as const
export const DIFFERENTIAL_ORACLE = 'differential'

/** Acceptance ids whose verdict is the comparison, not the exit code. */
export function differentialAcceptanceIds(contract: unknown): ReadonlySet<string> {
  const acceptance = record(contract)?.acceptance
  if (!Array.isArray(acceptance)) return new Set()
  return new Set(
    acceptance
      .map(record)
      .filter((item) => item?.oracle_kind === DIFFERENTIAL_ORACLE && text(item?.id))
      .map((item) => String(item!.id))
  )
}

/** True when every acceptance this check or run names decides its verdict by comparison. */
export function allDifferential(
  acceptanceIds: readonly unknown[],
  differential: ReadonlySet<string>
): boolean {
  return acceptanceIds.length > 0 && acceptanceIds.every((id) => differential.has(String(id)))
}

/**
 * The comparison itself: which baseline it was made against, what the command reports now that the
 * baseline did not, and what the reviewer read. An empty `new_identities` is what PASS means here,
 * so a PASS that lists new identities is refused rather than recorded — the exit code no longer
 * carries that refusal.
 */
export function assertDifferentialObservation(
  value: unknown,
  outcome: unknown,
  code: string
): void {
  const observation = record(value)
  if (
    !observation ||
    !text(observation.baseline) ||
    !texts(observation.new_identities) ||
    !text(observation.observed)
  )
    throw new Error(
      `${code}: a differential acceptance records {baseline, new_identities, observed} — the ` +
        `baseline it compared against, the identities this run adds to it, and what was read`
    )
  if (outcome === 'PASS' && (observation.new_identities as string[]).length)
    throw new Error(
      `${code}: PASS means the comparison added nothing; ` +
        `${String((observation.new_identities as string[]).length)} new identities were listed`
    )
  if (outcome !== 'PASS' && !(observation.new_identities as string[]).length)
    throw new Error(`${code}: a non-PASS differential check names the identities it found`)
}
