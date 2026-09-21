#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { loadContract, programBlock, sectionText } from './lib/contract-source.ts'
import {
  commandManagers,
  declaredManager,
  declaredManagers,
  ECOSYSTEM,
  LOCK_TOOL,
  lockManagers,
  resolveManagers,
  workspaceClaims,
  workspaceMembers
} from './facts/managers.ts'
import {
  MANIFESTS,
  packageDirectories as discoverPackages,
  read,
  repositoryRoot,
  walk,
  type IIssue,
  type Item
} from './facts/repository.ts'
import { toolchainPins } from './facts/toolchain.ts'

/**
 * Read-only repository facts for an SDD. Contracts declare what they touch; this file compares
 * those declarations with what the repository shows. The repository half now lives beside it —
 * discovery in `facts/repository.ts`, manager precedence in `facts/managers.ts`, pins in
 * `facts/toolchain.ts` — because those answer the `initial` lifecycle event and never read a
 * document, while everything here reads one.
 */
export type { IIssue }
/**
 * Package directories, with the manager module supplying the member lists a Gradle or sbt
 * subproject is named in. Keeping that edge here rather than inside discovery is what lets
 * `facts/repository.ts` answer `initial` without knowing anything about precedence.
 */
export const packageDirectories = (root: string, files = walk(root)) =>
  discoverPackages(root, files, workspaceMembers)

export {
  commandManagers,
  declaredManager,
  declaredManagers,
  lockManagers,
  repositoryRoot,
  resolveManagers,
  toolchainPins,
  walk,
  workspaceClaims,
  workspaceMembers
}
/**
 * What the check produces. `issues` are determinate: a declared path that does not exist, a write
 * point no manifest manages, a program child that is missing. `candidates` are the pattern-based
 * observations, which say "answer this", not "you are wrong". Only `issues` decide `valid`.
 */
export type FactReport = {
  valid: boolean
  issues: IIssue[]
  candidates: IIssue[]
  facts: Item
}

/** Largest file scanned for migration candidates; larger files are reported, not read. */
const SCAN_LIMIT_BYTES = 1_000_000
/**
 * Smallest match count that can make a legacy symbol look generic. Below it, a symbol matching a
 * large share of a tiny corpus is still worth listing file by file; above it, the share test in
 * the migration scan decides whether the symbol names a surface or an ordinary word.
 */
const GENERIC_SYMBOL_MIN_HITS = 25
/** Language and test-harness names that a repository need not declare for pseudocode to be real. */
const PSEUDOCODE_BUILTINS = new Set([
  'expect',
  'describe',
  'test',
  'await',
  'async',
  'return',
  'require',
  'catch',
  'throw',
  'console',
  'Promise',
  'Array',
  'Object',
  'String',
  'Number',
  'Boolean',
  'JSON',
  'Math',
  'Date',
  'Error',
  'Set',
  'Map',
  'parseInt',
  'parseFloat',
  'toMatchObject',
  'toBeInstanceOf',
  'toEqual',
  'toBe',
  'resolves',
  'rejects',
  'beforeEach',
  'afterEach',
  'push',
  'slice',
  'join',
  'split',
  'filter',
  'includes'
])

/** Every string an acceptance or runtime declaration says it runs with. */
function runtimeStatements(contract: Item): string[] {
  const acceptance = Array.isArray(contract.acceptance) ? contract.acceptance : []
  const resolution = contract.inventory_authorities?.RUNTIME_RESOLUTION ?? {}
  return [
    ...acceptance.flatMap((item: Item) => [item?.environment, item?.method]),
    resolution.tool_runtime_version
  ].filter((value): value is string => typeof value === 'string')
}

/** External module specifiers imported by code blocks in the API section. */
export function apiSpecifiers(text: string): string[] {
  const section = sectionText(text, /New\/Changed API & Typing/)
  const specifiers = new Set<string>()
  for (const block of section.matchAll(
    /```(?:ts|tsx|typescript|js|jsx|javascript)\s*\n([\s\S]*?)```/g
  ))
    for (const match of block[1]!.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const specifier = match[1]!
      if (!/^(\.|\/|node:|bun:|@\/|~)/.test(specifier)) specifiers.add(specifier)
    }
  return [...specifiers]
}

