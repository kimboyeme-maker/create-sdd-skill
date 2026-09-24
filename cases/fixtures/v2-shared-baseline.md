# API

- R1 The run returns ok (case 1).
- R2 The run returns ok (case 2).
- R3 The run returns ok (case 3).
- C1 Run change.
- S1 Make the run return ok.
- S2 Make the run return ok.
- S3 Make the run return ok.
- A1 Given the api, when it runs, then it returns ok.
- A2 Given the api, when it runs, then it returns ok.
- A3 Given the api, when it runs, then it returns ok.

<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd/v2",
  "id": "api",
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
      "kind": "must-ship",
      "implementation": [
        "S2"
      ],
      "acceptance": [
        "A2"
      ]
    },
    {
      "id": "R3",
      "kind": "must-ship",
      "implementation": [
        "S3"
      ],
      "acceptance": [
        "A3"
      ]
    }
  ],
  "batches": [
    {
      "id": "C1",
      "steps": [
        "S1",
        "S2",
        "S3"
      ],
      "requirements": [
        "R1",
        "R2",
        "R3"
      ],
      "depends_on": []
    }
  ],
  "steps": [
    {
      "id": "S1",
      "touches": [
        "src/api.ts"
      ],
      "closes": [
        "A1"
      ]
    },
    {
      "id": "S2",
      "touches": [
        "src/api.ts"
      ],
      "closes": [
        "A2"
      ]
    },
    {
      "id": "S3",
      "touches": [
        "src/api.ts"
      ],
      "closes": [
        "A3"
      ]
    }
  ],
  "acceptance": [
    "A1",
    "A2",
    "A3"
  ],
  "writes": [
    "src",
    "test"
  ],
  "oracles": {
    "A1": "test/api.test.ts",
    "A2": "test/api.test.ts",
    "A3": "test/api.test.ts"
  },
  "unresolved_user_decisions": []
}
```
<!-- sdd-contract:end -->
