# Complete implementation-targeting SDD

This is the canonical content template for create/refactor/merge work intended for implementation. It applies in Plan Mode and execution mode. Preserve repository language and equivalent heading names, but retain all five section identities below in `design_detail.sections`. A directory tree, checklist or JSON index cannot replace this prose.

## Plan Mode delivery

Plan Mode forbids writing the requested artifact; it does not reduce design depth. Output the complete proposed SDD, including its canonical implementation steps, machine index and any new routing document text. Never deliver merely “a plan to write an SDD.” Run safe read-only discovery and probes; do not implement production code or create temporary SDDs as a workaround for mode restrictions. Submit exact proposed Markdown through `validate-draft`'s stdin overlay. Existing linked evidence is read from disk. Proposed source files are design, not existing API evidence.

The validator returns DOCUMENT_VALID and reports structural/source-binding checks only. The author separately completes forward step execution and acceptance-to-entry reconstruction, checking actual interfaces, consumers, prerequisites, ownership and reachable failure paths. Only when these checks and all decisive permitted probes have actual supporting evidence may the author report the design ready (not persisted, not implemented). List concrete unresolved evidence/authority when this is not possible; continue solving discoverable gaps, never invent probe results or hand them to Operator as unspecified investigation.

After switching to a mode that allows edits, write that exact reviewed design, refresh any genuinely changed repository facts, and run `validate SDD --document-policy current --design-policy current`. Do not restart design merely because the mode changed. A disk fingerprint must equal the validated draft fingerprint when sources have not changed. No controller initialization or product edits are implied.

## Required human design sections

Headings may use the document language and section numbering such as `4.1 `. Machine-readable labels below stay exact; descriptions and values use the document language. Each section starts with `**Applicability:** APPLICABLE`. Breaking/API/entities sections may instead use NOT_APPLICABLE followed by `**Reason:**` and `**Evidence:**`; implementation and delivery remain applicable. N/A must follow inspected facts, not excuse omitted design.

### Breaking Changes

Use the fields **Before**, **After**, **Consumers**, **Migration**, **Intermediate states**, **Recovery**. Describe removals/replacements as well as additions. Include old/new examples, the real affected callers/readers, compatibility policy, staged order, valid intermediate states, and the precise rollback or forward-repair route. No breaking change still gets an evidenced N/A disposition. Existing user authorization is retained; do not ask again for an already approved break.

### New/Changed API & Typing

Use **Signatures**, **Inputs and outputs**, **Errors**, **Examples**, **Exports and consumers**. Give exact native-language signatures, including generics, defaults, unions/error variants or ownership semantics when used. Include valid/invalid caller examples and public export/generated declaration changes. Name existing symbols with their inspected source paths; declare planned symbols in this section before calling them from pseudocode. Ground an external symbol in proportion to what it decides: a capability the design depends on needs evidence that fits the claim, which may be an interface declaration, official material, an existing consumer in this repository, or an executed probe when nothing weaker settles it. `repo-facts.ts check` reports unmatched imported specifiers as grounding candidates for the author to answer; it does not reject them, and a candidate is not a finding. Match existing Go, Rust, Python or other native conventions; do not force TypeScript.

### New/Changed Entities & Tools

Use **Changes**, **Owners**, **Lifecycle**, **Dependencies**, **Reuse evidence**. Enumerate introduced, modified, reused and removed entities/modules/helpers/state/tools with their responsibility, owner, lifecycle and dependency direction. Show why existing canonical facilities cannot serve a proposed addition. Include the smallest annotated target subtree when locations change. No new tool is a valid outcome; do not manufacture a framework or helper inventory.

Before adding any entity, dependency, abstraction or file, climb the minimum-solution ladder and stop at the first rung that holds, recording the rung in **Reuse evidence**: (1) the outcome needs it at all; (2) the repository already has it; (3) the language standard library has it; (4) the platform or framework provides it natively; (5) an installed dependency provides it; (6) a few lines inside an existing owner suffice; (7) only then the smallest new unit. Climb only after the problem is understood. Never cut understanding of the real flow, input validation at trust boundaries, error handling that prevents data loss, security, accessibility, what the user explicitly asked for, or one runnable check per behavior change. A deliberate limit (a known ceiling accepted to stay small) is recorded as a residual risk with its trigger and upgrade path, never left implicit.

### Implementation Flow & Pseudocode

