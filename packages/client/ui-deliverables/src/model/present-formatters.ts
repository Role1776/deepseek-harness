/** Framework-free formatters for the present-call row and delivered-file cards. */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * Extract the declared file paths from raw present-call arguments. Raw
 * arguments can be partial while a call is streaming.
 * @param raw - model-produced JSON arguments or an incomplete prefix.
 * @returns comma-joined declared paths, or the raw text when unparsable.
 */
export function fileNames(raw: string): string {
  let args: unknown
  try { args = JSON.parse(raw) }
  catch { return raw } // Truncated tool JSON remains visible until the call completes.
  if (typeof args !== 'object' || args === null || !('files' in args) || !Array.isArray(args.files)) return raw
  return args.files.flatMap((file: unknown) =>
    typeof file === 'object' && file !== null && 'path' in file && typeof file.path === 'string'
      ? [file.path] : [],
  ).join(', ')
}

/**
 * Strip a trailing parenthetical qualifier from a file description.
 * @param description - persisted file description, possibly absent.
 * @param fallback - text to use when the description is empty after trimming.
 * @returns the trimmed description or the fallback.
 */
export function cardDescription(description: string | undefined, fallback: string): string {
  const trimmed = description?.replace(/\s*(?:\([^()]*\)|（[^（）]*）)\s*$/u, '').trim()
  return trimmed === undefined || trimmed === '' ? fallback : trimmed
}

/**
 * Localized remainder count for the produced-files row.
 * @param t - the `deliverables` namespace translator.
 * @param count - number of files beyond the shown limit.
 * @returns the singular or plural label.
 */
export function moreLabel(t: TranslateNS<'deliverables'>, count: number): string {
  return count === 1 ? t('produced.moreOne') : t('produced.more', { count: String(count) })
}
