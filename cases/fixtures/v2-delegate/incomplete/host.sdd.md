# Host R3

- R7 Except BC3 and BC4, pipeline behaviour for the four modes is the same as R2.
- C7 Stage wiring.
- S7 Wire `lift` for every stage registration.
- S-int Assemble host and pipeline.
- A7 Registering a stage of each mode installs it once.
- BC4 Generator stages are now lifted to async generators; INVALID_OPTION is wrapped as PIPELINE_MODE_MISMATCH.
- BC5 STAGE_KIND_MISMATCH is removed: no path reaches it any more.


<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd/v2",
  "id": "host",
  "revision": "4",
  "root": "root.sdd.md",
  "requirements": [
    {
      "id": "R7",
      "kind": "must-ship",
      "implementation": [
        "S7",
        "S-int"
      ],
      "acceptance": [
        "A7"
      ]
    }
  ],
  "batches": [
    {
      "id": "C7",
      "steps": [
        "S7",
        "S-int"
      ],
      "requirements": [
        "R7"
      ],
      "depends_on": []
    }
  ],
  "steps": [
    "S7",
    "S-int"
  ],
  "acceptance": [
    "A7"
  ],
  "writes": [
    "packages/host"
  ],
  "exports": [],
  "consumes": [
    {
      "document": "pipeline",
      "export": "create-pipeline",
      "version": "1",
      "fingerprint": "a5d58f6352e8"
    }
  ],
  "error_registry": "packages/host/src/error-code.ts",
  "delegations": {
    "S7": {
      "document": "pipeline",
      "export": "create-pipeline",
      "delta": {},
      "errors": {}
    }
  },
  "unresolved_user_decisions": []
}
```
<!-- sdd-contract:end -->
