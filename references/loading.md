# Progressive loading

Implementation-targeting create, refactor and merge work runs in phases. Load a phase's documents when it starts, work from them until its exit gate holds, and name the conditional documents you loaded in the design summary.

## Phases

| Phase | Load | Leaves the phase |
| --- | --- | --- |
| 1 Harvest | [harvest card](phases/1-harvest.md), [archetypes](product/archetypes.md), [delivery platforms](product/platforms.md), [program split](planning/program-split.md) | fact ledger and initial ownership inventory available |
| 2 Admit | [admission card](phases/2-admit.md) | single/multi-SDD assessment and outputs agreed with the user; convergence gate holds |
| 3 Design | [design card](phases/3-design.md), [complete design template](complete-design.md), [writing guide](writing.md), [document presentation](document-presentation.md) | template sections written |
| 4 Verify | [verification card](phases/4-verify.md), [acceptance standards](product/acceptance-standards.md) | verification gate holds |
| 5 Decompose | [work decomposition](work-decomposition.md) | `validate` reports the delivery plan |
| 6 Report | [contract and readiness](loop-ready.md), [Agent Context map](design/agent-context-map.md) | readiness reported, or the named blocker |

`scripts/lib/reading-policy.ts` owns the phase and conditional reading requirements; `reading-receipt.ts check` applies them, and the tables below explain the routing. Receipt tokens identify document versions; they do not authenticate a read.

## Minimum structured output

Whoever writes the SDD, each phase leaves the same inspectable minimum:

| Phase | Structured output |
| --- | --- |
| 1 | Fact ledger with environment facts (pins, managing workspaces and lockfiles, executor runtimes) and both queues |
| 2 | Grounding records and gate baselines in the evidence companion; decisions closed at the right scope |
| 3 | Steps with producer bindings; guarantees linked to branches and acceptance; context-change and destructive-step policies |
| 4 | Acceptance with oracle kind, consumed-artifact producers and shared-resource owners |
| 5 | `delivery_plan`, `shared_mechanism_writes`, a SHIP gate covering all Must-Ship acceptance |
| 6 | `design_convergence` is `CONVERGED`, or `IN_REVIEW` solely on a user decision carried by a decision requirement; `validate`, `reading-receipt.ts check` and `repo-facts.ts check` pass |

## Only when the condition holds

| Condition | Load | Phase |
| --- | --- | --- |
| The product has a user interface | [experience contract](product/experience-contract.md) | 1, 3 |
| `content-publication` (blog, docs, knowledge base, newsletter, magazine) | [content site](product/content-site.md) | 1, 3 |
| `mini-program` platform | [mini program](product/platforms/mini-program.md) | 1, 4 |
| `ios` or `android` platform | [native mobile](product/platforms/mobile-native.md) | 1, 4 |
| `flutter` platform | [Flutter](product/platforms/flutter.md) and [native mobile](product/platforms/mobile-native.md) | 1, 4 |
| `harmonyos` platform | [HarmonyOS ArkTS](product/platforms/harmonyos-arkts.md) | 1, 4 |
| `desktop` platform | [desktop](product/platforms/desktop.md) | 1, 4 |
| `native-sdk` platform | [native SDK](product/platforms/native-sdk.md) and each binding platform's guide | 1, 4 |
| A language is in scope (load only the languages present) | [Rust](product/languages/rust.md), [Go](product/languages/go.md), [Python](product/languages/python.md), [Bun and Node](product/languages/bun-node.md), [JVM](product/languages/jvm.md) | 1, 4 |
| TypeScript build or publication responsibility changes | [TypeScript toolchain](design/typescript-toolchain.md) | 3 |
| One capability exposed through several surfaces | [core and adapters](product/architecture/core-adapters.md) | 3 |
| A choice may need user authority | [decision authority](design/decision-authority.md) | 1, 2 |
| Protected artifacts, package-manager operations or any shared-mechanism write | [artifacts and dependencies](design/artifacts-and-dependencies.md) | 1, 3 |
| Continuation of an unfinished predecessor delivery | [continuation lineage](design/continuation-lineage.md) | 2 |
| Owner, export, path or format replacement or removal | [migration](migration.md) | 2, 5 |
| Two or more batches | [conflicts and lanes](planning/conflicts-and-lanes.md) | 5 |
| Any batch adds, changes or runs tests | [test budget](planning/test-budget.md) | 4, 5 |
| Prepared packet checks or final verification shards | [verification planning](planning/verification-planning.md) | 5 |
| Earlier deliveries left retrospectives | [estimate calibration](planning/estimate-calibration.md) | 5 |
| First contract for the repository, or an unclear field shape | [worked example](examples/loop-ready-example.md) | 6 |

## When a check fails

Read the owning document before fixing the SDD; do not patch a field until the diagnostic disappears.

| Diagnostic | Read |
| --- | --- |
| `SDD_CONTRACT_REQUIRED`, `CONTRACT_*` shape errors | [loop-ready](loop-ready.md), then the [worked example](examples/loop-ready-example.md) |
| `SDD_REQUIRED_SECTION_*`, `SDD_IMPLEMENTATION_PLACEHOLDER` | [complete design template](complete-design.md) |
| `CONTRACT_ACCEPTANCE_*`, `ACCEPTANCE_*` | [acceptance standards](product/acceptance-standards.md) and the [verification card](phases/4-verify.md) |
| `DELIVERY_PLAN_*`, `*_TEST_BUDGET_*` | [work decomposition](work-decomposition.md) and [test budget](planning/test-budget.md) |
| `CONTRACT_INVENTORY_*`, `CONTRACT_DEFERRAL_*`, `MUST_SHIP_DEFERRAL_REQUIRES_USER` | [admission card](phases/2-admit.md) and [decision authority](design/decision-authority.md) |
| `TEST_FILE_*` | [verification card](phases/4-verify.md#test-hosts-and-names) |
| `IMPLEMENTATION_LOGIC_*`, `DESIGN_CONVERGENCE_*`, `CONTRACT_NOT_CONVERGED` | [design card](phases/3-design.md) and [loop-ready](loop-ready.md) |
| `SDD_PRESENTATION_SHIP_COVERAGE_INCOMPLETE` | [document presentation](document-presentation.md) |
| `ACCEPTANCE_ARTIFACT_*` | [verification card](phases/4-verify.md#atomic-execution-and-failure-isolation) |
| `CONTRACT_REFERENCE_*` | [Agent Context map](design/agent-context-map.md#evidence-companion) |
| `SHARED_MECHANISM_*`, `TOOLCHAIN_VERSION_CONFLICT` | [artifacts and dependencies](design/artifacts-and-dependencies.md#dependency-operations) |
| `MIGRATION_CANDIDATE_UNDISPOSED`, `MIGRATION_SYMBOL_UNSCANNABLE`, `MIGRATION_DISMISSED_*` | [migration](migration.md) |
| `REPOSITORY_NOT_FOUND`, or entries in `facts.grounding_candidates` (review, not failure) | [admission card](phases/2-admit.md#run-decisive-probes-now) and the language guide |
| Reading receipt `missing` or `stale` | the listed documents, then update their receipt lines |

## Other modes

| Mode | Load |
| --- | --- |
| Merge | [writing guide](writing.md), [merge](merge.md) |
| Audit, or two invariants in tension | [invariants](invariants.md), [audit](audit.md); closure audits add [closure evidence](closure-evidence.md) |
| Changing this skill's policy | [behavior evaluation](behavior-evaluation.md) |

<!-- reading-receipt: 2327ed6a -->
