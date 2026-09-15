# Phase 1 · Harvest facts and converge the brief

Load at the start of implementation-targeting create, refactor or merge work. The output is a cited fact ledger kept outside the SDD and two question queues. Nothing written in this phase is normative.

## Treat the first reading as a hypothesis

Restate the observable user outcome, the business or user purpose behind it, the supplied mechanism, explicit constraints, exclusions and the apparent authority boundary. Mark every inferred statement as a hypothesis. A disposable working draft may expose missing facts; it is never an SDD revision, decision record, acceptance contract or `LOOP_READY` evidence.

## Fact ledger

```text
FACT-ID | kind | statement | source | dimension | confidence | invalidated_by
```

- `kind`: `USER_STATED` (verbatim or faithfully normalized user wording), `OBSERVED` (read or executed evidence), `INFERRED` (reasoned from observed facts), `ASSUMED` (believed, not evidenced).
- `source`: `path:line`, `command → exit + key output`, or a user quote. A fact without a source is `ASSUMED`.
- `dimension`: `OUTCOME`, `CONSTRAINT`, `EXCLUSION`, `OWNER`, `SURFACE`, `CONSUMER`, `STATE`, `COMPATIBILITY`, `ENVIRONMENT`, `TEST_HOST`, `RISK`, `EFFORT`, `WRITE_SET`.
- `invalidated_by`: the single observation that would make the fact false; it becomes the falsifier when the fact is route-critical.

Only `USER_STATED` and `OBSERVED` facts become normative. An `INFERRED` fact that controls owner, route, acceptance or plan needs a probe. An `ASSUMED` fact becomes an `INFORMATION_QUESTION`, an `AUTHORITY_CONFIRMATION` or a falsifier to run; it never silently becomes a requirement.

## Sources, in reading order

1. The user request verbatim, plus any issue, note or prior conversation the user supplied.
2. `AGENTS.md`, repository SDD templates and conventions nearest to the target.
3. The target SDD and its predecessors; when loop sidecars exist, read-only `status`, `audit` and `context-view`. For an existing SDD inventory its stable IDs, accepted decisions, unresolved items, contract index and Agent Context pointers, and classify each requested change as preserve, amend, add, remove, move or path-refresh.
4. Manifests and workspace configuration, public exports and entry points.
5. Direct consumers and reader edges of the touched surfaces.
6. Test hosts, CI configuration and the commands that actually run them.
7. `git status --short`, relevant diffs and history of touched files (Git is optional; dirty state is context, not durable evidence).
8. Safe read-only probes: type checks, focused test runs, package-resolution checks, isolated reproductions.

Use `rg --files`, manifest reads and targeted searches before opening source files. Stop a source class when the next file cannot change an owner, route, oracle, write set or estimate, and record `NOT_INSPECTED: <what> — <why it cannot change the design>`.

## Six bounded passes

Do not start a pass while the previous one can still change its output.

1. **Intent extraction.** Classify the product with [archetypes](../product/archetypes.md) (`product_archetype`), then `delivery_platforms` with [delivery platforms](../product/platforms.md) and the in-scope languages from manifests. The archetype, each platform and each language guide add their design-controlling dimensions; classify each dimension `REQUIRED_AND_CLOSED`, `REQUIRED_BUT_UNKNOWN` or `NOT_APPLICABLE` with a reason, and never ask about one that cannot change the design. Split the request into outcome, audience, constraints, exclusions, success signals and priority. Modal words (`must`, `only`, `never`, `不要`, `必须`) are constraint candidates; negations are exclusions whose non-implications you write down; a scope statement attributed to the user cites its `USER_STATED` row, and an author-proposed exclusion that removes or visibly degrades an outcome the user discussed is an `AUTHORITY_CONFIRMATION`, not a silent non-goal; examples are acceptance candidates; named files and tools are surface anchors. Exit: every sentence maps to a ledger row or is recorded as rationale.
2. **Surface map.** For each anchor find the owning package (manifest identity and root), public boundary, persisted state and lifecycle owner. Exit: every anchor has one `OWNER` and one `SURFACE` row, or an explicit unknown.
3. **Delta localization.** Record current (observed) against desired (stated) behavior, the locations that must change, the reader edges that observe them and the test hosts already covering the concept. Exit: each outcome names its landing boundary and at least one existing or justified new test host.
4. **Write set and effort.** For each landing boundary record the write set, read set, serialization points (lockfiles, root configuration, barrel exports, generated registries, schema files) and effort drivers. Exit: every landing boundary has `WRITE_SET` and `EFFORT` rows. When the rows show several independent owners and write sets, evaluate [program split](../planning/program-split.md).
5. **Constraint and risk scan.** Record the execution environment as `OBSERVED` facts: tool version pins, the package-manager and workspace authority that manages every touched package, generated registries and schema directories, and the runtime of each executor (product toolchain, verification toolchain, delivery controller) separately. Then check compatibility (exports, wire and data formats, persisted state), dependency operations ([artifacts and dependencies](../design/artifacts-and-dependencies.md) when any is planned), protected artifacts, guards needing oracle sensitivity, performance claims needing a workload, and environment assumptions. Exit: every risk is designed out, owned by a requirement, or disclosed as residual with its reason.
6. **Contradiction and gap check.** Compare rows within each dimension: two owners for one subject, a constraint contradicted by an observation, an exclusion that removes a required consumer, an assumption the route depends on. Convert each into one queue item or one probe. Exit: both queues are final and every route-critical `INFERRED` or `ASSUMED` fact has a probe.

## Two queues, never mixed

- `INFORMATION_QUESTION`: a fact that cannot be obtained safely from evidence. Its answer changes knowledge only and grants no scope, permission, risk acceptance or product decision. Never ask what a tool can answer.
- `AUTHORITY_CONFIRMATION`: authorization of a contract, scope, public behavior, destructive or external action, material risk, ownership or deferral change, using the brief in [decision authority](../design/decision-authority.md). A preference is one only when it changes an authorized contract or selects a choice reserved to the user.

Resolve discoverable facts first. Ask in rounds: order open decisions by dependency, ask the whole frontier at once (numbered, each with a recommended answer, its reason and what changes otherwise), record answers as `USER_STATED` rows, recompute the frontier, and stop when it is empty and the user confirms a one-sentence restatement.

## Milestone report

After pass 6 report once: outcome and users; confirmed facts by dimension with counts per kind; surfaces and owners; write sets and serialization points; top risks with falsifiers; both queues. Omit empty groups. The report is not approval; continue into design without waiting when both queues are empty.

## Exit gate

- [ ] Every request sentence maps to a ledger row; every row has a source or is `ASSUMED`.
- [ ] Archetype, platforms and languages are recorded; every design-controlling dimension is classified.
- [ ] Every anchor has an owner and surface; every outcome has a landing boundary, test host, write set and effort rows.
- [ ] Every risk has a disposition; every route-critical inference or assumption has a probe or queue item.
- [ ] Environment facts (version pins, managing workspaces and lockfiles, executor runtimes) are `OBSERVED` for every touched package.
- [ ] Both queues are final and separated by effect.
- [ ] Every document this phase loaded is listed in the SDD's authoring receipt with its current token.

## Anti-patterns

- Summarizing files instead of extracting sourced facts; reading the whole repository "to be safe".
- Treating a tool's presence, a config file or a planned command as evidence that a route works.
- Taking the first interpretation of a phrase as a constraint without writing what it does not imply.
- Asking the user for a fact a read-only command can establish, or mixing a question with a confirmation.

<!-- reading-receipt: 32e5425e -->
