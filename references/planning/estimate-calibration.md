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

## Anti-patterns

- Copying an old plan's numbers without recomputing the work.
- Calibrating from one delivery or from batches shorter than five minutes.
- Inflating every estimate to the cap to avoid overruns; it destroys wave planning and credit budgets.

<!-- reading-receipt: ffe57b88 -->
