#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { loadContract, programBlock, sectionText } from './lib/contract-source.ts'

/**
 * Read-only repository facts for an SDD. Contracts declare what they touch; this check compares
 * those declarations with what the repository shows, across ecosystems:
 * - shared mechanisms that actually manage a changed package (lockfiles, workspaces);
 * - tool versions pinned by the repository versus versions the SDD's acceptance runs with;
 * - migration symbol scan candidates, each of which needs a disposition;
 * - module-path matches in evidence, which only identify candidates for review.
 * It reports candidates and inconsistencies; it never claims an inventory is exhaustive.
 */

type Item = Record<string, any>
export type IIssue = { readonly code: string; readonly detail: string }
/**
 * What the check produces. `issues` are determinate: a declared path that does not exist, a write
 * point no manifest manages, a program child that is missing. `candidates` are the pattern-based
 * observations — a title that reads like a conjunction, a filtered command, an unresolved call —
 * which say "answer this", not "you are wrong". Only `issues` decide `valid`: a heuristic that
 * blocks delivery makes authors edit correct designs to satisfy a keyword, which is the opposite
 * of what a check is for.
 */
export type FactReport = {
  valid: boolean
  issues: IIssue[]
  candidates: IIssue[]
  facts: Item
}

/** Directories that hold dependencies, VCS data or build output, never product sources. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '.venv',
  'venv',
  '__pycache__',
  '.react-router',
  'coverage',
  'out',
  '.gradle',
  '.next',
  '.turbo'
])
/** A manifest path declared as a write point, or edited in a `BZ` step section, triggers manager checks. */
const MANIFESTS = [
  'package.json',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'build.gradle',
  'build.gradle.kts',
  'pom.xml'
]
/** Largest file scanned for migration candidates; larger files are reported, not read. */
const SCAN_LIMIT_BYTES = 1_000_000
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

/** Nearest ancestor holding `.git`, else the starting directory. */
export function repositoryRoot(start: string): string {
  let cursor = resolve(start)
  while (true) {
    if (existsSync(join(cursor, '.git'))) return cursor
    const parent = dirname(cursor)
    if (parent === cursor) return resolve(start)
    cursor = parent
  }
}

