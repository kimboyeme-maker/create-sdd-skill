# SDD writing guide

Load when writing or revising SDD prose (phase 3 onward). What the design must contain is decided by the [phase cards](loading.md#phases) and the [complete design template](complete-design.md); this page covers how the document reads.

## Plain prose

An SDD is read by people and agents who act on every sentence. Write claims, not staging:

- State the decision directly; no "not X but Y" framing, dramatic closers, aphorisms or run-ups that announce a point before making it.
- No inflated significance or sales words (pivotal, robust, seamless, comprehensive); name the concrete property and its measure.
- No stacked hedges; state an uncertainty once as an unknown with its falsifier.
- Name actors and owners; avoid passive constructions that hide who does what.
- Bold only defined labels; headings carry content, and the first sentence does not repeat the heading.
- Describe current and target behavior, not the history of earlier drafts.
- Never invent a fact, name, number, quote or source to make prose complete. Missing information becomes an `INFORMATION_QUESTION` or a simpler true sentence.

## Normative text and everything else

Distinguish normative requirements from rationale, examples, implementation suggestions and non-goals. Use RFC-style `MUST`/`SHOULD` only when the repository already uses them or the document defines them. Keep one compact design basis for the whole document instead of repeating rationale inside every requirement.

## Traceability

Prefer a compact mapping from normative clause → decision or implementation boundary → verification method. Proposed implementation locations may appear in a design-stage SDD; never present them as existing evidence.

## Execution projection boundary

The SDD is the only normative work graph. Requirements, dependencies, acceptance and delivery batches must let the loop derive bounded packets, but the SDD stores no runtime packet state: no agent assignments, active or completed flags, percentages, runtime blockers, retry counters or checkpoint history. A derived packet may reorder or group linked work; it cannot add a requirement, oracle, consumer, package or authority absent from the SDD.

<!-- reading-receipt: c9de4a27 -->
