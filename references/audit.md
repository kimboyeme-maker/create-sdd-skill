# SDD audit

An audit request does not authorize source or document edits unless the user also asks for fixes.

## Depth

- **Document-only:** internal consistency, completeness, ownership, dependency direction, ambiguity, testability and unresolved decisions; implementation state is unknown.
- **Implementation:** additionally source, tests, exports, dependencies, consumers, generated artifacts and reproducible commands.
- **Closure:** additionally reconcile every normative clause and deferred item against current evidence with [closure evidence](closure-evidence.md).

Do not silently escalate from document-only to a repository-wide implementation audit.

## Checks

Apply the exit gates of [phase 1](phases/1-harvest.md#exit-gate), [phase 2](phases/2-admit.md#exit-gate), [phase 3](phases/3-design.md#exit-gate) and [phase 4](phases/4-verify.md#exit-gate), the rules of [work decomposition](work-decomposition.md), and for loop-ready documents the checks in [loop-ready](loop-ready.md) plus the controller's `validate`. Then check what only an audit sees:

- statuses claim no more maturity than evidence supports; tests and evidence prove behavior rather than mention IDs;
- deferred items keep destination, trigger, owner and acceptance impact;
- post-approval amendments did not add or remove packages, requirements, oracles or outcomes without explicit user approval, and did not legitimize already-expanded work;
- no side list, batch table or packet set duplicates the requirement and acceptance graph as a second authority;
- every proposed user authorization has a non-empty authority-effect delta; custody authority is bound to the artifact envelope, not to attempt counters;
- controller, capability, dispatch and sidecar recovery mechanics are not product requirements, acceptance cases or product blockers;
- docs, exports, package metadata, lockfiles, registries and consumers agree where inspected.

## Finding format

Order by consequence. **High:** incorrect implementation, unsafe migration, reverse dependency, data loss, security failure or false completion. **Medium:** incomplete, ambiguous, untestable or likely to drift. **Low:** maintainability, organization or evidence-quality weakness. Each finding names location, problem, consequence and a specific correction, and separates confirmed defects from unknowns and optional improvements.

<!-- reading-receipt: 0f45611b -->
