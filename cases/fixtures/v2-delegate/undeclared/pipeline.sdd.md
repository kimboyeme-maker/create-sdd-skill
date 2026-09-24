# Pipeline

- R4 `lift` accepts sync, async and generator stages, lifts a generator to an async generator, and throws `INVALID_OPTION` for any other combination.
- C4 Lift batch.
- S4 Implement lift.
- A4 A generator stage lifts to an async generator.
- create-pipeline The lifting runner in packages/pipeline/runner.ts.

<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd/v2",
  "id": "pipeline",
  "revision": "1",
  "root": "root.sdd.md",
  "requirements": [
    {
      "id": "R4",
      "kind": "must-ship",
      "implementation": [
        "S4"
      ],
      "acceptance": [
        "A4"
      ]
    }
  ],
  "batches": [
    {
      "id": "C4",
      "steps": [
        "S4"
      ],
      "requirements": [
        "R4"
      ],
      "depends_on": []
    }
  ],
  "steps": [
    "S4"
  ],
  "acceptance": [
    "A4"
  ],
  "writes": [
    "packages/pipeline"
  ],
  "exports": [
    {
      "id": "create-pipeline",
      "version": "1",
      "asset": "T-pipe",
      "semantics": [
        "R4"
      ],
      "fingerprint": "a5d58f6352e8",
      "errors": [
        "INVALID_OPTION"
      ]
    }
  ],
  "consumes": [],
  "unresolved_user_decisions": []
}
```
<!-- sdd-contract:end -->
