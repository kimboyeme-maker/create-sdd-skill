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
| 2026-09-16 | migai / logger | PC01 | 15 min | 10.8 min | 0.72 | Two acceptance cases: one new case in an existing test host, one document row with its own comparison oracle. Delivered to SHIP across four contract revisions. `docs/logger/batch-overflow-coverage.sdd.md.retrospective.json`. |

One sample. It says a deliberately small batch came in under its estimate; it cannot say whether
that is a systematic bias or a property of a batch chosen to be small, which is exactly why one
sample is not calibration. Note also that this batch's elapsed time is dominated by evidence work —
readbacks, signed runs, two sensitivity flips — rather than by writing the thirty lines of product
change, so a lane median built from batches like it would mispredict a batch whose cost is the
code itself.

## Anti-patterns

- Copying an old plan's numbers without recomputing the work.
- Calibrating from one delivery or from batches shorter than five minutes.
- Inflating every estimate to the cap to avoid overruns; it destroys wave planning and credit budgets.

<!-- reading-receipt: ed7b1204 -->
