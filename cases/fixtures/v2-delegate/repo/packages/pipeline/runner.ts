export function lift(stage: unknown, mode: string) {
  if (mode === 'bad') throw new TypeError('INVALID_OPTION')
  return stage
}
