# Authoring an `sdd/v2` document

This page fills each of the six authoring phases with the practices that make a spec executable, many of them proven in GitHub's spec-kit. They are placed in phases and Metas that already exist: no new phase, Meta kind, file set or host role. Load the part for the phase you are in. The document stays one SDD; spec-kit's separate `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` and `tasks.md` become sections or derived views of it.

## 1 Harvest — facts and principles

- Classify every fact as `USER_STATED`, `OBSERVED` (with its `path:line` or command), `INFERRED` or `ASSUMED`. Only the first two become normative. An inferred fact that decides owner, route or acceptance needs a check. A material assumption becomes an open decision (Admit), never a silent requirement.
- Principles: read the repository's standing rules before designing — `AGENTS.md`, contribution guides and, in a spec-kit project, `.specify/memory/constitution.md`. Name the files the design must respect in the index's `principles` array. They stay the authority; do not copy their rules into the SDD.
- For each unknown you resolve by reading or probing, keep one line: **Decision**, **Rationale**, **Alternatives considered**. This is spec-kit's `research.md`; put it in a `## Decisions` section, not a separate file.

## 2 Admit — WHAT and WHY

- Write the outcome without technology: who needs what, and why. HOW belongs to Design.
- Each **Entry** is a user story with a priority (`"priority": "P1"`, `"P2"`, …). P1 is the smallest slice that delivers value alone. Give every Entry at least one acceptance that proves it independently — an Entry that can only be observed together with another is not independent, so merge the two. The highest-priority Entries become the handoff's `mvp`.
- Success criteria are measurable and technology-agnostic ("a user completes checkout in under 3 minutes", not "the API answers in 200 ms"). Record each as an acceptance case under the Entry it proves. There is no separate ID type.
- List the edge cases and failure paths the supported scope can reach. Each one either becomes a requirement or is named as out of scope.
- **Clarify.** Mark each unresolved point in place as `[NEEDS CLARIFICATION: D1 <question>]` (or `[需澄清: D1 …]`), define `D1` in prose, and list it in `unresolved_user_decisions`. `validate` blocks a marker whose decision is not listed, and reports `AWAITING_USER` while any decision is open. Ask at most five questions in one batch. Order them by impact (scope, then security and privacy, then user experience, then technical detail), and give each question options with a recommendation. Record every answer in a `## Clarifications` log (`- YYYY-MM-DD Q: … → A: …`). Then apply it to the affected clause and remove the marker and the list entry.

## 3 Design — HOW, under the principles

- **Principle check.** When `principles` is non-empty, add a `## Principle Check` (or `## 原则检查`) section. For each principle file, say whether the design complies. For any deviation, give the justification and the simpler alternative that was rejected: spec-kit's Complexity Tracking. Trade off in this order: usability and implementability, then measured performance, then feature breadth, then test machinery, and optional hardening last. Add abstraction, configuration or defensive machinery only for a current requirement or a demonstrated failure.
- **Key entities**, when data is involved: fields, relationships, validation rules and state transitions, in one `## Key Entities` section (spec-kit's `data-model.md`). If an entity file is delivered, it is an Asset.
- **Interfaces.** For every export, give its schema or signature location in prose (for example an OpenAPI file, a `.proto` or a TypeScript fence). The export's Asset is that file (spec-kit's `contracts/`). Consumers pin the exact version.
- Steps name their inputs, outputs and the file paths they touch, so a host can work without inventing locations.

## 4 Verify — observable acceptance

- Write each acceptance case as **Given / When / Then**, or as `command → expected observation`. It must fail when its requirement is absent: a case that would pass against the old code proves nothing.
- The integration or end-to-end acceptance is the quickstart: the shortest runnable walk through the P1 Entries (spec-kit's `quickstart.md`). In a program it is the root's `## Integration Acceptance`.
- Before calling the requirements ready, review them as a checklist. For each requirement, check that it is complete, unambiguous, consistent, measurable and covered by acceptance. Also check that no vague adjective ("fast", "robust", "intuitive") remains without a number. This review tests the writing, not the implementation; it runs no code.
- A document that declares exported TypeScript in fences may run `type-probe.ts check` to catch degenerate public types before implementation.

## 5 Decompose — tasks as a derived view

- Chunks (batches) group the steps of one coherent change. Order them so the P1 Entries' Chunks can finish first, and declare real `depends_on` edges.
- Do not hand-write parallel markers. The handoff derives `waves`, which layer the Chunks by `depends_on`, with higher-priority Entries first within a layer. A program root's handoff derives `parallel_children` from the child dependency layers, and each child's write boundary is already checked for conflicts. The host confirms file disjointness within one child before it runs Chunks together.
- Keep one SDD unless an independently deliverable outcome with its own owner makes a child narrow the context a host must read ([multi-SDD](v2-program.md)).

## 6 Report — analyze, hand off, converge

- Run `validate` once. Then analyze semantically what structure cannot see:
  - duplicated requirements
  - ambiguous or unmeasurable wording
  - underspecified steps
  - conflicts with the principles
  - requirements or Entries without acceptance
  - terminology or ordering inconsistencies

  Fix what is in scope; report the rest as limits.
- In Plan Mode, output the complete proposed SDD through `validate-draft`, never a short plan instead.
- Converge: when the host reports evidence against the acceptance cases, a failed or changed expectation returns as a revision. Bump `revision`, log the reason under `## Clarifications` if the user decided it, and amend in place with the IDs kept.

## Five Metas and spec-kit

| Meta | Carries | spec-kit counterpart |
| --- | --- | --- |
| Entry | A user story with priority and independent acceptance | User story (P1, P2, …), MVP |
| Module | One functional requirement at its normative source | `FR-###` in `spec.md` |
| Chunk | One coherent batch of steps inside a story's work | A phase of `tasks.md` |
| Bundle | One executable SDD and its reads and required Assets | One feature (`specs/###-name/`) |
| Asset | A versioned delivered file: interface, schema, entity model or code | `contracts/`, `data-model.md`, source |

<!-- reading-receipt: b12642e8 -->
