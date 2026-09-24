# Derived program

- E1 A maintainer ships the greeting and its formatter together.

## Shared Constraints

None

## Integration Acceptance

- A-total Given both packages built, when the consumer runs, then it prints the formatted greeting.

<!-- sdd-program:start -->
```json
{
  "protocol": "sdd-program/v2",
  "id": "derived-program",
  "revision": "1",
  "children": [
    { "id": "beta", "sdd": "beta/child.sdd.md", "depends_on": ["gamma"] },
    { "id": "gamma", "sdd": "gamma/child.sdd.md", "depends_on": [] }
  ],
  "metas": [
    { "id": "E1", "kind": "Entry", "priority": "P1", "members": ["M:beta:R1", "M:beta:R2", "M:gamma:R1"] },
    { "id": "T-format", "kind": "Asset", "producer": "B:gamma", "path": "cases/fixtures/v2-program-derived/gamma/format.ts", "version": "1", "acceptance": ["A1"] }
  ],
  "integration": { "owner": "beta", "implementation": ["S1"], "acceptance": ["A-total"] },
  "unresolved_user_decisions": []
}
```
<!-- sdd-program:end -->
