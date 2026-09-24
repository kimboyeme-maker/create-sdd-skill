# Sibling program

- E1 A maintainer reads each package's design next to the other packages' designs.

## Shared Constraints

None

## Integration Acceptance

- A-total Given both packages built, when the consumer runs, then it prints the greeting.

<!-- sdd-program:start -->
```json
{
  "protocol": "sdd-program/v2",
  "id": "sibling-program",
  "revision": "1",
  "children": [
    { "id": "beta", "sdd": "../../../../../../outside-program/child.sdd.md", "depends_on": [] }
  ],
  "metas": [
    { "id": "E1", "kind": "Entry", "priority": "P1", "members": ["M-beta"] },
    { "id": "M-beta", "kind": "Module", "owner": "beta", "source_id": "R1", "origin": { "document": "../../../../../../outside-program/child.sdd.md", "requirement_id": "R1" } },
    { "id": "K-beta", "kind": "Chunk", "owner": "beta", "source_id": "C1", "members": ["M-beta"] },
    { "id": "B-beta", "kind": "Bundle", "owner": "beta", "members": ["K-beta"], "requires": [] }
  ],
  "integration": { "owner": "beta", "implementation": ["S1"], "acceptance": ["A-total"] },
  "unresolved_user_decisions": []
}
```
<!-- sdd-program:end -->
