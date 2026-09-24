# Pipeline

- R1 The pipeline run returns ok.
- C1 Pipeline change.
- S1 Make the run return ok in the pipeline module.
- A1 Given the pipeline, when it runs, then it returns ok.

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
    {
      "id": "S1",
      "touches": [
        "packages/pipeline/pipeline.ts"
      ],
      "closes": [
        "A1"
      ]
    }
  ],
  "acceptance": [
    "A1"
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
