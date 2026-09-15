# Multi-SDD design and workflow handoff

Evaluate multi-SDD suitability after the initial requirement/ownership inventory, before committing to one large document. This reference is required for single-SDD choices too. Size is a signal, not a splitting rule. Present the proposed hierarchy, dependencies, work estimates and coordination cost, and ask once whether to split. An explicit split instruction already supplies this decision. Without approval retain a provisional root draft, not an implicitly approved single-SDD delivery; do not create children or tasks speculatively.

Ordinary authoring records the chosen boundaries, outputs and user decision in the SDD, then edits the files directly and uses the existing local checks. A single-SDD rationale must explain real coupling or disproportionate coordination cost; shared upstream APIs alone do not establish an indivisible delivery. Structure checks verify representation, not semantic correctness.

## Ownership tree and dependency graph

Maximum **three SDD levels**, counting the root: total SDD → optional business-group SDD → execution SDD. One or two levels are normal. Level three uses internal batches, never a fourth SDD level. Omit groups that only repeat their children.

The total SDD owns scope, shared constraints, derivation and overall completion. Groups own real business/composition boundaries, not a generic "conflicts layer". Every requirement and product write has exactly one execution owner. Parents reference children; foundation, wiring and integration work also belongs to an execution SDD. Parent constraints settle before derivation, but parent overall completion comes after children: never require parent SHIP as the prerequisite for its own children.

Cross-branch dependencies are edges, not additional parents. A Bundle is a dependency-bounded subgraph, not simply one head-to-tail path.

## Decide the cut before creating documents

Group requirements that share an authoritative state, an interface that must co-evolve or an indivisible business operation. Then mark producer/consumer dependencies and read/write conflicts. Only then choose batches and SDD boundaries.

Separate SDDs require stable external contracts, attributable outcomes, explicit prerequisite delivery and material benefit over extra Coordinator/admission/integration costs. Do not split by file, technical layer, requirement number or desired agent count. Small or tightly coupled work stays in one SDD.

- Several Providers touching app.tsx may be separate implementations with one wiring batch. Shared writes need a unique owner or execution order, not another document layer or a new registration framework.
- A consumer waits for the producer's usable artifact. Interface agreement permits only work not requiring the missing implementation; do not fabricate a stub to claim readiness.
- Two consumers of one foundation can be separate SDDs. Distinguish technical dependencies from a user-selected serial schedule; splitting documents does not authorize parallel execution or cancel that schedule.
- Cross-SDD cycles require a genuine shared foundation or a combined execution SDD. Do not dispatch both to negotiate their contract while implementing.
- A multi-predecessor integration Bundle declares merge/glue authority and an integration-first batch. Its delivered commit must contain every predecessor commit before downstream work starts. Scheduler coordination grants no product-write authority.
- A changed artifact affects only its consumers. Dependencies bind actual committed versions, not a thread ending or planned PASS.

## Five Meta kinds

The webpack analogy separates requirements from grouping; these are not five document levels.

| Kind | Meaning | Authority |
| --- | --- | --- |
| Entry | User business entry/outcome | Root/group clause and Module references |
| Module | One requirement | Execution SDD requirement ID |
| Chunk | Business-coherent implementation batch | delivery_plan batch ID |
| Bundle | Independently promised delivery unit | Exactly one execution SDD |
| Asset | Delivered file/directory | Producing Bundle, version and acceptance |

Every Meta binds validators.definition to "program-structure/v1" and validators.implementation to an object with owner, acceptance_ids, method and pass_condition. Preserve these fields; method/pass_condition explain the claim and never constitute execution evidence. Module/Chunk acceptance belongs to its requirement/batch; Asset/Bundle acceptance must have a bidirectional link to a non-non-goal producer requirement. A required Asset's linked acceptance must be verified for the delivered candidate, including when its requirement is should; never silently upgrade or waive the requirement.

An Entry owned by a root/group covers descendant Modules. With empty acceptance_ids it derives composition coverage from those deliveries. If it has an independent business integration condition, bind that acceptance to an existing descendant execution SDD. Do not invent a new Bundle or repeat child acceptance merely to populate a validator.

Structure does not prove implementation behavior. Planned Assets have no fabricated completion evidence. Runtime checks the child's authenticated state, current candidate and committed artifact before releasing dependents. Parent summaries reuse valid child evidence, not rerun all checks. Missing behavior verification stays unverified. A validation binding never authorizes test creation or execution.

## Program index

Put one JSON block between `<!-- sdd-program:start -->` and `<!-- sdd-program:end -->` in the total SDD, separate from leaf sdd-contract blocks.

