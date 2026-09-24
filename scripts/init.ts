/**
 * Write a new document skeleton that `validate` accepts, spec-kit's `specify init` for this skill.
 *
 *   init.ts --kind feature|bug|assessment|program --out <absolute .md> [--id <id>] [--repository <root>]
 *   init.ts --kind evidence --sdd <absolute SDD> --out <absolute .json>
 *
 * A skeleton carries the open decision D1 ("replace this skeleton"), so it validates as
 * AWAITING_USER and can never be handed to a host as a finished design. The repository preset
 * (`.create-sdd/preset.json`) supplies default principles, required sections and, per kind, a
 * template of its own (`{{id}}` is substituted). Every file is validated in memory first; if any
 * would not validate, nothing is written. Existing files are never overwritten.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import { contractBlock } from './lib/contract-source.ts'
import { repositoryRoot } from './facts/repository.ts'
import { validateAssessment } from './validator/domain/v2-assessment.ts'
import { validateV2Document } from './validator/domain/v2-document.ts'
import { list, object, text } from './validator/domain/v2-meta.ts'
import { loadPreset, type Preset, type PresetKind } from './validator/domain/v2-preset.ts'
import { runnerFor } from './validator/domain/v2-replay.ts'

const KINDS = ['feature', 'bug', 'assessment', 'program', 'evidence'] as const
type Kind = (typeof KINDS)[number]

const block = (index: unknown, marker = 'sdd-contract') =>
  `<!-- ${marker}:start -->\n\`\`\`json\n${JSON.stringify(index, null, 2)}\n\`\`\`\n<!-- ${marker}:end -->\n`

/** Headings a preset requires for this kind, each with a placeholder body. */
const presetSections = (preset: Preset | null, kind: PresetKind) =>
  (preset?.sections[kind] ?? [])
    .map((names) => `## ${names.split('|')[0]}\n\n[Required by the repository preset.]\n`)
    .join('\n')

/** The principle check a non-empty `principles` list requires. */
const principleCheck = (principles: readonly string[]) =>
  principles.length
    ? `## Principle Check\n\n${principles.map((p) => `- \`${p}\`: [complies, or the deviation and why]`).join('\n')}\n`
    : ''

/** A leaf skeleton: one Entry, requirement, batch, step and acceptance, and the open decision D1. */
function leaf(id: string, kind: 'feature' | 'bug', preset: Preset | null, root?: string): string {
  const principles = preset?.principles ?? []
  const index = {
    protocol: 'sdd/v2',
    id,
    revision: '1',
    ...(root ? { root } : {}),
    ...(kind === 'bug' ? { intent: 'bug', regression: ['A1'] } : {}),
    requirements: [{ id: 'R1', kind: 'must-ship', implementation: ['S1'], acceptance: ['A1'] }],
    batches: [{ id: 'C1', steps: ['S1'], requirements: ['R1'], depends_on: [] }],
    steps: [{ id: 'S1', touches: [], closes: ['A1'] }],
    acceptance: ['A1'],
    writes: ['src'],
    oracles: { A1: `src/${id}.test.ts` },
    ...(principles.length ? { principles } : {}),
    ...(root ? {} : { metas: [{ id: 'E1', kind: 'Entry', priority: 'P1', members: ['M:R1'] }] }),
    unresolved_user_decisions: ['D1']
  }
  const bug =
    kind === 'bug'
      ? '## Reproduction\n\n1. [Steps, expected versus actual, version and environment.]\n\n## Root Cause\n\n[The cause, not the symptom.]\n\n'
      : ''
  return `# ${id}

${root ? '' : '- E1 [Who needs what, and why — without technology.]\n\n'}[NEEDS CLARIFICATION: D1 replace this skeleton with the real design]

## Decisions

- D1 Replace every bracketed placeholder, set \`writes\` and \`oracles\`, then remove D1 and its marker.

${bug}## Requirements

- R1 [Observable behaviour the user needs.]

## Batches

- C1 [One coherent change.]

## Steps

- S1 [What changes, in which file; declare new functions in pseudocode.]

## Acceptance

- A1 Given [context], when [action], then [observable result].

${presetSections(preset, kind)}${principleCheck(principles)}
${block(index)}`
}

/** An idea assessment skeleton; its open decision already waits for the user. */
function assessment(id: string, preset: Preset | null): string {
  const index = {
    protocol: 'sdd-assessment/v1',
    id,
    revision: '1',
    options: [{ id: 'O1' }],
    decision: { outcome: 'open', option: null },
    proposed_entries: [],
    unresolved_user_decisions: []
  }
  return `# Assess ${id}

## Intake

[Who asks, and why now.]

## Research

[What exists, constraints and evidence.]

## Options

- O1 [An option with its cost and risk.]

## Decision

[Open until the user decides; a go names an option and proposes prioritized Entries.]

${presetSections(preset, 'assessment')}
${block(index)}`
}

