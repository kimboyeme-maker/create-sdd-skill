# Degenerate public surface (repaired fixture)

The repaired counterpart of `CSDD-TYPE-001.md`. Same document, with the union the dispatching entry
actually returns. It exists so the probe's sensitivity is observable: the defect fixture must fire
and this one must not.

Original defect:
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

export declare function createHost<TValue>(
  mode: IMode,
  options: IHostOptions
): IHost<TValue, ISyncStage<TValue> | IAsyncStage<TValue>>
```

**Inputs and outputs:** the mode-dispatching entry selects a runner at construction time.

**Errors:** none added.

**Examples:**

```ts
const host = createHost<number>('sync', options)
```

**Exports and consumers:** both factories are exported from the package root.
