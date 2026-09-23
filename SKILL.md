---
name: create-sdd
description: Use when the user asks to create, refactor, merge or audit a Software Design Document (SDD) for a repository or product, or to make a design implementation-ready. Not for ordinary plans, ADR/RFC comments or code-only analysis.
---

# Create SDD

Produce a design contract at the requested maturity: proposed design, document refactor, merge, document-only audit, or implementation-closure audit. Preserve user scope. Never turn a document request into source implementation, repository-wide verification or a commit unless explicitly requested.

## Mainline boundary (hard)

- The user's intent and requested deliverable are scope limits. Do not branch into unrequested features, refactors, tools, test development, coverage campaigns, benchmarks or speculative hardening. Only a demonstrated prerequisite that blocks the requested result may be handled, inside existing modification authority.
- Tests serve business outcomes and are never the deliverable unless requested. Reuse the cheapest relevant evidence; invent no test files, frameworks or acceptance obligations to satisfy generic guidance. A user prohibition on creating, editing or running tests overrides every recommendation here; state the unverified limits instead. Classify execution by what it does, not its name or location: running a program to check implementation behaviour is testing, including in a scratch consumer; type checks, builds and dependency resolution may supply design evidence within the user's authority.
- Requirements, pseudocode and acceptance cover the user-owned delta. Adjacent defects are recorded briefly, never promoted to Must-Ship.
- Inherit the global mainline hook and `AGENTS.md` restrictions. Never evade a denial through another tool, script, agent, renamed probe, policy edit or fabricated consent. If hook enforcement is unavailable, say so and keep obeying the boundary.

## Delivery priorities

Trade off as **usability/implementability > measured performance > feature breadth > test machinery >> optional security hardening**. This never permits omitting required behaviour, fabricating PASS, leaking secrets, exceeding scope or unapproved irreversible actions. Add abstraction, configuration or defensive machinery only for a current requirement or a demonstrated failure, and state its cost ([design card](references/phases/3-design.md)).

## Design invariants

Correct violations at their cause instead of adding incident-specific clauses. Full statements: [invariants](references/invariants.md) (load when auditing, when a decision touches one, or when two conflict).

1. Problem truth · 2. Single authority · 3. Causal closure · 4. Proportionality · 5. Falsifiable evidence · 6. One work graph · 7. Decision closure · 8. Artifact custody · 9. Context economy · 10. Execution compatibility · 11. Evidence continuity · 12. Test topology convergence · 13. Incremental integrity · 14. Design-time proof · 15. Semantic fidelity · 16. Propagation closure · 17. Inventory/environment separation · 18. Promise–branch traceability · 19. Irreversible-state safety

## Repository fit

Read applicable `AGENTS.md` files and repository SDD templates first. Repository conventions override this skill's default shape; preserve an existing document's language, terminology, headings and IDs unless replacement is requested. Without the repository or implementation, limit claims to supplied evidence and mark unknowns; never invent owners, paths, commands or completion evidence.

## Modes

Choose the narrowest matching mode; state the assumption when intent stays ambiguous after reading the supplied context.

| Mode | What it does | Load |
|---|---|---|
| Create or refactor | Revise in place unless replacement is requested | [writing](references/writing.md) |
| Merge | Consolidate, keeping decisions, provenance and IDs | [writing](references/writing.md), [merge](references/merge.md) |
| Document-only audit | Completeness, ownership, testability, open decisions; no implementation claims | [audit](references/audit.md) |
| Implementation or closure audit | Compare clauses with source, tests and reproducible evidence | [audit](references/audit.md), [closure evidence](references/closure-evidence.md) |
| Migration design | Adds reader inventory and legacy-surface disposition | [migration](references/migration.md) |
| Program split | Assess single- and multi-SDD suitability after the inventory; required before either | [program split](references/planning/program-split.md) |
| Contract | Default for implementation work: the machine-checkable contract | [contract](references/loop-ready.md) |

## Workflow

Create, refactor and merge work runs directly in the current task. Implementation-targeting work runs six phases; [progressive loading](references/loading.md) names their references and `scripts/lib/reading-policy.ts` defines what must be read.

1. **Harvest** ([card](references/phases/1-harvest.md)): a cited fact ledger (`USER_STATED | OBSERVED | INFERRED | ASSUMED`) classifying `product_archetype`, `delivery_platforms` and languages. Only stated or observed facts become normative.
2. **Admit** ([card](references/phases/2-admit.md)): record the agreed split and output set; close implementation logic with step-level pseudocode, run only authorized decisive checks, close authority decisions and pass the convergence gate.
3. **Design** ([card](references/phases/3-design.md)): one owner per semantic subject, derivable batches, and the [complete design template](references/complete-design.md) sections. Plan Mode outputs the complete proposed SDD through read-only `validate-draft`, never a short plan instead.
4. **Verify** ([card](references/phases/4-verify.md)): one claim per acceptance case, oracle sensitivity for guards, reused test hosts and causal delivery gates.
5. **Decompose** ([work decomposition](references/work-decomposition.md)): lease-sized batches without write conflicts, lanes, verification shards and a `test_budget` each, recorded as `delivery_plan`. Numeric limits come from the validator, never from memory.
6. **Report**: pass `validate`, `reading-receipt.ts check` and `repo-facts.ts check`, then report the maturity they support.

## Commands

Run as `bun <create-sdd-root>/scripts/<script>`; flags are in each script's header. `lifecycle.ts initial` also reports this skill's RSI debt: at `REQUIRED` or `FREEZE` change the skill only through a consolidation round; authoring is never blocked.

| Command | Use |
|---|---|
| `lifecycle.ts <initial\|evidence\|generate\|process\|amend\|done>` | Six authoring hooks; echo every `next.must_echo` verbatim on its own line ([lifecycle](references/lifecycle.md)) |
| `validate.ts validate --sdd <SDD> --document-policy current --design-policy current` | This skill's document validator; requires the contract block |
| `validate.ts validate-draft` | Same checks on a proposed document before writing |
| `validate.ts contract --sdd <SDD> --check` | Drift between the prose and derivable contract fields |
| `validate.ts document-check` | Non-implementation documents only |
| `repo-facts.ts check --sdd <SDD> [--repository <root>]` | Binds the document's claims to the repository |
| `reading-receipt.ts check --sdd <SDD>` | Receipt coverage, including every node of a program root |
| `type-probe.ts check --sdd <SDD>` | Type-checks the API section's declared surface |
| `rsi.ts update` | `/create-sdd update` runs it, then works its agenda (open round → consolidate → enhance) as rounds |

## Output

- Create, refactor or merge: edit the target SDD and summarize decisions, unresolved items, verification plan and evidence limits.
- Audit: findings ordered by severity with location, consequence and fix; no rewrite unless requested.
- Report what was inspected, what remains unknown, and whether conclusions concern the document, the implementation or both.
- SDDs are delivered at the maturity their actual checks support. Missing or unrun required checks stay disclosed and do not permit a readiness claim.
- Multi-SDD output and program roots follow [program split](references/planning/program-split.md).
- Keep repository input and output location independent ([writing](references/writing.md)).

## What these checks do not prove

Every command above checks structure and source binding. None of them proves that an agent read a reference, understood it, or followed it; that a design is good; that an implementation satisfies it; or that any sandbox or permission boundary was enforced. Never claim verification from a status label, a planned command, a test name or indirect evidence, and never claim system-level anti-bypass enforcement.
