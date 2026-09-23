# Defects observed while executing a real SDD

Findings from implementing `docs/plugin-host/plugin-host-r1.sdd.md` (SDD-R1-v13.4, `CONVERGED`,
35 requirements / 45 acceptance / 19 batches) batch by batch, 2026-09-23. Batches PC01–PC09 done.

Every one of these passed `validate`, `repo-facts check`, `reading-receipt check` and all three
review lenses. They are the class of defect this skill's checks do not reach — recorded here so a
later round can decide, with the evidence in hand, which of them deserve a detector.

This file is input to `rsi.ts`, not a rule. Nothing here is enforced yet.

---

## OD-01 Two acceptance criteria require opposite behaviour

**Observed:** `YS10` requires `revokeRegistration` to retire the stage slot ("卸载摘除 stage slot …
反复装卸不增长"). `YS15` requires the full `packages/tray` suite to pass. Tray fails precisely
because of that retirement: toggling the one block flips tray between 8 failures and 0.

**Evidence:** `packages/plugin-host/src/removal-runtime.ts` revoke path; `packages/tray` suite
121 passed / 0 failed with the block removed, 113 / 8 with it present.

**Why the checks missed it:** nothing compares acceptance criteria against each other. Each one is
checked for shape, binding and oracle sensitivity in isolation. Two oracles that cannot both hold
are a contradiction only a reader — or an execution — can see.

**What a detector would need:** hard. A cheap approximation: flag two acceptance cases whose
methods run the same command with different expected outcomes, or whose requirement texts contain a
negation of each other over the same subject. Neither is reliable. The honest candidate is a
*process* rule rather than a detector — an acceptance that constrains a second package must name
that package's suite as a reader, and the reader table would then show the collision.

## OD-02 A step's Failure clause contradicts its own pseudocode

**Observed:** `BZ08` Failure says "若 slot 属于另一个 host（组合场景），条件不成立则不摘除，交由
`retireDataOrderSlot` 处理". Its pseudocode guards with `slot.host === this.#port.host`, which is
true for every entry in the table — `stageSlots` is written only by `createDataOrderSlot`, the
composition entry, so every slot in it belongs to a composition owner *on this host*. The guard can
never express the case the prose describes.

**Why the checks missed it:** `complete-design.md` already prescribes exactly this read-back —
"read its **Failure**, **State changes** and **Observable result** back against its own
**Pseudocode**, claim by claim" — and says plainly that the validator "can never check that the
labels describe the code beneath them". That is the gap, stated by the skill itself, now with a
worked instance.

**What a detector would need:** this is the strongest candidate on the list. The type probe already
reads fenced TypeScript out of a document; a step's pseudocode is fenced TypeScript too. A probe
that extracted the identifiers a Failure clause names (`slot`, `host`, `retireDataOrderSlot`) and
checked they appear in the pseudocode with a reachable branch would have caught this one: the prose
names a branch (`条件不成立`) the code cannot take.

## OD-03 A batch's acceptance depends on a later batch's deliverable

**Observed:** `YS13` and `YS14` (PC06) require `defineHost` handles. `defineHost` is `BZ17`,
delivered by PC08. The dependency chain is PC06 → PC07 → PC08, so PC06's acceptance cannot pass at
PC06.

**Why the checks missed it:** `delivery_plan` checks batch dependencies and requirement coverage,
not whether an acceptance's *oracle text* mentions something a later batch produces.

**What a detector would need:** feasible and cheap. Every batch produces named symbols (they are in
the step `produces` lists and the API section). An acceptance bound to batch N whose oracle names a
symbol first produced by batch M > N is a mechanical finding. This one is worth a case.

## OD-04 A cross-package assertion on error text was never declared a reader

**Observed:** `INSTALL_RESULT_THENABLE` replaced the sync path's bare `TypeError`, changing its
message. `packages/logger/logger.test.ts` asserted the old message and broke. r1's migration readers
do not list it.

**Why the checks missed it:** `repo-facts` scans for *symbols*. A test that asserts a message string
references no symbol, so no scan reaches it. `AGENTS.md` already requires cross-package assertions to
be updated on a message migration; nothing connects that requirement to the reader inventory.

**What a detector would need:** straightforward. When a delivery changes a member of the owning
package's error-text module, scan the declared inventory roots for string literals matching the old
text and require each hit to appear as a reader. The old text is available from git.

## OD-05 An acceptance whose observable cannot fail

**Observed:** `XQ08` / `YS10` observe "反复装卸同名插件 N 次后 `stageSlots` 尺寸恒定". The table is
keyed by plugin name, so its size is bounded by the number of distinct names no matter what the
change does. The observation holds before the change and after it, and would hold if the change were
reverted.

**Why the checks missed it:** `oracle_sensitivity` demands a perturbation only for guards and
absence claims. A positive structural observation carries no such obligation, so nothing asks
whether the oracle can distinguish the two worlds.

**What a detector would need:** the general form is the same question `oracle_sensitivity` already
asks — "flip the thing, does this case flip?" — applied to more kinds of acceptance. Widening that
obligation is a design decision with a real cost (every case then needs a perturbation), so this is
a candidate for a *ruling*, not an obvious rule.

## OD-06 An acceptance names an implementation site the design's own behaviour rules out

**Observed:** `YS22` requires that "storage-web 在提供的 native contexts 数量与安装批次大小不符时,
domainCore 显式抛错". The domain-core callback cannot make that judgement: a storage batch installs a
reactive service plugin and one adapter per reactive entry *in addition to* its entries, so the
context queue running dry there is ordinary rather than a fault. The callback sees one registration
at a time and never learns how many contexts were supposed to cover how many entries.

**Evidence:** implementing it as written turned 28 passing storage-web cases red. The check belongs
at `setNativeContexts`, which receives both numbers.

**Why the checks missed it:** an acceptance oracle may name a function by name, and nothing compares
that name against what the design says the function is given. The information the oracle demands was
never routed to the place the oracle points at.

**What a detector would need:** the step `requires`/`produces` lists, if they were populated, would
say which facts reach which step. An oracle naming a symbol whose owning step does not `require` the
fact the oracle tests is a mechanical finding. It needs the markdown structure from B3 first.

## OD-07 A design change invalidates a whole technique, and the reader inventory sees none of it

**Observed:** `XQ15`/`XQ19` replace class inheritance with a factory handle. Every test that reached
the old surface through `vi.spyOn(Class.prototype, ...)`, `class X extends Host`, `Object.assign(host, …)`
or `Reflect.ownKeys(host)` broke — across three packages — and r1's migration readers list none of
them. The readers table is built from *symbol* scans, and none of these reference the migrated
symbol at all.

**Evidence:** `web-rpc` (4 sites), `store-middleware` (2), plus `tray` earlier. Each needed a
different replacement, and two of them turned out to be asserting paths production cannot reach
(see OD-05's family).

**Why the checks missed it:** the migration model is symbol-based. "Everything that depends on the
subject being a class" is a *shape* dependency, not a symbol reference, so no scan can see it.

**What a detector would need:** when a legacy surface's disposition changes its construction form —
class to factory, instance to handle — scan the inventory roots for the four techniques above and
require each hit to appear as a reader. The technique list is short and stable, which makes this the
cheapest of the shape-dependency checks worth having.

## OD-08 A new host guarantee overrides a downstream package's published error contract

**Observed:** `XQ06` makes a published extension closure throw `VIEW_REVOKED` as soon as its
registrations are revoked, and `publication.ts` checks that *before* the member body runs. WebRPC
publishes its control members (`send`, `pingAll`, `sendAll`) as host extensions and documents
`ENDPOINT_DISPOSED` as what a disposed endpoint throws. After `XQ06` the endpoint can no longer
produce its own code from those members: the host's check always wins.

**Evidence:** four WebRPC contract cases, failing since PC04 landed. The endpoint's only place to
translate is its projection, and the projection's own contract is that it copies values by
reference — so the two guarantees cannot both hold as written.

**Why the checks missed it:** `XQ06`'s reader inventory lists what references the *symbol* being
changed. WebRPC references no symbol here; it depends on an ordering — "my member body runs before
anything else can reject" — that no scan represents. Same shape as `OD-07`, one level deeper: not a
construction form this time but an interception point.

**What a detector would need:** the honest answer is that this one is a design review question, not
a scan. What would have surfaced it is the acceptance-topology lens asking, for each new guard,
"which downstream error contract now has a competitor for the same call". That is a checklist item
for a human, and it belongs in the lens rather than in a script.

---

## What these eight have in common

Four of the five are consistency questions *between* two places in one document — two acceptances,
a clause and its own code, a batch and a later batch, a change and an inventory. The skill's checks
are overwhelmingly per-object: shape, binding, presence. The one class it already reaches between
objects is ID reference integrity, which is why none of these look like the defects it catches.

`OD-03`, `OD-04` and `OD-07` are mechanical and cheap; they are the three to turn into cases first.
`OD-02` is the highest value and needs the type probe extended to step pseudocode.
`OD-06` needs B3's step `requires`/`produces` structure before it can be checked at all.
`OD-01`, `OD-05` and `OD-08` are rulings before they are rules; `OD-08` in particular belongs in the
acceptance-topology lens as a question, not in a detector.

Five of the seven are consistency questions between two places in one document. `OD-07` is the one
that is not: it is a dependency the document could not have listed, because the thing depended on
was a *shape* rather than a name. That is the gap worth thinking hardest about — a migration model
built on symbols cannot see it at all.

---

## Findings from authoring plugin-host R2 with sdd/v2 (2026-09-24)

Found while writing `docs/plugin-host/plugin-host-r2.sdd.md` (sdd/v2, 25 requirements, `validate`
→ `STRUCTURALLY_READY`) and amending `docs/website/website-library-runtime.sdd.md` (legacy v1, r7).
Same status as the entries above: inputs to `rsi.ts`, not rules.

## OD-09 An acceptance or test reads a git-ignored path

**Observed:** `packages/store-devtools/test/public-exports.test.ts` reads
`docs/store/public-exports.baseline.json`, and `docs/` is ignored (`.gitignore:14` in the migai
repository). On a clean checkout the file does not exist and the test fails. The repository's error
registry `docs/contracts/error-codes.md` sits in the same ignored tree while an acceptance (R1's
YS02) reads it.

**Evidence:** `git check-ignore -v docs/store/public-exports.baseline.json` → `.gitignore:14:docs/`.

**Why the checks missed it:** `validate` checks that Bundle `reads` exist in the resolved repository.
An ignored file exists locally, so the check passes on the author's machine and nowhere else.

**What a detector would need:** cheap and deterministic — run `git check-ignore` over the paths named
in acceptance methods and step `touches`; any hit is a candidate ("this input will not exist in a
clean checkout").

## OD-10 A leaf's write set enters another SDD's ownership

**Observed:** the first R2 draft carried a requirement to change `website/scripts/generate/signatures.ts`.
The user had already assigned all website work to `docs/website/website-library-runtime.sdd.md`; the
requirement had to be moved there (it became that document's XQ07).

**Evidence:** R2 revision before the move listed `website/scripts/generate/signatures.ts` in
`writes`; the website SDD owns `migaia-website`.

**Why the checks missed it:** v2 validates one leaf's `writes` in isolation. Ownership conflicts are
checked only between children of one program root, and these two documents share no root.

**What a detector would need:** read the ownership other SDDs in the same repository declare
(`writes`, v1 `ownership`/`modification_packages`) and intersect it with the leaf's `writes`; an
intersection is a candidate naming the other document.

## OD-11 A CONVERGED legacy document fails the current validator

**Observed:** `website-library-runtime.sdd.md` at revision `2026-09-16-r6` declares design status
CONVERGED, yet the current legacy `validate` reports `MIGRATION_READER_BATCH_COVERAGE_INVALID`
(reader DY01 needs XQ02 and XQ06, split across PC02 and PC06). The r6 text was validated unchanged
to confirm the diagnostic predates the r7 amendment.

**Evidence:** `validate.ts validate --sdd <r6 copy> --document-policy current --design-policy current`
→ `valid: false`, one diagnostic.

**Why the checks missed it:** convergence was judged by the validator of its day. When a later rule
tightens, nothing re-announces that an existing CONVERGED claim no longer holds; the document keeps
reading as settled.

**What a detector would need:** a v1 document whose recorded status is CONVERGED but which yields
diagnostics is reported as "convergence predates the current validator" rather than as an ordinary
invalid draft, so the reader knows the claim, not the draft, is stale.

## OD-12 A predecessor's numeric facts go stale, or were wrong

**Observed:** R1 §1.1 #4 stated 11 `context ? f(v, ctx) : f(v)` conditional calls in
middleware-pipeline, three `isRecord` definitions in event-subscriber, and six assertions that a
never-existing dependency is absent. Live source for R2 showed 4, 2 and 4 — and two of the six
"vacuous" assertions are valid tree-shaking checks (the async entry must not bundle the sync runner).

**Evidence:** `packages/middleware-pipeline/test/tree-shaking.test.ts:40-51`,
`packages/event-subscriber/src/style.ts:209`, `packages/event-subscriber/src/channel.ts:96`.

**Why the checks missed it:** the claims passed every check and all three lenses when R1 was written.
A successor that cites a predecessor as `basis` inherits its prose without any prompt to re-read.

**What a detector would need:** low reliability, recorded for judgement — list the predecessor's
numeric or universal claims as "re-verify before reuse" items when a new SDD names it as basis.

## OD-13 Host plan mode overrides the skill's Plan Mode rule

**Observed:** `SKILL.md` says Plan Mode outputs the complete proposed SDD through `validate-draft`.
When the host entered plan mode mid-authoring, the agent followed the host's instruction (write a
short plan file, then exit plan mode) and produced a plan instead of the SDD draft.

**Evidence:** this session's plan file `sorted-bubbling-lighthouse.md` held a step list, not a
validated draft.

**Why the checks missed it:** no check sees the reply, and the two instructions are not reconciled
anywhere — both read as authoritative.

**What a detector would need:** not a detector. A behaviour case, plus one SKILL.md line stating that
under host plan mode the plan file carries the full draft that `validate-draft` accepted.

## OD-14 sdd/v2 work reaches RSI only as diagnostic counts

**Observed:** writing and validating a full SDD leaves exactly one kind of RSI trace — the codes in
`validate`'s `diagnostics`. Three things never arrive:

1. **v2 candidates.** The first R2 `validate` returned three `PSEUDOCODE_SYMBOL_UNRESOLVED`
   candidates in `handoff.candidates`; its telemetry line records `candidate_codes: []`.
   `validate.ts` builds the entry with `codesOf(output)`, which reads only `output.diagnostics`, and
   passes no `candidateCodes`. Advisory findings are therefore invisible to rule health.
2. **Authoring-time defects.** The v2 workflow (SKILL.md Report step, `references/v2-authoring.md`
   §6) never asks the author to record a defect the checks missed; this file is referenced only from
   `rsi.ts update`'s agenda text.
3. **Implementation-time failures.** `rsi.ts ingest` reads retrospectives in the retired
   `sdd-loop-delivery` format. v2 hosts report through `validate --evidence` (`sdd-evidence/v1`), and
   the v2 closure feeds nothing to RSI, so a FAIL found while implementing never arrives.

**Evidence:** telemetry line for R2's first run (2026-09-23T17:45:45Z, `codes:
["SDD_V2_PROSE_DEFINITION_DUPLICATE"]`, `candidate_codes: []`) against the same run's handoff; the
`record({ tool, sddSha, codes: codesOf(output) })` call at the end of `scripts/validate.ts`.

**Correction recorded for honesty:** the investigation first concluded that telemetry writes were
silently failing. They were not — the file's local mtime (01:50 +08:00) was read as if it were the
UTC timestamps in the ledger (17:50Z), which are the same moment. A controlled rerun appended
normally through both the `~/.codex` path and the `~/.claude` symlink.

**Why the checks missed it:** each piece works on its own, and a channel that delivers nothing looks
exactly like a quiet corpus — dormancy statistics read an absence of input as an absence of defects.

**What a detector would need:** not a detector, three small wiring changes: pass
`handoff.candidates` codes as `candidateCodes` in `validate.ts`; one Report-step line pointing
authors here; let `validate --evidence` record FAIL and stale-revision closures.

**Status (2026-09-24):** repaired. Round R-20260923180325 (case-amendment) pinned gaps 1 and 3 as
`CSDD-RSI-TEL-101`/`102`, both failing on the unchanged code; round R-20260923180447 (improvement,
ACCEPTED) made `validate.ts` record `handoff.candidates` as `candidate_codes` and `closure.findings`
as `codes`, flipping both to PASS, and added the Report-step line in SKILL.md for gap 2.
