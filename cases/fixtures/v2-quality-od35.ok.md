# Topology projection refactor

Fixture for OD-35: a must-ship property that holds before and after the change by design.

## Requirements
- R1 `buildTopology()` keeps its output while its sorting moves into the index.

## Batches
- C1 Move the sort.

## Steps
- S1 Rebuild `buildTopology()` on the index in `packages/graph/src/topology.ts`.

## Acceptance
- A1 Given the golden fixtures recorded before the change, when `buildTopology()` runs on each, then its output stays unchanged.

<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd/v2",
  "id": "topology-projection",
  "revision": "1",
  "requirements": [{ "id": "R1", "kind": "must-ship", "implementation": ["S1"], "acceptance": ["A1"] }],
  "batches": [{ "id": "C1", "steps": ["S1"], "requirements": ["R1"], "depends_on": [] }],
  "steps": ["S1"],
  "acceptance": ["A1"],
  "preserve": ["A1"],
  "writes": ["packages/graph"],
  "unresolved_user_decisions": []
}
```
<!-- sdd-contract:end -->
