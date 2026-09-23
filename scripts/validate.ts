/**
 * The SDD document validator, owned by create-sdd because create-sdd defines the format.
 *
 * Same commands, flags, JSON output and exit codes as the delivery loop's document commands, so a
 * caller can switch between them without changing how it reads the result: 0 valid, 1 invalid,
 * 2 for a usage error or a document that could not be read. What the loop adds on top — the
 * sidecar files a run would write — is not a property of the document and is not reported here.
 *
 *   validate          --sdd <path> [--document-policy current] [--design-policy current]
 *   validate-draft    --sdd <path> | --draft-file <path> | (stdin)
 *                     --sdd <absolute root> --documents-file <json array of {path, content}>
 *   document-check    --sdd <path>
 *   document-next-id  --sdd <path> --prefix <XX>
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { documentDigest, record } from './lib/telemetry'
import { contractBlock } from './lib/contract-source.ts'
import {
  contractDrift,
  deriveContract,
  replaceContractBlock,
  reverseTables,
  writeDerived
} from './validator/domain/derive/contract.ts'
import {
  documentCheck,
  nextDocumentId,
  validateDocument,
  validateDraft,
  validateDraftText
} from './validator/controllers/document.controller'

type DocumentPolicy = Parameters<typeof validateDocument>[1]
const COMMANDS = [
  'validate',
  'validate-draft',
  'document-check',
  'document-next-id',
  'contract',
  'contract-migrate'
] as const
const USAGE =
  'usage: validate.ts validate|validate-draft|document-check|contract|contract-migrate --sdd <path> [--repository <absolute-root>] [--document-policy current] [--design-policy current] | contract --sdd <path> [--check | --emit inline|sidecar|stdout] | validate-draft --draft-file <path> | validate-draft --sdd <abs> --documents-file <json> | document-next-id --sdd <path> --prefix <XX>'

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

/** Run one command and return its JSON result with the exit code it implies. */
export async function run(
  command: string,
  argv: readonly string[]
): Promise<{ output: unknown; exit: number }> {
  if (!(COMMANDS as readonly string[]).includes(command))
    throw new Error(`CLI_COMMAND_UNKNOWN:${command}`)
  const options = flags(argv)
  const value = (key: string) => options.get(key)
  const byValidity = (result: { valid: boolean }) => ({
    output: result,
    exit: result.valid ? 0 : 1
  })
  const sdd = value('--sdd')
  const repository = value('--repository')
  if (options.has('--repository') && (!repository || !isAbsolute(repository)))
    throw new Error('REPOSITORY_PATH_ABSOLUTE_REQUIRED')
  if (command === 'contract-migrate') {
    if (!sdd) throw new Error('SDD_REQUIRED: pass --sdd /absolute/path/to/document.sdd.md')
    const text = readFileSync(sdd, 'utf8')
    const block = contractBlock(text)
    if (!block.value)
      return {
        output: {
          protocol: 'create-sdd-contract-migrate/v1',
          sdd,
          tables: [],
          reason: block.error
        },
        exit: 0
      }
    const tables = reverseTables(block.value)
    // Printed, never written. A reverse projection is a draft of prose: where to put a table, what
    // to call its heading and which column carries which fact are the author's decisions, and a
    // command that pasted them into the document would be guessing at all three.
    return {
      output: {
        protocol: 'create-sdd-contract-migrate/v1',
        sdd,
        tables,
        note: 'Paste each table under a heading of your choosing, then run `contract --check`: a field whose table is in place derives, and the JSON copy can go.'
      },
      exit: 0
    }
  }
  if (command === 'contract') {
    if (!sdd) throw new Error('SDD_REQUIRED: pass --sdd /absolute/path/to/document.sdd.md')
    const text = readFileSync(sdd, 'utf8')
    const block = contractBlock(text)
    if (!block.value)
      return {
        output: {
          protocol: 'create-sdd-contract/v2',
          sdd,
          valid: true,
          applicability: 'NOT_APPLICABLE',
          reason: block.error ?? 'the document carries no sdd-contract block',
          derived: [],
          drift: []
        },
        exit: 0
      }
    const derived = deriveContract(block.value, text, 'self')
    const drift = contractDrift(block.value, text, 'self')
    const checking = options.has('--check')
    const emit = value('--emit')
    if (emit !== undefined && !['inline', 'sidecar', 'stdout'].includes(emit))
      throw new Error('CONTRACT_EMIT_INVALID: pass --emit inline|sidecar|stdout')
    if (emit) {
      // `contract_source` is what makes the two tracks distinguishable. A document that never opted
      // in keeps its authored block and every existing check; one that has been written by the
      // generator says so, so a later reader knows which copy is the original.
      const written = writeDerived(block.value, derived)
      const rendered = `${JSON.stringify(written, null, 2)}\n`
      if (emit === 'stdout') return { output: written, exit: 0 }
      const target = emit === 'sidecar' ? `${sdd}.contract.json` : sdd
      if (emit === 'sidecar') writeFileSync(target, rendered)
      else writeFileSync(sdd, replaceContractBlock(text, rendered))
      return {
        output: {
          protocol: 'create-sdd-contract/v2',
          sdd,
          written: target,
          emit,
          fields: derived.map((field) => field.path),
          contract_source: 'generated',
          note: 'The derived fields in this document are now computed. Editing one by hand will be reported as drift on the next --check; change the prose it comes from instead.'
        },
        exit: 0
      }
    }
    return {
      output: {
        protocol: 'create-sdd-contract/v2',
        sdd,
        valid: !checking || drift.length === 0,
        applicability: 'APPLICABLE',
        contract_source:
          (block.value as { contract_source?: unknown }).contract_source === 'generated'
            ? 'generated'
            : 'authored',
        derived_fields: derived.map((field) => field.path),
        drift,
        note: 'A derived field is computed from the document; if a derived value looks wrong, the generator is wrong, not the block.'
      },
      exit: checking && drift.length ? 1 : 0
    }
  }
  if (command === 'document-next-id') {
    const prefix = value('--prefix')
    if (!sdd || !prefix) throw new Error('SDD_AND_PREFIX_REQUIRED: pass --sdd and --prefix')
    return { output: nextDocumentId(sdd, prefix), exit: 0 }
  }
  for (const policy of ['--document-policy', '--design-policy'])
    if (options.has(policy) && value(policy) !== 'current')
      throw new Error(`DOCUMENT_POLICY_INVALID:${policy}`)
  // Without the flag an existing document that never opted into the current policy stays readable.
  const policy: DocumentPolicy = options.has('--document-policy') ? 'current' : 'legacy'
  if (command === 'validate-draft' && options.has('--documents-file')) {
    const file = value('--documents-file')
    if (!file || !sdd || !isAbsolute(sdd) || options.has('--draft-file'))
      throw new Error('DRAFT_DOCUMENTS_ARGS_INVALID')
    const documents = JSON.parse(readFileSync(file, 'utf8')) as unknown
    if (!Array.isArray(documents)) throw new Error('DRAFT_DOCUMENTS_ARRAY_REQUIRED')
    const entries = documents as { path?: unknown; content?: unknown }[]
    const roots = entries.filter(
      (entry) => entry && typeof entry.path === 'string' && resolve(entry.path) === resolve(sdd)
    )
    if (roots.length !== 1 || typeof roots[0]!.content !== 'string')
      throw new Error('DRAFT_ROOT_REQUIRED')
    return byValidity(
      validateDraftText(
        roots[0]!.content as string,
        sdd,
        entries as { path: string; content: string }[],
        policy,
        repository
      )
    )
  }
  if (command === 'validate-draft' && !sdd) {
    const draftFile = value('--draft-file')
    const text = draftFile ? readFileSync(draftFile, 'utf8') : await new Response(Bun.stdin).text()
    return byValidity(validateDraftText(text, draftFile ?? '<stdin>', [], policy, repository))
  }
  if (!sdd) throw new Error('SDD_REQUIRED: pass --sdd /absolute/path/to/document.sdd.md')
  return byValidity(
    command === 'validate'
      ? validateDocument(sdd, policy, repository)
      : command === 'validate-draft'
        ? validateDraft(sdd, policy, repository)
        : documentCheck(sdd)
  )
}

