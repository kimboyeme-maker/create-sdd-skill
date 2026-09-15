# Program split: several SDDs in parallel threads

Use this reference when a requested change is wide enough that one SDD would carry several independent delivery streams. It decides whether to split, and if so produces one foundation SDD, parallel child SDDs and one integration SDD. Each is a normal loop-ready SDD run by its own `sdd-loop-delivery` controller in its own thread and git worktree. Splitting buys wall-clock time with extra credit; it is justified only when both the independence and the saving are real.

## When to consider it

Evaluate after [harvest card](../phases/1-harvest.md) pass 4 and a draft [work decomposition](../work-decomposition.md). Candidates appear when the ledger and draft plan show several groups of batches whose owners, write sets and acceptance do not touch, each with several batches of its own.

## Decision test

Split only when every condition holds for each proposed child:

1. **Disjoint ownership and write sets.** No shared semantic owner, state, lockfile, root configuration, barrel export, generated registry or schema; any such shared edit can be hoisted into the foundation SDD and finished first.
2. **Freezable interfaces.** Every interaction between children is an interface (signature, type, wire/data shape, event, route) that the foundation SDD can define and ship before children start, with no expected co-evolution.
3. **Independently observable acceptance.** Each child's Must-Ship acceptance is observable inside the child's packages against the frozen interface. Only genuinely cross-child behavior waits for integration.
4. **Worth the overhead.** Each child SDD pays fixed costs: a resident Coordinator, design convergence, admission, final verification, integration merge. Compare the program critical path (foundation + slowest child + integration) with the single-SDD critical path from `validate`. Split only when the saving is material and each child carries several batches; a child with one small batch stays in the parent plan.
5. **Authority closed up front.** All user decisions that affect more than one child are collected and resolved once, before children start.

Keep one SDD when any condition fails, for example: two streams mutate one state owner; a public contract must evolve on both sides together; the only meaningful acceptance is end-to-end; the work is a single serial chain; or children would be one batch each. Name the failing condition in the design summary instead of splitting.

## Structure

```text
Foundation SDD (serial, first)
  frozen interfaces + hoisted shared edits + acceptance that consumers compile/use the interface
      ↓ SHIP
Child SDD A ─┐
Child SDD B  ├─ each: own git worktree/branch from the foundation SHIP commit, own thread, own controller
Child SDD C ─┘   each: own delivery_plan, test budgets, preparation overlap
      ↓ all SHIP
Integration SDD
  merge children, resolve conflicts inside declared glue packages, run cross-child acceptance
```

- **Foundation:** `lineage.mode: fresh`. Its interface sections are normative for all children. Acceptance proves the interface exists and is consumable, not the children's behavior.
- **Children:** `lineage.mode: fresh`, with the foundation SDD and its SHIP evidence in `lineage.basis` (a shipped authority is context, not a delivery predecessor). The first early falsifier checks that the frozen interface revision is present in the child's worktree. Modification authority excludes foundation-owned interface files.
- **Integration:** `lineage.mode: continuation` with every child as `delivery-predecessor`, so unresolved child obligations carry forward. Modification authority is limited to declared glue packages and merge resolution; acceptance covers only cross-child behavior plus a regression of each child's final shard.

## Program plan document

Record the split in one `<name>.program.md` beside the SDDs. It is routing and planning metadata, not a contract; every normative clause lives in exactly one SDD.

| ID | description | role | sdd | owner_packages | write_set | depends_on | worktree | estimated_minutes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PG01 | Freeze session interfaces and shared exports | FOUNDATION | docs/session-foundation.sdd.md | packages/session-api | packages/session-api | | main | 45 |
| PG02 | Move storage onto the frozen interface | CHILD | docs/session-storage.sdd.md | packages/storage | packages/storage | PG01 | wt/session-storage | 120 |
| PG03 | Render session state in the web app | CHILD | docs/session-web.sdd.md | apps/web | apps/web | PG01 | wt/session-web | 90 |
| PG04 | Integrate and verify end-to-end sessions | INTEGRATION | docs/session-integration.sdd.md | apps/web, packages/storage | apps/web/src/session-glue | PG02, PG03 | main | 40 |

Apply the same write-set rule as a delivery plan: children without a dependency path must not share a write set. Report program serial minutes, program critical path and the single-SDD critical path they replace.

## Running the program

- Create each child worktree from the foundation SHIP commit. Keep each SDD file and its controller sidecars inside that SDD's own worktree; the controller rejects another SDD's state with `WORKTREE_FOREIGN_CONTROLLER_STATE`.
- Start each child in its own thread with its own Coordinator. Respect the host thread limit; queue children rather than oversubscribing.
- **Interface change:** stop affected children at safe checkpoints, amend the foundation SDD under a new revision and ship it, then amend each affected child. Never patch a frozen interface locally inside a child.
- Merge only SHIPped children into the integration worktree. A merge conflict outside the declared glue packages is a design defect of the split: record it and amend the owning child or foundation instead of widening integration authority.

## Anti-patterns

- Splitting by layer (API SDD, UI SDD, tests SDD) when every feature crosses all layers.
- Children that "coordinate" an interface during implementation instead of receiving it frozen.
- Putting several SDDs' sidecars in one worktree.
- Treating the program plan as progress tracking or a second requirement graph.
- Splitting small work because parallelism sounds faster; the fixed per-SDD cost dominates.

<!-- reading-receipt: 1a53b1bc -->
