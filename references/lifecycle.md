# Legacy v1 authoring lifecycle hooks

The six hooks and echo tokens on this page remain for existing v1 runs. New `sdd/v2` authoring validates and hands off directly; it does not use these hooks as a readiness gate.

`scripts/lifecycle.ts` marks four points in an authoring run. Each one is a place where the session
either learns something it cannot derive on its own, or is about to commit to something it cannot
cheaply undo. They are not progress reporting: a hook that only recorded what the session said would
launder a guess into a record.

```bash
bun <create-sdd-root>/scripts/lifecycle.ts describe
bun <create-sdd-root>/scripts/lifecycle.ts <initial|evidence|generate|process|amend|done> --payload-file <json>
bun <create-sdd-root>/scripts/lifecycle.ts <event> --payload '<json>'
```

Exit code is 0 when `ok`, 1 when anything is blocking, 2 on a usage error.

## The payload is a claim, the answer is the fact

A language model writes the payload, so every field is one of two things: something only the session
knows (the user's request, the path it intends to write, the phase it believes it is entering), or a
claim this tool re-derives from the repository and compares. Shape is validated first, so a missing
or misspelled field is named at the boundary — including unknown keys, because a misspelling is
otherwise silently absent and reads as "the hook ignored what I told it".

Every result has the same shape:

```json
{
  "protocol": "create-sdd-lifecycle/v1",
  "event": "done",
  "ok": false,
  "blocking": [{ "code": "...", "detail": "..." }],
  "advisory": [{ "code": "...", "detail": "..." }],
  "facts": {},
  "next": { "must_do": ["..."], "must_echo": ["..."] }
}
```

`blocking` stops the run; `advisory` is worth acting on but decides nothing by itself. `facts` is
what the repository actually says — use it instead of inferring. `next.must_do` names what has to
happen before continuing. **`next.must_echo` holds strings the reply must reproduce verbatim, each
on its own line.** Each is derivable at any time and was being lost between being derivable and
being said.

## The run journal

`initial` mints a run id and every later call carries it as `run`. The record lives outside the
repository and outside the output directory — a run's bookkeeping is not a deliverable and must not
appear in a diff — and it outlives each process, which is the only way one hook can answer what
another one did.

`done` reads it. A run that never submitted an `evidence` ledger, or never called `generate` before
and after a document it now reports, is `LIFECYCLE_PHASE_NEVER_CALLED`. A run id nothing minted is
`LIFECYCLE_RUN_UNKNOWN`. Refused calls are recorded too: a run that tried Handoff three times and
was refused each time is not a run that never tried, and only the journal separates them. They are
forensics and never steps in the order: counting a refused call would let one misuse of an optional
hook poison a run permanently, because the entry stays in the journal and `done` could never be
reached again.

Be exact about what an entry proves: that a hook was called with a payload that passed its own
checks. Not that the work behind the call happened. What it removes is the cheapest failure — a run
that skipped a phase entirely and reported as though it had not.

The journal also carries wall-clock per document and the shape of every fact ledger the run
submitted, both returned in `facts.run`. That is **authoring time
measured**, which this skill has never had: its estimate calibration could only ever reach a
delivery's elapsed time, and only after a delivery had run.

## Six events

`initial` · `evidence` · `generate` (twice) · `process` (per transition) · `amend` (per change after
reporting) · `done` (twice).

## `initial` — once, after the request is read

Answers with the manager **each owned package declares for itself** (`facts.ownership[].managers`,
one entry per ecosystem) and the repository's toolchain pins. Write every command for a package from
that entry, never from the repository root's choice — a workspace file above a package speaks about
the workspace, not about the package, and reading the root instead is how a bun package acquires a
`pnpm install`. An owned name the repository cannot resolve is blocking: every later check is scoped
to these roots, so an unresolved one silently narrows the run to nothing.

## `evidence` — once per run, when the fact ledger is assembled

The ledger belongs to the **run**, not to a document: one harvest reads the repository once, and the
facts it yields are the same facts whatever is written from them. Each document then declares which
of those facts it rests on, in `documents[]`.

That shape came from a failure. The field used to name a single `sdd`, which left a program-wide
ledger with two bad options — submit it once per document, identical each time, or hang it on one
document arbitrarily. A real run chose the first, and three documents ended up with a fact census
matching byte for byte while one of those facts was an editorial audience assumption irrelevant to
two of them. Every document looked independently grounded and none of them was.

Phase 1 classifies every fact `USER_STATED | OBSERVED | INFERRED | ASSUMED` and says only the first
two may become normative. That was prose: nothing ever compared a classification with anything. This
hook does, and adds the check the classification implies — an `OBSERVED` fact names a path the
repository can be asked about, and a path that is not there makes the fact an inference wearing an
observation's label. Reported as `LIFECYCLE_NORMATIVE_FACT_NOT_GROUNDED` and
`LIFECYCLE_OBSERVATION_UNRESOLVED`, both blocking. The reliance map adds three more: a document
resting on a fact the ledger never recorded is `LIFECYCLE_FACT_ID_UNKNOWN`, blocking; a document
whose normative facts contain no observation at all is `LIFECYCLE_DOCUMENT_UNOBSERVED`, advisory and
asked **per document**, because a run-wide count hides one ungrounded document behind the others;
and a harvested fact no document rests on is `LIFECYCLE_FACT_UNUSED`, advisory — a harvest
legitimately reads more than it needs, and this is also the shape a padded ledger takes.

The journal records the **shape** of each submission — how many facts, how they were classified, how
many carry a requirement — and `done` returns them as `facts.run.ledgers`. Passing this hook says the
payload was well formed and internally consistent; an empty shell of three plausible facts passes
exactly as a real ledger does, and without the counts nothing afterwards could tell them apart.
Counts only, never content: this is forensics about a submission, not a second copy of the document.
A run whose normative facts are all stated and none observed is `LIFECYCLE_LEDGER_UNOBSERVED`,
advisory — a design can legitimately rest on what the user said, and that is worth seeing rather
than refusing.

## `amend` — a document changed after `generate: after` reported it

While a document is still being authored **every** change is normative — that is what authoring is —
so a revision made before it was reported is another `generate: after`, not an amendment. Calling
`amend` earlier is refused: it claims to change something that was never written. This event exists
for the one thing that only matters once a document claims convergence.

`CONVERGED` together with `stable_after_last_normative_change: true` is a claim about a moment, and
nothing reset it when that moment passed: a document could be edited after converging and still
present itself as settled, and a reader would take it at its word. A normative
amendment against a converged contract is `LIFECYCLE_CONVERGENCE_STALE`; the lenses have to be run
again. A non-normative one leaves the claim standing, and the reply says which it was.

## `generate` — twice per document, `phase: "before"` then `"after"`

Two moments, two different questions, which is why one event carries a phase rather than two events
sharing a name:

- **before** the file exists, the only checkable things are where it goes and what must be read to
  write it. The answer is `facts.reading_baseline` — assemble the receipt from it rather than
  reconstructing one afterwards.
- **after** it exists, the document itself is checked: repository facts, the reading receipt and
  `validate --document-policy current --design-policy current`, spawned as a CLI so its diagnostics
  come back as blocking. A program root carries no leaf contract; it is disclosed as
  `LIFECYCLE_VALIDATE_SKIPPED`, never counted as a pass.

## `process` — at each phase transition inside one document

`entering: true` checks the precondition of the phase being entered (Design, Verify and Decompose
all require an admitted contract; Handoff requires the contract block). `entering: false` records
leaving it and is not gated by entry — they are different claims. Harvest legitimately precedes the
file; every later phase reads what is already written. The answer recomputes
`facts.reading_required` from the contract as it stands, because the derived conditions change as
the contract fills in.

## `done` — once, when every document is written

Runs the repository-facts and reading-receipt checks over every reported document, and for a program
compares the reported set against the program's own node list in both directions: fewer documents
than nodes means one was lost, more means one was written that nothing will schedule. Returns what
must not be lost in `must_echo`, with an `echo_token` beside it, and is **not** `ok`. Everything
gathered there is covered by the same token — acknowledging means having read all of it:

- every **superseded manager** claim: the losing lockfile still exists, and a reader who follows the
  workspace file instead of the package will install with it;
- every **deferred must-ship**: work the user agreed to ship and will not get, recorded in the
  contract and read by nobody until it is missing;
- every **assumption** recorded through `evidence`, with the reason it is unverified — an
  unverified claim that nobody saw is the failure the classification exists to prevent.

A terminal report is the one action no check here can observe: this skill cannot see the reply. So
the run does not reach `ok` on the strength of the documents alone — it reaches it on a second call
carrying the `echo_token`, which the session can only have by reading the first result. Be exact
about what that proves: nothing about whether the echo happened, the same way a reading receipt
proves content identity and not a read. What it changes is that a forgotten echo leaves the run with
no complete state, and a claimed one is an explicit claim rather than a silence.

The strings also go to **stderr** as `ECHO VERBATIM: …`, because a harness that shows a tool's stderr
to its model shows them at the moment they are needed.

## What these hooks do not do

They do not start a delivery and do not write
anything outside the run journal. They cannot make a session call them: a session that runs no hook
at all is invisible to them, exactly as one that never runs `repo-facts.ts` is invisible to that.
What the journal closes is the weaker case — a session that calls the last hook and skips the rest. A green `done`
means the documents pass this skill's own checks — not that the design is
right, that an agent read what it receipted, or that the work has been approved.

<!-- reading-receipt: 91477d7d -->
