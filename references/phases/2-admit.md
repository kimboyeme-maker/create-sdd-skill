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

### Build the fixture for the mechanism you are inventing

A probe that only reads answers "is my premise about the repository true?". It cannot answer "does the
mechanism I just designed actually carry the shapes it has to carry?" — and that is the question a
design gets wrong in the expensive direction, because the pseudocode reads as though it works.

So for every path that introduces a mechanism the repository does not already run — a new
construction order, a new entry form, a new protocol or handoff, a new ownership boundary — on which
a Must-Ship requirement depends, the challenge's `method` is an **executed fixture**, not an
inspection. The fixture instantiates the designed mechanism, exercises it with the real shapes it
must carry (each named consumer, each awkward caller, the boundary case the design claims to fix),
and reports per-assertion. Where the mechanism does not exist yet, build the smallest thing that has
its structure — if a shape cannot be expressed against that, the real implementation cannot express
it either.

**A behaviour-preserving replacement needs the same fixture, and it is the case that gets skipped.**
Rewriting an expression, merging two branches into one predicate, routing an existing call through a
new helper, replacing a local implementation with a shared one: none of these invent a mechanism, all
of them assert an equivalence, and an equivalence is the claim a reading is worst at. "It is an
ordinary application of something the repository already runs" exempts a step only when that step
replaces nothing. The moment the design says *instead of*, the incumbent behaviour is the thing under
test and citing its source location proves only that it exists.

A fixture that passes on the first run has proved nothing yet. Perturb it: break the ordering it
depends on, restore the behaviour it claims to replace, and confirm the matching assertion flips.
An assertion that cannot be made to fail is measuring nothing, and is rewritten until it can.
Record, in the challenge, what was perturbed and what flipped.

Read the perturbation results in both directions, because each direction catches a different defect:

- **A perturbation that flips nothing is a missing assertion, not a passing fixture.** Disabling one
  of the mechanism's behaviours and watching every assertion stay green means nothing in the fixture
  exercises that behaviour. Add the assertion and rerun; do not delete the perturbation to make the
  run look clean. This is how a design learns that one half of a mechanism it was about to ship is
  load-bearing — the missing arm is usually the one the pseudocode treats as obvious.
- **An assertion no perturbation reaches can still be vacuous.** Perturbation only falsifies the
  assertions whose path it touches, so an assertion that is true by construction — a condition that
  short-circuits, a comparison of a value with itself, a check that restates the setup — passes every
  arm and proves nothing. For each assertion, name the fact it would catch if the mechanism were
  wrong; an assertion with no such fact is rewritten, and one whose subject the fixture never
  constructs is split so the setup itself is asserted first.

Both readings are cheap and they are the point of running the fixture at all. A design that skips
them has a green file and the same unexamined pseudocode it started with.

#### A preservation fixture is differential, not assertional

A fixture that asserts what the new design does will pass when the design is wrong, because the
design is what wrote the assertions. Asserting "the hostile getter now becomes a typed rejection
instead of escaping" is a faithful description of the intended mechanism and, if the incumbent
preserved the original error, it is also a recorded regression with a PASS beside it. The fixture
answered "does my design do what I designed?" and nobody asked the other question.

So a preservation claim runs **both** implementations over one input set and asserts the difference is
empty — the `differential` oracle kind from [acceptance standards](../product/acceptance-standards.md),
applied at design time. Build the incumbent arm from the real code where it can be imported or copied
verbatim, and from its observable contract where it cannot. Compare what the migration promised to
preserve: returned value, thrown value's **identity** (`thrown === original`) and native type, the
`cause` chain, call count and order, and which branch ran. Inputs come from the reachable set worked
out below, and every input on which the arms differ is either a defect to fix or an intentional
behaviour change that owes its own clause — never a diff quietly narrowed until it is empty.

Keep it proportional. This is design evidence, not a test suite and not a deliverable: one runnable
file per mechanism, living beside the SDD with the rest of the evidence, no product source touched
and no acceptance obligation created by its existence. A step that adds behaviour without replacing
any needs no fixture when it is an ordinary application of something the repository already runs —
cite the existing usage instead; a step that replaces behaviour does not qualify, whatever it reuses.
The difficulty drivers already named in the design basis are the list to work from: if a driver has no
fixture and no cited precedent, the logic is not closed, and the pseudocode that rests on it is a
proposal rather than a design.

#### An equivalence claim is falsified on its value set, not read off the two expressions

Every "instead of" carries a hidden universal claim: *for every value this is evaluated on, old and
new agree*. Reading the two forms side by side checks the shape; it never checks the quantifier. Close
it with three lines in the challenge, in this order:

1. **The reachable set.** What values does this expression actually see at run time? Not the declared
   type — the values the surrounding code can produce. A depth counter guarded by an overflow branch
   reaches every depth beyond the boundary, so a predicate that was true at exactly the boundary and a
   predicate that is true from the boundary onward are different functions on a set the code visits.
