export const unUse = (_name: string): void => undefined

export function use(name: string): object
export function use(options: { readonly name: string }): object
export function use(input: string | { readonly name: string }): object {
  return { name: typeof input === 'string' ? input : input.name }
}
