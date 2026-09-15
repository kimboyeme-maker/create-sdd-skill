---
name: create-sdd
description: Use when the user asks to create, refactor, merge or audit a Software Design Document (SDD) for a repository or product, or to make a design loop-ready. Not for ordinary plans, ADR/RFC comments or code-only analysis.
---

# Create SDD

Produce a design contract at the requested maturity: proposed design, document refactor, merge, document-only audit, or implementation-closure audit. Preserve user scope. Never turn a document request into source implementation, repository-wide verification or a commit unless explicitly requested.

## Mainline boundary (hard)

- The user's intent and requested deliverable are scope limits. Do not branch into unrequested features, refactors, tools, test development, coverage campaigns, benchmarks or speculative hardening, before or after the main result. Only a demonstrated prerequisite that blocks the requested result may be handled, inside existing modification authority.
- Tests serve business outcomes and are never the deliverable unless requested. Reuse the cheapest relevant evidence; invent no test files, frameworks, mutation platforms or acceptance obligations to satisfy generic guidance. An unrelated failing test does not expand the SDD. User prohibitions on creating, editing or running tests override every testing or probe recommendation here; state the unverified limits instead. Design positive/negative examples clarify the intended outcome and what would depart from it; they create no test obligation. Classify execution by what it does, not its name or location: running a program to check implementation behavior is testing, including in a scratch consumer; type checks, builds and dependency resolution may supply design evidence within the user's authority.
- Requirements, pseudocode and acceptance cover the user-owned delta. Adjacent defects and control-plane maintenance are recorded briefly, never promoted to Must-Ship. Add no second task graph, approval form or test program to enforce this.
- Inherit the global mainline hook and `AGENTS.md` restrictions. Never evade a denial through another tool, script, agent, renamed probe, policy edit or fabricated consent. Only a real user instruction opens tests for the current turn. If hook enforcement is unavailable, say so and keep obeying the boundary.

## Delivery priorities

