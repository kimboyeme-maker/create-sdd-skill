# Host C

## Requirements
- R1 Install errors are reworded.

## Batches
- C1 Reword install errors.

## Steps
- S1 Reword the install error in `packages/host/index.ts` and update `packages/host/host.test.ts`.

## Acceptance
- A1 Given the package builds, when `install()` receives a thenable, then it throws `INSTALL_RESULT_THENABLE`.


<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd/v2",
  "id": "host-c",
  "revision": "1",
  "requirements": [{ "id": "R1", "kind": "must-ship", "implementation": ["S1"], "acceptance": ["A1"] }],
  "batches": [{ "id": "C1", "steps": ["S1"], "requirements": ["R1"], "depends_on": [] }],
  "steps": [{ "id": "S1", "touches": ["packages/host/index.ts", "packages/host/host.test.ts"], "closes": ["A1"] }],
  "acceptance": ["A1"],
  "writes": ["packages/host"],
  "unresolved_user_decisions": []
}
```
<!-- sdd-contract:end -->
