export class Host {
  run(): void {}
}

export function install(result: unknown): void {
  if (result instanceof Promise) throw new TypeError('install result must not be thenable')
}
