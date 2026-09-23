# Host-neutral SDD contract (`sdd/v2`)

Use this format for a new implementation-targeting SDD. The readable document is authoritative. The JSON block is a small index of IDs and relationships that `validate` can check; it must not repeat behavior, rationale, command output, or claimed implementation results. Existing `sdd-loop-delivery/v1` documents remain readable through the legacy validator.

## Document content

State the user outcome and current behavior, then the target behavior, implementation route, supported failure behavior, change boundary, and observable acceptance. Give each requirement, coherent implementation batch, implementation step, acceptance case, cross-document export, and unresolved user decision a stable ID in the prose. An executable step names its inputs, producer, output and consumer when those relationships matter. Acceptance says what will be observed and how; a planned command or test name is not a PASS.

For a capability with an external consumer, identify the producer, consumer, exact interface version, error behavior and compatibility or deployment order that the current change requires. Do not create a contract registry for an internal detail with no independent consumer. Read current repository instructions and contracts from their authoritative files; point to them instead of copying rules into a second source of truth.

## Compact index

Put one JSON block between `<!-- sdd-contract:start -->` and `<!-- sdd-contract:end -->`:

```json
{
  "protocol": "sdd/v2",
  "id": "feature-a",
  "revision": "1",
  "requirements": [
    { "id": "R1", "kind": "must-ship", "implementation": ["S1"], "acceptance": ["A1"] }
  ],
  "batches": [{ "id": "C1", "steps": ["S1"], "requirements": ["R1"], "depends_on": [] }],
  "steps": ["S1"],
  "step_sources": [],
  "acceptance": ["A1"],
  "writes": ["packages/feature-a"],
  "metas": [
    { "id": "E1", "kind": "Entry", "priority": "P1", "members": ["M1"] },
    { "id": "M1", "kind": "Module", "owner": "self", "source_id": "R1", "origin": { "document": "self", "requirement_id": "R1" } },
    { "id": "K1", "kind": "Chunk", "owner": "self", "source_id": "C1", "members": ["M1"] },
    { "id": "B1", "kind": "Bundle", "owner": "self", "members": ["K1"], "requires": [] },
    { "id": "T1", "kind": "Asset", "producer": "B1", "path": "packages/feature-a/index.ts", "version": "1", "acceptance": ["A1"] }
  ],
  "exports": [],
  "consumes": [],
  "unresolved_user_decisions": []
}
```

In this one-document example only `E1` (for its priority) and `T1` (a delivered output) add information; `M1`, `K1` and `B1` could be omitted and derived as `M:R1`, `K:C1` and `B:self`, with `E1` then listing `M:R1`.

`root` is an optional path to a `sdd-program/v2` root for a child SDD. `principles` is an optional list of repository-relative files the design was checked against, such as `AGENTS.md` or a spec-kit `.specify/memory/constitution.md`. When it is non-empty, the body needs a `## Principle Check` (or `## 原则检查`) section; the files are handed to the host and stay the authority. An Entry may carry `"priority": "P1"`, `"P2"` and so on (user-story priority; the highest priority present is the MVP). Its authoring practice is in [authoring](v2-authoring.md). In a one-document design the five Meta kinds live in this block and use owner and origin document `self`. Any kind you omit is derived from the index: Module `M:<requirement>` for each requirement that is not a non-goal, Chunk `K:<batch>`, Bundle `B:self`, and Entry `E:self` over all Modules. Declare only what adds information, typically prioritized Entries (which may list derived `M:` IDs) and Assets for delivered outputs. The handoff's `meta_source` says `declared`, `derived` or `mixed`; in a multi-SDD design they live once in the [program root](v2-program.md), and children keep only their local requirements and batches. The five kinds are a design graph, not five document levels or host roles. Entry groups Modules (user outcomes and requirements); each Module's `source_id` binds the currently authoritative leaf requirement, while `origin:{document,requirement_id}` preserves its original Source identity. They match for a newly authored leaf and may differ when an existing SDD is split. A Chunk groups Modules around one locally defined batch through its own `source_id`. One Bundle owns each executable SDD and contains its Chunks. An Asset names a repository-relative delivered file or directory, its producing Bundle, planned version and the leaf acceptance that must observe it. The graph must lead each Must-Ship requirement through a Module, Chunk and Bundle to an observable acceptance; an Asset is required for a delivered output, not invented for work that produces none.