Use **Entry points**, **Ordered flow**, **Data and state**, **Step coverage**. Describe the complete runtime and implementation/migration flow, normal and reachable error paths, state transitions and shared authorities. Link every path and step from the existing work graph. Include meaningful concurrency/cancellation/resource behavior; for a synchronous resource-free path explain why it does not apply. Link every failure and guarantee row of the lifecycle section to the step and branch that implements it and to its acceptance ([design card](phases/3-design.md#asynchronous-work-and-context-bound-resources)).

Every indexed step has one canonical source section, with these exact labels:

````markdown
## BZ01 Validate before publishing

**Kind:** BEHAVIOR
**Location:** Proposed src/entry.ts, handle body
**Owner:** Existing request entry module
**Inputs and types:** request: Request supplied by the existing caller
**Preconditions:** The request has been decoded; prior result remains unchanged
**Calls:** The local guard; no helper API is introduced
**Pseudocode:**
```ts
if (request.value === undefined) return { ok: false, error: "Invalid" };
const validated = request.value;
```
**State changes:** None; publication occurs in the dependent BZ02 step
**Failure:** Return Invalid immediately and leave the previous result untouched
**Lifecycle and recovery:** Synchronous validation acquires no resource; a corrected request may retry
**Observable result:** Missing input returns Invalid without publication; YS01 observes both outcomes
````

`MECHANICAL` steps replace Pseudocode with **Operation** containing the exact bounded operation and its postcondition. Behavioral decisions cannot be hidden as mechanical work. One step is a meaningful operation, not every source statement. Shared logic has one defined producer and references from dependents. Do not copy it under different step IDs.

Before the step is finished, read its **Failure**, **State changes** and **Observable result** back against its own **Pseudocode**, claim by claim. The validator checks that each label is present and can never check that the labels describe the code beneath them, so a step whose Failure promises "identical to the previous behaviour" while its pseudocode ten lines above replaces the thrown object passes every gate with the contradiction sealed inside one section. This read-back costs a minute per step and is the only thing standing between a confident sentence and an admission refusal: a claim the pseudocode does not support is corrected in one of the two places before the step is called done.

Source index example, inside existing `implementation_logic.paths[].steps`:

```json
{"id":"BZ01","requires":["request"],"produces":["validated"],"source":{"document":"self","heading":"BZ01 Validate before publishing"}}
```

A path input produced by another path binds it: `{"name":"store","source":{"path":"LJ01","output":"store"}}`. `ENTRY` inputs carry evidence, and an `ENTRY` input that shares a name with another path's output either binds that path or sets `"independent_of_outputs": true`.

The human body is authoritative. The parser resolves pseudocode/failure into the existing implementation-logic representation in memory; new output omits those duplicated strings from JSON. If older duplicated fields exist they must exactly match the body. Prerequisites, outputs, requirement/acceptance relationships stay in the existing work graph. Reviewer fingerprints must be computed from the controller's resolved contract (`context-view` includes implementation_logic), not the unresolved raw JSON.

### Experience Architecture (products with a user interface)

Required when `product_archetype` has a user interface; otherwise omit. Use **Archetype and audience**, **Route set**, **Templates and regions**, **Journeys**, **Style hooks**, **States**, and for `content-publication` **Readability**, as defined in [experience contract](product/experience-contract.md). Decide these before components: routes and templates determine page structure, journeys determine continuity, and style hooks keep every visual value in tokens. The contract `experience_contract` block is the machine projection of this section.

### Platform and Architecture (every implementation SDD)

Use **Platforms**, **Lifecycle and navigation**, **Capabilities and permissions**, **Distribution gates**, **Compatibility and performance budgets**, **Surfaces and core boundary**. Close the dimensions from [delivery platforms](product/platforms.md) and each loaded platform and language guide with decisions and evidence. When one core feeds several surfaces, include the use-case mapping table, error catalog mapping and import-boundary enforcement from [core and adapters](product/architecture/core-adapters.md). The contract `delivery_platforms` field is the machine projection of this section; for a single-surface change this section may be a short evidenced paragraph inside Implementation Flow.

The contract's `architecture` field is **not** a general projection of this section. It is the [core and adapters](product/architecture/core-adapters.md) shape and nothing else: `protocol: "core-adapters/v1"`, a `core.packages` list, and a non-empty `adapters` array whose entries are thin translation layers over that core, on packages disjoint from it, scheduled after every core batch. The field is optional and omitting it is valid; declaring it without adapters is `ARCHITECTURE_ADAPTERS_REQUIRED`, and declaring peer packages as adapters invents a layer the repository does not have. A library whose consumers are independent products, a single-package change, and any design with no core/adapter split all omit it and say so in **Surfaces and core boundary** with the reason.

### Delivery & Verification

Use **Batches and dependencies**, **Exit conditions**, **Acceptance**, **Execution permissions**, **Executed probes**. Tie batches to existing requirements, implementation locations, prerequisite producer steps, admissible edit scope and observable exits.

**Execution permissions** lists every operation the delivery needs beyond reading the repository and running the acceptance commands already named in **Acceptance**: temporary writes to product source for a declared perturbation and their restoration, writes outside the modification packages, cache or tool-directory writes, network access, installs, and anything else a host will stop to approve. For each one name the operation, the exact paths, whether the change is temporary or persistent, and how restoration is proven. A test budget is not a substitute — it authorizes running tests, not mutating a source file — and neither is a perturbation described only inside a `perturbation_method` sentence.

This list exists because the alternative has a measured cost. A delivery whose design knew its perturbation paths but never projected them met the host's approval boundary one operation at a time, mid-lease, and was refused twice before the user could grant what was actually needed; the operations were reversible and already in scope, and the interruption was purely a disclosure gap. Collect them once, before the first lease, so the delivery can ask once. Declaring an operation is not being granted it: the host still approves or refuses, and a design may not promise that any approval will be given or bypassed. Derive the batches with [work decomposition](work-decomposition.md): state each batch's write packages, estimate basis, lane and dependencies, the serialization points you hoisted, and the resulting waves and critical path; the contract `delivery_plan` is the machine projection of exactly this text. Map each acceptance to its owning behavior. Record real decisive design probes with method, environment, failure condition, observed result and evidence location. The evidence location is the SDD's evidence companion, never only a temporary directory. Label demonstration fixtures as fixtures; do not copy their evidence claims into a real repository SDD.

Compare every proposed public signature with its actual baseline, including constructors, optional/default parameters and exports. Breaking/N/A declarations must agree with that diff; a constructor is not private merely because examples instantiate it indirectly. For each introduced state field, an indexed step specifies its exact initial value before first read, then its writer/owner and cleanup transitions. Mentioning a constructor as a location does not define initialization. An implementation evaluator who must supply these decisions has found incomplete design, even if guessed code passes tests; record the failure and correct its canonical step before accepting the document.

Before calling a design ready, walk each reachable branch and reverse-trace each acceptance to its producing path. Inspect undeclared direct consumers and alternate mutation entries, not just the listed steps. Pure structure cannot verify an API's real semantics or an experiment's truth. Missing calls, ownership decisions or migration choices must be designed now. Changed external facts later invalidate the affected assumptions; no process can promise knowledge of unobserved future facts.

## Source metadata and shared validation

New output adds a `design_detail` block to the existing contract, alongside current numbering/presentation metadata: one binding per section above, each naming the document and the heading that owns it. Its exact shape is in the [worked example](examples/loop-ready-example.md).

Bind each section with an anchor comment on the line above its heading — `<!-- sdd-section: breaking_changes -->`, then `api_typing`, `entities_tools`, `implementation_flow`, `delivery_verification`. Without one the binding matches the heading text and requires it to occur exactly once, so renumbering or translating a heading breaks it silently. `contract --check` derives the binding from the anchor when it is there and from the heading when it is not.

## Tables that carry their own machine columns

`contract --check` rebuilds a field from the markdown when the table that defines those objects carries the columns the field needs, and leaves the field to the author when it does not. A table missing a column is not a defect — it is a prose view, and deriving from it would mean inventing the missing values.

| Field | Table rows | Required columns | Optional |
|---|---|---|---|
| `requirements` | `XQnn` | `id`, `description`, `kind`, `status`, `acceptance_ids` | `dependencies` |
| `migration.legacy_surfaces` | `YLnn` | `id`, `owner`, `symbols`, `final_disposition`, `requirement_ids`, `acceptance_ids` | `zero_reader_acceptance_ids` |

One row replaces roughly ten lines of JSON, and the row is the copy a reader actually reads. Two tables defining the same prefix leave the field authored rather than picking one. `presentation`, `design_detail`, `ownership.packages`, `migration_applicability`, `inventory_authorities.SOURCE_INVENTORY.roots` and `design_convergence.status` are derived with no new structure at all; do not maintain them by hand.

A source is the root (`self`) or an existing/proposed normative Agent Context document path relative to the root SDD. Its heading must occur exactly once outside code. Do not use contextual or evidence documents as normative step owners.

Validate proposed documents with `validate-draft` before anything is written: pass the root SDD plus any new or revised Agent Context map and normative companions as complete strings, or a root-only draft through `--draft-file` or stdin. It reads existing linked evidence from disk, returns the delivery plan when the draft carries one, and never runs document commands, executes acceptance or signs evidence. Exact flags: the header of `bun <create-sdd-root>/scripts/validate.ts`.

Documents without `design_detail` are validated without section bindings; add it through a normal scoped amendment when the design is revised.

<!-- reading-receipt: 7dcaa1ee -->
