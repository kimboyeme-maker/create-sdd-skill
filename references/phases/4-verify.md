# Phase 4 · Verification design and delivery gates

Load when mapping clauses to acceptance. Field standards and default oracles live in [acceptance standards](../product/acceptance-standards.md); the loop validator rejects structural violations, so this card covers the judgments a validator cannot make.

## One claim, one oracle

Every normative non-deferred clause needs a verification method, not necessarily an automated test: tests, type or architecture checks, package inspection, benchmarks, security or manual review, or explicit approval. State each oracle's kind: a mechanical oracle is an assertion decidable from exit code or output; a judgment oracle states its criteria and the evidence the judge records. Describe each case's environment as it actually runs, never as a shared template. Each acceptance case owns exactly one atomic claim in one dimension (`EXECUTION_AUTHORITY`, `DIRECT_DEPENDENCY`, `TRANSITIVE_DEPENDENCY`, `CONFIGURATION`, `RUNTIME_INVOCATION`, `BUILD_OUTPUT`, `BEHAVIOR`, `PUBLIC_CONTRACT`, `ARCHITECTURE`). One command may produce evidence for several cases, each bound separately. Use the narrowest oracle that can falsify the business contract; add no repository-wide health, coverage, fixture or harness work unless the contract causally needs it.

A universal negative claim ("no Babel anywhere in the dependency graph") declares the closed universe it quantifies over — manifests, lock graph, installed graph, configuration, emitted output — and inspects every member with evidence that observes that dimension. A source inspection cannot prove lock-graph absence; a passing build cannot prove dependency absence. An unknown universe keeps the SDD `in-review`.

## Oracle sensitivity for guards

Rejection or denial, unsigned, null or malformed input, provenance and custody, permission, budget and boundary guards, and legacy-absence claims declare `oracle_sensitivity` with one minimal fault model and one perturbation: bypassing the guard flips only that case `PASS → FAIL`, and restoration returns it to `PASS`. An existing guard is probed in an isolated copy now (`DESIGN_PROVEN`); a new guard declares the fault model (`IMPLEMENTATION_REQUIRED`) for Operator to implement and Architect to confirm. A positive business path without a guard is `NOT_APPLICABLE` with a reason. Both branches' exact fields are in the [worked example](../examples/loop-ready-example.md#guarded-acceptance-the-required-branch). Never build mutation-testing infrastructure.

### A perturbation is an operation, so declare what it writes

`perturbation_method` says what is broken; it does not say which bytes change, and the delivery cannot ask for permission it was never told about. A design that knows it will temporarily edit a product source file, and says so only as prose inside a method string, hands the loop a permission request it can only discover by reaching it — which arrives mid-delivery, one operation at a time, after a lease is already running.

Every `REQUIRED` branch therefore also declares the operation:

```json
"perturbation_writes": ["packages/event-subscriber/src/channel.ts"],
"write_disposition": "TEMPORARY",
"restoration_check": "the full candidate fingerprint equals the pre-perturbation value"
```

- `perturbation_writes` lists every repository path the perturbation and its restoration touch. Empty means the perturbation changes no tracked file — an isolated copy, a fixture input, an environment variable — and that is worth saying explicitly rather than leaving unstated.
- `write_disposition` is `TEMPORARY` when the bytes are restored inside the same check, `PERSISTENT` when the change is part of the delivered product.
- `restoration_check` is how restoration is proven, not that it happened: the equality that must hold afterwards.

These paths are design facts known while the case is written, not runtime discoveries. Collect them with everything else the delivery needs permission for and put them in the Delivery & Verification section's **Execution permissions** so one request covers them all; see [the complete design template](../complete-design.md#required-human-design-sections). The fields are additive — a controller that does not read them still accepts the contract — and they never promise that a host will grant anything.

## Atomic execution and failure isolation

Each case declares an independently runnable target, bounded timeout, readiness oracle, mutable-state boundary, evidence boundary and the cases that can prevent it from running. Dry-run failure isolation: assume the case times out before producing evidence and list every other case that becomes unobservable; each such edge must be declared in `blocking_acceptance_ids` and be causally necessary. Shared browser pages, processes, fixtures, databases or sequential journeys are never `INDEPENDENT`; `SHARED_SAFE` needs reset evidence and one attributable result per claim. Split a group when one failure blocks attribution or targeted retry, state leaks between claims, or its bounded runtime exceeds the command budget. Never compensate for a flaky topology with retries. A shared process, server or fixture is started and stopped once by an owner declared in `state_boundary`; case methods never start their own copies. An acceptance that consumes a built or external artifact declares it in `execution.consumes` with its producer (a blocking acceptance) or external source, bound to the current candidate.

## Test hosts and names

Inventory the nearest unit, integration, browser, packed-consumer and E2E suites before proposing a file. Put a regression in the existing suite for the same business, function, module or helper concept when its layer and runtime fit. A new file needs a named rejected host and a real layer, runtime, isolation or repository-module boundary, within the batch's [test budget](../planning/test-budget.md). Names describe the protected behavior (`storage-consistency.test.ts`), never a round, revision, packet, attempt, agent, finding, patch or hotfix. The loop rejects delivery-history names at `validate` for owning tests and at implementation for created files (`TEST_FILE_DELIVERY_METADATA_NAME_FORBIDDEN`, `TEST_FILE_BUSINESS_NAME_REQUIRED`, `CREATED_TEST_FILE_JUSTIFICATION_REQUIRED`). Test counts and coverage growth are not outcomes.

## Observed packages and delivery gates

Each acceptance case names the packages it observes, including verification-only packages; that set is not modification authority, and a localized repair names its own writable subset. Select gates from the admitted causal surface and repository scripts. A package, consumer, repository, build, E2E or platform gate belongs only when its failure can falsify or mask a named oracle; an aggregate nonzero exit does not make unrelated packages part of the design. Keep transient command output in an evidence artifact, not in the durable contract. A failed verification never promotes a verification-only surface into implementation scope.

## Exit gate

- [ ] Every normative clause has a method; every case has one claim in one dimension with a narrow oracle.
- [ ] Universal claims declare and inspect a closed universe; guard-backed cases declare sensitivity.
- [ ] Failure-isolation dry run found no undeclared or incidental blocking edge; groups are bounded.
- [ ] Regressions reuse canonical hosts; any new file names its rejected host, boundary and behavior.
- [ ] Observed packages and gates follow the causal surface; modification authority is stated separately.
- [ ] Oracle kinds are stated; red-baseline gates compare diagnostic identities; shared resources and consumed artifacts have declared owners and producers.
- [ ] Every document this phase loaded is listed in the SDD's authoring receipt with its current token.

<!-- reading-receipt: 0cecbea5 -->
