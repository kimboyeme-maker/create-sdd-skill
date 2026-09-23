# SDD contract and readiness

Load in phase 6 for a machine-checkable contract. Document checks (`validate`, `validate-draft`, `document-check`, `document-next-id`) run as `bun <create-sdd-root>/scripts/validate.ts <command>`. The contract was drafted in phase 5; this phase completes it. Field shapes are in the [worked example](examples/loop-ready-example.md); load it only for a first contract or an unclear field.

## Contract block

Keep the human SDD normative and readable. Add one compact block between `<!-- sdd-contract:start -->` and `<!-- sdd-contract:end -->` holding a JSON fence with `protocol: "sdd-loop-delivery/v1"`; it points at clauses and acceptance already written and duplicates no prose, command output, history or agent reports. `revision` changes whenever normative content changes during execution. New designs include `implementation_logic`.

Derive `ownership.packages` from repository manifests (Node `package.json` name, Go `go.mod` module, Rust `Cargo.toml` `[package].name`), or keep an exact repository-relative root when that is the approved identity. Shared workspace files have a directory owner separate from member packages. Discovery is evidence, not modification permission.

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

## What validate rejects

`validate --sdd <SDD> --document-policy current --design-policy current` (or `validate-draft` for an unpersisted draft) rejects:

- the contract block and protocol, unique requirement and acceptance IDs, resolved references and an acyclic dependency graph;
- the five design sections, their `design_detail` bindings and implementation placeholders;
- presentation IDs, content tables and descriptions;
- `delivery_plan`: batch size, test budgets, requirement and acceptance coverage, write conflicts, requirement order and shard partition;
- `product_archetype`, `delivery_platforms`, `experience_contract` and `architecture`;
- `inventory_authorities`, deferral metadata, behavior-named owning tests, and each acceptance case's atomic execution fields and oracle sensitivity;
- acceptance shape: every case carries a unique `id`, a non-empty `oracle`, `method`, `environment`, `requirement_ids` and `packages`, and the requirement→acceptance and acceptance→requirement links must name each other exactly (`CONTRACT_ACCEPTANCE_INVALID`, `CONTRACT_ACCEPTANCE_REQUIREMENT_LINK_MISMATCH`). A case reachable from one direction only is rejected: matching counts do not excuse an acceptance attached to the wrong requirement.
- implementation-graph truth (producer bindings, path cycles, producers landing before their consumers and acceptance), a SHIP gate covering every Must-Ship acceptance, consumed-artifact producers, typed references that must exist, shared-mechanism write scope, migration inventory shape, and a `CONVERGED` claim that disagrees with its own fields.

Run `validate` until clean and never weaken the design to satisfy a code.

## Repository facts

`bun <create-sdd-root>/scripts/repo-facts.ts check --sdd <SDD> [--repository <root>]` compares declarations with the repository, for any ecosystem it recognizes. `bun <create-sdd-root>/scripts/reading-receipt.ts check --sdd <SDD> [--repository <root>]` takes the same flag: output location and source repository are independent, so an SDD written to a scratch directory still derives its reading requirements from the repository it was authored against.