A step in `steps` is a string ID or a record `{"id", "touches", "after", "closes"}` naming the repository paths it touches (inside `writes`), the steps it follows and the acceptance it closes; the handoff turns them into ordered `tasks` ([authoring](v2-authoring.md#5-decompose--tasks-as-a-derived-view)). `"intent": "bug"` requires `## Reproduction` and `## Root Cause` sections and a non-empty `regression` list of acceptance IDs that must fail before the fix. `assessment` cites the `sdd-assessment/v1` document with a `go` decision that seeded this SDD. `batches` records the coherent work cut and step order without repeating the steps' design. Its ID, steps and requirement links must be defined in the body. A step defined in an external normative Agent Context file uses `step_sources:[{step,path}]`; `path` resolves from the leaf SDD into its document tree or target repository, and the target document must define that step. Steps omitted from `step_sources` are defined in the leaf body. This Source locator is not a sixth Meta or an evidence receipt. `writes` names repository-relative file or directory surfaces the work may change; it does not grant permission. Declare an exact surface when known, and do not claim two children can execute independently if their write boundaries or producer/consumer relation are unresolved. `exports` and `consumes` are needed only for an interface crossing child boundaries. An export points to its produced Asset; a consumer names `{document, export, version}` using the producing child ID, export ID and exact version. The consumer's Bundle requires the producing Asset, which makes the dependency concrete. Versions here are design targets, never evidence that the artifact was built.

Every Must-Ship requirement points to at least one implementation step and an observable acceptance case. Define each requirement, batch, step, acceptance, export and decision ID exactly once at the start of a prose heading (`## R1 ...`) or list item (`- R1 ...` or `- **R1** ...`) in its owning normative document. A table row whose first cell is the ID (`| R1 | ...`) defines it only when no heading or list item does, so a traceability table may repeat IDs defined elsewhere. An ID repeated only inside JSON or a code block is not a definition. A decision in `unresolved_user_decisions` blocks design readiness until the user closes it. The index may show structural closure; only a semantic review can judge whether the steps really implement the behavior and whether the oracle detects failure. The source file, pseudocode, supported error behavior and acceptance method remain in the body; do not repeat them in Meta validators or a second plan.

## Direct host handoff

Run `bun <create-sdd-root>/scripts/validate.ts validate --sdd <absolute-SDD>`, adding `--repository <absolute-repository>` when the document is outside its target repository. The command does not alter the SDD or product; it may record local, untracked skill telemetry. If the target SDD already exists, revise it in place rather than initializing over it. The repository is found from a `.git` above the document; an explicit `--repository` must exist but needs no `.git`. When none is resolved (a draft in a temporary directory, stdin), path existence and escape checks are skipped and reported as an evidence limit rather than a blocker. A `[NEEDS CLARIFICATION: D1 …]` marker whose decision is not listed in `unresolved_user_decisions` blocks. Bundle `reads` must exist in a resolved repository. Its v2 result carries one compact `handoff` with resolved SDD/repository paths, structural maturity, blockers, pending user decisions, principles, relevant document paths, the selected Bundle/Chunk/Module Source slice (with its prioritized `entries`, `mvp` and dependency `waves`), produced Assets marked `existing` or `new`, direct dependency Assets and evidence limits. Review the prose and live source for semantic closure before calling the design ready. Give the result and SDD path to the chosen host. The host decides its own execution and reports implementation evidence against the acceptance cases; the SDD grants no test, commit, merge, deployment or other external-action authority.

`validate --evidence <report.json>` adds a `closure` result comparing a host's `sdd-evidence/v1` report with this leaf's acceptance and revision ([converge](v2-authoring.md#6-report--analyze-hand-off-converge)); it exits non-zero until the closure is `CLOSED`, and a bug leaf's regression cases need a failing baseline of the same command (behaviour proof). The handoff's `candidates` lists advisory findings such as step calls declared nowhere in owned source. `validate-draft` performs the same design checks before a file is written. Neither command proves implementation, semantic completeness, agent reading, or permission enforcement.

<!-- reading-receipt: e798135d -->
