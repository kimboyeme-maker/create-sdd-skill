# Host B

## Requirements
- R1 Hosts are created through a factory instead of a class.

## Batches
- C1 Host factory.

## Steps
- S1 Replace the class in `packages/host/index.ts` with a factory and reword install errors.

## Acceptance
- A1 Given the package builds, when `install()` receives a thenable, then it throws `INSTALL_RESULT_THENABLE`.


<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd/v2",
  "id": "host-b",
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
        "packages/host/index.ts"
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
    "packages/host"
  ],
  "unresolved_user_decisions": []
}
```
<!-- sdd-contract:end -->