/**
 * Pull the codes out of whatever shape the command returned, for the rule ledger.
 *
 * The reported `code` is often an umbrella — `SDD_CONTRACT_INVALID` carries the code that actually
 * fired inside its message. Counting only the umbrella would make almost every contract rule look
 * dead, which is the opposite of what this measurement is for, so the inner codes are harvested too.
 */
function codesOf(output: unknown): readonly string[] {
  const diagnostics = (
    output as { diagnostics?: readonly { code?: unknown; message?: unknown }[] } | undefined
  )?.diagnostics
  if (!Array.isArray(diagnostics)) return []
  const codes: string[] = []
  for (const entry of diagnostics) {
    const code = String(entry?.code ?? '')
    if (code) codes.push(code)
    for (const match of String(entry?.message ?? '').matchAll(/\b([A-Z][A-Z0-9_]{3,})\b/g))
      codes.push(match[1]!)
  }
  return codes
}

if (import.meta.main) {
  const [command, ...argv] = Bun.argv.slice(2)
  try {
    if (!command) throw new Error(USAGE)
    const { output, exit } = await run(command, argv)
    const sdd = argv[argv.indexOf('--sdd') + 1]
    if (sdd && argv.includes('--sdd') && existsSync(sdd))
      record({
        tool: `validate:${command}`,
        sddSha: documentDigest(readFileSync(sdd, 'utf8')),
        codes: codesOf(output)
      })
    console.log(JSON.stringify(output))
    process.exit(exit)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(2)
  }
}
