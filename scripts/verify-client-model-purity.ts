/**
 * Enforce the Client UI model/view split: files under a package-level
 * `packages/client/ui-<name>/src/model/` directory must stay framework-free so
 * the native-client rewrite can reuse them without a DOM.
 *
 * The split and its rationale live in the
 * [model/view split Agent Note](../.agents/notes/implemented/architecture/2026-09-15-client-model-view-split.md).
 * Discovery is syntax-aware, as `scripts/AGENTS.md` requires: a line-wise
 * regex would read `document` inside a property access or a string, and would
 * miss a renamed `react-dom` import.
 *
 * Run directly:
 *   pnpm exec tsx scripts/verify-client-model-purity.ts
 */

import { globSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')

/** Package-level model tree of every Client UI package. */
const MODEL_GLOB = 'packages/client/ui-*/src/model/**/*.{ts,tsx}'

/**
 * Lower bound on the Client UI package count. The model tree is legitimately
 * empty before the first package is split, so the corpus guard watches the
 * packages the glob can discover instead of the files it finds.
 */
const MINIMUM_UI_PACKAGES = 40

/** Browser module specifiers model code must never reach. */
const FORBIDDEN_MODULES = ['react-dom']

/** DOM globals model code must never reference. */
const DOM_GLOBALS = new Set([
  'document',
  'window',
  'localStorage',
  'sessionStorage',
  'HTMLElement',
])

/** DOM element interfaces (`HTMLDivElement`, `HTMLButtonElement`, ...). */
const HTML_ELEMENT_TYPE = /^HTML[A-Za-z]*Element$/

/** One file or position that breaks model purity. */
export interface ModelPurityViolation {
  /** Repository-relative path, in POSIX separators. */
  readonly file: string
  /** One-based line number. */
  readonly line: number
  /** Which rule the position broke. */
  readonly what: string
  /** The offending source text, trimmed. */
  readonly text: string
}

/**
 * Whether an identifier is a declaration or a property name rather than a
 * reference. `obj.document` and `interface X { window: string }` name a member;
 * a bare `document` is the global.
 *
 * @param node - the identifier to classify.
 * @returns true when the identifier does not reference a value.
 */
function isNonReference(node: ts.Identifier): boolean {
  const parent = node.parent
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true
  if (ts.isQualifiedName(parent) && parent.right === node) return true
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true
  if (ts.isPropertySignature(parent) && parent.name === node) return true
  if (ts.isPropertyDeclaration(parent) && parent.name === node) return true
  if (ts.isMethodDeclaration(parent) && parent.name === node) return true
  if (ts.isMethodSignature(parent) && parent.name === node) return true
  if (ts.isImportSpecifier(parent) && parent.propertyName === node) return true
  return false
}

/**
 * Whether an import declaration names a forbidden module or one of its subpaths.
 *
 * @param specifier - the module specifier text.
 * @returns true when model code may not import it.
 */
export function isForbiddenModule(specifier: string): boolean {
  return FORBIDDEN_MODULES.some(module => specifier === module || specifier.startsWith(`${module}/`))
}

/**
 * Find every model-purity violation in one model source file.
 *
 * @param file - repository-relative path, used for the diagnostic.
 * @param sourceText - the file's contents.
 * @returns one violation per offending position, in source order.
 */
export function findModelPurityViolations(file: string, sourceText: string): ModelPurityViolation[] {
  const posix = file.replaceAll('\\', '/')
  const source = ts.createSourceFile(
    posix,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    posix.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const lines = sourceText.split('\n')
  const violations: ModelPurityViolation[] = []

  const record = (node: ts.Node, what: string): void => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line
    violations.push({ file: posix, line: line + 1, what, text: (lines[line] ?? '').trim() })
  }

  if (posix.endsWith('.tsx')) {
    record(source, 'model files must be .ts, never .tsx')
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && isForbiddenModule(node.moduleSpecifier.text)) {
      record(node, `imports "${node.moduleSpecifier.text}"`)
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'require') {
      const [argument] = node.arguments
      if (argument !== undefined && ts.isStringLiteral(argument) && isForbiddenModule(argument.text)) {
        record(node, `requires "${argument.text}"`)
      }
    }
    if (ts.isIdentifier(node) && !isNonReference(node)
      && (DOM_GLOBALS.has(node.text) || HTML_ELEMENT_TYPE.test(node.text))) {
      record(node, `references DOM global "${node.text}"`)
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(source, visit)
  return violations
}

/**
 * Scan every model file under the Client UI packages.
 *
 * @returns every violation found, in scan order.
 * @throws when fewer Client UI packages are discovered than the guard requires,
 *   which would let the gate pass by scanning a narrowed corpus.
 */
export function scanRepository(): ModelPurityViolation[] {
  const uiPackages = readdirSync(resolve(root, 'packages/client')).filter(name => name.startsWith('ui-'))
  if (uiPackages.length < MINIMUM_UI_PACKAGES) {
    throw new Error(
      `verify-client-model-purity: found ${String(uiPackages.length)} Client UI packages, `
      + `expected at least ${String(MINIMUM_UI_PACKAGES)}; the glob no longer matches the corpus.`,
    )
  }
  return globSync(MODEL_GLOB, { cwd: root })
    .sort()
    .flatMap(file => findModelPurityViolations(file, readFileSync(resolve(root, file), 'utf8')))
}

function main(): void {
  const violations = scanRepository()
  if (violations.length === 0) {
    console.log('verify-client-model-purity: Client UI model trees are DOM-free.')
    return
  }
  console.error('verify-client-model-purity: model code must not touch the DOM or react-dom.\n')
  for (const violation of violations) {
    console.error(`  ${violation.file}:${String(violation.line)} ${violation.what}`)
    console.error(`    ${violation.text}`)
  }
  console.error('\nMove the browser-bound code out of src/model, or keep the value in the view layer.')
  process.exit(1)
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) main()