Trade off as **usability/implementability > measured performance > feature breadth > test machinery >> optional security hardening**. This never permits omitting required behavior, fabricating PASS, leaking secrets, exceeding scope or unapproved irreversible actions. Prefer one usable end-to-end path and a conventional, recoverable implementation; add abstraction, configuration, compatibility or defensive machinery only for a current requirement or demonstrated failure, stating its benefit and cost in the design basis. Performance work needs a workload and an observable target. For stateful workflows, design the normal path and the shortest recovery from a rejected prerequisite across every entry point that enacts the same state change; rejection preserves committed state and leaves a valid repair path. Destructive steps follow confirmed commits and unrecognized data is preserved ([irreversible state changes](references/phases/3-design.md#irreversible-state-changes)).

## Design invariants

Correct violations at their cause instead of adding incident-specific clauses. Full statements: [invariants](references/invariants.md) (load when auditing, when a decision touches one, or when two conflict).

1. Problem truth · 2. Single authority · 3. Causal closure · 4. Proportionality · 5. Falsifiable evidence · 6. One work graph · 7. Decision closure · 8. Artifact custody · 9. Context economy · 10. Execution compatibility · 11. Evidence continuity · 12. Test topology convergence · 13. Incremental integrity · 14. Design-time proof · 15. Semantic fidelity · 16. Propagation closure · 17. Inventory/environment separation · 18. Promise–branch traceability · 19. Irreversible-state safety

## Repository fit

Read applicable `AGENTS.md` files and repository SDD templates first. Repository conventions override this skill's default shape; preserve an existing document's language, terminology, headings and IDs unless replacement is requested. Repository-specific mechanisms become requirements only when repository evidence establishes them. Without the repository or implementation, limit claims to supplied evidence and mark unknowns; never invent owners, paths, commands or completion evidence.

## Modes

Choose the narrowest matching mode; state the assumption when intent stays ambiguous after reading the supplied context.

- **Create or refactor**: revise an existing target in place unless replacement is requested or evidence proves a new owning document is needed. [writing](references/writing.md).
- **Merge**: consolidate while preserving decisions, provenance and stable IDs. [writing](references/writing.md), [merge](references/merge.md).
- **Document-only audit**: completeness, consistency, ownership, testability, open decisions; no implementation claims. [audit](references/audit.md).
- **Implementation or closure audit**: compare clauses with source, tests, metadata and reproducible evidence. [audit](references/audit.md), [closure evidence](references/closure-evidence.md).
- **Migration design**: add [migration](references/migration.md).
- **Program split**: assess both single- and multi-SDD suitability after the initial inventory; [program split](references/planning/program-split.md) is required before either choice. Shared prerequisites are dependency edges, not proof that consumers must merge. Propose boundaries with estimates and record the user's decision before creating child documents. Reuse an explicit split instruction without asking again. At most three levels; omit unnecessary groups. Meta references one authority graph, each Meta binds validators and each SDD has its own estimate. Only execution SDDs are Bundles.
- **Loop-ready**: when `sdd-loop-delivery` is installed, implementation-targeting work defaults to loop-ready unless document-only output is requested: follow [loop-ready](references/loop-ready.md), emit the machine-checkable index including `delivery_plan`, and obtain the controller compatibility receipt. Do not ask the user to announce the later loop run.

## Workflow

Create, refactor and merge work runs directly in the current task: read the requirements and relevant repository files, edit the requested SDD files, and run the local checks within user authorization.

Implementation-targeting work runs six phases. [Progressive loading](references/loading.md) names their references; reading requirements are defined by `scripts/lib/reading-policy.ts`. Ordinary receipt tokens identify document versions only: they do not authenticate tool reads or prove understanding. Local checks establish document/contract consistency, not sandbox enforcement or perfect semantic understanding. Independent review remains subject to the user's agent and budget permissions; disclose when it was not performed.

Keep repository input and output location independent. Read the actual system `$TMPDIR` when requested and write the sample there directly; absolute output paths are supported. Source paths remain repository-relative, and cross-document links resolve from their referring document. For an external SDD use `repo-facts.ts check --sdd <absolute-SDD> --repository <absolute-repository>` so output location does not change the source repository.

1. **Harvest** ([card](references/phases/1-harvest.md)): a cited fact ledger (`USER_STATED | OBSERVED | INFERRED | ASSUMED`) from six bounded passes, classifying `product_archetype`, `delivery_platforms` and languages, plus separate information and authority queues. Only stated or observed facts become normative.
2. **Admit** ([card](references/phases/2-admit.md)): record the agreed split and output set, including a reasoned single-SDD choice; close implementation logic with step-level pseudocode, normalize constraints, perform only authorized decisive checks, close authority decisions and pass the convergence gate.
3. **Design** ([card](references/phases/3-design.md)): one owner per semantic subject, derivable batches, and the [complete design template](references/complete-design.md) sections. Plan Mode outputs the complete proposed SDD and uses read-only `validate-draft`; it never replaces the document with a short plan.
4. **Verify** ([card](references/phases/4-verify.md)): one claim per acceptance case, oracle sensitivity for guards, failure-isolation dry run, reused test hosts and causal delivery gates.
5. **Decompose** ([work decomposition](references/work-decomposition.md)): lease-sized batches without write conflicts, lanes, prepared checks, final verification shards and a strict `test_budget` per batch, recorded as `delivery_plan`. Numeric limits belong to the delivery controller: read them from its `configuration`, never from memory. Draft the contract block in this phase, even when the SDD stays `in-review`, and run `validate-draft`; report waves, serial minutes and critical path from its output.
6. **Hand off** (loop-ready only; [loop-ready](references/loop-ready.md)): pass `validate` and the controller compatibility receipt, then report `LOOP_READY`.

## Output

- Multi-SDD output includes per-SDD estimates, total work and concurrency-aware elapsed time, exact SDD-to-task mapping by wave, prerequisites/worktrees, integration ownership and a clickable full-workflow launch with a copyable fallback. Follow the program-split reference. Never auto-start from document creation or multiply test permission/budgets by child count.
- Multi-SDD roots/groups use the delivery controller's `program-check --program <absolute-root-SDD>` command, not a fabricated executable contract. On the root, `reading-receipt.ts check` covers every node's receipt and `repo-facts.ts check` requires a sourced `split_decision` and checks every execution SDD; the six implementation phases and leaf LOOP_READY gates below apply to execution SDDs. Group overall completion follows its children's delivery, not the reverse.
- Preserve each split requirement's original document/ID and unique execution Bundle; multiple batches may reference it inside that Bundle. Bind real integration work and Asset acceptance as specified in the program-split reference.

- Create, refactor or merge: edit the target SDD and summarize decisions, unresolved items, verification plan and evidence limits.
- Audit: findings ordered by severity with location, consequence and fix; no rewrite unless requested.
- Extracting requirements from an older SDD does not inherit its protocol and does not cancel its product compatibility requirements. Independent review must assess split rationale, source fidelity, execution ownership and implementability against the current candidate, not merely count IDs or receipts.
- SDDs are delivered at the maturity their actual checks support. Missing or unrun required checks remain disclosed and do not permit a `LOOP_READY` claim. Never claim system-level anti-bypass enforcement.
- Report what was inspected, what remains unknown, and whether conclusions concern the document, the implementation or both. Never claim verification from a status label, planned command, test name or indirect evidence.
- New output uses `sdd-loop-delivery/v1` and `sdd-contract` markers with Coordinator/Operator/Architect roles; read current runtime and constants from `bun <loop-skill-root>/scripts/main.ts configuration`.
- New documents use `sdd-document/v1` IDs and presentation ([document presentation](references/document-presentation.md)); implementation-targeting documents pass `bun <create-sdd-root>/scripts/reading-receipt.ts check --sdd <SDD>`, `bun <create-sdd-root>/scripts/repo-facts.ts check --sdd <SDD>` and `validate --sdd <SDD> --document-policy current --design-policy current`; `validate` requires the contract block. `document-check` is only for documents that do not target implementation and never stands in for `validate`.