- protocol: "sdd-program/v1"; id and revision identify the program and current design.
- split_decision: {source, reference}. source is `USER_STATED` (the user answered the one split question) or `EXPLICIT_INSTRUCTION` (the request itself asked for a split); reference quotes or points to that message. An author's own judgment is not a source. `repo-facts check` on the root reports `SPLIT_DECISION_UNRECORDED` without it and checks every execution SDD; `reading-receipt check` on the root checks every node's receipt.
- nodes: {id, parent, kind, sdd, estimate}. Root parent is null and its sdd points to the total document itself. Other nodes have one group parent. kind is group or execution. Paths are relative to the total SDD directory; no path/symlink escape. A one-document program may have an execution root.
- estimate: [min,max] minute ranges for design, implementation, integration, verification and conditional_verification, plus basis and waiting text. Groups have zero implementation/integration/verification: delegate such work to execution Bundles. Group design covers only their own design/coordination. An execution node's implementation+integration+verification range must hold its own `delivery_plan` batch minutes and not exceed three times that sum; otherwise program-check reports `PROGRAM_ESTIMATE_DIVERGED` and one of the two estimates is reconciled.
- metas: {id, kind, owner, members, requires, validators}. Owner is a node ID. Entry members are Modules; Chunk members are its owner's Modules; Bundle members are its owner's Chunks. Module/Asset members are empty. Module/Chunk source_id references its existing requirement/batch ID.
- Requirement execution ownership is unique per Bundle, not per Chunk: multiple ordered Chunks in that same Bundle may reference one Module. Keep their batch requirement/acceptance references unchanged.
- Every Module in a multi-Bundle program includes origin: {document, requirement_id}, where document is relative to the program directory and identifies the original normative SDD. The referenced requirement must exist. Preserve the original pair when deriving children; identical local IDs in different original documents are distinct. A new requirement originally authored in a leaf references that leaf. A one-Bundle legacy Module may omit origin and resolves to its own leaf/source_id. Duplicate original identities are rejected across all Modules.
- Bundle reads lists repository-relative shared inputs; requires lists Asset IDs. Other kinds have empty requires. Asset path names a delivered repository-relative file/directory; its owning execution node is its producer.
- A Bundle with multiple producer Bundles must set integration_batch_id to an existing first delivery-plan batch with no batch prerequisites; every other batch must depend on it transitively. A dedicated integration Bundle or a consumer's own integration-first batch are both supported. Nonzero integration estimates alone do not establish this responsibility. Dependent product work starts only after all required commits are in its worktree.
- execution: {max_parallel, total_test_seconds, base_ref, allocations}. Allocations map every Bundle ID to its lifetime test seconds including all roles, rounds and retries, and sum to at most the total. These are proposed limits, never inferred user consent.

Children point back to the root in Linked SDDs. Existing leaf contracts own requirement, batch, acceptance and write-set definitions. The index only joins them; do not maintain another normative program table or product-status graph.

Run `bun <loop-skill-root>/scripts/main.ts program-check --program <absolute-total-SDD>`. It applies the delivery leaf parser, including normative companion sources and batch validation, for structural diagnostics, estimates and bounded-concurrency waves. This does not execute acceptance commands or replace leaf admission/compatibility gates. Group documents are not executable leaf contracts and must not be labelled LOOP_READY by a leaf controller.

## Estimates and execution instructions

Every generated SDD reports its own design, implementation, integration, verification estimate and basis. Unapproved tests are conditional and excluded from authorized totals. Waiting is separate from active work. Estimates are not deadlines, billed credits or authorization.

The final report must include:

1. Every SDD's own estimate and dependencies, including group documents.
2. Aggregate work without child duplication and elapsed time under stated concurrency. The checker reports a conservative wave schedule, not an optimal critical path; disclose external waits and conditional verification separately.
3. One top-level scheduling task (normally the current task), total execution task count, peak concurrent tasks, and exact SDD paths per wave. Delivery's internal roles consume additional host capacity and credits.
4. Which parent documents need no execution task, which versions/worktrees are required and which Bundle owns integration.
5. A copyable launch instruction in the user's language, for example `使用 sdd-loop-delivery 启动 <actual absolute total SDD path> 的完整 workflow`, with the real path substituted. It is an instruction for a host session, not a shell command; a host that renders follow-up actions may present it as one.

Creating documents does not start implementation. A workflow-start instruction authorizes orchestration within explicit limits, not tests, commits, merges or extra budget. Collect missing launch choices once. After launch, workflow automatically advances ready Bundles rather than asking the user to open every wave.

## Runtime boundary and compatibility

Read delivery's [program workflow](../../../sdd-loop-delivery/references/program-workflow.md) when executing. One scheduling task coordinates independent tasks/worktrees; groups do not each get a team. Runtime mappings and budget reservations belong to delivery; product facts remain in child controllers.

New single-SDD authoring also requires the approved assessment. Preserve requirement IDs, active controllers and budgets. Do not claim unverified host/runtime behavior.

<!-- reading-receipt: 18688575 -->
