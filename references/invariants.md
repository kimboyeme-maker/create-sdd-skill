# Design invariants

Treat a design failure as a violation of one of these invariants and correct its cause instead of adding an incident-specific clause. Each invariant names where its operational rule lives.

1. **Problem truth:** evidence establishes the current behavior and gap, or the greenfield need, before a solution becomes normative. [Design basis](phases/2-admit.md#design-basis)
2. **Single authority:** each semantic invariant and product decision has one accountable owner; projections and adapters never become parallel truth. [Ownership](phases/3-design.md#ownership-and-boundaries)
3. **Causal closure:** scope and acceptance stop at the owned delta and demonstrably affected consumers; permission to observe a package never grants permission to modify it. [Gates](phases/4-verify.md#observed-packages-and-delivery-gates)
4. **Proportionality:** the smallest conventional route that satisfies the observable outcome; complexity, compatibility layers, new primitives and broad gates need evidence. [Delivery priorities](../SKILL.md#delivery-priorities)
5. **Falsifiable evidence:** every material choice names its evidence and the cheapest check that could disprove it; a guard-backed claim proves its oracle flips when the guard is bypassed; a rule that blocks a route names the nearest fact that would make the route valid, and one incident never becomes a universal rule without a minimal contrast. [Probes](phases/2-admit.md#run-decisive-probes-now), [oracle sensitivity](phases/4-verify.md#oracle-sensitivity-for-guards), [behavior evaluation](behavior-evaluation.md)
6. **One work graph:** the SDD owns requirements, dependencies, acceptance and batches; runtime packets are a lossless projection. [Work decomposition](work-decomposition.md)
7. **Decision closure:** every known Must-Ship choice about public contracts, ownership, dependency direction, breaking behavior or user authority is resolved before implementation or is an explicit decision requirement. [Decision authority](design/decision-authority.md)
8. **Artifact custody:** every protected artifact has one executable generator → signer → installer → verifier chain. [Artifacts](design/artifacts-and-dependencies.md#artifact-custody)
9. **Context economy:** the SDD is the single contract; agent reading is a derived routing view that copies nothing. [Agent Context map](design/agent-context-map.md)
10. **Execution compatibility:** loop readiness needs a compatible installed controller as well as a closed contract; controller mechanics and limits stay in the controller's configuration, never become product requirements, and a pipeline incident invalidates runtime readiness, not the design. [Loop-ready](loop-ready.md#control-plane-compatibility-receipt)
11. **Evidence continuity:** a continuation carries every unresolved predecessor obligation until it has a disposition; only an unfinished delivery is a predecessor. [Continuation lineage](design/continuation-lineage.md)
12. **Test topology convergence:** tests follow stable behavior, module and runtime boundaries, never delivery history. [Test hosts](phases/4-verify.md#test-hosts-and-names)
13. **Incremental integrity:** revise in place, preserving IDs, decisions and routing; files are locations, not owners. [Incremental revision](phases/3-design.md#incremental-revision)
14. **Design-time proof:** the author closes the implementation logic and grounds key decisions about external capabilities with inspectable evidence at the material version and runtime; Coordinator independently reconstructs it; a derivable blocker is a design omission. There is no universal install, compile or consumer-execution obligation, and tools are chosen by exact responsibility rather than familiarity. [Admission](phases/2-admit.md#close-the-implementation-logic)
15. **Semantic fidelity:** a user constraint is normalized without strengthening it. [Constraints](phases/2-admit.md#normalize-constraints-without-strengthening-them)
16. **Propagation closure:** work on anything a shared mechanism manages is classified by its effects, not by the command name, and closes every manager and write point along the authority chain. [Dependency operations](design/artifacts-and-dependencies.md#dependency-operations)
17. **Inventory/environment separation:** source inventory stays authoritative without installed dependencies; runtime resolution is fingerprint-bound and drift is inconclusive, not product failure. [Inventory authorities](design/artifacts-and-dependencies.md#source-inventory-and-runtime-resolution)
18. **Promise–branch traceability:** every stated guarantee is a branch in a step and an observed acceptance. [Design card](phases/3-design.md#asynchronous-work-and-context-bound-resources)
19. **Irreversible-state safety:** destructive steps follow confirmed commits, and unrecognized data is preserved. [Design card](phases/3-design.md#irreversible-state-changes)

<!-- reading-receipt: 8d1d1774 -->