2. **The witness search.** Name one value where old and new differ. If one exists, the claim is false
   and the design changes; the search succeeds far more often than the reading suggests it will. Only
   if no witness can be constructed does the claim survive, and then say what made it impossible.
3. **The surviving distinction.** Before merging two forms, state what each one means. Repeated
   occurrences of one literal are not one concept: a threshold asking *am I past the boundary* and a
   threshold asking *am I the frame at the boundary* share a number and nothing else, and "unify the
   constant" destroys the second while the diff looks like a rename. The same holds for collapsing
   several rejection reasons into one, or several error constructions into one — write down which
   distinctions the incumbent made and which of them the new form still makes.

A step whose challenge omits these has an unexamined universal claim in its pseudocode, however
carefully the prose around it is written.

#### Say where an `observed_result` came from

A challenge record is `{premise, method, failure_condition, observed_result, implementation_resolution, result, evidence}`, and none of those fields distinguishes a result that was executed from one that was reasoned. Both read identically, both satisfy the controller, and the reasoned one is the one that ships a defect — the author who wrote "the truth sets are identical" into `observed_result` believed it, which is exactly why nothing downstream questioned it.

Add `provenance` to every challenge, `"EXECUTED"` or `"REASONED"`:

```json
{"premise": "…", "method": "…", "failure_condition": "…", "provenance": "EXECUTED",
 "observed_result": "…", "implementation_resolution": "…", "result": "CLOSED",
 "evidence": ["feature.evidence.md#fixture-a"]}
```

- `EXECUTED` means something ran and its output was read. `evidence` then names where that run is recorded — the evidence companion entry, the fixture file, the command and its output excerpt.
- `REASONED` means the conclusion came from reading. It is honest and often sufficient for a premise about repository structure, and it **may not carry `result: "CLOSED"` on a premise a Must-Ship requirement rests on**: either run it, or leave it open and let the gate say so.
- `evidence` pointing only at the source files the reasoning was about is not evidence of anything happening; it is a citation of the subject. `repo-facts.ts check` reports these as candidates for the author to answer rather than failures to fix, because a citation can be legitimate context — answer it in the document or replace it with a run.

The asymmetry this removes is worth naming: `oracle_sensitivity` already forces an acceptance guard to declare its fault model, its perturbation, its restoration and its expected flip, and `DESIGN_PROVEN` there demands a recorded probe. The design-side challenge had none of that, so the weakest evidence in the contract was attached to the claims the whole route rests on.

- Owner, path or contract replacement and legacy removal: the first falsifier is the module-reader inventory in [migration](../migration.md).
- Continuation of an unfinished delivery: load [continuation lineage](../design/continuation-lineage.md) first. An inherited failure has four dispositions only: a current rerun proves it resolved; an admitted requirement repairs it inside modification authority; causal evidence proves its package is outside every acceptance surface; or a user-owned decision changes the contract.

## Close decisions and freeze the boundary

Close every currently knowable authority decision across the whole Must-Ship graph before the first batch, following [decision authority](../design/decision-authority.md). Ordinary reversible technical choices inside the approved contract are never user questions.

Decisions about shared contracts, ownership and authority close across the whole Must-Ship graph; execution details of a later batch close when that batch's slice is admitted. A later batch's Must-Ship work stays a requirement, batch and dependency of this contract; it is never downgraded to deferred or non-goal because it is outside the current slice.

Challenge an internally inconsistent proposal by separating the outcome from the proposed mechanism and surfacing the smallest decision. Do not encode a pattern only because it is familiar or invent alternatives for ceremony.

