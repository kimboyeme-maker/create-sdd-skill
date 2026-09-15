# Work decomposition and delivery planning

Use this reference for every implementation-targeting SDD after the implementation logic is closed. It turns the closed design into lease-sized batches, a dependency DAG, parallel-safe lanes and final verification shards, and records them in the contract's `delivery_plan`. The plan is a projection of the requirement graph, not a second todo list: it carries no status, owner assignment or progress.

The sibling loop controller validates the plan (`validate` returns `deliveryPlan` with waves, lanes, serial minutes and critical path) and uses it for early Architect preparation, prepared packet checks that surface failures early, and concurrent final-verification shards. Batches with disjoint write sets are also the units a controller with concurrent Operator leases would run side by side; do not claim concurrent execution unless the installed controller's `capabilities` advertises it.

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
- fits one Operator lease: `estimated_minutes` between roughly 20 and 45, never above 60 (the controller rejects `DELIVERY_PLAN_BATCH_TOO_LARGE`);
- has one write set that the Operator can hold in context without re-discovery;
- has a strict `test_budget` (≤⌈estimate/3⌉ and ≤15 minutes, ≤1 new test file) derived from its own acceptance; see [test budget](planning/test-budget.md).

Cut along the implementation logic, not along files or layers. Invalid shapes: "all types", "all tests", "all docs", one batch per file, one batch per requirement by reflex, a test-only batch detached from its behavior. A migration keeps its reader DAG from [migration](migration.md): new owner → reader groups → exports and owning tests → zero-reader scan → removal.

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

Rules the controller enforces: unique batch IDs; known non-`non-goal` requirements; acceptance inside each batch's requirements; every delivered requirement and its acceptance covered; acyclic known dependencies; requirement order respected; no write overlap between unordered batches; 1–60 minutes per batch; a `test_budget` per batch within min(15, ⌈estimate/3⌉) minutes and at most one new test file; acceptance `timeout_seconds` ≤900; shards partition Must-Ship acceptance without cross-shard blocking edges.

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

<!-- reading-receipt: 9f77c6f2 -->
