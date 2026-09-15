# Test budget

Load from [work decomposition](../work-decomposition.md) whenever a batch adds, changes or runs tests. Tests exist to falsify the batch's own acceptance; they are never a separate deliverable, a coverage campaign, or a way to turn an unrelated failing gate into scope.

## Declare the budget

Every `delivery_plan` batch declares `test_budget: {minutes, max_new_test_files}`:

- `minutes`: controller-measured Operator test execution the batch may spend, at most ⌈`estimated_minutes`/3⌉ and never above 15. Use `0` when the batch needs no Operator test run (for example a pure rename whose acceptance the Architect executes); its READY self-check then hands off on the candidate receipt alone.
- `max_new_test_files`: 0 by default; 1 only when the batch needs a genuinely new layer, runtime or isolation boundary that no existing host can express.

Derive the number from the batch's acceptance cases: for each, the cheapest existing command that observes it, its realistic runtime, and room for one rerun after a failure or a code change (a rerun is never a retry for flakiness). If the honest sum exceeds the cap, the batch is too large or the oracle is too broad: split the batch or narrow the method. Never raise the cap by moving work into another batch without moving its acceptance too.

Each acceptance `execution.timeout_seconds` is at most 900. A case that cannot finish within 15 minutes must be split into narrower claims or given a smaller environment; a long end-to-end journey is not an acceptable single case.

## Choose hosts before files

1. Reuse the nearest existing suite for the same business concept and layer.
2. Extend an existing fixture rather than creating a new harness.
3. Create a file only with a named reuse candidate that was rejected and a real `TEST_LAYER`, `RUNTIME`, `ISOLATION` or `REPOSITORY_MODULE` boundary. Name it for the behavior, never for a round, packet, attempt or fix.

## What the loop enforces

| Rule | Enforcement |
| --- | --- |
| Batch and packet budgets | `validate`/admission reject `…_TEST_BUDGET_TOO_LARGE`, `…_TEST_SPRAWL`, `…_TEST_BUDGET_INVALID` |
| No sprawl | an implementation creating more test files than allowed fails `TEST_SPRAWL_FORBIDDEN` |
| No gate-chasing | a test change proving acceptance outside the packet fails `TEST_CHANGE_SCOPE_INVALID` |
| Real timing | commands run through `test-run`, authorized before they start and killed at the acceptance timeout, the lease deadline or the remaining allowance; roles cannot self-report runs, and Architect checks must equal their measured runs |
| Bounded retries | a packet may spend twice its budget and a round twice the sum of all packet budgets, each measured separately; then `TEST_BUDGET_EXHAUSTED` requires escalation |
| Credit | each started test minute records one relative credit unit; the ledger observes by default and blocks only when the delivery chose `enforce` |

## Gate failures outside the batch

A failing suite that cannot falsify or mask the batch's acceptance is recorded as scope-external observation in the delivery summary. It gets no budget, no new tests and no fixes inside the batch. If the user wants it fixed, that is a separate requirement with its own acceptance and batch.

## Contrast

- Bad: "Fix date parsing in billing" budgets 40 minutes and three new files to make the whole repository suite green.
- Good: the same batch budgets 5 minutes and no new file for one regression in the existing billing parser suite; the unrelated reporting failure is listed as scope-external.

<!-- reading-receipt: 9cf72089 -->
