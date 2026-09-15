# Agent Context map

Load for loop-ready SDDs when adding or refreshing Agent Context routing.

## Root entry and companion

Add exactly one root entry; the `@` line is routing syntax only and never inlines or recursively expands content:

```markdown
## Agent Context

@./feature.agent-context.md
```

The companion routes files and copies nothing:

```markdown
## Shared

### Normative
@./architecture/ownership.md

### Contextual
@./README.md

## Coordinator

### Evidence
@./evidence/consumer-inventory.md

## Operator
@./implementation-notes.md

## Architect
@./verification-oracles.md

## Fresh Architect
### Untrusted
@./prior-findings.md

## Packet PC01
@./packets/pc01-context.md
```

- Level-two blocks: `Shared`, `Coordinator`, `Operator`, `Architect`, `Fresh Operator`, `Fresh Architect`, `Temporary`, `Packet <ID>`.
- Source classes: `Normative`, `Contextual` (default), `Evidence`, `Untrusted`. `Normative` sources join the SDD fingerprint but never outrank the root SDD; `Untrusted` sources are leads that need fresh inspection.
- Every pointer is one standalone relative `@path.md` or `@<path with spaces.md>` line resolved from the declaring file. Pointers are recognized only in the root section and direct companion blocks; linked documents are terminal and never scanned for more pointers.
- One source may appear in several blocks with one consistent classification; derived views deduplicate it. The companion never contains copied clauses, decisions, status, progress, verdicts, leases, capabilities, tokens or transcripts, and never encodes file operations.

## Evidence companion

Probe records live in an evidence companion next to the SDD (`<name>.evidence.md`), routed from the `Shared` or `Coordinator` block with class `Evidence`. Each record names its claim links, command, exact versions, environment, failure condition, result and an output excerpt or an attachment path inside the repository. A temporary directory may host the probe, but a record that points only there is not evidence. Contract evidence strings that name a local `.md` file must resolve, and `validate` rejects missing ones.

## Reading selection

Coordinator reads the whole contract and decision evidence. Operator and Architect read the root SDD plus `Shared`, their role block and the current packet; fresh or replacement agents add the matching `Fresh` block and the controller's resume view. Do not make every agent read every linked source. Paging and retained-read reuse follow the loop's execution reference.

## Refreshing routing

Refresh routing before `validate`. When a referenced file moved, update the pointer only with unambiguous identity evidence (rename history, a unique current path with matching content, or unchanged ownership and document identity), updating every direct declaration together and preserving placement and classification. A same-source path refresh is routing maintenance, not scope change. An uncertain target stays an explicit unresolved routing defect; never delete the route, invent a replacement or fork a successor.

When loop sidecars exist, inspect public status first and never change the map under an active Operator or Architect lease; wait for a Coordinator safe checkpoint. Root SDD changes and normative source changes need a normal revision and authenticated amendment because they change the fingerprint; contextual and evidence maintenance must still precede the next dispatch.

## Optional context index v2

A `<!-- context-index:start -->` / `<!-- context-index:end -->` block in the companion may enclose one JSON fence with `protocol: "context-index/v2"` and a `sections` array; each entry has exactly `path`, unique ATX `heading`, `requirement_ids`, `acceptance_ids` and boolean `shared`. It is source-location metadata only: shared constraints and unindexed bytes remain required reading, invalid or ambiguous mappings fall back to full reads, and Coordinator verifies relevance and prerequisite coverage before relying on narrower reading.

<!-- reading-receipt: f924ae0b -->
