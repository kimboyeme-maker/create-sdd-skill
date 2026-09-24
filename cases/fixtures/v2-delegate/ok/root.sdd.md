# R3 program

- E1 Hosts run pipelines of every mode.

## Shared Constraints

None

## Integration Acceptance

- A-total The host run passes host A7 end to end.

<!-- sdd-program:start -->
```json
{
  "protocol": "sdd-program/v2",
  "id": "r3",
  "revision": "1",
  "children": [
    {
      "id": "pipeline",
      "sdd": "pipeline.sdd.md",
      "depends_on": []
    },
    {
      "id": "host",
      "sdd": "host.sdd.md",
      "depends_on": [
        "pipeline"
      ]
    }
  ],
  "metas": [
    {
      "id": "E1",
      "kind": "Entry",
      "members": [
        "M-pipe",
        "M-host"
      ]
    },
    {
      "id": "M-pipe",
      "kind": "Module",
      "owner": "pipeline",
      "source_id": "R4",
      "origin": {
        "document": "pipeline.sdd.md",
        "requirement_id": "R4"
      }
    },
    {
      "id": "K-pipe",
      "kind": "Chunk",
      "owner": "pipeline",
      "source_id": "C4",
      "members": [
        "M-pipe"
      ]
    },
    {
      "id": "B-pipe",
      "kind": "Bundle",
      "owner": "pipeline",
      "members": [
        "K-pipe"
      ],
      "requires": []
    },
    {
      "id": "T-pipe",
      "kind": "Asset",
      "producer": "B-pipe",
      "path": "packages/pipeline/runner.ts",
      "version": "1",
      "acceptance": [
        "A4"
      ]
    },
    {
      "id": "M-host",
      "kind": "Module",
      "owner": "host",
      "source_id": "R7",
      "origin": {
        "document": "host.sdd.md",
        "requirement_id": "R7"
      }
    },
    {
      "id": "K-host",
      "kind": "Chunk",
      "owner": "host",
      "source_id": "C7",
      "members": [
        "M-host"
      ]
    },
    {
      "id": "B-host",
      "kind": "Bundle",
      "owner": "host",
      "members": [
        "K-host"
      ],
      "requires": [
        "T-pipe"
      ]
    }
  ],
  "integration": {
    "owner": "host",
    "implementation": [
      "S-int"
    ],
    "acceptance": [
      "A-total"
    ]
  },
  "relies_on": {
    "A-total": [
      {
        "document": "host",
        "acceptance": "A7"
      }
    ]
  },
  "unresolved_user_decisions": []
}
```
<!-- sdd-program:end -->
