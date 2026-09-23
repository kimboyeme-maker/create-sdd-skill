# Degenerate public surface (defect fixture)

Minimal reproduction of the defect observed in
`docs/middleware-pipeline/pipeline-host-r2.sdd.md:88-117`: a mode-dispatching factory whose declared
return type instantiates its stage parameter as `never`, so the public type admits no registration at
all. The original document passed validate, repo-facts and three review lenses with `CONVERGED`,
because nothing in the pipeline read these fences as types.

## New/Changed API & Typing

**Applicability:** APPLICABLE

**Signatures:**

```ts
export type IHost<TValue, TStage> = {
  use(stage: TStage): () => void
  readonly size: number
  run(value: TValue, done: (value: TValue) => void): void
}

export declare function createSyncHost<TValue>(
  options: IHostOptions
): IHost<TValue, ISyncStage<TValue>>

export declare function createHost<TValue>(mode: IMode, options: IHostOptions): IHost<TValue, never>
```

**Inputs and outputs:** the mode-dispatching entry selects a runner at construction time.

**Errors:** none added.

**Examples:**

```ts
const host = createHost<number>('sync', options)
```

**Exports and consumers:** both factories are exported from the package root.
