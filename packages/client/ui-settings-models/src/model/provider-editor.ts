/**
 * Framework-free provider-editor helpers: the collapsed layout chosen per
 * adapter family, the draft subtree read, the credential reference resolution,
 * and the minimal path ops that carry one draft over its loaded value.
 */

import type { SettingsNamespaceView, SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { deriveKeyRef } from './store.ts'
import type { SettingsSchemaOperations } from './schema-operations.ts'

/** Per-adapter-family curated field sets (unknown namespaces get the hint alone). */
export type EditorLayout = 'deepseek' | 'pi-ai' | 'unknown'

/** The public DeepSeek endpoint shown as the deepseek base-URL placeholder. */
export const DEEPSEEK_PUBLIC_BASE_URL = 'https://api.deepseek.com'

/**
 * Read a user-section subtree as a plain draft object.
 * @param schema - settings schema and immutable path operations.
 * @param namespace - the namespace view owning the profile.
 * @param path - path from the namespace root to the subtree.
 * @returns a structured clone of the subtree, or an empty object when absent.
 */
export function draftAt(
  schema: SettingsSchemaOperations,
  namespace: SettingsNamespaceView,
  path: readonly string[],
): Record<string, unknown> {
  const subtree = schema.getPath(namespace.user, path)
  if (typeof subtree !== 'object' || subtree === null || Array.isArray(subtree)) return {}
  return structuredClone(subtree) as Record<string, unknown>
}

/**
 * The minimal path ops carrying `after` over `before`, both as the card sees
 * them. Only keys the card observed are named; fields absent from both sides
 * produce no op, which is why edits are path-addressed rather than a rebuilt
 * section.
 * @param base - path of the edited subtree inside the user section.
 * @param before - the subtree as loaded, or undefined when it is new.
 * @param after - the subtree as edited.
 * @returns ordered set/unset ops; empty when nothing changed.
 */
export function pathOps(
  base: readonly string[],
  before: unknown,
  after: Record<string, unknown>,
): SettingsPathOpView[] {
  const previous = typeof before === 'object' && before !== null && !Array.isArray(before)
    ? before as Record<string, unknown>
    : {}
  const ops: SettingsPathOpView[] = []
  for (const [key, value] of Object.entries(after)) {
    if (JSON.stringify(previous[key]) === JSON.stringify(value)) continue
    ops.push({ op: 'set', path: [...base, key], value: value as JsonValue })
  }
  for (const key of Object.keys(previous)) {
    if (!(key in after)) ops.push({ op: 'unset', path: [...base, key] })
  }
  return ops
}

/**
 * The editor layout the owning namespace selects.
 * @param ns - the provider's settings namespace.
 * @returns the curated field-set name.
 */
export function layoutOf(ns: string): EditorLayout {
  if (ns === 'llm-deepseek') return 'deepseek'
  if (ns === 'llm-pi-ai') return 'pi-ai'
  return 'unknown'
}

/**
 * The credential reference this profile resolves keys through.
 * @param schema - settings schema and immutable path operations.
 * @param namespace - the namespace view owning the profile.
 * @param path - path from the namespace root to the profile.
 * @param provider - provider route id used for the derived fallback.
 * @returns the profile's `apiKeyEnv`, or the derived `<ROUTE>_API_KEY`.
 */
export function refFor(
  schema: SettingsSchemaOperations,
  namespace: SettingsNamespaceView,
  path: readonly string[],
  provider: string,
): string {
  const profile = schema.getPath(namespace.value, path)
  const named = typeof profile === 'object' && profile !== null
    ? (profile as { apiKeyEnv?: unknown }).apiKeyEnv
    : undefined
  return typeof named === 'string' && named.length > 0 ? named : deriveKeyRef(provider)
}
