# Loop-ready SDD contract

Load in phase 6 when `sdd-loop-delivery` will execute the SDD or the user asks for a machine-checkable delivery contract. Commands run as `bun <loop-skill-root>/scripts/main.ts <command>`. The contract was drafted in phase 5; this phase completes it. Field shapes are in the [worked example](examples/loop-ready-example.md); load it only for a first contract or an unclear field.

## Contract block

Keep the human SDD normative and readable. Add one compact block between `<!-- sdd-contract:start -->` and `<!-- sdd-contract:end -->` holding a JSON fence with `protocol: "sdd-loop-delivery/v1"`; it points at clauses and acceptance already written and duplicates no prose, command output, history or agent reports. `revision` changes whenever normative content changes during execution. New designs include `implementation_logic`; Coordinator's reconstruction protocol is the loop's [design convergence](../../sdd-loop-delivery/references/design-convergence.md).

Derive `ownership.packages` from repository manifests (Node `package.json` name, Go `go.mod` module, Rust `Cargo.toml` `[package].name`), or keep an exact repository-relative root when that is the approved identity. Shared workspace files have a directory owner separate from member packages. Discovery is evidence, not modification permission; worktree baselines and owner mapping follow the loop's [execution](../../sdd-loop-delivery/references/execution.md) reference.

## Migration projection

`migration_applicability` is `REQUIRED` whenever the contract replaces or removes an existing owner, contract, public path, export, wire or data shape, factory, adapter or compatibility surface, and `NOT_APPLICABLE` otherwise, whatever the work type. `REQUIRED` adds this closed reader projection beside `ownership`; it points at requirements and acceptance and is not a second work graph:

```json
{
  "migration_applicability": "REQUIRED",
  "migration": {
    "inventory_roots": ["packages/example/src"],
    "inventory_method": "exact read-only source/dependency scan used before design admission",
    "inventory_evidence": ["feature.evidence.md#reader-inventory"],
    "unknown_readers": [],
    "dismissed_candidates": [{"module": "docs/guide.md", "reason": "prose mention in documentation, not a reader"}],
    "legacy_surfaces": [
      {
        "id": "YL01",
        "owner": "current semantic owner or path",
        "symbols": ["legacyProtocol"],
        "final_disposition": "REMOVE",
        "requirement_ids": ["XQ01"],
        "acceptance_ids": ["YS01"],
        "zero_reader_acceptance_ids": ["YS01"]
      }
    ],
    "readers": [
      {
        "id": "RSP01",
        "module": "packages/example/src/attachment.ts",
        "edge": "static import and construction",
        "legacy_surface_ids": ["YL01"],
        "disposition": "MIGRATE",
        "target_owner": "new canonical owner",
        "requirement_ids": ["XQ01"],
        "acceptance_ids": ["YS01"],
        "owning_test": "packages/example/test/attachment.test.ts",
        "evidence": ["source edge and test-host inspection"]
      }
    ]
  }
}
```

`readers` is empty only when the executed inventory observes no reader. A `REMOVE` surface links a `UNIVERSAL` acceptance case: `ARCHITECTURE`, or `BEHAVIOR`/`PUBLIC_CONTRACT`/`RUNTIME_INVOCATION` with `REQUIRED` oracle sensitivity when the case also proves runtime removal; the source and dependency inventory must still prove zero readers. `RETAIN_COMPATIBILITY` omits `zero_reader_acceptance_ids` and is justified in the human compatibility contract. Batches form a DAG from reader groups to exports and tests and finally zero-reader removal; a single atomic cutover needs evidence that no buildable intermediate exists.

## What the controller rejects

`validate --sdd <SDD> --document-policy current --design-policy current` (or `validate-draft` for an unpersisted draft) rejects, with codes from the loop's [error catalog](../../sdd-loop-delivery/references/error-codes.md):

- the contract block and protocol, unique requirement and acceptance IDs, resolved references and an acyclic dependency graph;
- the five design sections, their `design_detail` bindings and implementation placeholders;
- presentation IDs, content tables and descriptions;
- `delivery_plan`: batch size, test budgets, requirement and acceptance coverage, write conflicts, requirement order and shard partition;
- `product_archetype`, `delivery_platforms`, `experience_contract` and `architecture`;
- `inventory_authorities`, deferral metadata, behavior-named owning tests, and each acceptance case's atomic execution fields and oracle sensitivity;
- acceptance shape: every case carries a unique `id`, a non-empty `oracle`, `method`, `environment`, `requirement_ids` and `packages`, and the requirement→acceptance and acceptance→requirement links must name each other exactly (`CONTRACT_ACCEPTANCE_INVALID`, `CONTRACT_ACCEPTANCE_REQUIREMENT_LINK_MISMATCH`). A case reachable from one direction only is rejected: matching counts do not excuse an acceptance attached to the wrong requirement.
- implementation-graph truth (producer bindings, path cycles, producers landing before their consumers and acceptance), a SHIP gate covering every Must-Ship acceptance, consumed-artifact producers, typed references that must exist, shared-mechanism write scope, migration inventory shape, and a `CONVERGED` claim that disagrees with its own fields.

