# create-sdd

Creates, refactors, merges or audits a repository Software Design Document. Implementation-targeting work produces the loop-ready contract that `sdd-loop-delivery` executes.

## Use

Invoke the skill with the target SDD path and the desired product outcome. It works in six phases (harvest, admit, design, verify, decompose, hand off) and stops before implementation unless implementation was separately requested.

1. Run `create-sdd` to produce a loop-ready SDD.
2. Review any genuine product or authority decisions that remain.
3. Run `sdd-loop-delivery` with that SDD path.

## Layout

- [SKILL.md](SKILL.md): the normative skill contract.
- [references/loading.md](references/loading.md): which documents each phase loads.
- [references/phases/](references/phases/): one card per phase, each ending with an exit gate.
- [cases/behavior-cases.json](cases/behavior-cases.json): Bad/Good minimal contrasts for policy changes, evaluated as described in [behavior evaluation](references/behavior-evaluation.md).

This README is a map; it never duplicates or overrides SKILL.md.

## Checks

Authors run all three before reporting an implementation SDD:

- `bun scripts/reading-receipt.ts check --sdd <SDD>`: every phase and contract-implied document was loaded at its current version.
- `bun scripts/repo-facts.ts check --sdd <SDD>`: declarations agree with the repository (shared-mechanism writes, toolchain pins, migration candidates; grounding candidates are reported for review, not as failures). On a multi-SDD root both scripts also check every node (receipts) or execution SDD (repository facts), and repo-facts requires a sourced `split_decision`; the root's structure is checked by the delivery controller's `program-check --program <root>` command.
- `bun <loop-skill-root>/scripts/main.ts validate --sdd <SDD> --document-policy current --design-policy current`: contract, work graph and convergence consistency.

These checks run only when the author runs them; the skill cannot force a host agent to read, understand or run anything. Two stronger points exist outside the author: the delivery controller repeats `validate` at admission and at `program-start`, and a host that supports hooks (for example a stop or pre-report hook) can run the three checks itself before the agent may finish. Hooks are host configuration chosen by the user, not part of this skill.

Maintenance: every `references/**/*.md` ends with a reading-receipt token. After editing references run `bun scripts/reading-receipt.ts stamp`; `verify` fails while a token is stale. Logic tests for the scripts live in `tests/` (`bun test tests`).
