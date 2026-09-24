# API

- R1 The run returns ok (case 1).
- C1 Run change.
- S1 Make the run return ok.
- A1 Given the api, when it runs, then it returns ok.

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
        "src/api.ts"
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
    "src",
    "test"
  ],
  "oracles": {
    "A1": "test/api.test.ts"
  },
  "unresolved_user_decisions": []
}
```
<!-- sdd-contract:end -->