- every lockfile or workspace that manages a package whose manifest the SDD edits appears in `shared_mechanism_writes: [{"mechanism", "target", "managers", "write_points", "owners"}]`, and each owner is inside modification authority;
- acceptance runtimes agree with repository version pins unless `environment_exceptions: [{"tool", "reason"}]` names the tool;
- every command runs the package manager its target package declares, reported as `COMMAND_PACKAGE_MANAGER_MISMATCH` otherwise. Precedence is settled here rather than left to the author: a `packageManager` field in the package's own manifest, backed by its own lockfile, speaks about that package, while a workspace file above it speaks about the workspace, so the nearer and more specific declaration wins. This is not JavaScript-specific: a `pyproject.toml` states its manager through the tool table it carries (`[tool.uv]`, `[tool.poetry]`, `[tool.pdm]`, `[tool.rye]`, `[tool.hatch]`, `[tool.pipenv]`), broken by the lockfile beside it when two are present. A lockfile in the package's own directory is itself a declaration for any ecosystem no manifest there speaks for — a package carrying its own `bun.lock`, `pdm.lock` or `poetry.lock` has chosen, whatever the workspace above it says — while a `packageManager` field still outranks one, and two lockfiles of one ecosystem in one directory are a stray rather than a choice and decide nothing. Member lists honour negation: Cargo's `exclude` and pnpm's `!packages/x` carve directories back out of a glob, so `crates/*` plus `exclude = ["crates/scratch"]` leaves scratch unmanaged. `Cargo.toml` and `go.mod` have one manager each, so they declare truthfully but nothing in those ecosystems can disagree; the JVM is where the build file is a real choice, and a module carrying its own `pom.xml` under a Gradle settings file is the same shape as a bun package inside a pnpm workspace. A package that states two competing tools for one ecosystem and has no lockfile to break the tie declares nothing for it — the repository root answers only for ecosystems the package is silent about, never for one it left contested. Maven and Gradle have no lockfile to carry a parent's claim, so it is read from the member list instead (`<modules>`, `include`, sbt's `project.in(file(...))`) and reported as `claimed_by`; those lists are also where a Gradle or sbt subproject is named at all, since such directories hold no manifest of their own. `sbt` and `mill` join `gradle` and `mvn` in the JVM ecosystem, whose toolchain is pinned in the wrapper properties the build actually downloads (`gradle/wrapper/`, `.mvn/wrapper/`) as well as in `.java-version` and `.sdkmanrc`, and whose composite builds (`includeBuild`) claim a directory the same way `include` does. Ruby, PHP, .NET, Swift, Dart/Flutter, Elixir, Haskell, Julia, Zig and C/C++ are read the same way at lower fidelity — enough for their facts to be true and for a command naming the wrong tool to be caught — and Nix, like Bazel, gets an ecosystem of its own because it drives the others rather than competing with them. Bazel gets an ecosystem to itself: it drives the others rather than competing with them — a Bazel repository legitimately keeps the pnpm lockfile `rules_js` consumes — so it is recorded and never asserted over npm or Maven. Precedence applies inside one ecosystem only — a `uv.lock` beside a `bun.lock` supersedes nothing, and a Rust crate whose acceptance drives a JS harness is not running the wrong installer. A command is read at the head of each segment, so `uv pip install` names uv and `NPM_CONFIG_USERCONFIG=... pnpm install` names pnpm. `facts.packages[]` carries `declared_managers` (one entry per ecosystem), `declared_manager` (that value when exactly one ecosystem is declared, otherwise `null`), `manager_tools` and `superseded_managers` — read them instead of inferring the manager from the repository root, which is how a bun package acquires a pnpm install;
- every indexed step's `**Location:**` names a path inside a declared owner, reported as `STEP_WRITE_OUTSIDE_AUTHORITY` otherwise. Admission compares `modification_packages` against `ownership.packages` by exact identifier, so a location under no declared root is admissible nowhere; declare that root by its own approved identity (a package name, or an exact repository-relative root such as `docs/contracts`) rather than expecting one root to cover another;
- the phase-2 exit gate, as determinate failures rather than candidates: `DESIGN_GATE_ITEM_OPEN` for each unresolved information question, route-critical unknown, blocking or material finding; `DESIGN_GATE_LENS_MISSING` and `DESIGN_GATE_LENS_NOT_PASSED` for the synthesis, adversarial and acceptance-topology lenses; `DESIGN_GATE_UNSTABLE` for a design not stable after its last normative change; and `DESIGN_NOT_CONVERGED` for any status but `CONVERGED`. A design blocked solely on a decision the user owns, carried by a `requirement_type: "decision"` requirement, is exempt — waiting for an answer is not unfinished work;
- migration symbols are literal patterns and every scan candidate is disposed;
- external API imports have persisted grounding evidence.

