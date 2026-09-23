# Work decomposition and delivery planning

Use this reference for every implementation-targeting SDD after the implementation logic is closed. It turns the closed design into lease-sized batches, a dependency DAG, parallel-safe lanes and final verification shards, and records them in the contract's `delivery_plan`. The plan is a projection of the requirement graph, not a second todo list: it carries no status, owner assignment or progress.

This skill's validator checks the plan (`validate` returns `deliveryPlan` with waves, lanes, serial minutes and critical path) and uses it for early Architect preparation, prepared packet checks that surface failures early, and concurrent final-verification shards. Batches with disjoint write sets are also the units a controller with concurrent Operator leases would run side by side; do not claim concurrent execution unless the installed controller's `capabilities` advertises it.

## Inputs

- The closed `implementation_logic` paths and their `BZ` steps (requires/produces).
- Requirements with dependencies and acceptance cases with `packages` and `execution`.
- The [harvest card](phases/1-harvest.md)'s `WRITE_SET` and `EFFORT` rows, including serialization points.

## Step 1: write-set inventory

For every step record `writes` (package roots or exact files it changes), `reads` (inputs it depends on) and whether it touches a serialization point: lockfiles, root build/tool configuration, barrel or index exports, generated registries, database schema or migration directories, shared fixtures. A serialization point belongs to exactly one batch per wave; two unordered batches must never both write it.

Prefer package roots as write sets. Use an exact file only when two batches legitimately evolve different files inside one package and neither reads the other's result.

## Step 2: cut batches

A batch is the smallest unit that:

- produces one externally observable outcome linked to its requirement and acceptance IDs;
- closes its own acceptance, or is an explicit producer for a later batch that closes it;
- fits one Operator lease: `estimated_minutes` roughly 20–45 and at most `configuration.limits.max_batch_minutes` (`DELIVERY_PLAN_BATCH_TOO_LARGE` otherwise);
- has one write set that the Operator can hold in context without re-discovery;
- has a strict `test_budget` derived from its own acceptance; see [test budget](planning/test-budget.md).

Cut along the implementation logic, not along files or layers. Invalid shapes: "all types", "all tests", "all docs", one batch per file, one batch per requirement by reflex, a test-only batch detached from its behavior. A migration keeps its reader DAG from [migration](migration.md): new owner → reader groups → exports and owning tests → zero-reader scan → removal.

### Cut the batches and the paths together

An `implementation_logic` path's acceptance may only be verified in a batch that lands after every batch carrying that path's own requirements **and** after every batch carrying the requirements of each path it consumes. A path whose requirements are spread over several batches therefore drags all of its acceptance behind the last of them, and the first acceptance that was supposed to close earlier is rejected as `IMPLEMENTATION_LOGIC_ACCEPTANCE_BEFORE_PRODUCER`.

The shape that follows from this is one path per batch: the path's requirement set equals the batch's, its steps are the batch's work, and the cross-path inputs mirror the batch's `depends_on`. Cut them in the same pass rather than writing the paths first and discovering the ordering later — a path drawn per package or per theme, spanning three batches, has to be re-cut, and the steps move with it. Two batches may share a path only when neither closes acceptance before the other lands, which in practice means they are one batch.

Estimate honestly from drivers, and write the basis in the human Delivery & Verification section: files and public signatures touched, new or migrated readers, new test hosts, probes to rerun, and review surface. Round up for unfamiliar code or cross-package edits. An estimate is planning evidence, never progress.

### Slice vertically, migrate by expand–contract

- Prefer vertical slices: each batch delivers one observable behavior through every layer it needs (schema, core, adapter, UI, acceptance) and can be demonstrated alone. Horizontal batches ("all models", "all endpoints") are allowed only for a foundation that later slices consume, such as tokens, a core API or a schema.
- A wide replacement follows expand–contract: add the new form beside the old, migrate consumers in bounded batches, then remove the old form in a final batch. Each intermediate state is valid and named in Breaking Changes.
- Refactoring that a slice depends on (prefactoring) is its own earlier batch with behavior-preserving acceptance.

## Step 3–4: dependencies, conflicts, lanes and waves

With two or more batches, load [conflicts and lanes](planning/conflicts-and-lanes.md).

## Step 5: verification planning

Load [verification planning](planning/verification-planning.md) for packet checks and final verification shards.

## Step 6: record and evaluate

For an approved multi-SDD design, apply [program split](planning/program-split.md): map requirements to Modules, these batches to Chunks, each execution SDD to one Bundle, and explicit output paths to Assets. Keep parent/group coordination separate from execution ownership; include each SDD's own estimate and the wave-to-task handoff. The program's total test allocation is shared, never copied into each child or reset by integration. Run each leaf's normal checks; do not claim source-level independence from declared paths alone.

Add the plan beside `implementation_logic` in the contract:

```json
"delivery_plan": {
  "protocol": "delivery-plan/v1",
  "batches": [
    {"id": "PC01", "lane": "core", "requirement_ids": ["XQ01"], "acceptance_ids": ["YS01"],
     "modification_packages": ["packages/core"], "depends_on": [], "estimated_minutes": 30,
     "test_budget": {"minutes": 8, "max_new_test_files": 0}},
    {"id": "PC02", "lane": "web", "requirement_ids": ["XQ02"], "acceptance_ids": ["YS02"],
     "modification_packages": ["apps/web"], "depends_on": [], "estimated_minutes": 40,
     "test_budget": {"minutes": 10, "max_new_test_files": 1}},
    {"id": "PC03", "lane": "core", "requirement_ids": ["XQ03"], "acceptance_ids": ["YS03"],
     "modification_packages": ["packages/core"], "depends_on": ["PC01"], "estimated_minutes": 25,
     "test_budget": {"minutes": 5, "max_new_test_files": 0}}
  ],
  "final_verification_shards": [
    {"id": "FV01", "acceptance_ids": ["YS01", "YS03"]},
    {"id": "FV02", "acceptance_ids": ["YS02"]}
  ]
}
```

`validate-draft` checks the plan's structure (coverage, dependencies, write overlap, size and budget limits, shard partition) and names each violation by code. Author judgment covers what it cannot: whether a cut follows the implementation logic and whether an estimate is honest.

When earlier deliveries left retrospectives, calibrate estimates first with [estimate calibration](planning/estimate-calibration.md) and record the ratio used.

Run `validate` and read `deliveryPlan`. Report waves, lanes, serial minutes and critical path in the design summary, plus the serialization points you hoisted. Reuse the batch IDs for the human delivery table's batch rows and for Coordinator's `execution_packets`; a packet reusing a batch ID must stay within that batch's requirements and `modification_packages`.

## Exit gate

- [ ] The contract block is drafted and `validate-draft` reports no diagnostics, even when the SDD stays `in-review`.
- [ ] Every document this phase loaded is listed in the SDD's authoring receipt with its current token.

## Anti-patterns

- Declaring parallel lanes whose batches both edit a barrel export, lockfile or root config.
- Estimating every batch at the maximum to avoid thinking about size, or at the minimum to look parallel.
- Using lanes as ownership or assignment; lanes carry no runtime identity.
- Adding shards that split one browser journey or shared fixture across Architects.
- Treating the plan as a promise that concurrent Operators exist in the current controller.

<!-- reading-receipt: 3371cad3 -->
