# Migration Design

Read this reference only for migrations.

## Establish the compatibility contract

Inventory current public behavior and decide explicitly what must remain compatible: exports, wire/data formats, call order, disposal order, error type/code/cause, messages, Promise identity, cancellation reason, persistence, or performance. Do not assume every implementation detail is public. Record intentional behavior changes separately.

**Every item on that list names the acceptance case that observes it.** A compatibility promise with no oracle is the cheapest sentence in the document and the one most likely to be false: it is written early, it reads as a summary of intent, and nothing ever executes it. A delivery whose whole suite was green shipped a broken identity promise for exactly this reason — the promise lived in the compatibility contract, the migration's own steps quietly specified the replacement, and no case in the plan ever compared the two.

Two read-backs close it, and both are cheap:

- **Contract against steps.** For each promised item, find the step that touches it and check the step actually preserves it. A row promising that an error's identity survives, sitting beside pseudocode that constructs a new error with the original on `cause`, is a contradiction the document states about itself — and prose and pseudocode are reviewed at different moments, which is why it survives.
- **Contract against acceptance.** For each promised item, name the case. If none exists, either add one or move the item to the intentional-change list with its own clause. "Covered by the existing suite" is not an answer unless a named case observes that property; a suite that passes on both the old and the new behaviour observes something else.

Identity, native type and `cause` reachability are three different promises. A wrapper that puts the original on `cause` keeps the third and breaks the first two, and only a case that asserts `thrown === original` can tell them apart.

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
- list `symbols` as literal search patterns (identifiers, keys, paths, message text), never prose; scan the declared roots, treat every hit as a candidate, and give each candidate a disposition: a reader entry, or `dismissed_candidates: [{module, reason}]` for a comment, an unrelated homonym or a generated copy. Dismissal is **per module, not per line**: a module listed in `readers` may not also appear in `dismissed_candidates` (`MIGRATION_DISMISSED_CANDIDATE_IS_READER`), so a real reader that happens to also mention an unrelated homonym elsewhere in the file stays a reader, and the homonym is explained in the human inventory prose instead. Claim only that candidates are disposed, never that readers are proven exhaustive; `repo-facts.ts check` rejects undisposed candidates and prose symbols — and it reads the repository, so it will name a reader the hand-written inventory missed. Treat that as the inventory's first falsifier doing its job, not as a formatting complaint. Reader kinds without a text trace (dynamic resolution, configuration, generators) get their own discovery method, and Graphify or a symbol index may locate candidates but never proves completeness by itself;
- define a final universal architecture oracle that scans the declared source universe and proves every removed legacy surface has zero remaining readers, exports, and runtime lookup paths, using the same pattern set as the inventory.

The first decisive falsifier for a removal route is the reader inventory itself. A type-inference test, new API smoke, owner-package test, or package-level consumer list cannot prove module-level migration closure. Record the exact inventory method and result before implementation; if new readers appear, revise the migration DAG and workload before admission.

Derive batches from reader dependencies, not from the desired final atomic invariant. **Each reader's requirements and acceptance must fit inside one batch**: admission binds a reader to a single execution packet and requires that packet to cover it, so a reader whose requirements are split across two batches has no admissible packet at all (`MIGRATION_READER_BATCH_COVERAGE_INVALID` at `validate`, `MIGRATION_READER_PACKET_COVERAGE_INVALID` at admission).

One module is one reader entry — `readers[].module` is unique and a second entry for the same path is `MIGRATION_READER_MODULE_DUPLICATE` — so a module that reads two legacy surfaces cannot be split into one entry per surface. When its requirements land in different batches, there are two ways out, and which one applies is a fact about the module, not a preference:

- The module only needs editing for one of the surfaces, because the other edge is `RETAIN_COMPATIBILITY` and its symbol keeps its name. Then the entry lists both `legacy_surface_ids` but names only the requirements and acceptance of the edge that is actually changing, and its `edge` text says which edge needs no change. Nothing is hidden: the retained edge is still inventoried, still linked to its surface, and still covered by that surface's own migrating reader.
- The module genuinely has to change for both. Then re-cut the batches so both land together, and if that batch exceeds the lease size, the cut was wrong further up — split by surface earlier so each batch owns one of them end to end.

The default staged shape is:

```text
new owner/contract → foundational readers → dependent attachment groups
→ exports and owning tests → zero-reader scan → legacy removal
```

Each reader belongs to a requirement and a bounded batch. The removal batch depends on every batch that migrates a reader of that surface. `COORDINATED_ATOMIC` is allowed only when current repository/release evidence proves no buildable or compatible intermediate state exists; record that evidence, the exact cutover boundary, and rollback. “The migration should be atomic” or a large reader count is not evidence. Atomicity describes the final externally visible invariant; it does not justify one unreviewable implementation packet.

Each batch should state prerequisites, owned scope, reader IDs, behavior proved, rollback or recovery path, relevant gates, and exit conditions. Share a broad gate only when the design basis proves that any failure within it can falsify or mask migration acceptance; otherwise keep package and consumer gates inside the causal boundary.

## Dispose of the expressions, not only the readers

The reader inventory asks "who touches this surface?" and disposes of every hit. Nothing asks the same question of the expressions the migration rewrites, and that is where a behaviour-equivalent migration actually breaks: the reader list is complete, every module is migrated, and one predicate inside one of them now answers differently.

Give every replaced expression a disposition the same way, in the step that replaces it:

```text
Incumbent form | Proposed form | Reachable value set | Witness or why none exists | Distinction preserved?
```

- **Reachable value set** is what the surrounding code can produce here, not the declared type. A counter whose guard admits values past a boundary reaches all of them.
- **Witness** is one value where the two forms differ. Search for it before claiming equivalence; a found witness means the claim is false and the step changes. Only when none can be constructed does the row close, and it says what made it impossible.
- **Distinction preserved** answers the merge case. Two occurrences of one literal, two rejection reasons collapsed into one result, two error constructions replaced by one factory: write down what each incumbent form meant and confirm the proposed form still means both. A number shared by *am I past the boundary* and *am I the frame at the boundary* is two predicates, and unifying "the constant" deletes one of them while the diff reads as a rename.

A row whose witness search was never run is an open universal claim; see [the admission card](phases/2-admit.md#an-equivalence-claim-is-falsified-on-its-value-set-not-read-off-the-two-expressions) for the executed form, and prefer a differential fixture over a reading whenever the incumbent can be run.

## Errors

Follow the repository's canonical error conventions when they exist. For changed failure behavior, specify trigger, public type/code/message contract, state effects, cleanup, aggregation, and preservation of the original error reference through `cause` or `AggregateError.errors` when wrapping is required.

Routing an existing throw site through a new helper is a replaced expression, so it gets a row above. Thrown-value **identity** is part of what behaviour-equivalence means and is the part a wrapper silently loses: a call that attached a code to the original object and a call that constructs a new error with the original on `cause` both satisfy "the original stays reachable", and only the first keeps `thrown === original` and the original's native type. When a shared validator collapses several failure causes into one result, check the mapping is onto the incumbent's: an incumbent that constructed a new error for one cause and preserved the object for another is not reproduced by a call site that treats every cause the same way.

Do not require an error registry or fixed file path in repositories that lack them. Intentional best-effort suppression is allowed only when its boundary, observability, and effect on the primary operation are explicit.

<!-- reading-receipt: 7c55dae4 -->
