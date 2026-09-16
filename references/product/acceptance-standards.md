# Acceptance standards

Load for every implementation SDD together with the platform and language guides. An acceptance case is an executable falsifier of one claim. It is written before implementation, runs inside the loop's limits and fails when the claim is false.

## Anatomy of an acceptance case

| Field | Standard |
| --- | --- |
| Claim | one observable behavior bound to requirement IDs; never "works", "is fast" or "looks good" |
| Method | the cheapest existing command that observes the claim, with exact arguments |
| Environment | runtime and version, device or simulator and OS/API level, browser, data fixture, network condition |
| Oracle | the precise pass condition: exit code, asserted value, schema, threshold with unit, empty diff |
| Oracle kind | `mechanical` (decidable from exit code or asserted output) or `judgment` (explicit criteria plus the evidence the judge records) |
| Sensitivity | the mutation or baseline state under which the oracle fails (proves it can detect the defect) |
| Packages | only the packages the oracle observes |
| Timeout | at most 900 seconds; budget counted in the batch's `test_budget` |
| Evidence | the artifact kept: command output tail, report file, size listing, benchmark comparison, persisted in the SDD's evidence companion |

## Standard oracles by quality dimension

| Dimension | Default oracle (replace with repository or product thresholds when they exist) |
| --- | --- |
| Correctness | unit or contract tests naming the claim; property tests for invariants over input ranges |
| Journeys | one UI or end-to-end test per named journey, on a named device or browser |
| Compatibility | the same case on the lowest and highest declared runtime, OS or API level |
| Accessibility | WCAG 2.2 AA: text contrast ≥ 4.5:1 (3:1 large text), every control labeled, focus order and keyboard or switch access, font scaling to the declared maximum without clipping |
| Web performance | Core Web Vitals at p75 on the declared device profile: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1; page weight budget for reading pages |
| Mobile and mini-program performance | cold start and first meaningful screen within the declared budget on a named low-end device; package or binary size within budget |
| Service performance | latency percentile and throughput for a stated workload against a stored baseline |
| Security | negative tests for authorization and input validation; secrets absent from built artifacts; dependency audit clean |
| Privacy | collected data matches the store or platform declaration; permission-denied paths render their fallback |
| Resilience | offline, timeout, retry and process-death cases for flows that persist user work |
| Documentation | generated reference documents match core metadata (empty regeneration diff) |
| Release readiness | build, sign or package command succeeds for each shipped target; size and review checklist evidence |

## Platform and language guides

Commands, tools and platform oracles live in each guide: [platforms](platforms.md), [mini program](platforms/mini-program.md), [native mobile](platforms/mobile-native.md), [Flutter](platforms/flutter.md), [HarmonyOS ArkTS](platforms/harmonyos-arkts.md), [desktop](platforms/desktop.md), [native SDK](platforms/native-sdk.md), [JVM](languages/jvm.md), [Rust](languages/rust.md), [Go](languages/go.md), [Python](languages/python.md), [Bun and Node](languages/bun-node.md), [core and adapters](architecture/core-adapters.md).

## The method must be unable to pass on nothing

A command's exit code answers "did the run fail?", never "was anything observed?". A name-filtered
test run that matches no case, a suite whose files were all skipped, a linter given no input and a
query returning an empty set all exit 0. An acceptance whose method can exit 0 without observing
its claim is not a falsifier: deleting the case restores a green result, so the case cannot detect
the loss of the coverage it exists to assert.

Write the method so that absence fails. Pass the runner's own flag for it where one exists
(`--passWithNoTests=false` in Vitest and Jest, `--suiteXmlFile` counts in others), or make the
oracle assert the observed count rather than the exit status. State in the Oracle field what a zero
observation looks like and why it cannot be mistaken for a pass.

The decisive check needs no knowledge of the runner: an acceptance whose sensitivity declares
`implementation_timing: IMPLEMENTATION_REQUIRED` must **fail** when run before its implementation
exists. Run it then and record the result. A pre-implementation PASS means the oracle is insensitive
and the case is decorative, whatever its assertions say.

## Sizing to the loop

- One claim per case; a journey is split at its natural checkpoints when the whole run would exceed the timeout.
- Device farms, full cross-browser matrices, long soak tests and fuzzing campaigns are design probes or release gates outside a batch, recorded with their evidence, never an unbounded per-batch test.
- Visual taste is not an oracle. Tokens, measured spacing, contrast, layout at breakpoints and golden images of token-driven components are.

## Anti-patterns

- "Manually verified on my phone" without device, OS, steps and observed result.
- Coverage percentage as the acceptance of a behavior.
- A performance claim without workload, environment and baseline.
- A filtered test command whose runner treats "matched nothing" as success.
- One end-to-end test standing in for every requirement.

<!-- reading-receipt: df5c7997 -->
