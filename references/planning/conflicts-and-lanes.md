# Conflicts, lanes and waves

Load from [work decomposition](../work-decomposition.md) whenever the plan has two or more batches.

## Step 3: dependencies and conflict removal

1. Every requirement dependency satisfied by another batch becomes a batch dependency (`depends_on`); the controller rejects `DELIVERY_PLAN_REQUIREMENT_ORDER_INVALID` otherwise.
2. For every pair of batches without a dependency path, compare write sets. Roots overlap when equal, nested, or either is `.`. An overlap is `DELIVERY_PLAN_WRITE_CONFLICT`. Resolve it by, in order of preference:
   - **Hoist:** move the shared edit (export, config, lockfile, schema) into a small foundation batch both depend on.
   - **Narrow:** split the write set so each batch owns distinct roots or files.
   - **Serialize:** add a dependency when the edits are genuinely sequential.
3. Never widen `modification_packages` or merge batches merely to silence a conflict; that hides a real serialization point.

## Step 4: lanes and waves

A lane groups sequential batches that benefit from one runtime's retained understanding (same owner, same code area). Lanes express affinity only; safety comes from Step 3. Waves are computed: wave 0 has no dependencies, wave n depends only on earlier waves. The critical path is the longest chain of estimated minutes.

Target a critical path clearly below the serial total. When they are nearly equal, look for a hoistable shared edit or an over-broad write set before accepting a fully serial plan. A serial plan is valid when the work is genuinely sequential; say so instead of inventing parallelism.

<!-- reading-receipt: 0fc29a70 -->