Steps say how; acceptances say done. A measurable threshold that can fail a delivery — a line count,
a percentage reduction, a size ceiling — belongs in an acceptance, never in a step's observable
result. One delivery stopped on "install-runtime.ts normally formatted <= 440 lines" written into an
implementation step, while the requirement's only acceptance was behavioural and named neither the
file nor any count: a complete candidate at 502 lines was refused, and the acceptance that decides
whether the requirement is met was never run. The number had reached the step through three
successive design estimates — 430-450, 434-481, 404-440 — each of which came in under the eventual
502. Estimates do that; the defect was promoting one to a gate. If a structural outcome matters,
state the structure an acceptance can observe ("both paths reuse one shared step; neither repeats
registration construction") rather than a count standing in for it.

Record every revision bump in `lineage.revision_ledger`: one entry per bump, `{from, to,
requirements_added, requirements_removed, packages_added, batches_added, authorization}`. A
document that is not at its first revision owes this ledger, its entries chain, the last entry names
the current revision, and an entry that adds a requirement or an owned package carries the user's
own words authorizing it together with where they said them. This exists because a handed-off
design is the next session's raw material and the run that grows a document is never the run that
wrote it: without the ledger nothing could compare a revision against its predecessor, and a later
run added nine requirements and two owned packages to a converged, loop-ready contract, re-ran the
three lenses against its own enlarged version, and passed every check. Half of each entry is
verified against the contract — an id or package named as added has to be there — and the other
half is your word that nothing else was added. An omission is therefore not silence; it is a ledger
that contradicts the revision it claims to describe.

Freeze the approved causal and modification boundary. A later failing root, browser, consumer or repository gate is evidence to classify, not permission to make it Must-Ship. Adding or removing a package, outcome, requirement, oracle or modification authority needs explicit user approval, and is never used to legitimize work already done.

## Review lenses and convergence gate

After the information set closes, apply three lenses: synthesis of the route, adversarial challenge of architecture and causal assumptions, and acceptance execution topology. They are lenses, not separate documents or agent calls. Record findings as blocking, material or residual; one evidence-backed clean pass suffices. A normative change reopens only the affected conclusions. Never invent a failure to show diligence.

The adversarial lens is the one that decays into a free-text PASS, because it is the author grading their own design with no required output. Give it a fixed subject so it cannot: **enumerate every behaviour this design replaces, and record the witness search for each.** One row per replaced behaviour — the incumbent form, the proposed form, the reachable value set, the witness found or the reason none exists. A `PASS` whose evidence names no replaced behaviour is an unapplied lens wearing a result, and a design that replaces nothing says so in one line instead. Findings from the other two lenses stay free-form; this list is what makes the adversarial one falsifiable by a reader who did not write the design.

All three are recorded, because an unrecorded lens was not applied and an absent result is not a clean one. Write the outcome into the contract as it is reached:

```json
"design_convergence": {
  "status": "CONVERGED",
  "unresolved_information_questions": [],
  "pending_authority_confirmations": [],
  "route_critical_unknowns": [],
  "blocking_findings": [],
  "material_findings": [],
  "stable_after_last_normative_change": true,
  "review_passes": [
    {"id": "SP01", "lens": "SYNTHESIS", "result": "PASS", "revision": "<the contract's own revision>", "evidence": "what was examined and where"},
    {"id": "SP02", "lens": "ADVERSARIAL", "result": "PASS", "revision": "<same>", "evidence": "the challenge and its answer"},
    {"id": "SP03", "lens": "ACCEPTANCE_TOPOLOGY", "result": "PASS", "revision": "<same>", "evidence": "the execution shape checked"}
  ]
}
```

Earlier entries stay as history: a lens that failed and was rerun converges on its rerun. Each pass names the contract `revision` it was performed against, and the gate requires **exactly one pass per lens at the current revision**. Without that marker the entries cannot be separated into rounds, and a document that re-reviewed two of three lenses reads as fully reviewed because the third lens's stale pass fills the gap — which is what a real regenerated document did, carrying six passes the gate accepted. Reported as `DESIGN_GATE_LENS_REVISION_MISSING`, `DESIGN_GATE_LENS_NOT_CURRENT` and `DESIGN_GATE_LENS_DUPLICATED`. A contract with no `revision` of its own cannot be split into rounds either, so one entry per lens is the only shape it may carry.

Evidence that describes its own limits — a single-owner self-review, say — is honest and still counts as that lens having been applied; it does not excuse the other two.

## Exit gate

`repo-facts.ts check` enforces this list; it is not a reminder. An open information question, an
open route-critical unknown, a blocking or material finding, a missing or failing review lens, or a
design that is not stable after its last normative change each fail the check by name, and a status
other than `CONVERGED` fails as `DESIGN_NOT_CONVERGED`. The one handoff that may stay `IN_REVIEW` is
a design whose sole open item is a decision the user owns, carried by a `requirement_type:
"decision"` requirement — that is not unfinished work, and the delivery loop has a channel for it.
Everything else on this list is this skill's own work, and leaving it for the delivery to discover
costs an initialised run and a refused admission.

- [ ] Zero unresolved information questions, pending confirmations, route-critical unknowns, blocking or material findings.
- [ ] Every design-relevant product dimension is closed or not applicable; every Must-Ship requirement has one semantic owner, dependency direction, authority state, causal and modification boundary, atomic acceptance claim, executable evidence route and executed route-critical falsifier.
- [ ] Constraints are normalized with their non-implications; rejections and guards carry a counterexample.
- [ ] Every inherited obligation has a disposition; abstractions are justified by owned invariants.
- [ ] Synthesis, adversarial and acceptance-topology evidence covers the final design, rechecked after the last normative change.
- [ ] Every route-critical assumption was probed, or its authority request is recorded.
- [ ] External capabilities supporting key decisions have applicable evidence, including version/runtime details where material; gate baselines used as oracles are observed, and executed probe records are persisted in the evidence companion.
- [ ] Every document this phase loaded is listed in the SDD's authoring receipt with its current token.
- [ ] Remaining residual risks cannot invalidate Must-Ship behavior, ownership, scope, authority or verification, and are disclosed. Nothing was satisfied by downgrading, omitting, renaming or moving an item.

<!-- reading-receipt: bb2a47af -->