It also returns `candidates`, which do **not** affect `valid`: pattern-based observations the author answers in the document rather than failures to fix. Today they are `CONJUNCTIVE_REQUIREMENT_SINGLE_ORACLE` (a Must-Ship title that joins two observable facts while only one has an oracle), `ACCEPTANCE_METHOD_ZERO_OBSERVATION` (a method that selects by name without asserting what it observed), `PSEUDOCODE_SYMBOL_UNRESOLVED` (a call that neither the repository nor the step's own pseudocode defines), `CHALLENGE_EVIDENCE_CITES_SUBJECT_ONLY` (a challenge whose `evidence` names only product source, which cites what the reasoning was about rather than a record of anything running — a fixture or evidence companion is not flagged) and `CHALLENGE_REASONED_BUT_CLOSED` (a challenge declaring `provenance: "REASONED"` while carrying `result: "CLOSED"`). The last two exist because a wrong equivalence closed on a reading passes every other check and surfaces at admission; answer them in the document, or replace the reading with a run ([admission card](phases/2-admit.md#say-where-an-observed_result-came-from)). Prose and command text cannot carry a proof, so blocking on them would make authors reword correct designs to satisfy a keyword; answer the candidate, or say in the document why it does not apply.

It reports candidates and inconsistencies and never proves exhaustiveness; an unrecognized ecosystem relies on the author's declarations.

## What no validator proves

The exit gates of phases 1–4 and the [work decomposition](work-decomposition.md) rules apply unchanged. A ready contract additionally holds these:

- `design_convergence` is `CONVERGED` with every unresolved list empty, `stable_after_last_normative_change: true`, and the latest entry for each of `SYNTHESIS`, `ADVERSARIAL` and `ACCEPTANCE_TOPOLOGY` is a PASS with evidence. Earlier entries stay as history — a lens that failed and was rerun converges on its rerun — but a PASS followed by a later FAIL for the same lens is stale and the claim is rejected. `validate` rejects a `CONVERGED` claim that disagrees with these fields. Classify before claiming it: an uncertainty the design must remove blocks convergence; acceptance evidence only implementation can produce is not a design unknown; Must-Ship work of a later batch remains a requirement, batch and dependency and closes its execution details at its own slice admission.
- `lineage.mode` is `fresh` (current evidence, no predecessors) or `continuation`. Only a contract whose unfinished delivery this SDD continues is a predecessor, with relation `delivery-predecessor`; shipped authorities, reusable capability sources and overlapping projects belong in `lineage.basis`, Linked SDDs or Agent Context. Lineage is immutable after initialization.
- A continuation carries every inherited obligation with its own acceptance IDs, observed packages, method, environment and oracle; a `RESOLVED` disposition reruns the original failed method, and removing a package from the successor is not externality evidence.
- `must-ship` means SHIP needs independent verification. A deferred requirement records owner, trigger, impact and `approved_by`, and a Must-Ship deferral needs `approved_by: "user"`. `non-goal` entries may omit acceptance; unfinished work is not a non-goal. A non-goal that removes or visibly degrades an outcome the user discussed records its authority basis (a `USER_STATED` fact or a resolved decision requirement); author trade-offs that leave user outcomes intact need no approval.
- Every `PROVEN` route assumption cites structured current facts, and the executed early falsifier binds exact versions, runtime, failure condition, method, result and evidence location.
- After approval, objective, ownership, requirements and acceptance semantics are frozen; changing them needs explicit user scope approval.
- The union of derived packet requirement and acceptance references exactly covers the admitted contract, and the SDD holds no runtime packet status.
- Every known decision requirement across the Must-Ship graph is resolved and every dependent edge is present ([decision authority](design/decision-authority.md)).
- Every protected artifact stage names a role that can execute it under the actual safety policy; a planned installer the custody layer will reject makes the SDD non-loop-ready ([artifacts and dependencies](design/artifacts-and-dependencies.md#artifact-custody)).
- Agent Context has exactly one root pointer; direct companion pointers are relative, present, inside the project (no symlink escape), consistently classified and inside allowed blocks. `@` lines inside linked business documents are ordinary content ([Agent Context map](design/agent-context-map.md)).
- The TypeScript tool-selection check activates only for in-scope packages whose production source a TypeScript toolchain compiles ([TypeScript toolchain](design/typescript-toolchain.md)).

## Upgrading an existing SDD

Derive the contract only from explicit clauses, preserve stable IDs and add mechanically certain links directly. When a missing Must-Ship boundary, oracle, owner, dependency or authority choice needs product judgment, mark the document not loop-ready and surface that decision instead of guessing. Collect every knowable authority choice before asking.

## Reporting readiness

`validate` reports `admissibility: {admissible, blockers}` beside its diagnostics. A draft stays structurally valid while it is written, so `valid: true` with `admissible: false` is the ordinary state of an unfinished document. The blockers name what is still open: the status, each unresolved question, each missing or failing review lens, and stability after the last normative change. Never report a document ready while `admissible` is false.

`admissible: true` reports design convergence; the structural rules — implementation graph, acceptance shape, executable methods for mechanical oracles, migration inventory and its reader-to-batch coverage — are ordinary `validate` diagnostics, so a contract that passes `validate` has met them. A program root is not a leaf: `validate` answers it with one `SDD_PROGRAM_ROOT` directive instead of reporting child-owned IDs as dangling.

A clean `validate` is necessary, not sufficient. Re-read the human clauses as one design for guessed product choices, unsupported problem-to-solution jumps, route-invalidating assumptions, causal expansion, contradictions, competing owners, missing failure behavior, and oracles that only assert an implementation or test exists. Readiness is never implementation evidence.

Judge readiness from the evidence in hand, in both directions. A prerequisite without a producer, a failure path left to a future implementer or an unexecuted decisive probe blocks readiness. When every prerequisite has an evidenced producer and the decisive probes have run, the route is ready: do not invent defects, request permissions the contract already grants, or open a successor to appear careful.

## The only two endings

Implementation-targeting output converges before it is handed off. An open information question or route-critical unknown is work this skill owns: close it by running the check, or, when only the user can answer, carry it as a `requirement_type: "decision"` requirement under `pending_authority_confirmations`. Those are the only two endings — recording the gap and handing the document on is not a third, and `repo-facts.ts check` fails the document by name when it happens. A design blocked solely on a user decision is a complete handoff; one blocked on work nobody has done is not.

Independent review is subject to the user's agent and budget permissions; disclose when it was not performed. A review that runs must assess split rationale, source fidelity, execution ownership and implementability against the current candidate, not merely count IDs or receipts.

<!-- reading-receipt: 09af9d83 -->