Coordinator admission rejects the rest before any lease: the design convergence receipt, lineage and inherited obligations, Must-Ship decision closure, early falsifier evidence, route and responsibility, verification scope and claim coverage, migration reader closure, semantic ownership and artifact custody. Run `validate` until clean and never weaken the design to satisfy a code.

## Repository facts

`bun <create-sdd-root>/scripts/repo-facts.ts check --sdd <SDD> [--repository <root>]` compares declarations with the repository, for any ecosystem it recognizes. `bun <create-sdd-root>/scripts/reading-receipt.ts check --sdd <SDD> [--repository <root>]` takes the same flag: output location and source repository are independent, so an SDD written to a scratch directory still derives its reading requirements from the repository it was authored against.

- every lockfile or workspace that manages a package whose manifest the SDD edits appears in `shared_mechanism_writes: [{"mechanism", "target", "managers", "write_points", "owners"}]`, and each owner is inside modification authority;
- acceptance runtimes agree with repository version pins unless `environment_exceptions: [{"tool", "reason"}]` names the tool;
- every indexed step's `**Location:**` names a path inside a declared owner, reported as `STEP_WRITE_OUTSIDE_AUTHORITY` otherwise. Admission compares `modification_packages` against `ownership.packages` by exact identifier, so a location under no declared root is admissible nowhere; declare that root by its own approved identity (a package name, or an exact repository-relative root such as `docs/contracts`) rather than expecting one root to cover another;
- migration symbols are literal patterns and every scan candidate is disposed;
- external API imports have persisted grounding evidence.