/** A program root and its first child, linked both ways. */
function program(id: string, child: string, preset: Preset | null): string {
  const index = {
    protocol: 'sdd-program/v2',
    id,
    revision: '1',
    children: [{ id: 'core', sdd: child, depends_on: [] }],
    metas: [
      { id: 'E1', kind: 'Entry', priority: 'P1', members: ['M-core'] },
      {
        id: 'M-core',
        kind: 'Module',
        owner: 'core',
        source_id: 'R1',
        origin: { document: child, requirement_id: 'R1' }
      },
      { id: 'K-core', kind: 'Chunk', owner: 'core', source_id: 'C1', members: ['M-core'] },
      { id: 'B-core', kind: 'Bundle', owner: 'core', members: ['K-core'], requires: [] }
    ],
    ...(preset?.principles.length ? { principles: preset.principles } : {}),
    unresolved_user_decisions: ['D1']
  }
  return `# ${id}

- E1 [The total outcome this program delivers.]

[NEEDS CLARIFICATION: D1 replace this skeleton with the real program]

## Decisions

- D1 Split into children only where an outcome has its own owner; then remove D1 and its marker.

## Shared Constraints

None

${presetSections(preset, 'program')}${principleCheck(preset?.principles ?? [])}
${block(index, 'sdd-program')}`
}

/** An evidence report to fill in after implementation: one row per acceptance, runner prefilled. */
function evidence(sdd: string, repository: string | null, preset: Preset | null): string {
  const index = contractBlock(readFileSync(sdd, 'utf8')).value
  if (!object(index) || index.protocol !== 'sdd/v2')
    throw new Error('INIT_EVIDENCE_REQUIRES_V2_LEAF')
  const oracles = object(index.oracles) ? index.oracles : {}
  const results = list(index.acceptance)
    .filter(text)
    .map((id) => {
      const oracle = oracles[id]
      const runner = text(oracle)
        ? runnerFor(repository ?? dirname(sdd), oracle, preset?.runners)
        : null
      return {
        acceptance: id,
        status: 'BLOCKED',
        command: runner ? runner.join(' ') : '',
        evidence: '',
        commit: '',
        baseline: { status: 'FAIL', evidence: '', commit: '' }
      }
    })
  return `${JSON.stringify({ protocol: 'sdd-evidence/v1', sdd: index.id, revision: index.revision, results }, null, 2)}\n`
}

/** Create the files for one kind; returns every path written. */
export function init(options: {
  kind: Kind
  out: string
  id?: string
  repository?: string
  sdd?: string
}): {
  written: string[]
  validation: { path: string; maturity: string; diagnostics: unknown[] }[]
} {
  const { kind, out } = options
  if (!(KINDS as readonly string[]).includes(kind)) throw new Error(`INIT_KIND_UNKNOWN:${kind}`)
  if (!isAbsolute(out)) throw new Error('INIT_OUT_ABSOLUTE_REQUIRED')
  const detected = repositoryRoot(dirname(out))
  const repository = options.repository ?? (existsSync(join(detected, '.git')) ? detected : null)
  if (repository && !(existsSync(repository) && statSync(repository).isDirectory()))
    throw new Error('REPOSITORY_NOT_FOUND')
  const preset = loadPreset(repository)
  const id = options.id ?? basename(out).replace(/\.sdd\.md$|\.md$|\.json$/, '')
  const files = new Map<string, string>()
  if (kind === 'evidence') {
    if (!options.sdd || !isAbsolute(options.sdd)) throw new Error('INIT_SDD_ABSOLUTE_REQUIRED')
    files.set(out, evidence(options.sdd, repository, preset))
  } else {
    const template = preset?.templates[kind]
    if (template)
      files.set(out, readFileSync(join(repository!, template), 'utf8').replaceAll('{{id}}', id))
    else if (kind === 'assessment') files.set(out, assessment(id, preset))
    else if (kind === 'program') {
      const child = `${id}-core.sdd.md`
      files.set(out, program(id, child, preset))
      files.set(
        join(dirname(out), child),
        leaf('core', 'feature', preset, relative(dirname(out), out))
      )
    } else files.set(out, leaf(id, kind, preset))
  }
  for (const path of files.keys())
    if (existsSync(path)) throw new Error(`INIT_TARGET_EXISTS:${path}`)
  // Preflight in memory, with the new files visible to each other, before anything is written:
  // a skeleton that would not validate (or a template with no recognised block) writes nothing.
  const drafts = [...files].map(([path, content]) => ({ path, content }))
  const validation = [...files.keys()]
    .filter((path) => path.endsWith('.md'))
    .map((path) => {
      const content = files.get(path)!
      const result =
        validateAssessment(path, content) ??
        validateV2Document(path, content, drafts, repository ?? undefined)
      if (!result)
        return {
          path,
          maturity: 'UNVALIDATED',
          diagnostics: [
            {
              code: 'INIT_TEMPLATE_UNRECOGNIZED',
              message: 'no sdd/v2, program or assessment block'
            }
          ]
        }
      return { path, maturity: result.handoff.maturity, diagnostics: [...result.diagnostics] }
    })
  const failed = validation.filter((item) => item.diagnostics.length)
  if (failed.length) throw new Error(`INIT_PREFLIGHT_FAILED:${JSON.stringify(failed)}`)
  for (const [path, content] of files) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  return { written: [...files.keys()], validation }
}

if (import.meta.main) {
  const argv = Bun.argv.slice(2)
  const value = (flag: string) => {
    const at = argv.indexOf(flag)
    return at >= 0 ? argv[at + 1] : undefined
  }
  try {
    const result = init({
      kind: value('--kind') as Kind,
      out: value('--out') ?? '',
      id: value('--id'),
      repository: value('--repository'),
      sdd: value('--sdd')
    })
    console.log(JSON.stringify({ protocol: 'create-sdd-init/v1', ...result }, null, 2))
    process.exit(result.validation.every((item) => !item.diagnostics.length) ? 0 : 1)
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error))
    process.exit(2)
  }
}
