/**
 * Design-time type probe: compile the API an SDD proposes, before anyone implements it.
 *
 * Every other check in this skill reads the `**Signatures:**` fence as text. A structurally perfect
 * document can therefore declare a public surface that cannot be used at all, and no gate notices:
 * `docs/middleware-pipeline/pipeline-host-r2.sdd.md:114-117` returns `IMiddlewarePipelineHost<TValue,
 * never>` from its mode-dispatching entry, whose `use(stage: TStage)` then admits no value, and that
 * document passed validate, repo-facts and three review lenses with `CONVERGED`.
 *
 * Layer P1 finds that class of defect without reading a single example: walk each exported symbol's
 * type and report `never` wherever a caller must supply a value. It is deliberately narrow — see
 * "What this does not prove" in the JSON output, which is part of the contract, not a disclaimer.
 *
 *   type-probe.ts check --sdd <path> [--repository <root>] [--max-depth <n>] [--keep-workdir]
 *
 * Exit codes match the other scripts: 0 clean, 1 issues found, 2 usage or unreadable document.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { API, SignatureKind, SymbolFlags, TypeFlags } from 'typescript/unstable/async'
import { readApiSurface, synthesize } from './validator/domain/api-section'

const USAGE =
  'usage: type-probe.ts check --sdd <path> [--repository <root>] [--max-depth <n>] [--keep-workdir]'

/** Bounded walk depth; four hops reach a factory's handle's method's parameter, which is the shape
 * the defect class lives in. Deeper graphs are reported as unexplored rather than silently trusted. */
const DEFAULT_MAX_DEPTH = 4

/**
 * Types whose members are the standard library rather than the design.
 *
 * Without this the walk reaches `String.prototype` and reports thousands of unexplored branches,
 * which is worse than useless: it buries the one finding that matters under noise.
 */
const LEAF_TYPE =
  TypeFlags.String |
  TypeFlags.Number |
  TypeFlags.Boolean |
  TypeFlags.BigInt |
  TypeFlags.ESSymbol |
  TypeFlags.UniqueESSymbol |
  TypeFlags.Void |
  TypeFlags.Undefined |
  TypeFlags.Null |
  TypeFlags.Literal |
  TypeFlags.Enum |
  TypeFlags.Unknown |
  TypeFlags.Any |
  TypeFlags.Never |
  TypeFlags.TypeParameter

/** Suppression comment an author may place on the declaration line of a deliberate `never` input. */
const ALLOW_NEVER = /\/\/\s*sdd-allow:\s*never-input\b\s*(.*)$/

type Issue = Readonly<{ code: string; detail: string; sddLine?: number }>

/** Read `--flag value` pairs; a bare flag reads as present with no value. */
function flags(argv: readonly string[]): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>()
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]!
    if (!key.startsWith('--')) throw new Error(`CLI_ARGUMENT_UNEXPECTED:${key}`)
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      out.set(key, next)
      index += 1
    } else out.set(key, undefined)
  }
  return out
}

/**
 * Names the signatures reference but never declare, harvested from the compiler rather than guessed.
 *
 * A design fence is an excerpt: it names types that live elsewhere in the package. Stubbing them as
 * distinct brands keeps the walk honest — `unknown` or `any` would make every position assignable
 * and hide exactly the defect this probe exists to find. The brand is a literal rather than a
 * `unique symbol` because the latter is illegal inside a type alias, and an illegal stub resolves to
 * `any`, which is the very failure mode being avoided.
 */
function unresolvedNames(messages: readonly string[]): readonly string[] {
  const names = new Set<string>()
  for (const message of messages) {
    const match = /Cannot find name '([^']+)'|Cannot find module '([^']+)'/.exec(message)
    if (match?.[1]) names.add(match[1])
  }
  return [...names]
}

