# Held-out cases

Cases kept out of the improvement loop's sight. A round commits to their sha256 when it opens, and
`rsi.ts evaluate` refuses to run when one of them changed since, or when the round's diff touched
this directory at all.

The refusal is real: the digests are written before the work and compared after it. Its limit is
just as real, and stating it is part of the design rather than a caveat. An author with write access
to this repository can edit these files; the guard makes that edit visible in the round record, it
does not make it impossible. There is no sandbox here and this document does not pretend there is
one. The defence that does not depend on trust is somewhere else entirely: a mechanical case is
decided by running a command, so "optimising for the test" and "fixing the defect" are the same
action, and there is nothing to gain by cheating.

The directory is empty of cases today. The mechanism is in place and tested; populating it is a
decision about which cases to spend, and spending one before there are enough to spare would buy
nothing.
