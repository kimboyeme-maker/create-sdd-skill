# SDD numbering and readable progress

New SDDs use `sdd-document/v1` IDs matching `^[A-Z]{2}[0-9]{2,4}$`: PC01, JZ02, BH003 and MJ0004 are valid; PC1, PC-01 and PC10000 are invalid. The authoritative default prefixes come from the sibling controller's `configuration` output. Register additional non-conflicting two-letter prefixes in `presentation.prefixes`. Allocate from 01, extend to three or four digits when needed, keep IDs stable when rows are reordered, and record removed IDs in `presentation.retired_ids`; never recycle them. `bun <loop-skill-root>/scripts/main.ts document-next-id --sdd <SDD> --prefix PC` suggests the next unused ID without reserving or writing it.

Every SDD content table has an exact `description` column with a non-empty sentence in the document language that describes the action and its observable result. An ID, TODO or "完成该项" is not a description. Descriptions never replace requirements, exit conditions, oracle, permission or evidence, and never carry live completion status. Use Markdown pipe tables; fenced examples and indented code are not validated. Escape a literal `|` inside a cell as `\|`. An ID prefix outside the configured defaults (for example `RT`, `TP`, `JN` from the experience contract) is registered in `presentation.prefixes` before its first table row, and each ID is defined in exactly one table row. Diagnostics name the source file, heading or table, and physical row.

Define an object once in a table with an `ID` column; reference it elsewhere through `refs`, `requirement_ids`, `acceptance_ids` or `batch_ids`. The column must be spelled exactly `ID`: a table heading its identifiers `Semantic ID`, `Case ID` or similar is not an identifier definition and receives none of these checks. Code symbols, versions, external references, runtime packet IDs, events and lease IDs keep their own formats.

## The Authoring receipt is a list

Every phase exit gate requires the documents that phase loaded to appear in the SDD's authoring receipt with their current tokens. Write it under a heading matching `authoring receipt`, as a plain list — one line per document, its path followed by its eight-hex token:

```markdown
## Authoring receipt

- references/phases/1-harvest.md — 32e5425e
- references/migration.md — ecbe9f4c
```

The parser reads any line under that heading carrying a reference path and takes the last hex token after it, so the list form and a prose line both work. A Markdown table does not: the `description`-column rule above applies to every pipe table in the document, and a two-column receipt table is reported as `SDD_TABLE_DESCRIPTION_MISSING`. The same holds for any other inventory that is not a content table — keep it out of pipe tables rather than inventing a `description` column for it.

Editing a reference file changes its token and makes every receipt row naming it stale. Refresh the idle documents; leave an SDD under active delivery alone and reconcile it in the amendment that carries its next revision.

## Source-derived presentation index

New executable SDDs add `"document_policy": "sdd-document/v1"` and a presentation index to the contract. A source is the root (`self`) or a normative Agent Context path relative to the root SDD; `heading` must identify one section and `table` is its one-based table ordinal. The index locates original descriptions; it is not another dependency graph.

```json
"presentation": {
  "protocol": "sdd-presentation/v1",
  "prefixes": {},
  "retired_ids": [],
  "items": [
    {"id": "PC01", "kind": "batch", "source": {"document": "self", "heading": "Delivery items", "table": 1}},
    {"id": "BH01", "kind": "closure", "source": {"document": "self", "heading": "Delivery items", "table": 1}},
    {"id": "MJ01", "kind": "gate", "source": {"document": "self", "heading": "Delivery items", "table": 1}}
  ]
}
```

```markdown
## Delivery items

| ID | description | requirement_ids | acceptance_ids | batch_ids | gate |
| --- | --- | --- | --- | --- | --- |
| PC01 | Validate requests while preserving existing callers | XQ01 | YS01 | | |
| BH01 | Reject missing input before mutating state | XQ01 | YS01 | PC01 | |
| MJ01 | Complete final independent acceptance | XQ01 | YS01 | PC01 | SHIP |
```

Index every batch, closure and gate definition. Child bindings must fit their batch. A row bound to `batch_ids` may only reference requirements and acceptance inside each bound batch, so a gate spanning several batches (such as the final `SHIP` row) leaves `batch_ids` empty; the `SHIP` rows together list every Must-Ship acceptance. Link cells hold IDs only; explanations such as "none" belong in `description`. A `batch` row always leaves `batch_ids` empty: batch order is `delivery_plan.depends_on`, and repeating it here is a second graph (`SDD_PRESENTATION_SECOND_GRAPH_FORBIDDEN`, which names the offending row ID). An optional index `description` must equal the table cell exactly; prefer omitting it. Executable rows reference existing requirements and acceptance. `gate: SHIP` denotes the final gate. A missing binding reads "待核实", never a fabricated success. Batch IDs in this table are the same IDs used by `delivery_plan.batches`.

Validate new loop-ready documents with `validate --sdd <SDD> --document-policy current --design-policy current`. The flag is load-bearing, not decoration: it selects how strictly the document is read. Under it a new executable document must declare `document_policy` and carry a `SHIP` row covering every Must-Ship acceptance; without it an existing document that never opted into the policy stays readable, which is how execution and status read it. `document-check --sdd <SDD>` checks numbering, tables and index only and never claims loop readiness.

## Compatibility and reporting

Existing SDDs keep their IDs, references and signed history; do not adopt the new policy retroactively just to continue work. Presentation metadata enters through a normal revision or amendment and never expands product scope.

Progress is reported from the controller's `status` projection: batch overview first, then current closure and gate items, with stages `PENDING`, `ACTIVE`, `AWAITING_VERIFICATION`, `REWORK`, `DONE`, `UNKNOWN`. `DONE` requires authenticated acceptance and requirement evidence; a finished agent or implementation is not enough. Pipeline incidents, pause and waiting-user states are shown separately from product blockers.

<!-- reading-receipt: e46b39c3 -->