/** Text an independent reviewer can inspect as grounding evidence for this SDD. */
function evidenceCorpus(sdd: string, text: string, contract: Item | null): string {
  const sections = sectionText(text, /Executed probes|Evidence|证据|探测|事实|Fact ledger/i)
  const dir = dirname(sdd)
  const stem = basename(sdd).replace(/\.sdd\.md$|\.md$/, '')
  const companions = readdirSync(dir)
    .filter((name) => name.startsWith(stem) && /evidence/i.test(name) && name !== basename(sdd))
    .map((name) => read(join(dir, name)))
  const challenges = (contract?.implementation_logic?.paths ?? []).flatMap((path: Item) =>
    (path?.challenges ?? []).map((challenge: Item) => JSON.stringify(challenge))
  )
  return [sections, ...companions, ...challenges].join('\n')
}

/** Where a split decision may come from; an author's own judgment is not one of them. */
const SPLIT_SOURCES = ['USER_STATED', 'EXPLICIT_INSTRUCTION']

/** A program root records who decided to split, and every execution SDD passes its own checks. */
/** The sentence a user sends to a host session to start a program's delivery. */
export function launchInstruction(programRoot: string): string {
  return `使用 sdd-loop-delivery 启动 ${resolve(programRoot)} 的完整 workflow`
}

async function checkProgramFacts(
  sdd: string,
  program: Item,
  repository?: string
): Promise<FactReport> {
  const issues: IIssue[] = []
  const candidates: IIssue[] = []
  const decision = program.split_decision
  if (
    !SPLIT_SOURCES.includes(decision?.source) ||
    typeof decision?.reference !== 'string' ||
    !decision.reference.trim()
  )
    issues.push({ code: 'SPLIT_DECISION_UNRECORDED', detail: sdd })
  const children: Item[] = []
  for (const node of Array.isArray(program.nodes) ? program.nodes : []) {
    if (node?.kind !== 'execution' || typeof node.sdd !== 'string') continue
    const child = resolve(dirname(sdd), node.sdd)
    if (!existsSync(child)) {
      issues.push({ code: 'PROGRAM_CHILD_NOT_FOUND', detail: node.sdd })
      continue
    }
    // A one-document program is its own execution SDD.
    const result = await checkRepositoryFacts(child, repository, true)
    children.push({ sdd: node.sdd, valid: result.valid, facts: result.facts })
    issues.push(
      ...result.issues.map((issue) => ({
        code: issue.code,
        detail: `${node.sdd}: ${issue.detail}`
      }))
    )
  }
  return {
    valid: issues.length === 0,
    issues,
    candidates,
    facts: {
      program: program.id ?? null,
      // The launch instruction is the one part of a program's output the user acts on, and it is
      // the agent's to say, not the document's to store. Deriving it here puts the exact sentence
      // in the agent's context at the moment it writes its reply, which is where it was being lost.
      launch: launchInstruction(sdd),
      children
    }
  }
}

