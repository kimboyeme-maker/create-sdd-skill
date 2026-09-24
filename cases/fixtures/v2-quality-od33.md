# Topology index transactions

Fixture for OD-33: an acceptance must assert what the declared interface can read.

## Requirements
- R1 `rollback()` restores the index to its state before `begin()`.

## Batches
- C1 Add transactions.

## Steps
- S1 Add `begin()` and `rollback()` to `packages/graph/src/index.ts`.

## Interface

```ts
export interface TopologyIndex {
  add(node: string): void
  begin(): void
  rollback(): void
  order(): readonly string[]
  // private state: #nextOrdinal: number
}
```

## Acceptance
- A1 Given an index holding `a` and `b`, when `begin()`, `add("c")` and `rollback()` run, then the next `add` receives the next ordinal it would have received before `begin()`.

<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd/v2",
  "id": "topology-index",
  "revision": "1",
  "requirements": [{ "id": "R1", "kind": "must-ship", "implementation": ["S1"], "acceptance": ["A1"] }],
  "batches": [{ "id": "C1", "steps": ["S1"], "requirements": ["R1"], "depends_on": [] }],
  "steps": ["S1"],
  "acceptance": ["A1"],
  "writes": ["packages/graph"],
  "unresolved_user_decisions": []
}
```
<!-- sdd-contract:end -->
