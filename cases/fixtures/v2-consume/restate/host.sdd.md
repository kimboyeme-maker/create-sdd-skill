# Host

- R1 The host resumes plugins after a generation change.
- C1 Host resume.
- S1 Apply the planner's plan.
- S-int Assemble host and planner.
- A6 When a can rebind, `planResume` restarts b, so b is disposed and installed once.

<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd/v2",
  "id": "host",
  "revision": "1",
  "root": "root.sdd.md",
  "requirements": [
    {
      "id": "R1",
      "kind": "must-ship",
      "implementation": [
        "S1",
        "S-int"
      ],
      "acceptance": [
        "A6"
      ]
    }
  ],
  "batches": [
    {
      "id": "C1",
      "steps": [
        "S1",
        "S-int"
      ],
      "requirements": [
        "R1"
      ],
      "depends_on": []
    }
  ],
  "steps": [
    "S1",
    "S-int"
  ],
  "acceptance": [
    "A6"
  ],
  "writes": [
    "packages/host"
  ],
  "exports": [],
  "consumes": [
    {
      "document": "capability",
      "export": "dependency-planner",
      "version": "1",
      "fingerprint": "c4524b8b69dc"
    }
  ],
  "unresolved_user_decisions": []
}
```
<!-- sdd-contract:end -->