function stubSource(names: readonly string[]): string {
  return names
    .map(
      (name) =>
        `declare type ${name}<A = unknown, B = unknown, C = unknown> = { readonly __sdd_opaque: '${name}'; readonly __a?: A; readonly __b?: B; readonly __c?: C }`
    )
    .join('\n')
}

export type ProbeResult = Readonly<{
  protocol: 'create-sdd-type-probe/v1'
  sdd: string
  valid: boolean
  applicability: 'APPLICABLE' | 'NOT_APPLICABLE'
  reason?: string
  mode: 'closed' | 'repository'
  issues: readonly Issue[]
  candidates: readonly Issue[]
  facts: Readonly<{
    heading?: string
    /** Whether the surface came from the canonical section or from the document's fences. */
    read_from: 'section' | 'document'
    signature_blocks: number
    example_blocks: number
    exports_walked: number
    stubbed_types: readonly string[]
    foreign_languages: readonly string[]
    max_depth: number
    unexplored_at_max_depth: number
  }>
  does_not_prove: readonly string[]
}>

const DOES_NOT_PROVE = [
  'runtime semantics: ordering, identity-based removal, cancellation and drain are invisible to a type checker',
  'implementability: a coherent signature may still be impossible to implement with the information it receives',
  'completeness: a public surface missing a necessary entry point raises nothing here',
  'external types in closed mode: unresolved names are stubbed as opaque brands, which weakens every position that touches them',
  'non-TypeScript ecosystems: this probe reports NOT_APPLICABLE for them and no equivalent gate exists yet',
  'any leaking into the public surface: the checker reports any for positions that depend on an uninstantiated type parameter, so the check could not tell a real any from a generic one and was removed rather than shipped as noise'
]

