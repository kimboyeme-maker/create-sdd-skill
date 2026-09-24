# Pipeline factory

Fixture for OD-34: a removed export against a test file promised unchanged.

## Requirements
- R1 The package root removes the export `runSync`; it adds `createPipeline`.

## Batches
- C1 Replace the runner.

## Steps
- S1 Replace `runSync` with `createPipeline` in `packages/pipe/src/index.ts`.
- S2 Move the callers in `packages/pipe/test/signal.test.ts` to `createPipeline`; its export assertions for the removed runner are rewritten to assert its absence.

## Acceptance
- A1 Given the package, when the root is imported, then it exports `createPipeline` and not `runSync`.

<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd/v2",
  "id": "pipeline-factory",
  "revision": "1",
  "requirements": [{ "id": "R1", "kind": "must-ship", "implementation": ["S1", "S2"], "acceptance": ["A1"] }],
  "batches": [{ "id": "C1", "steps": ["S1", "S2"], "requirements": ["R1"], "depends_on": [] }],
  "steps": ["S1", "S2"],
  "acceptance": ["A1"],
  "writes": ["packages/pipe"],
  "unresolved_user_decisions": []
}
```
<!-- sdd-contract:end -->
