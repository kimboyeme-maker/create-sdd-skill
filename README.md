# create-sdd

Creates, refactors, merges or audits a repository Software Design Document (SDD). New implementation work produces an `sdd/v2` document that goes **directly to your coding host** (Claude Code, Codex or any other agent). There is no separate delivery controller: the host implements, reports evidence, and `validate --evidence` checks convergence.

This README is a map. [SKILL.md](SKILL.md) is the normative contract; where they differ, SKILL.md wins.

## Use

Invoke the skill (`/create-sdd` in Claude Code, `$create-sdd` in Codex) with the outcome you want and the repository. It picks the mode, writes the document and stops before implementation unless you asked for that too.

| You want | Mode | Result |
| --- | --- | --- |
| A feature or change | feature (default) | `sdd/v2` leaf |
| A bug fixed | bug (`intent: bug`) | reproduction, root cause, regression acceptance |
| To decide whether an idea is worth doing | assessment | `sdd-assessment/v1`: go / no-go / reshape; a go seeds the SDD's Entries |
| Several independently owned outcomes | program | `sdd-program/v2` root plus one child SDD per outcome |
| A review of an existing SDD or its implementation | audit | findings, no rewrite unless asked |

Every document follows six authoring phases — Harvest, Admit, Design, Verify, Decompose, Report — and the five-Meta graph Entry → Module → Chunk → Bundle → Asset ([authoring guide](references/v2-authoring.md)). The skill starts new documents from an `init` skeleton, which stays `AWAITING_USER` until the placeholders are replaced.

## The flow for a team

1. **Author.** Run the skill. Answer the open decisions it lists (`[NEEDS CLARIFICATION: D1 …]`); `validate` reports `AWAITING_USER` until they are closed and `STRUCTURALLY_READY` when the structure is complete.
2. **Hand off.** Give the SDD path and the `validate` handoff to your coding host. The handoff carries the read order, the ordered `tasks` (with files, dependencies and safe parallelism), the MVP task set and advisory `candidates`.
3. **Implement.** The host implements. To make convergence provable, commit each step separately with its step ID in the message (`S2: add farewell`) and make every must-ship case's `oracles` test (or bounded command) real.
4. **Converge.** The host fills an evidence report (`init --kind evidence` writes the template) and runs `validate --evidence <report> [--replay]`. `closure.status` is `CLOSED`, `OPEN` (missing, stale, unproven, or a design-to-code gap) or `FAILED`. A FAIL or a changed expectation becomes a new SDD revision.

`--replay` runs only the declared oracles, with a runner the validator derives from the repository, in trees exported from Git: the oracle must fail at the baseline, pass at the change, and fail again with this requirement's commits reverted. It never runs the host's own command and never writes to the repository.

## Commands

Run from anywhere as `bun <create-sdd-root>/scripts/<script>`; flags are in each script's header.

| Command | Use |
| --- | --- |
| `init.ts --kind feature\|bug\|assessment\|program --out <abs.md>` | Write a skeleton that validates as `AWAITING_USER`; never overwrites, writes nothing if it would not validate |
| `init.ts --kind evidence --sdd <abs SDD> --out <abs.json>` | Write the evidence report a host fills in |
| `validate.ts validate --sdd <abs SDD> [--repository <abs root>]` | Structural check plus the host handoff |
| `validate.ts validate --sdd <SDD> --evidence <report.json> [--replay]` | Convergence (`closure`) |
| `validate.ts validate-draft --draft-file <path>` | The same checks before a document is written |
| `type-probe.ts check --sdd <SDD>` | Optional: type-check exported TypeScript fences |

## Adapting it to your repository

Put `.create-sdd/preset.json` in the repository to state its rules without editing the skill: required principle files (for example `AGENTS.md` or a spec-kit constitution), extra required sections per document kind, advisory candidates to treat as blockers, the replay runner, and your own `init` templates ([presets](references/v2-presets.md)).

## What the checks do not prove

Structure, evidence links and replays do not prove that a design is good, that an oracle covers all of a requirement's behaviour, or that any agent read the guidance. A design-ready SDD grants no authority to run tests, commit, merge or deploy. Read the `evidence_limits` in every result literally.

## Existing v1 documents

Documents in the older `sdd-loop-delivery/v1` or `sdd-program/v1` format still validate through the legacy path ([legacy contract](references/loop-ready.md)), and `sdd-loop-delivery` remains only to finish deliveries already running on it. Do not start new work on it: new documents are `sdd/v2` and go to the host directly.

## Layout

- [SKILL.md](SKILL.md): the normative skill contract.
- [references/v2-contract.md](references/v2-contract.md), [v2-authoring.md](references/v2-authoring.md), [v2-program.md](references/v2-program.md), [v2-presets.md](references/v2-presets.md): the v2 format, phase practice, multi-SDD programs, presets and `init`.
- [references/loading.md](references/loading.md): which guide to read for a platform, language or diagnostic.
- `scripts/`: `validate.ts`, `init.ts`, `type-probe.ts`, `rsi.ts` and the validator under `scripts/validator/`.
- `cases/`: frozen defect cases and fixtures; `tests/`: logic tests (`bun test tests`).
- `rsi/`: the skill's own improvement ledger (below).

## Maintaining the skill

The skill improves itself only through recorded rounds ([behavior evaluation](references/behavior-evaluation.md)):

- Record a defect a real run found that the checks missed as an `OD-<n>` entry in [rsi/observed-defects.md](rsi/observed-defects.md). It is a queue: each update settles every entry (`rsi.ts settle`) and closing the round archives it, so after an update the file holds only its header.
- `bun scripts/rsi.ts update` gives the agenda. A change runs as rounds: `case-amendment` to freeze a failing case, `budget-change` to raise a size ceiling with a reason, `improvement` to repair it (accepted only when a frozen case flips and nothing regresses), `consolidation` to shrink.
- After editing `references/**/*.md`, run `bun scripts/reading-receipt.ts stamp`. Before finishing a change, run `bun test tests`, `bun run typecheck`, `bun run lint` and `bun scripts/rsi.ts suite`.
