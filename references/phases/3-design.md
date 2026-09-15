# Phase 3 · Ownership, boundaries and the canonical design

Load after the route is admitted. Write the design with the [complete design template](../complete-design.md); this card decides what that template must contain.

## Ownership and boundaries

State the owning package or layer, public boundary, dependency direction, consumers, reused abstractions, non-goals, prerequisites and cross-document relationships. Cross-package work may use one or several SDDs following repository ownership; do not duplicate detailed contracts.

Close ownership by semantic subject, not by clause or file. One lifecycle state, identity, mutation authority, registry, counter, resource set, cache truth or protocol decision has exactly one authoritative owner across the whole SDD. Every other participant is a delegate, derived projection or observer; a derived projection states its source, update or invalidation rule and lifecycle. Mutation entry points delegate to the owner. When more than one requirement, layer or package touches one subject, add one ledger:

```text
ID | description | Subject/invariant | Authoritative owner | Delegates/derived views | Canonical primitive | Requirement/batch refs | Evidence
```

Name the first column `ID`, not `Semantic ID`: only a column named exactly `ID` makes the row an identifier definition, so any other spelling silently exempts the ledger from ID uniqueness and prefix checks. Its IDs use a two-letter prefix outside the controller's defaults, registered in `presentation.prefixes` before the first row ([document presentation](../document-presentation.md)); `SDD_ID_OR_PREFIX_INVALID` names an unregistered one.

A new helper or primitive needs targeted negative evidence that no compatible canonical owner exists. An unresolved competing owner keeps the SDD `in-review`. Protected artifacts close their custody chain with [artifacts and dependencies](../design/artifacts-and-dependencies.md).

## Status, IDs and derivable batches

- Document status `draft | in-review | approved | superseded`; clause status `pending | red | implemented | verified | documentation-only | deferred | blocked`; evidence quality `current | stale | indirect | missing | environment-failed`. An SDD may be `approved` before implementation; `complete` is used only under repository-defined closure. Deferred work names owner (or `unassigned`), destination, trigger and acceptance impact.
- Follow the repository ID scheme, otherwise [document presentation](../document-presentation.md); preserve existing IDs and record aliases on merge.
- Each delivery batch must be derivable into one execution packet: one observable outcome, requirement and acceptance IDs, prerequisites, causal scope, write packages and stop conditions. Keep runtime owner, status, progress, blockers and assignment out of the SDD.
- A file may receive several ordered operations from several requirements or batches. That is valid when dependencies order them, one semantic owner remains, and the final state is coherent; reject only unordered incompatible writes, competing owners, contradictory final states or orphan operations.
- A Must-Ship authority choice uses `requirement_type: "decision"` with `decision` metadata (authority, question, `pending | resolved`, and resolution plus evidence when resolved); dependent requirements list its ID.
- Execution-role feasibility (generator, signer, installer or verifier assignment, ephemeral key rotation, bounded local reinstall inside the approved artifact envelope) belongs to the design and Coordinator, not the user, unless it independently crosses an authority boundary.

## Canonical design content

Specify observable contracts, ownership, state transitions, failure behavior, concurrency, cancellation and deadlines, cleanup order, idempotency, rollback, isolation, compatibility, exports and performance constraints where relevant. For each normative behavior make clear: actor or trigger; preconditions and input validation; ordered transitions; output and visible state; ownership and cleanup; reachable failure, retry, rollback and terminal behavior. Reuse canonical lifecycle, validation, codec, resource and error mechanisms. Complete both runtime behavior and the implementation or migration sequence; never leave missing design to Operator. TypeScript build responsibility changes follow [TypeScript toolchain](../design/typescript-toolchain.md).

### Asynchronous work and context-bound resources

For every long-lived instance, subscription, cache or connection, name the context it is bound to (locale, tenant, account, configuration, session, route, connection) and what happens when that context changes: update in place, rebuild, or isolate per context. Any of them is valid when stated. Every asynchronous result, rejection and acquired resource has an owner, and the design shows why a late or repeated completion, re-entry, close or unmount, and partial construction cannot corrupt current state or leak the resource. Name the mechanism the owner uses; no particular mechanism is required, and a synchronous, resource-free path only states why none applies.

### Irreversible state changes

Order every destructive step on persisted or user data (delete, overwrite, migrate, clean up) after the replacement state is confirmed committed. Data that cannot be recognized, such as an unknown version or format, is preserved or degraded to read-only by default; only data proven corrupt and whose loss is acceptable may be discarded. Provide the shortest recovery for the failures this change can reach, and add a user-facing reset only when no automatic safe recovery exists.

## Abstractions and target tree

Before proposing directories, record for each concept the invariant it owns, its variation axis, public or internal boundary, dependency direction and the primitive it extends:

```text
Concept/invariant | description | Owner | Public/internal | Variation axis | Reused primitive | Dependency direction | Requirement refs
```

Reject an abstraction that only shortens files, anticipates unsupported variants, mirrors a delivery packet or wraps one call. Reject a flat layout that mixes owners, runtimes, lifecycles or public and private contracts.

New products, packages and structural changes include one annotated target tree; localized changes show only the affected subtree and its attachment point. Mark proposed, added, moved, generated and removed paths; annotate non-obvious nodes with responsibility and semantic owner. Check that every Must-Ship requirement has a landing boundary, directories carry more than delivery-history meaning, dependency edges follow the design, exports and build inputs include new public paths, and no second owner appears through folder separation. The tree is a projection, not a task list or evidence that paths exist.

## Incremental revision

Revise an existing SDD in place as a delta. Preserve stable IDs, accepted decisions, evidence lineage, unresolved obligations, exclusions and valid routing; do not renumber, reset status or create a successor because the document is edited again. Path drift is routing maintenance: refresh a stale Agent Context pointer only when history, a unique current path, content identity or ownership proves the same document, and update every direct reference together; otherwise keep the SDD `in-review` and report the unresolved route. Loop-ready routing follows [Agent Context map](../design/agent-context-map.md).

## Exit gate

- [ ] Every stateful or authority-bearing subject has one owner; others are delegates, projections or observers with stated rules.
- [ ] Batches are derivable into packets without runtime state; decision requirements carry complete metadata.
- [ ] Every required template section is written or carries an evidenced `NOT_APPLICABLE`; runtime and implementation sequences are both complete.
- [ ] Every nontrivial path has indexed `BZ` step sections with the template's labels; an ordered prose list is not a step section.
- [ ] Every stated failure, degradation, recovery or isolation guarantee links to a branch in a step and to an acceptance; a promise without a branch blocks convergence.
- [ ] Context-bound resources state their context-change policy; asynchronous results, rejections and resources have owners.
- [ ] Destructive steps follow confirmed commits, and unrecognized data is preserved.
- [ ] Cross-path inputs bind their producing path; an acceptance only exercises steps delivered by its own or an earlier batch.
- [ ] Every document this phase loaded is listed in the SDD's authoring receipt with its current token.
- [ ] Abstractions own invariants; the target tree or subtree follows owners, exports and dependency direction.
- [ ] An incremental revision preserved IDs, decisions and routing, and changed only the requested or causally required delta.

<!-- reading-receipt: 809de355 -->