/** Run P1 over one SDD. */
export async function probe(
  sddPath: string,
  text: string,
  options: {
    readonly repository?: string
    readonly keepWorkdir?: boolean
    readonly maxDepth?: number
  } = {}
): Promise<ProbeResult> {
  const section = readApiSurface(text)
  const base = {
    protocol: 'create-sdd-type-probe/v1' as const,
    sdd: sddPath,
    mode: (options.repository ? 'repository' : 'closed') as 'closed' | 'repository',
    does_not_prove: DOES_NOT_PROVE
  }
  const emptyFacts = {
    read_from: section.readFrom ?? 'section',
    signature_blocks: 0,
    example_blocks: 0,
    exports_walked: 0,
    stubbed_types: [] as string[],
    foreign_languages: section.foreignLanguages,
    max_depth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    unexplored_at_max_depth: 0
  }
  if (!section.found)
    return {
      ...base,
      valid: true,
      applicability: 'NOT_APPLICABLE',
      reason:
        'the document declares no exported TypeScript surface: no New/Changed API & Typing section, and no fence anywhere in it declares one',
      issues: [],
      candidates: [],
      facts: emptyFacts
    }
  if (section.applicability === 'NOT_APPLICABLE')
    return {
      ...base,
      valid: true,
      applicability: 'NOT_APPLICABLE',
      reason: 'the API section declares NOT_APPLICABLE',
      issues: [],
      candidates: [],
      facts: { ...emptyFacts, heading: section.heading }
    }
  // A whole-document read has no Signatures/Examples split: every block it found is a declaration,
  // so it is all surface and there are no caller examples to check against it.
  const signatures = section.blocks.filter(
    (block) => block.field === 'Signatures' || block.field === 'Declarations'
  )
  const examples = section.blocks.filter((block) => block.field === 'Examples')
  if (!signatures.length)
    return {
      ...base,
      valid: true,
      applicability: 'NOT_APPLICABLE',
      reason: section.foreignLanguages.length
        ? `the API section carries no TypeScript signature fence; languages seen: ${section.foreignLanguages.join(', ')}. No equivalent gate exists for them.`
        : 'the API section carries no signature fence',
      issues: [],
      candidates: [],
      facts: { ...emptyFacts, heading: section.heading, example_blocks: examples.length }
    }

  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  const synthesized = synthesize(signatures)
  const workdir = mkdtempSync(join(tmpdir(), 'sdd-type-probe-'))
  const fileName = join(workdir, 'signatures.ts')
  const configName = join(workdir, 'tsconfig.json')
  const api = new API()
  const issues: Issue[] = []
  const candidates: Issue[] = []
  const stubbed: string[] = []
  let exportsWalked = 0
  let unexplored = 0
  try {
    writeFileSync(
      configName,
      JSON.stringify({
        compilerOptions: {
          target: 'ESNext',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          ...(options.repository ? { baseUrl: options.repository } : {})
        },
        files: ['signatures.ts']
      })
    )
    /**
     * Resolve the excerpt's undeclared names first, then walk once.
     *
     * The walk and the stub discovery deliberately do not share a snapshot: every Symbol the walk
     * touches is resolved lazily against the snapshot that produced it, so a snapshot disposed
     * between rounds would make those lookups fail rather than return a wrong answer.
     */
    let source = synthesized.code
    for (let round = 0; round < 3; round += 1) {
      writeFileSync(fileName, source)
      const snapshot = await api.updateSnapshot({ openProjects: [configName] })
      const project = snapshot.getProject(configName)
      if (!project) throw new Error('TYPE_PROBE_PROJECT_UNAVAILABLE')
      const messages = (await project.program.getSemanticDiagnostics(fileName)).map((diagnostic) =>
        String((diagnostic as { text?: unknown }).text ?? '')
      )
      const missing = unresolvedNames(messages).filter((name) => !stubbed.includes(name))
      if (!missing.length || round === 2) break
      stubbed.push(...missing)
      source = `${stubSource(stubbed)}\n${synthesized.code}`
    }
    writeFileSync(fileName, source)
    const snapshot = await api.updateSnapshot({ openProjects: [configName] })
    const project = snapshot.getProject(configName)
    if (!project) throw new Error('TYPE_PROBE_PROJECT_UNAVAILABLE')
    await walkExports(project, fileName, source, synthesized.lineMap, stubbed.length)
  } finally {
    await api.close()
    if (!options.keepWorkdir) rmSync(workdir, { recursive: true, force: true })
  }

  /** Walk every export of the synthesized module and report degenerate input positions. */
  // eslint-disable-next-line no-inner-declarations
  async function walkExports(
    project: NonNullable<
      Awaited<ReturnType<API['updateSnapshot']>>['getProject'] extends (...args: never[]) => infer R
        ? R
        : never
    >,
    file: string,
    source: string,
    lineMap: readonly number[],
    stubLines: number
  ) {
    const checker = project.checker
    const sourceFile = await project.program.getSourceFile(file)
    if (!sourceFile) throw new Error('TYPE_PROBE_SOURCE_UNAVAILABLE')
    const moduleSymbol = await checker.getSymbolAtLocation(sourceFile)
    if (!moduleSymbol) throw new Error('TYPE_PROBE_MODULE_UNAVAILABLE')
    const sourceLines = source.split('\n')
    /** Translate a synthesized line back to the SDD, accounting for prepended stub lines. */
    const toSddLine = (synthLine: number) => lineMap[synthLine - 1 - stubLines] ?? 0
    const allowed = new Set<number>()
    for (const [index, line] of sourceLines.entries())
      if (ALLOW_NEVER.test(line)) allowed.add(index + 1)

    const seen = new Set<string>()
    const report = (path: string, declLine: number) => {
      const sddLine = toSddLine(declLine)
      issues.push({
        code: 'API_SURFACE_DEGENERATE_INPUT',
        detail: `${path} requires a value of type never, so no caller can supply one`,
        ...(sddLine ? { sddLine } : {})
      })
    }

    const visit = async (type: unknown, path: string, declLine: number, depth: number) => {
      if (depth > maxDepth) {
        unexplored += 1
        return
      }
      const asType = type as { flags?: number; id?: number } | undefined
      if (!asType) return
      // Stop at values a caller passes but never navigates: primitives, literals and void-likes
      // carry the whole standard library as members, and walking them buries the real finding.
      if (((asType.flags ?? 0) & LEAF_TYPE) !== 0) return
      // Key on the type, not the path it was reached by: a degenerate position belongs to the type,
      // so one visit per type finds every one of them while keeping the walk linear. Keying on the
      // path instead re-enters shared types once per route and exhausts the depth budget.
      const key = String(asType.id ?? path)
      if (seen.has(key)) return
      seen.add(key)
      for (const kind of [SignatureKind.Call, SignatureKind.Construct]) {
        for (const signature of await checker.getSignaturesOfType(asType as never, kind)) {
          for (const parameter of await signature.getParameters()) {
            // A parameter whose type the checker cannot produce is not evidence of a degenerate
            // surface; it is missing evidence, and reporting it as a finding would be a guess.
            const parameterType = await checker.getTypeOfSymbol(parameter)
            if (!parameterType) continue
            if ((parameterType.flags & TypeFlags.Never) !== 0 && !allowed.has(declLine))
              report(`${path}(${parameter.name})`, declLine)
          }
          const returned = await checker.getReturnTypeOfSignature(signature)
          if (returned) await visit(returned, `${path}()`, declLine, depth + 1)
        }
      }
      for (const property of await checker.getPropertiesOfType(asType as never)) {
        const propertyType = await checker.getTypeOfSymbol(property)
        await visit(propertyType, `${path}.${property.name}`, declLine, depth + 1)
      }
    }

    /**
     * Locate a declared name in the synthesized source.
     *
     * The API's Symbol does not carry a usable position here, so the line comes from the text that
     * was compiled. A name declared once resolves exactly; a name that never appears as a
     * declaration resolves to 0 and the diagnostic falls back to its owner's line.
     */
    const lineOf = (name: string): number => {
      const pattern = new RegExp(
        `^\\s*(?:export\\s+)?(?:declare\\s+)?(?:async\\s+)?(?:function|const|let|var|type|interface|class)\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`
      )
      for (const [index, line] of sourceLines.entries()) if (pattern.test(line)) return index + 1
      return 0
    }

    for (const exported of await checker.getExportsOfModule(moduleSymbol)) {
      if ((exported.flags & SymbolFlags.Alias) !== 0) continue
      exportsWalked += 1
      const type = await checker.getTypeOfSymbol(exported)
      await visit(type, exported.name, lineOf(exported.name), 0)
    }
  }

  return {
    ...base,
    valid: issues.length === 0,
    applicability: 'APPLICABLE',
    issues,
    candidates,
    facts: {
      heading: section.heading,
      read_from: section.readFrom ?? 'section',
      signature_blocks: signatures.length,
      example_blocks: examples.length,
      exports_walked: exportsWalked,
      stubbed_types: stubbed,
      foreign_languages: section.foreignLanguages,
      max_depth: maxDepth,
      unexplored_at_max_depth: unexplored
    }
  }
}

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv
  if (command !== 'check') {
    console.error(USAGE)
    return 2
  }
  const options = flags(rest)
  const sdd = options.get('--sdd')
  if (!sdd) {
    console.error(USAGE)
    return 2
  }
  const sddPath = isAbsolute(sdd) ? sdd : resolve(process.cwd(), sdd)
  let text: string
  try {
    text = await Bun.file(sddPath).text()
  } catch {
    console.error(JSON.stringify({ error: 'SDD_UNREADABLE', sdd: sddPath }))
    return 2
  }
  const repository = options.get('--repository')
  const depth = options.get('--max-depth')
  const result = await probe(sddPath, text, {
    ...(repository ? { repository: resolve(repository) } : {}),
    ...(depth ? { maxDepth: Number(depth) } : {}),
    keepWorkdir: options.has('--keep-workdir')
  })
  console.log(JSON.stringify(result, null, 2))
  return result.valid ? 0 : 1
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)))
