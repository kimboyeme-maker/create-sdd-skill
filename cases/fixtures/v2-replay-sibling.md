# Pipeline

- R1 The pipeline run returns ok.
- R2 An optional extra.
- C1 Pipeline change.
- S1 Make the run return ok in the pipeline module.
- S2 Add the extra.
- A1 Given the pipeline, when it runs, then it returns ok.
- A2 The extra exists.

<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd/v2",
  "id": "pipeline",
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
    },
    {
      "id": "R2",
      "kind": "should",
      "implementation": [
        "S2"
      ],
      "acceptance": [
        "A2"
      ]
    }
  ],
  "batches": [
    {
      "id": "C1",
      "steps": [
        "S1",
        "S2"
      ],
      "requirements": [
        "R1",
        "R2"
      ],
      "depends_on": []
    }
  ],
  "steps": [
    {
      "id": "S1",
      "touches": [
        "packages/pipeline/pipeline.ts"
      ],
      "closes": [
        "A1"
      ]
    },
    {
      "id": "S2"
    }
  ],
  "acceptance": [
    "A1",
    "A2"
  ],
  "writes": [
    "packages/pipeline"
  ],
  "oracles": {
    "A1": "packages/pipeline/pipeline.test.ts"
  },
  "unresolved_user_decisions": []
}
```
<!-- sdd-contract:end -->
