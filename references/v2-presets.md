# Repository presets and `init`

A repository adapts this skill without editing it through `.create-sdd/preset.json` (spec-kit's presets). `validate`, `init` and convergence read it from the resolved repository; a malformed preset is reported as `SDD_V2_PRESET_INVALID` and ignored.

```json
{
  "protocol": "create-sdd-preset/v1",
  "principles": ["AGENTS.md", ".specify/memory/constitution.md"],
  "sections": { "feature": ["Security Review|安全评审"], "bug": ["Rollback"] },
  "blocking_candidates": ["SDD_V2_PATH_GIT_IGNORED"],
  "runners": { ".ts": ["pnpm", "vitest", "run", "{oracle}"] },
  "templates": { "feature": "docs/templates/feature.sdd.md" }
}
```

- `principles`: files every SDD must list in `principles` (and therefore check under `## Principle Check`); a missing one is `preset-principle-missing`.
- `sections`: headings each kind (`feature`, `bug`, `program`; `assessment` for templates) must contain; alternatives are joined by `|`. A missing one is `preset-section-missing`.
- `blocking_candidates`: advisory candidate codes this repository treats as blockers; each hit becomes `SDD_V2_PRESET_BLOCKED`.
- `runners`: the replay command per oracle extension; `{oracle}` is the only substitution. Without one, replay derives the runner (`bun test`, `vitest`, `jest`, `pytest`, `go test`).
- `templates`: repository skeletons `init` writes instead of the built-in ones; `{{id}}` is substituted. A template must carry a recognised index block; `init` refuses one that does not.

## `init`

`bun <create-sdd-root>/scripts/init.ts --kind feature|bug|assessment|program --out <absolute .md> [--id <id>] [--repository <root>]` writes a skeleton the validator accepts: IDs anchored in prose, a derived Meta graph, `oracles`, preset principles and sections, and the open decision `D1`. `D1` keeps it at `AWAITING_USER` until the author replaces the placeholders, so a skeleton can never be handed to a host as a design. `program` writes the root and its first child, linked both ways. `--kind evidence --sdd <leaf> --out <report.json>` writes the `sdd-evidence/v1` report a host fills in after implementation, one row per acceptance with the replay runner prefilled. Every file is validated in memory first; if any would not validate (a malformed preset, or a template without a recognised block), nothing is written and `init` fails with `INIT_PREFLIGHT_FAILED`, so a corrected retry is never blocked by a half-written skeleton. Existing files are never overwritten.

<!-- reading-receipt: ae954df5 -->