/** Repository-relative files under `base`, skipping dependency and build directories. */
export function walk(root: string, base = '.'): string[] {
  const result: string[] = []
  const visit = (dir: string) => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(join(root, dir), { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = dir === '.' ? entry.name : `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(path)
      } else if (entry.isFile()) result.push(path)
    }
  }
  if (existsSync(join(root, base)) && statSync(join(root, base)).isFile()) return [base]
  visit(base)
  return result
}

const read = (path: string) => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/** `*` matches one path segment, `**` any number; used for workspace member globs. */
function globMatch(pattern: string, path: string): boolean {
  const clean = pattern.replace(/^\.\//, '').replace(/\/$/, '')
  const expression = clean
    .split('/')
    .map((part) =>
      part === '**' ? '.*' : part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')
    )
    .join('/')
  return new RegExp(`^${expression}$`).test(path)
}

/** Package identity to repository-relative directory, from each ecosystem's manifest. */
export function packageDirectories(root: string, files = walk(root)): Map<string, string> {
  const map = new Map<string, string>()
  for (const file of files) {
    const dir = dirname(file) === '.' ? '.' : dirname(file)
    const name = basename(file)
    const text = () => read(join(root, file))
    let identity: string | undefined
    if (name === 'package.json') {
      try {
        identity = JSON.parse(text()).name
      } catch {}
    } else if (name === 'Cargo.toml')
      identity = /\[package\][^[]*?\bname\s*=\s*"([^"]+)"/.exec(text())?.[1]
    else if (name === 'go.mod') identity = /^module\s+(\S+)/m.exec(text())?.[1]
    else if (name === 'pyproject.toml')
      identity = /\[(?:project|tool\.poetry)\][^[]*?\bname\s*=\s*"([^"]+)"/.exec(text())?.[1]
    else if (name === 'build.gradle' || name === 'build.gradle.kts' || name === 'pom.xml')
      identity = basename(resolve(root, dir))
    if (identity && !map.has(identity)) map.set(identity, dir)
  }
  return map
}

/** Tool versions pinned by the repository, with the file that pins them. */
export function toolchainPins(root: string): { tool: string; version: string; source: string }[] {
  const pins: { tool: string; version: string; source: string }[] = []
  const mise = read(join(root, 'mise.toml'))
  const tools = /\[tools\]([^[]*)/.exec(mise)?.[1] ?? ''
  for (const match of tools.matchAll(/^\s*"?([\w-]+)"?\s*=\s*"([^"]+)"/gm))
    pins.push({ tool: match[1]!, version: match[2]!, source: 'mise.toml' })
  for (const match of read(join(root, '.tool-versions')).matchAll(/^([\w-]+)\s+(\S+)/gm))
    pins.push({ tool: match[1]!, version: match[2]!, source: '.tool-versions' })
  for (const file of walk(root).filter((path) => basename(path) === 'package.json')) {
    try {
      const manifest = JSON.parse(read(join(root, file)))
      const manager = /^([\w-]+)@(.+)$/.exec(String(manifest.packageManager ?? ''))
      if (manager)
        pins.push({ tool: manager[1]!, version: manager[2]!, source: `${file} packageManager` })
    } catch {}
  }
  const rust =
    /channel\s*=\s*"([^"]+)"/.exec(read(join(root, 'rust-toolchain.toml')))?.[1] ??
    read(join(root, 'rust-toolchain')).trim()
  if (rust) pins.push({ tool: 'rust', version: rust, source: 'rust-toolchain' })
  const python = read(join(root, '.python-version')).trim()
  if (python) pins.push({ tool: 'python', version: python, source: '.python-version' })
  const node = read(join(root, '.nvmrc')).trim()
  if (node) pins.push({ tool: 'node', version: node.replace(/^v/, ''), source: '.nvmrc' })
  return pins
}

/**
 * Lockfiles that actually manage a package directory. A lockfile in the package directory
 * manages it; a lockfile higher up manages it only when its workspace declares the package as a
 * member (pnpm importer, bun/npm workspace entry, Cargo or uv workspace members, go.work use).
 * A lockfile that merely mentions the package name does not manage it.
 */
export function lockManagers(root: string, packageDir: string): string[] {
  const managers: string[] = []
  const locks = [
    'pnpm-lock.yaml',
    'bun.lock',
    'bun.lockb',
    'package-lock.json',
    'yarn.lock',
    'Cargo.lock',
    'go.sum',
    'go.work.sum',
    'uv.lock',
    'poetry.lock',
    'Pipfile.lock',
    'gradle.lockfile'
  ]
  let dir = packageDir
  while (true) {
    const rel = relative(dir === '.' ? '' : dir, packageDir === '.' ? '' : packageDir) || '.'
    for (const lock of locks) {
      const path = dir === '.' ? lock : `${dir}/${lock}`
      if (!existsSync(join(root, path))) continue
      if (dir === packageDir) {
        managers.push(path)
        continue
      }
      const text = read(join(root, path))
      const manifest = read(join(root, dir, 'package.json'))
      let members: string[] = []
      if (lock === 'pnpm-lock.yaml') {
        const importers = /^importers:\n([\s\S]*?)(?:^\S|$(?![\s\S]))/m.exec(text)?.[1] ?? ''
        if (
          new RegExp(`^  ${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*$`, 'm').test(importers)
        )
          managers.push(path)
        continue
      }
      if (lock === 'bun.lock' && text.includes(`"${rel}": {`)) {
        managers.push(path)
        continue
      }
      if (lock === 'package-lock.json' && text.includes(`"${rel}": {`)) {
        managers.push(path)
        continue
      }
      if (lock === 'yarn.lock' || lock === 'bun.lockb') {
        try {
          const workspaces = JSON.parse(manifest).workspaces
          members = Array.isArray(workspaces) ? workspaces : (workspaces?.packages ?? [])
        } catch {}
      } else if (lock === 'Cargo.lock') {
        const block =
          /\[workspace\][\s\S]*?members\s*=\s*\[([^\]]*)\]/.exec(
            read(join(root, dir, 'Cargo.toml'))
          )?.[1] ?? ''
        members = [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]!)
      } else if (lock === 'uv.lock') {
        const block =
          /\[tool\.uv\.workspace\][\s\S]*?members\s*=\s*\[([^\]]*)\]/.exec(
            read(join(root, dir, 'pyproject.toml'))
          )?.[1] ?? ''
        members = [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]!)
      } else if (lock === 'go.work.sum') {
        members = [
          ...read(join(root, dir, 'go.work')).matchAll(/^\s*(?:use\s+)?\.\/(\S+)\s*$/gm)
        ].map((match) => match[1]!)
      }
      if (members.some((pattern) => globMatch(pattern, rel))) managers.push(path)
    }
    if (dir === '.') break
    dir = dirname(dir) === '.' ? '.' : dirname(dir)
  }
  return managers
}

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
    facts: { program: program.id ?? null, children }
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
    facts.packages.push({ package: name, dir, lock_managers: managers })
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
        for (const file of scanned) {
          if (disposed.has(file)) continue
          const path = join(root, file)
          if (statSync(path).size > SCAN_LIMIT_BYTES) continue
          if (read(path).includes(symbol))
            issues.push({ code: 'MIGRATION_CANDIDATE_UNDISPOSED', detail: `${file} (${symbol})` })
        }
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
