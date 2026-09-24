# Beta greeting

## Requirements

- R1 The consumer prints a greeting.
- R2 The greeting uses the shared formatter.

## Batches

- C1 Add the formatted greeting.

## Steps

- S1 Print the formatted greeting from the entry point.

## Acceptance

- A1 Given the package is built, when the entry point runs, then it prints `Hello`.

<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd/v2",
  "id": "beta",
  "revision": "1",
  "root": "../root.sdd.md",
  "requirements": [
    { "id": "R1", "kind": "must-ship", "implementation": ["S1"], "acceptance": ["A1"] },
    { "id": "R2", "kind": "must-ship", "implementation": ["S1"], "acceptance": ["A1"] }
  ],
  "batches": [{ "id": "C1", "steps": ["S1"], "requirements": ["R1", "R2"], "depends_on": [] }],
  "steps": ["S1"],
  "acceptance": ["A1"],
  "consumes": [{ "document": "gamma", "export": "X1", "version": "1" }],
  "writes": ["cases/fixtures/v2-program-derived/beta"],
  "unresolved_user_decisions": []
}
```
<!-- sdd-contract:end -->
