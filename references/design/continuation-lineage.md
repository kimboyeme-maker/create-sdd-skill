# Continuation lineage

Load only when the SDD continues an unfinished predecessor delivery.

## Successor evidence

For a successor, first prove every predecessor controller is terminal with no active lease, then read its SDD, public state, and event log before rewriting any acceptance. Treat every non-PASS verification check not superseded by an equivalent later PASS, the latest non-PASS Operator self-check, unresolved route escalation, open P0-P2 finding, pending decision, and terminal product blocker as an inherited obligation. Preserve each failed check's own packages and acceptance IDs; never substitute the implementation-level `changed_packages`. Preserve its predecessor acceptance oracle, method, environment, and packages: changing those semantics is a user-authorized contract change, not a way to make the old failure disappear. Preserve an authenticated finding's exact affected packages and requirement/acceptance links; do not widen it to every owner package. A pure `COORDINATOR_AUTHORITY_UNRECOVERABLE` event is control-plane history, not a product-route fact, though any independent product evidence recorded before it remains inherited. A proposed route is infeasible when an inherited failing package remains in a named acceptance surface but no admitted role may modify it and no current rerun proves it green. Do not use tool availability, script discovery, configuration presence, or a planned command as evidence that the acceptance route itself works.

<!-- reading-receipt: e8aa5fb1 -->
