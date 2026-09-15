# Behavior evaluation

Use this reference only when changing `create-sdd` policy or investigating a demonstrated Skill-behavior failure. It does not alter normal SDD structure.

## Evidence levels

- `report`: sanitized request, proposed action, expected decision, and reason.
- `trace`: report plus starting state, decisive evidence, and event sequence.
- `repro`: pinned public repository or minimal fixture with repeatable checks.
- `paired-eval`: isolated comparison with executable task-completion and counterexample checks.

Do not promote a report or one successful trace into a universal hard rule. A controller-enforced rule needs at least a reproducible minimal contrast; an effectiveness claim needs paired evaluation.

## Minimal contrast

Every policy change names one case in `cases/behavior-cases.json`. The Bad and Good arms keep the task shape stable and change one decisive fact. Passing means:

1. the Bad action is rejected, deferred, or escalated as expected;
2. the Good action remains allowed;
3. the requested result still completes;
4. no new prompt, retry, successor, or authorization loop appears.

File count, diff size, token count, elapsed time, and failure count are observations, not authority evidence.

## Evaluation arms

- `stable`: currently released Skill and controller.
- `candidate-skill`: candidate Skill text with the stable controller.
- `candidate-full`: candidate Skill text and candidate controller.

Run each Bad/Good arm in a fresh isolated workspace with pinned model, reasoning effort, permissions, repository revision, and applicable instructions. Keep infrastructure failures, negative results, and null results. All Good cases must complete before claiming improvement. The sibling loop Skill provides a dry-run plan generator; it never starts paid sessions itself.

## Pressure scenarios and rationalizations

A rule that agents skip under pressure needs a pressure scenario, not more emphasis:

1. Run the Bad arm without the new guidance under realistic pressure (time, sunk cost, a plausible shortcut) and record the exact rationalization the agent used.
2. Write the smallest guidance that answers that rationalization; match the form to the failure: a prohibition with the rationalization and its rebuttal for skipped rules, a positive recipe for wrong output shape, a required-field template for omissions, and a condition on an observable predicate for context-dependent behavior.
3. Rerun both arms; a new rationalization becomes the next case rather than a longer paragraph.

Loop retrospectives (`evolution-digest` `trace` proposals targeting create-sdd) are the preferred source of Bad arms: they carry cited delivery evidence.

<!-- reading-receipt: aa09c9b2 -->