It also returns `candidates`, which do **not** affect `valid`: pattern-based observations the author answers in the document rather than failures to fix. Today they are `CONJUNCTIVE_REQUIREMENT_SINGLE_ORACLE` (a Must-Ship title that joins two observable facts while only one has an oracle), `ACCEPTANCE_METHOD_ZERO_OBSERVATION` (a method that selects by name without asserting what it observed) and `PSEUDOCODE_SYMBOL_UNRESOLVED` (a call that neither the repository nor the step's own pseudocode defines). Prose and command text cannot carry a proof, so blocking on them would make authors reword correct designs to satisfy a keyword; answer the candidate, or say in the document why it does not apply.

It reports candidates and inconsistencies and never proves exhaustiveness; an unrecognized ecosystem relies on the author's declarations.

While a delivery is running, the SDD's bytes are its controller's normative source: the state records a fingerprint of them, and any edit makes the controller refuse to proceed until the Coordinator amends. So do not refresh an Authoring receipt row on an SDD under active delivery, even though editing a reference here makes that row stale. Refresh the idle documents, leave the running one, and reconcile it in the same amendment that carries its next revision.

## What no validator proves

The exit gates of phases 1–4 and the [work decomposition](work-decomposition.md) rules apply unchanged. A loop-ready handoff additionally holds these:

- `design_convergence` is `CONVERGED` with every unresolved list empty, `stable_after_last_normative_change: true`, and the latest entry for each of `SYNTHESIS`, `ADVERSARIAL` and `ACCEPTANCE_TOPOLOGY` is a PASS with evidence. Earlier entries stay as history — a lens that failed and was rerun converges on its rerun — but a PASS followed by a later FAIL for the same lens is stale and the claim is rejected. `validate` rejects a `CONVERGED` claim that disagrees with these fields, and admission rejects a contract whose recorded status is not `CONVERGED`. Classify before claiming it: an uncertainty the design must remove blocks convergence; acceptance evidence only implementation can produce is not a design unknown; Must-Ship work of a later batch remains a requirement, batch and dependency and closes its execution details at its own slice admission.
- `lineage.mode` is `fresh` (current evidence, no predecessors) or `continuation`. Only a contract whose unfinished delivery this SDD continues is a predecessor, with relation `delivery-predecessor`; shipped authorities, reusable capability sources and overlapping projects belong in `lineage.basis`, Linked SDDs or Agent Context. Lineage is immutable after initialization.
- A continuation carries every inherited obligation with its own acceptance IDs, observed packages, method, environment and oracle; a `RESOLVED` disposition reruns the original failed method, and removing a package from the successor is not externality evidence.
- `must-ship` means the loop cannot SHIP without independent Architect verification. A deferred requirement records owner, trigger, impact and `approved_by`, and a Must-Ship deferral needs `approved_by: "user"`. `non-goal` entries may omit acceptance; unfinished work is not a non-goal. A non-goal that removes or visibly degrades an outcome the user discussed records its authority basis (a `USER_STATED` fact or a resolved decision requirement); author trade-offs that leave user outcomes intact need no approval.
- Every `PROVEN` route assumption cites structured current facts, and the executed early falsifier binds exact versions, runtime, failure condition, method, result and evidence location.
- After approval, objective, ownership, requirements and acceptance semantics are frozen; changing them needs explicit user scope approval.
- The union of derived packet requirement and acceptance references exactly covers the admitted contract, and the SDD holds no runtime packet status.
- Every known decision requirement across the Must-Ship graph is resolved and every dependent edge is present ([decision authority](design/decision-authority.md)).
- Every protected artifact stage names a role that can execute it under the actual safety policy; a planned installer the custody layer will reject makes the SDD non-loop-ready ([artifacts and dependencies](design/artifacts-and-dependencies.md#artifact-custody)).
- Agent Context has exactly one root pointer; direct companion pointers are relative, present, inside the project (no symlink escape), consistently classified and inside allowed blocks. `@` lines inside linked business documents are ordinary content ([Agent Context map](design/agent-context-map.md)).
- The TypeScript tool-selection check activates only for in-scope packages whose production source a TypeScript toolchain compiles ([TypeScript toolchain](design/typescript-toolchain.md)).

## Control-plane compatibility receipt

Product closure and execution-control compatibility are separate gates. Resolve the installed sibling skill root and run `capabilities`. Require `protocol: "sdd-loop-delivery/v1"` and at least these `features` values; a missing or different value is `LOOP_CONTROL_PLANE_INCOMPATIBLE`:

```json
{
  "document_policy": "sdd-document/v1",
  "document_presentation": "sdd-presentation/v1",
  "preparation": "readonly-grant/v1",
  "preparation_window": "contract-admitted/v1",
  "prepared_checks": [
    "baseline_check",
    "packet_check"
  ],
  "packet_modification_packages": true,
  "delivery_plan": "delivery-plan/v1",
  "bootstrap_helper": "three-process/v1",
  "direct_role_authorship": "agent-record",
  "pipeline_incidents_isolated_from_product_counters": true,
  "execution_failure_forces_readmission": true,
  "operator_candidate_receipt": "candidate-integrity-v1",
  "operator_worktree": "operator-worktree/v1",
  "decision_relevant_evidence_review": "decision-evidence-v1",
  "authorization_effect_delta": "v1",
  "artifact_custody": "executable-custody-v1",
  "epoch_public_key_signatures": "ed25519-role-v1"
}
```

An absent or malformed `capabilities` result is also `LOOP_CONTROL_PLANE_INCOMPATIBLE`. The receipt is execution-infrastructure evidence, never SDD content or a product acceptance case. It proves advertised interfaces, not host behavior, and does not replace the Operator/Architect lease continuity check at loop startup; a host without a deny-capable before-action hook may still run the loop but must report that machine pre-action enforcement is unavailable. It does not advertise concurrent Operator leases: a plan's parallel waves are realized through early preparation, prepared packet checks and concurrent final-verification shards.

## Upgrading an existing SDD

Derive the contract only from explicit clauses, preserve stable IDs and add mechanically certain links directly. When a missing Must-Ship boundary, oracle, owner, dependency or authority choice needs product judgment, mark the document not loop-ready and surface that decision instead of guessing. Collect every knowable authority choice before asking.

## Reporting LOOP_READY

For multi-SDD work, the total/group documents use `sdd-program/v1` and the delivery controller's `program-check` command; they are not dispatched as duplicate executable contracts. Only execution SDDs receive individual LOOP_READY receipts. Report structure validity, individual readiness and runtime delivery separately. Program runtime startup and continuation follow delivery's program-workflow reference and do not grant test, merge or budget authority.

A clean `validate` and a compatible receipt are necessary, not sufficient. Re-read the human clauses as one design for guessed product choices, unsupported problem-to-solution jumps, route-invalidating assumptions, causal expansion, verification that includes non-causal repository health, contradictions, competing owners, unresolved primitive reuse, missing failure behavior, and oracles that only assert an implementation or test exists. Report `LOOP_READY` only when product closure, validation and compatibility all pass; it is still not implementation or runtime lease evidence.

A single SDD's report ends with one copyable launch instruction naming the document's absolute path, in the delivery skill's own documented invocation form: `$sdd-loop-delivery <absolute-SDD-path>`, optionally followed by a round bound. Introduce it in the user's language, for example `交付时发这一句：$sdd-loop-delivery <absolute-SDD-path>`. Like the multi-SDD instruction in [program split](planning/program-split.md), it is an instruction for a host session, not a shell command, and a host that renders follow-up actions may present it as one. Give it whatever the host is, and never substitute a controller command: the loop's own entry takes the document path and an optional round bound, and role selection belongs to that skill. Reporting the instruction is not starting the run, and the user decides when to give it.

Judge readiness from the evidence in hand, in both directions. A prerequisite without a producer, a failure path left to a future Operator or an unexecuted decisive probe blocks readiness. When every prerequisite has an evidenced producer and the decisive probes and branches have been executed, the route is ready: do not invent defects, request permissions the contract already grants, or open a successor to appear careful.

<!-- reading-receipt: 0d899a33 -->
