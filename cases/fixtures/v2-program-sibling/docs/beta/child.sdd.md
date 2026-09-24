# Beta greeting

## Requirements

- R1 The consumer prints a greeting.

## Batches

- C1 Add the greeting.

## Steps

- S1 Print the greeting from the entry point.

## Acceptance

- A1 Given the package is built, when the entry point runs, then it prints `hello`.

<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd/v2",
  "id": "beta",
  "revision": "1",
  "root": "../alpha/root.sdd.md",
  "requirements": [{ "id": "R1", "kind": "must-ship", "implementation": ["S1"], "acceptance": ["A1"] }],
  "batches": [{ "id": "C1", "steps": ["S1"], "requirements": ["R1"], "depends_on": [] }],
  "steps": ["S1"],
  "acceptance": ["A1"],
  "writes": ["cases/fixtures/v2-program-sibling"],
  "unresolved_user_decisions": []
}
```
<!-- sdd-contract:end -->
