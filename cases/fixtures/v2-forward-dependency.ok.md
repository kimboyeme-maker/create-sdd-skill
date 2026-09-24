# Host A

## Requirements
- R1 Stages can be registered.
- R2 Hosts are created through a factory.

## Batches
- C1 Stage registry.
- C2 Host factory.

## Steps
- S1 Add the stage registry in `packages/host/stage.ts`.

  ```ts
  export function registerStage(stage: Stage) {}
  ```
- S2 Add the factory in `packages/host/define.ts`.

  ```ts
  export function defineHost(options: Options) {}
  ```

## Acceptance
- A1 Given a registry, when `registerStage()` runs, then the stage is listed.
- A2 Given options, when `defineHost()` runs, then a host is returned.

<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd/v2",
  "id": "host-a",
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
    },
    {
      "id": "C2",
      "steps": [
        "S2"
      ],
      "requirements": [
        "R2"
      ],
      "depends_on": [
        "C1"
      ]
    }
  ],
  "steps": [
    {
      "id": "S1",
      "touches": [
        "packages/host/stage.ts"
      ],
      "closes": [
        "A1"
      ]
    },
    {
      "id": "S2",
      "touches": [
        "packages/host/define.ts"
      ],
      "closes": [
        "A2"
      ]
    }
  ],
  "acceptance": [
    "A1",
    "A2"
  ],
  "writes": [
    "packages/host"
  ],
  "unresolved_user_decisions": []
}
```
<!-- sdd-contract:end -->
