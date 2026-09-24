export function runSync(stages: readonly (() => void)[]): void {
  for (const stage of stages) stage()
}
