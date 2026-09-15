# Verification planning

Load from [work decomposition](../work-decomposition.md) when batches need prepared packet checks or the Must-Ship acceptance needs final verification shards.

## Step 5: verification planning

- Keep each acceptance case's `packages` to the packages its oracle actually observes and name the inputs it depends on (lockfiles, tool configuration). A prepared Architect measures packet checks early; a measured check bound to those complete inputs is reused in round verification while the inputs stay identical, so tight observation sets save reruns.
- For each batch name the acceptance a prepared Architect can check right after that batch lands, and any baseline observation worth taking on the frozen baseline (oracle sensitivity "before" results).
- `final_verification_shards` partition all Must-Ship acceptance for final verification. Put acceptance cases that share mutable state or declare `blocking_acceptance_ids` between them in the same shard (the controller rejects `DELIVERY_PLAN_SHARD_BLOCKING_EDGE`). Size each shard to one Architect lease (about 20–40 minutes).

<!-- reading-receipt: f0990927 -->
