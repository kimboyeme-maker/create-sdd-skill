# Feature A

Minimal sdd/v2 fixture for create-sdd defect cases.

## Outcome
A caller can obtain the feature-a greeting.

## Requirements
- R1 `featureA()` returns the string `ok`.

## Batches
- C1 Implement feature A.

## Steps
- S1 Create `packages/feature-a/index.ts` exporting `featureA()`.

## Acceptance
- A1 Given the package is built, when `featureA()` is called, then it returns `ok`.

<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd/v2",
  "id": "feature-a",
  "revision": "1",
  "requirements": [
    {
      "id": "R1",
      "kind": "must-ship",
      "implementation": [
        "S1"
      ],
      "acceptance": [
        "A1"
      ]
    }
  ],
  "batches": [
    {
      "id": "C1",
      "steps": [
        "S1"
      ],
      "requirements": [
        "R1"
      ],
      "depends_on": []
    }
  ],
  "steps": [
    "S1"
  ],
  "step_sources": [],
  "acceptance": [
    "A1"
  ],
  "writes": [
    "packages/feature-a"
  ],
  "exports": [],
  "consumes": [],
  "unresolved_user_decisions": []
}
```
<!-- sdd-contract:end -->
