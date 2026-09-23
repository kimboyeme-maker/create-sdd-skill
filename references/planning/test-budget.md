# Test budget

Load from [work decomposition](../work-decomposition.md) whenever a batch adds, changes or runs tests. Tests exist to falsify the batch's own acceptance; they are never a separate deliverable, a coverage campaign, or a way to turn an unrelated failing gate into scope.

## Declare the budget

Every `delivery_plan` batch declares `test_budget: {minutes, max_new_test_files}`:

- `minutes`: controller-measured Operator test execution the batch may spend, within the controller's limits (`configuration.limits.test_budget_max_minutes`, and a `configuration.limits.test_budget_max_share_divisor` share of `estimated_minutes`). Use `0` when the batch needs no Operator test run (for example a pure rename whose acceptance the Architect executes); its READY self-check then hands off on the candidate receipt alone.
- `max_new_test_files`: 0 by default; 1 only when the batch needs a genuinely new layer, runtime or isolation boundary that no existing host can express.

Derive the number from the batch's acceptance cases: for each, the cheapest existing command that observes it, its realistic runtime, and room for one rerun after a failure or a code change (a rerun is never a retry for flakiness). If the honest sum exceeds the cap, the batch is too large or the oracle is too broad: split the batch or narrow the method. Never raise the cap by moving work into another batch without moving its acceptance too.

Each acceptance `execution.timeout_seconds` stays within `configuration.limits.acceptance_timeout_max_seconds`. A case that cannot finish within that limit must be split into narrower claims or given a smaller environment; a long end-to-end journey is not an acceptable single case.

## Choose hosts before files

1. Reuse the nearest existing suite for the same business concept and layer.
2. Extend an existing fixture rather than creating a new harness.
3. Create a file only with a named reuse candidate that was rejected and a real `TEST_LAYER`, `RUNTIME`, `ISOLATION` or `REPOSITORY_MODULE` boundary. Name it for the behavior, never for a round, packet, attempt or fix.

## What validate enforces

`validate` enforces the budget and sprawl limits and is their single statement; do not restate them in an SDD.

## Gate failures outside the batch

A failing suite that cannot falsify or mask the batch's acceptance is recorded as scope-external observation in the delivery summary. It gets no budget, no new tests and no fixes inside the batch. If the user wants it fixed, that is a separate requirement with its own acceptance and batch.

## Contrast

- Bad: "Fix date parsing in billing" budgets 40 minutes and three new files to make the whole repository suite green.
- Good: the same batch budgets 5 minutes and no new file for one regression in the existing billing parser suite; the unrelated reporting failure is listed as scope-external.

<!-- reading-receipt: be966ef3 -->
