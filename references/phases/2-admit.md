# Phase 2 · Close the logic and admit the route

Load after phase 1's queues are final. A route becomes normative only when this phase's gate holds; otherwise the SDD stays `in-review` with the missing evidence or decision named.

## Close the implementation logic

Treat the SDD as an executable argument. For every Must-Ship outcome trace entry or input → prerequisite producers → ordered operations and branches → intermediate state or artifact → consumer or output → acceptance, for both product behavior and implementation or migration order. Cross-reference canonical clauses instead of keeping another work graph.

Write implementable pseudocode for every nontrivial path: concrete owners and existing APIs, inputs and outputs, ordering, branch conditions, mutations, error propagation, cleanup and recovery. A verb such as "integrate", "migrate" or "handle errors" is insufficient when it hides a choice. Every prerequisite comes from an evidenced entry condition or an earlier producer; every failure branch ends in a specified result or bounded repair, never "Operator investigates". Resolve conflicts between individually valid intermediate states.

Then challenge from the opposite direction: start at each acceptance and failure outcome and reconstruct what must be true. Inspect readers, rejected inputs, missing resources, partial completion, interruption, concurrency and old/new coexistence where they can affect the contract. Every stated guarantee (failure handling, degradation, recovery, cancellation, isolation) must reconstruct to a concrete branch in a step and to an acceptance that observes it. A discovered blocker needs its cause, affected step, prevention or repair design, order and confirming evidence before the SDD is ready. The author closes the logic; Coordinator later reconstructs it independently. Neither may rely on the other to find an omitted prerequisite, and an unknown is a reason to investigate, not an accepted risk.

For loop-ready documents `implementation_logic` is the machine projection of these paths; its shape is validated, its completeness is not.

## Design basis

Keep one compact basis for the whole design:

- the observed problem or greenfield need, and the desired observable delta;
- decision owner and approval authority;
- the conventional repository-native route, any genuine alternative, and why the selected route fits ownership and dependency direction;
- the causal surface: owning boundary, changed public or persisted behavior, directly affected consumers, exclusions;
- `SOURCE_INVENTORY` authority separate from fingerprint-bound `RUNTIME_RESOLUTION` (an installed resolver never proves source closure);
- dependency-operation effects and recovery envelopes where required;
- reused capability, or evidence that no compatible primitive exists;
- the top route-invalidating failure mode and its cheapest early falsifier;
- inherited facts that can invalidate the route, and difficulty drivers.

Scope contains only the owner, the changed contract or state, directly affected consumers and surfaces whose failure can falsify or mask acceptance. When the basis cannot be supported, keep the SDD `in-review`; do not compensate with abstraction, compatibility paths, defensive machinery, broader tests or repository-wide gates.

## Normalize constraints without strengthening them

For each material user constraint record the exact wording, the narrow operational invariant it requires, the semantic dimension it governs, and the nearby claims it does **not** imply. Distinguish execution authority, direct dependency, transitive dependency, configuration, runtime invocation and emitted output. Widening a dimension or quantifier beyond the wording is a proposed contract change. Example: "Oxc compiles production React code; do not fall back to Babel" constrains compiler authority and fallback invocation; it does not forbid audited Babel utilities inside React Router's transitive graph.

For every material rejection, hard stop or proposed universal guard, record the nearest counterexample: the single changed fact that would reverse the decision. If none can be stated, keep the rule as an incident observation.

## Run decisive probes now

Execute the cheapest decisive probe for every assumption whose failure would change architecture, ownership, dependency direction, public contract, compatibility route or acceptance executability. Allowed: read-only builds, type checks, package-resolution checks, packed-consumer smoke tests and isolated reproductions that do not modify product source, tracked manifests, lockfiles, protected fixtures or external systems. Use the exact candidate versions and runtime. Record claim, requirement and acceptance links, method, environment, failure condition, observed result and evidence location.

Never defer a safely executable probe to Batch 0, Coordinator, Operator or Architect. A planned command, installed tool, configuration file, older-version success or "a later role will verify" is not evidence. A disproved route is revised or rejected now. When the exact probe needs network, installation, credentials, protected writes or another authority, exhaust local and temporary-workspace alternatives, request the minimum authority once with command, location, cost and cleanup, and keep the SDD `in-review` until it runs.

