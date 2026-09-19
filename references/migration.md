# Migration Design

Read this reference only for migrations.

## Establish the compatibility contract

Inventory current public behavior and decide explicitly what must remain compatible: exports, wire/data formats, call order, disposal order, error type/code/cause, messages, Promise identity, cancellation reason, persistence, or performance. Do not assume every implementation detail is public. Record intentional behavior changes separately.

## Plan safe batches

A typical order is:

```text
inventory and baseline → red verification where useful → new contract
→ implementation → consumer migration → duplicate/compatibility removal
→ exports/docs/dependencies → package and consumer gates → closure evidence
```

Adjust ordering so every intermediate batch remains buildable or explicitly identifies a coordinated breaking cutover. Do not delete a compatibility path before all in-scope consumers and metadata are ready unless the cutover is intentionally atomic.

Package ownership is not migration closure. Whenever an owner, public path, wire shape, factory, adapter, export, or compatibility surface will be replaced or removed, establish a closed module-reader inventory before making the route normative:

- name every legacy surface and symbol plus the exact source roots searched;
- enumerate every importing, re-exporting, constructing, calling, configuring, dynamically resolving, generated, fixture, and test module that reads it;
- for each reader record the actual edge, disposition (`MIGRATE`, `REMOVE`, or evidenced `RETAIN_COMPATIBILITY`), target owner, requirement/acceptance links, owning regression, and source evidence;
- list `symbols` as literal search patterns (identifiers, keys, paths, message text), never prose; scan the declared roots, treat every hit as a candidate, and give each candidate a disposition: a reader entry, or `dismissed_candidates: [{module, reason}]` for a comment, an unrelated homonym or a generated copy. Claim only that candidates are disposed, never that readers are proven exhaustive; `repo-facts.ts check` rejects undisposed candidates and prose symbols. Reader kinds without a text trace (dynamic resolution, configuration, generators) get their own discovery method, and Graphify or a symbol index may locate candidates but never proves completeness by itself;
- define a final universal architecture oracle that scans the declared source universe and proves every removed legacy surface has zero remaining readers, exports, and runtime lookup paths, using the same pattern set as the inventory.

The first decisive falsifier for a removal route is the reader inventory itself. A type-inference test, new API smoke, owner-package test, or package-level consumer list cannot prove module-level migration closure. Record the exact inventory method and result before implementation; if new readers appear, revise the migration DAG and workload before admission.

Derive batches from reader dependencies, not from the desired final atomic invariant. **Each reader's requirements and acceptance must fit inside one batch**: admission binds a reader to a single execution packet and requires that packet to cover it, so a reader whose requirements are split across two batches has no admissible packet at all (`MIGRATION_READER_BATCH_COVERAGE_INVALID` at `validate`, `MIGRATION_READER_PACKET_COVERAGE_INVALID` at admission). Either re-cut the batch or split the reader into the entries the batches actually deliver. The default staged shape is:

```text
new owner/contract → foundational readers → dependent attachment groups
→ exports and owning tests → zero-reader scan → legacy removal
```

Each reader belongs to a requirement and a bounded batch. The removal batch depends on every batch that migrates a reader of that surface. `COORDINATED_ATOMIC` is allowed only when current repository/release evidence proves no buildable or compatible intermediate state exists; record that evidence, the exact cutover boundary, and rollback. “The migration should be atomic” or a large reader count is not evidence. Atomicity describes the final externally visible invariant; it does not justify one unreviewable implementation packet.

Each batch should state prerequisites, owned scope, reader IDs, behavior proved, rollback or recovery path, relevant gates, and exit conditions. Share a broad gate only when the design basis proves that any failure within it can falsify or mask migration acceptance; otherwise keep package and consumer gates inside the causal boundary.

## Errors

Follow the repository's canonical error conventions when they exist. For changed failure behavior, specify trigger, public type/code/message contract, state effects, cleanup, aggregation, and preservation of the original error reference through `cause` or `AggregateError.errors` when wrapping is required.

Do not require an error registry or fixed file path in repositories that lack them. Intentional best-effort suppression is allowed only when its boundary, observability, and effect on the primary operation are explicit.

<!-- reading-receipt: ecbe9f4c -->
