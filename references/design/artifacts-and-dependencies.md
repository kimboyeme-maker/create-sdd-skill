# Protected artifacts and dependency operations

Load when the design creates or replaces a signed, generated, approved or otherwise protected artifact, plans any package-manager operation beyond read-only, or writes any shared mechanism: dependency manifests and lockfiles, workspace definitions, generated registries, schema or migration directories, CI configuration or version pins.

## Dependency operations

Classify each operation by its expected effects, never by the command name: `READ_ONLY`, `REPRODUCIBLE_MATERIALIZATION`, `WORKSPACE_RESOLUTION_MUTATION`, `DEPENDENCY_CONTRACT_MUTATION` or `EXTERNAL_PACKAGE_ACTION`. For anything beyond read-only record the exact command, predicted writes, affected packages, lifecycle scripts, manifest, lock, workspace-link, critical-resolution and dirty-worktree baselines, recovery after interruption, OOM, partial completion or failure, availability of recovery inputs, postconditions, stability checks and stop conditions. Reject a route that recovers only by overwriting user dirty work.

`REPRODUCIBLE_MATERIALIZATION` preserves manifests and lockfiles. Resolution, contract and external changes need Architect safety advice and a Coordinator decision; external actions keep their real user authority boundary. Scoped offline hydration from an existing lockfile or cache that changes no manifest, lockfile, product source, protected artifact or external system is disposable environment preparation: record it as an execution prerequisite with tracked-file preservation evidence, not as a decision.

Record each write to a shared mechanism in `shared_mechanism_writes`. Follow the authority chain from the edited package to every manager that owns it: a lockfile in the package, a workspace lockfile whose importers or members include the package, a generator whose registry includes it. Include each owner in modification authority. A file that merely mentions the package name does not manage it. Record the product toolchain, the verification toolchain and the delivery controller's runtime separately; a runtime that differs from a repository pin is either aligned or named in `environment_exceptions` with its reason.

For a dependency-contract change, list its repository-relative manifest path explicitly in the existing `write_points`, together with the managing lockfiles. `repo-facts` derives the lockfile completeness check from these declared manifest write points and from `BZ` step sections that edit a manifest path, never from other prose. Use these manifest write points for dependency changes, not read-only inventory or unrelated metadata edits. This check cannot establish that all intended writes were declared; source inventory alone grants no write authority.

## Source inventory and runtime resolution

`SOURCE_INVENTORY` (manifests, workspace configuration, exports, source reader edges) stays authoritative when `node_modules` is absent or polluted. `RUNTIME_RESOLUTION` is `REQUIRED` only when acceptance depends on installed resolution, and then binds source, lockfile, tool or runtime, workspace-link and resolver-mode fingerprints; otherwise it is `NOT_APPLICABLE` with a reason. Environment drift is inconclusive pipeline evidence, never product failure or permission to rewrite dependencies. The contract records both in `inventory_authorities`, which the loop's `validate` checks.

## Artifact custody

For every signed, generated, approved, migration, lock, manifest or integrity-bound artifact trace its operational chain:

```text
Artifact/path | description | Generator | Signer/approver | Installer/writer | Verifier | Protection/secret flow | Executability evidence
```

Every stage must be runnable by its assigned role under the actual repository and safety policy; a planned assignment the safety layer will reject is a design-admission failure. Signing, installation and verification are distinct even when two share a role. A secret stays with its custodian; hand off only the finalized artifact when policy allows. When only the signer or custodian may overwrite an approved artifact, that role performs a byte-exact install and Operator self-check plus Architect verification remain separate.

Authority covers the admitted artifact and effect envelope, not signer, stage-write, rename, retry or agent-lifetime counters. Process-local key replacement, re-signing and bounded local reinstall inside the envelope are recovery mechanics; a role or capability correction inside the approved artifact, path, behavior, protection policy and mutation scope is not a user authorization request.

<!-- reading-receipt: 9a34cc65 -->
