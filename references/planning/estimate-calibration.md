# Estimate calibration

Load from [work decomposition](../work-decomposition.md) when earlier deliveries of the same repository or team left loop retrospectives. Estimates are hypotheses; retrospectives measure them.

## Source

- Each loop delivery writes `<SDD>.retrospective.json` at SHIP or BLOCKED. Its `metrics.estimates` lists, per `delivery_plan` batch, `estimated_minutes`, the elapsed minutes of Operator leases for that batch ID, and their `ratio`. Batches whose ratio falls outside 0.5–1.5 also appear as `ESTIMATE_MISS` issues.
- `bun <loop-skill-root>/scripts/main.ts evolution-digest --retrospective-files a.json,b.json` returns `estimate_calibration`: sample count and median ratio overall and per lane.
- Elapsed lease time includes reading, waiting on commands and repair inside the lease. That is the time the next plan must budget.

## Apply

1. Use calibration only with at least three samples for the lane, or five overall; otherwise estimate from first principles and state that no calibration applied.
2. Estimate each batch from its work first (logic steps, files, probes, acceptance runtime), then multiply by the lane's median ratio, or the overall median when the lane has too few samples.
3. A calibrated estimate above 60 minutes means the batch must be split, not that the cap should move. Recompute `test_budget` from the calibrated estimate.
4. Record the basis in the Delivery & Verification section: raw estimate, ratio, sample count and the digest files used.
5. A lane with a median ratio above 1.5 signals a decomposition problem (hidden prerequisites, broad write sets, slow test hosts). Name its cause in the design basis before scaling numbers.

## Observed samples

Not yet calibration. This ledger exists so the third sample can be recognised as the third, rather
than the first one anybody remembered. Do not multiply an estimate by anything here until the rules
in **Apply** are satisfied.

| Date | Repository / lane | Batch | Estimated | Actual | Ratio | Note |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-16 | migai / logger | PC01 | 15 min | 10.8 min | 0.72 | Two acceptance cases: one new case in an existing test host, one document row with its own comparison oracle. `docs/logger/batch-overflow-coverage.sdd.md.retrospective.json`. |
| 2026-09-21 | migai / utils | PC01 | 40 min | 12.2 min | 0.30 | `docs/utils/shared-boundary-primitives.sdd.md.retrospective.json`. |
| 2026-09-21 | migai / event-subscriber | PC02 | 30 min | 2.1 min | 0.07 | Same delivery. A type-only edge with no product logic. |
| 2026-09-21 | migai / event-subscriber | PC03 | 50 min | 21 min | 0.42 | Same delivery. The largest batch of the six and still under half its estimate. |
| 2026-09-21 | migai / middleware-pipeline | PC04 | 30 min | 7.6 min | 0.25 | Same delivery. |
| 2026-09-21 | migai / utils | PC05 | 25 min | 3.4 min | 0.14 | Same delivery. |

Six samples across two deliveries, every one of them under estimate, with a median ratio near 0.28.
Read that as a statement about the estimator, not about the work: estimates here are being set two to
four times higher than the lease actually needs, and the four lowest ratios are all boundary or
type-level batches whose cost was decided by reading rather than by writing.

It is still not calibration under **Apply**: no lane has three samples, and the overall five is met
by one delivery of five batches, which is one observation of one estimator on one day, not five
independent ones. What it does support is a named suspicion — that batches whose work is reading and
evidence get padded like batches whose work is code — which the next delivery can confirm or kill.

These rows were read out of `sdd-loop-delivery` retrospectives by an `rsi.ts ingest` command that
has since been retired with the loop: new sdd/v2 work reports through `validate --evidence`, and
defects reach the skill through `rsi/observed-defects.md`. The rows stay as history for v1 plans.

## Anti-patterns

- Copying an old plan's numbers without recomputing the work.
- Calibrating from one delivery or from batches shorter than five minutes.
- Inflating every estimate to the cap to avoid overruns; it destroys wave planning and credit budgets.

<!-- reading-receipt: 9acc66fe -->