/** Compare the SDD's declarations with repository facts; `asLeaf` ignores a program block. */
export async function checkRepositoryFacts(
  sdd: string,
  repository?: string,
  asLeaf = false
): Promise<FactReport> {
  const text = readFileSync(sdd, 'utf8')
  const program = asLeaf ? { value: null } : programBlock(text)
  const { contract, error: contractError } = await loadContract(sdd, text)
  const root = repository ? resolve(repository) : repositoryRoot(dirname(sdd))
  const files = walk(root)
  const directories = packageDirectories(root, files)
  const issues: IIssue[] = []
  const candidates: IIssue[] = []
  const facts: Item = {
    root,
    packages: [],
    toolchain: toolchainPins(root),
    unscannable_symbols: []
  }
  // An unreadable block is reported, never treated as an absent one: the checks below would
  // otherwise describe a document this command could not actually read.
  if (program.error)
    return { valid: false, issues: [{ code: program.error, detail: sdd }], candidates, facts }
  if (program.value) return checkProgramFacts(sdd, program.value, repository)
  if (contractError)
    return { valid: false, issues: [{ code: contractError, detail: sdd }], candidates, facts }
  if (!contract)
    return { valid: false, issues: [{ code: 'CONTRACT_REQUIRED', detail: sdd }], candidates, facts }
  // Without a repository the facts below would be vacuous, so absence is a failure, not a pass.
  if (!existsSync(join(root, '.git')))
    return {
      valid: false,
      issues: [{ code: 'REPOSITORY_NOT_FOUND', detail: dirname(sdd) }],
      candidates,
      facts
    }

  // Shared mechanisms: a dependency edit of an owned package declares every lockfile managing it.
  const owned = new Set<string>([
    ...(contract.ownership?.packages ?? []),
    ...(contract.delivery_plan?.batches ?? []).flatMap(
      (batch: Item) => batch?.modification_packages ?? []
    )
  ])
  const writes: Item[] = Array.isArray(contract.shared_mechanism_writes)
    ? contract.shared_mechanism_writes
    : []
  const writePoints = writes.flatMap((write) =>
    Array.isArray(write?.write_points) ? write.write_points : []
  )
  // Step sections are structured design; other prose that merely mentions a manifest is not an edit.
  const stepText = sectionText(text, /^BZ\d+\b/)
  for (const name of owned) {
    const dir = directories.get(name) ?? (existsSync(join(root, name)) ? name : undefined)
    if (!dir) continue
    const managers = lockManagers(root, dir)
    // Nearest declaration wins per ecosystem; the root answers only for ecosystems this package
    // is silent about.
    const declared = resolveManagers(root, dir)
    const claims = workspaceClaims(root, dir)
    const tools = [...new Set(managers.map((lock) => LOCK_TOOL[basename(lock)] ?? 'unknown'))]
    const sole = Object.values(declared)
    facts.packages.push({
      package: name,
      dir,
      lock_managers: managers,
      declared_managers: declared,
      ...(claims.length
        ? { claimed_by: claims.map((claim) => `${claim.dir}/${claim.file}:${claim.manager}`) }
        : {}),
      declared_manager: sole.length === 1 ? sole[0] : null,
      manager_tools: tools,
      // Managers that also claim this package from above. They lose to the package's own
      // declaration; they are listed because a claim that is overridden is still a claim, and an
      // author reading only the repository root would have followed it. Two routes carry one:
      // a lockfile that manages this directory, and a workspace file that names it as a member —
      // Maven and Gradle have only the second, so without it their losing side is invisible.
      // Only within one ecosystem: a uv.lock beside a bun.lock supersedes nothing.
      ...(() => {
        const lost = (tool: string) => {
          const ecosystem = ECOSYSTEM[tool]
          return (
            ecosystem !== undefined &&
            declared[ecosystem] !== undefined &&
            declared[ecosystem] !== tool
          )
        }
        const superseded = [
          ...new Set([...tools, ...claims.map((claim) => claim.manager)].filter(lost))
        ]
        return superseded.length ? { superseded_managers: superseded } : {}
      })()
    })
    // A workspace above a package may also list it. That is not a tie: a `packageManager` field in
    // the package's own manifest, backed by its own lockfile, is a statement about this package,
    // while a workspace list is a statement about the workspace. The nearer and more specific one
    // wins, and resolving it here is the point — an author handed two "supported" answers picks the
    // one they read first, which is how a bun package gets a pnpm install. Record the overlap as a
    // fact so it stays visible, and never as a question for the author to settle.
    const edited = MANIFESTS.some((manifest) => {
      const path = dir === '.' ? manifest : `${dir}/${manifest}`
      return writePoints.includes(path) || (dir !== '.' && stepText.includes(path))
    })
    if (!edited) continue
    for (const lock of managers)
      if (!writePoints.some((point: unknown) => typeof point === 'string' && point.includes(lock)))
        issues.push({
          code: 'SHARED_MECHANISM_WRITE_POINT_UNDECLARED',
          detail: `${lock} manages ${dir}`
        })
  }
  // Every step writes somewhere, and admission compares modification scope against the declared
  // owners by exact identifier. A location outside every declared root is admissible nowhere, so the
  // author sees it here instead of discovering it when the controller refuses the admission.
  const ownedDirs = [...owned]
    .map((name) => directories.get(name) ?? (existsSync(join(root, name)) ? name : undefined))
    .filter((dir): dir is string => dir !== undefined)
  for (const line of stepText.split(/\r?\n/)) {
    if (!/^\*\*Location:\*\*/.test(line.trim())) continue
    for (const token of line.match(/[\w.@-]+(?:\/[\w.@-]+)+/g) ?? []) {
      // Only a path the repository can actually place counts; prose that merely looks path-like
      // (a package specifier, a URL fragment) has no existing parent directory here.
      const parent = dirname(token)
      if (!existsSync(join(root, token)) && !existsSync(join(root, parent))) continue
      if (ownedDirs.some((dir) => dir === '.' || token === dir || token.startsWith(`${dir}/`)))
        continue
      issues.push({ code: 'STEP_WRITE_OUTSIDE_AUTHORITY', detail: token })
    }
  }
  // A command in the document must use the manager the package it targets declares. The facts were
  // already here — every package's manager and every acceptance's `packages` — and nothing compared
  // them, so a document could declare `pnpm install` against a package whose own manifest says bun
  // and pass every check. The failure then lands at execution, in someone else's repository state.
  const managerOf = new Map<string, Record<string, string>>()
  for (const entry of facts.packages as Item[])
    managerOf.set(String(entry.package), (entry.declared_managers ?? {}) as Record<string, string>)
  const commands: { id: string; command: string; packages: string[] }[] = [
    ...(Array.isArray(contract?.acceptance) ? contract.acceptance : []).map((item: Item) => ({
      id: String(item?.id),
      command: typeof item?.method === 'string' ? item.method : '',
      packages: Array.isArray(item?.packages) ? item.packages.map(String) : []
    }))
  ]
  for (const entry of commands) {
    if (!entry.command) continue
    const used = commandManagers(entry.command)
    if (!used.length) continue
    for (const owner of entry.packages) {
      const owners = managerOf.get(owner)
      if (!owners) continue
      for (const tool of used) {
        // Only tools that compete for the same install are comparable. `uv pip install` names uv,
        // and a Rust crate whose acceptance drives a JS harness is not installing anything wrong.
        const expected = owners[ECOSYSTEM[tool] ?? '']
        if (expected && expected !== tool)
          issues.push({
            code: 'COMMAND_PACKAGE_MANAGER_MISMATCH',
            detail: `${entry.id} runs ${tool} against ${owner}, which declares ${expected}`
          })
      }
    }
  }

  // Phase 2's exit gate says a handoff has zero unresolved information questions, zero
  // route-critical unknowns, no blocking or material findings, and evidence from all three review
  // lenses. It was prose only, so a document could violate every line of it and still pass all
  // three authoring checks; the delivery loop then refuses the contract at admission, after a run
  // has been initialised. That is this skill's own obligation, not the author's to remember, so it
  // is checked here as a determinate failure rather than reported as a candidate.
  //
  // One shape of `IN_REVIEW` is legitimate and stays legitimate: a design whose only open item is a
  // decision the user owns, recorded as a decision requirement. That is not unfinished work — it is
  // work that cannot proceed without an answer, and the loop has a channel for exactly it.
  const record = (value: unknown): Item | undefined =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Item)
      : undefined
  const convergence = record(contract?.design_convergence)
  if (convergence) {
    const open = (key: string) =>
      Array.isArray(convergence[key]) ? (convergence[key] as unknown[]).map(String) : []
    const authorityOnly =
      open('pending_authority_confirmations').length > 0 &&
      ['unresolved_information_questions', 'route_critical_unknowns', 'blocking_findings'].every(
        (key) => open(key).length === 0
      ) &&
      (contract?.requirements ?? []).some((item: Item) => item?.requirement_type === 'decision')
    const lenses = ['SYNTHESIS', 'ADVERSARIAL', 'ACCEPTANCE_TOPOLOGY']
    const passes = Array.isArray(convergence.review_passes)
      ? (convergence.review_passes as Item[])
      : []
    for (const key of [
      'unresolved_information_questions',
      'route_critical_unknowns',
      'blocking_findings',
      'material_findings'
    ])
      for (const entry of open(key))
        issues.push({ code: 'DESIGN_GATE_ITEM_OPEN', detail: `${key}: ${entry}` })
    // A handoff needs exactly one current PASS per lens, not one somewhere in the history. Keeping
    // earlier rounds is honest — they are what the design was reviewed against before — but a lens
    // whose newest pass predates the current revision was not re-run, and counting it lets a
    // document that re-reviewed two of three lenses present itself as fully reviewed.
    //
    // "Current" needs a marker the document carries. `stable_after_last_normative_change` says no
    // change has happened *since the passes*, which is the author's own claim about the same thing
    // and cannot separate a stale pass from a fresh one. The contract's own `revision` can: a pass
    // records the revision it was performed against, and a revision bump is exactly what a
    // normative change produces.
    const revision = typeof contract?.revision === 'string' ? contract.revision : undefined
    for (const lens of lenses) {
      const forLens = passes.filter((pass) => record(pass)?.lens === lens)
      if (!forLens.length) {
        issues.push({ code: 'DESIGN_GATE_LENS_MISSING', detail: lens })
        continue
      }
      // A history with no revision markers cannot be separated into rounds at all. One entry per
      // lens is then the only shape that can be read unambiguously.
      const unmarked = forLens.filter((pass) => typeof record(pass)?.revision !== 'string')
      if (unmarked.length && revision) {
        issues.push({
          code: 'DESIGN_GATE_LENS_REVISION_MISSING',
          detail: `${lens}: ${unmarked.length} pass(es) name no contract revision, so none can be shown to be current`
        })
        continue
      }
      const current = revision
        ? forLens.filter((pass) => record(pass)?.revision === revision)
        : forLens
      if (!current.length) {
        issues.push({
          code: 'DESIGN_GATE_LENS_NOT_CURRENT',
          detail: `${lens}: newest pass is for revision ${String(record(forLens.at(-1)!)?.revision)}, not ${revision}`
        })
        continue
      }
      if (current.length > 1) {
        issues.push({
          code: 'DESIGN_GATE_LENS_DUPLICATED',
          detail: `${lens}: ${current.length} passes for revision ${String(revision)}; a round records one`
        })
        continue
      }
      if (current[0]!.result !== 'PASS')
        issues.push({
          code: 'DESIGN_GATE_LENS_NOT_PASSED',
          detail: `${lens}: ${String(current[0]!.result)}`
        })
    }
    if (convergence.stable_after_last_normative_change !== true)
      issues.push({
        code: 'DESIGN_GATE_UNSTABLE',
        detail: 'stable_after_last_normative_change is not true'
      })
    if (convergence.status !== 'CONVERGED' && !authorityOnly)
      issues.push({
        code: 'DESIGN_NOT_CONVERGED',
        detail: `status ${String(convergence.status)}: a handoff is CONVERGED, or IN_REVIEW solely on a pending authority confirmation carried by a decision requirement`
      })
  }

  // Three observations below were written from a delivery that shipped these defects past every
  // other gate. They read prose and command text, which cannot carry a proof, so each one is a
  // candidate the author answers in the document. None of them decides `valid`: a keyword that
  // blocks delivery is answered by rewording the design, and a design reworded to satisfy a
  // pattern is worse than the pattern going unanswered.

  // A requirement whose title joins two observable facts needs an oracle for each of them. The
  // rehearsal admitted "the code is covered AND the registry says so truthfully" with one
  // acceptance case that observed only the first, so a PASS closed a requirement half of which
  // nothing had ever looked at.
  const CONJUNCTIONS = [/\band\b/i, /\band also\b/i, /，?\s*且/, /\s并且/, /\s以及/]
  for (const requirement of Array.isArray(contract?.requirements) ? contract.requirements : []) {
    const item = requirement as Item
    if (item.kind !== 'must-ship' || typeof item.title !== 'string') continue
    const linked = Array.isArray(item.acceptance) ? item.acceptance.length : 0
    if (linked > 1) continue
    if (CONJUNCTIONS.some((pattern) => pattern.test(item.title)))
      candidates.push({ code: 'CONJUNCTIVE_REQUIREMENT_SINGLE_ORACLE', detail: String(item.id) })
  }

  // An acceptance method that selects by name must prove something was selected. Exit codes answer
  // "did the run fail", not "was anything observed": a Vitest or Jest name filter matching nothing,
  // and pytest's -k, all exit 0. A method that filters without asserting a count can pass on a tree
  // where its own case was deleted.
  //
  // This is an early warning, not the guarantee. The decisive check lives in the delivery loop,
  // which refuses to ship when an acceptance declaring IMPLEMENTATION_REQUIRED has a signed PASS
  // from before its implementation — that rule needs no list of runner flags and cannot rot. These
  // patterns exist to say so at authoring time; do not grow them into a catalogue of every runner.
  const SELECTORS = [/(^|\s)-t\s/, /--testNamePattern/, /(^|\s)-k\s/, /--grep\b/, /--filter\s+"/]
  const COUNT_ASSERTIONS = [
    /numPassedTests/,
    /numTotalTests/,
    /--reporter[= ]json/,
    /tests?\s+ran/i,
    /grep\s+-c/,
    /--require-count/
  ]
  for (const acceptance of Array.isArray(contract?.acceptance) ? contract.acceptance : []) {
    const item = acceptance as Item
    if (typeof item.method !== 'string') continue
    if (!SELECTORS.some((pattern) => pattern.test(item.method))) continue
    if (COUNT_ASSERTIONS.some((pattern) => pattern.test(item.method))) continue
    candidates.push({ code: 'ACCEPTANCE_METHOD_ZERO_OBSERVATION', detail: String(item.id) })
  }

  // Pseudocode that calls a helper nobody has and nobody is writing is not a design an implementer
  // can follow; the rehearsal's step called two invented functions. A name resolves three ways, and
  // only a name that resolves none of them is worth asking about:
  //
  //  - the repository defines it, read as a definition rather than any occurrence of the name
  //    followed by a paren, because a call site elsewhere would answer the question with itself;
  //  - the step's own pseudocode declares or assigns it, which is how a design introduces a helper
  //    it is about to write — the common shape, and the one a naive check punishes;
  //  - it is a language or harness name no repository is expected to declare.
  //
  // A step whose Location is `Proposed` is deliberately not exempt. New code is exactly where an
  // invented helper hides, and the rehearsal's defect lived in such a step.
  // Search the roots this work owns, not the whole repository. A same-named helper in an unrelated
  // package would answer the question with somebody else's code and hide that this step has no
  // implementation available to it; scanning everything also costs the most in the repositories
  // where it helps least. With no resolvable owner the search is skipped rather than widened,
  // because a candidate derived from the wrong scope is worse than no candidate.
  const ownedRoots = [...owned]
    .map((name) => directories.get(name) ?? (existsSync(join(root, name)) ? name : undefined))
    .filter((dir): dir is string => dir !== undefined)
  const sourceCorpus = files
    .filter(
      (file) =>
        /\.(ts|tsx|js|jsx|mjs|cjs|go|rs|py|java|kt|swift)$/.test(file) &&
        ownedRoots.some((dir) => dir === '.' || file.startsWith(`${dir}/`))
    )
    .map((file) => read(join(root, file)))
    .join('\n')
  const definition = (name: string) =>
    new RegExp(
      `(?:function|class|def|fn|func)\\s+${name}\\b|(?:const|let|var)\\s+${name}\\b|\\b${name}\\s*[:=]\\s*(?:async\\s+)?(?:function\\b|\\()`
    )
  const logicPaths: Item[] = Array.isArray(contract?.implementation_logic?.paths)
    ? contract.implementation_logic.paths
    : []
  for (const path of logicPaths) {
    for (const step of Array.isArray(path?.steps) ? (path.steps as Item[]) : []) {
      const item = step as Item
      if (typeof item?.pseudocode !== 'string') continue
      if (!ownedRoots.length) continue
      const called = new Set(
        [...item.pseudocode.matchAll(/(?:^|[^.\w])([a-z][A-Za-z0-9_]{3,})\s*\(/g)].map(
          (match) => match[1]!
        )
      )
      for (const name of called) {
        if (PSEUDOCODE_BUILTINS.has(name)) continue
        const declares = definition(name)
        if (declares.test(item.pseudocode) || declares.test(sourceCorpus)) continue
        candidates.push({
          code: 'PSEUDOCODE_SYMBOL_UNRESOLVED',
          detail: `${String(item.id)}: ${name}`
        })
      }
    }
  }

  for (const point of writePoints) {
    const path =
      typeof point === 'string'
        ? /^([\w.@/-]+\.(?:lock|lockb|ya?ml|json|toml|sum|lockfile))\b/.exec(point)?.[1]
        : undefined
    if (path && !existsSync(join(root, path)))
      issues.push({ code: 'SHARED_MECHANISM_WRITE_POINT_NOT_FOUND', detail: path })
  }

  // Toolchain: acceptance must not run with a version that contradicts a repository pin.
  const exceptions = new Set<string>(
    Array.isArray(contract.environment_exceptions)
      ? contract.environment_exceptions.map((item: Item) => String(item?.tool ?? item))
      : []
  )
  for (const pin of facts.toolchain as { tool: string; version: string; source: string }[]) {
    if (!/^\d+\.\d+(\.\d+)?$/.test(pin.version) || exceptions.has(pin.tool)) continue
    const pattern = new RegExp(`\\b${pin.tool}(?:@|\\s+)v?(\\d+\\.\\d+(?:\\.\\d+)?)\\b`, 'gi')
    for (const statement of runtimeStatements(contract))
      for (const match of statement.matchAll(pattern))
        if (!pin.version.startsWith(match[1]!) && !match[1]!.startsWith(pin.version))
          issues.push({
            code: 'TOOLCHAIN_VERSION_CONFLICT',
            detail: `${pin.tool} ${match[1]} vs ${pin.version} pinned by ${pin.source}`
          })
  }

  // Migration: every scan candidate of a legacy symbol has a disposition.
  const migration = contract.migration_applicability === 'REQUIRED' ? contract.migration : undefined
  if (migration) {
    const disposed = new Set<string>([
      ...(migration.readers ?? []).map((reader: Item) => String(reader?.module)),
      ...(migration.dismissed_candidates ?? []).map((candidate: Item) => String(candidate?.module))
    ])
    const scanned = [
      ...new Set<string>(
        (migration.inventory_roots ?? []).flatMap((base: string) => walk(root, base))
      )
    ]
    for (const surface of migration.legacy_surfaces ?? [])
      for (const symbol of surface?.symbols ?? []) {
        if (typeof symbol !== 'string' || !/^[\w$@./:[\]-]{3,}$/.test(symbol)) {
          facts.unscannable_symbols.push(String(symbol))
          // A prose description cannot be searched; the inventory needs the literal pattern.
          issues.push({ code: 'MIGRATION_SYMBOL_UNSCANNABLE', detail: String(symbol) })
          continue
        }
        const hits: string[] = []
        for (const file of scanned) {
          if (disposed.has(file)) continue
          const path = join(root, file)
          if (statSync(path).size > SCAN_LIMIT_BYTES) continue
          if (read(path).includes(symbol)) hits.push(file)
        }
        // A legacy symbol is a removal surface, so its undisposed matches are few and each one is
        // worth naming. A symbol that matches a large share of the repository is not a surface —
        // it is an ordinary word (`plugin`, `config`, `host`) that happens to appear in a symbol
        // list. Emitting one finding per match then buries every other issue in the report under
        // hundreds of identical lines, which is how a real defect stays invisible. Saturation is
        // reported once, as the narrowing instruction it actually is.
        if (hits.length > GENERIC_SYMBOL_MIN_HITS && hits.length * 5 > scanned.length)
          issues.push({
            code: 'MIGRATION_SYMBOL_TOO_GENERIC',
            detail: `${symbol}: matches ${hits.length} of ${scanned.length} scanned files; a legacy symbol must name a removal surface, not an ordinary word — narrow it to the exact identifier, subpath or declaration site being retired`
          })
        else
          for (const file of hits)
            issues.push({ code: 'MIGRATION_CANDIDATE_UNDISPOSED', detail: `${file} (${symbol})` })
      }
  }

  // Missing module-path matches are review candidates, not proof of missing or invalid interfaces.
  const corpus = evidenceCorpus(sdd, text, contract)
  facts.grounding_candidates = apiSpecifiers(text).filter(
    (specifier) => !corpus.includes(specifier)
  )

  const dedupe = (list: IIssue[]) => [
    ...new Map(list.map((issue) => [`${issue.code}|${issue.detail}`, issue])).values()
  ]
  const unique = dedupe(issues)
  // Candidates never decide validity. They are questions the author answers in the document, and a
  // question that blocks delivery is answered by editing the design to please a pattern.
  return { valid: unique.length === 0, issues: unique, candidates: dedupe(candidates), facts }
}

if (import.meta.main) {
  const [command, flag, value, repoFlag, repository, ...extra] = Bun.argv.slice(2)
  if (
    command === 'check' &&
    flag === '--sdd' &&
    value &&
    !extra.length &&
    (repoFlag === undefined || (repoFlag === '--repository' && repository))
  ) {
    const result = await checkRepositoryFacts(value, repository)
    console.log(JSON.stringify({ protocol: 'create-sdd-repo-facts/v1', sdd: value, ...result }))
    process.exit(result.valid ? 0 : 1)
  }
  console.error('usage: repo-facts.ts check --sdd <path> [--repository <root>]')
  process.exit(2)
}