Ground the external capabilities on which key design decisions depend. Choose evidence appropriate to the claim: an applicable interface contract, official documentation, an existing consumer, or a necessary focused probe. Where version, runtime, types or call shape affect the decision, bind the evidence to those details. Do not require every project or import to install packages, compile or execute a consumer; reuse applicable existing evidence. Installation or resolution alone does not establish behavior. The module-path scan in repo-facts only identifies missing-evidence candidates: a match proves neither interface correctness nor evidence sufficiency, and a missing match may be resolved by citing the applicable evidence rather than running a new probe.

Observe the baseline of every gate used as an oracle or route decision before relying on it. A red baseline is recorded by diagnostic identity, and acceptance then compares identities, never counts. Design positive/negative examples clarify scope and decisions without creating an obligation to execute tests. Actual execution follows the mainline boundary in SKILL.md, including scratch consumers; a probe label does not change its authorization. When a probe is blocked, record the unverified limit; only a blocked route-critical probe keeps the SDD `in-review`. A probe that needs credentials or network becomes one authority request naming the exact command and scope. "Verify at admission" is never a disposition for a route-critical assumption.

Probes may run in a temporary directory, but the command, versions, environment, result and an output excerpt or attachment are persisted in the SDD's [evidence companion](../design/agent-context-map.md#evidence-companion); a path into a temporary directory is not evidence.

- Owner, path or contract replacement and legacy removal: the first falsifier is the module-reader inventory in [migration](../migration.md).
- Continuation of an unfinished delivery: load [continuation lineage](../design/continuation-lineage.md) first. An inherited failure has four dispositions only: a current rerun proves it resolved; an admitted requirement repairs it inside modification authority; causal evidence proves its package is outside every acceptance surface; or a user-owned decision changes the contract.

## Close decisions and freeze the boundary

Close every currently knowable authority decision across the whole Must-Ship graph before the first batch, following [decision authority](../design/decision-authority.md). Ordinary reversible technical choices inside the approved contract are never user questions.

Decisions about shared contracts, ownership and authority close across the whole Must-Ship graph; execution details of a later batch close when that batch's slice is admitted. A later batch's Must-Ship work stays a requirement, batch and dependency of this contract; it is never downgraded to deferred or non-goal because it is outside the current slice.

Challenge an internally inconsistent proposal by separating the outcome from the proposed mechanism and surfacing the smallest decision. Do not encode a pattern only because it is familiar or invent alternatives for ceremony.

Freeze the approved causal and modification boundary. A later failing root, browser, consumer or repository gate is evidence to classify, not permission to make it Must-Ship. Adding or removing a package, outcome, requirement, oracle or modification authority needs explicit user approval, and is never used to legitimize work already done.

## Review lenses and convergence gate

After the information set closes, apply three lenses: synthesis of the route, adversarial challenge of architecture and causal assumptions, and acceptance execution topology. They are lenses, not separate documents or agent calls. Record findings as blocking, material or residual; one evidence-backed clean pass suffices. A normative change reopens only the affected conclusions. Never invent a failure to show diligence.

## Exit gate

- [ ] Zero unresolved information questions, pending confirmations, route-critical unknowns, blocking or material findings.
- [ ] Every design-relevant product dimension is closed or not applicable; every Must-Ship requirement has one semantic owner, dependency direction, authority state, causal and modification boundary, atomic acceptance claim, executable evidence route and executed route-critical falsifier.
- [ ] Constraints are normalized with their non-implications; rejections and guards carry a counterexample.
- [ ] Every inherited obligation has a disposition; abstractions are justified by owned invariants.
- [ ] Synthesis, adversarial and acceptance-topology evidence covers the final design, rechecked after the last normative change.
- [ ] Every route-critical assumption was probed, or its authority request is recorded.
- [ ] External capabilities supporting key decisions have applicable evidence, including version/runtime details where material; gate baselines used as oracles are observed, and executed probe records are persisted in the evidence companion.
- [ ] Every document this phase loaded is listed in the SDD's authoring receipt with its current token.
- [ ] Remaining residual risks cannot invalidate Must-Ship behavior, ownership, scope, authority or verification, and are disclosed. Nothing was satisfied by downgrading, omitting, renaming or moving an item.

<!-- reading-receipt: 849c26af -->
