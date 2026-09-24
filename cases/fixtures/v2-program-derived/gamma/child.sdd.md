# Gamma formatter

## Requirements

- R1 A formatter capitalises a greeting.

## Batches

- C1 Add the formatter.

## Steps

- S1 Export `format()` from `cases/fixtures/v2-program-derived/gamma/format.ts`.

## Acceptance

- A1 Given `format('hello')`, then it returns `Hello`.

## Exports

- X1 `format()` in `cases/fixtures/v2-program-derived/gamma/format.ts`, version 1.

<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd/v2",
  "id": "gamma",
  "revision": "1",
  "root": "../root.sdd.md",
  "requirements": [{ "id": "R1", "kind": "must-ship", "implementation": ["S1"], "acceptance": ["A1"] }],
  "batches": [{ "id": "C1", "steps": ["S1"], "requirements": ["R1"], "depends_on": [] }],
  "steps": ["S1"],
  "acceptance": ["A1"],
  "exports": [{ "id": "X1", "asset": "T-format", "version": "1" }],
  "writes": ["cases/fixtures/v2-program-derived/gamma"],
  "unresolved_user_decisions": []
}
```
<!-- sdd-contract:end -->
