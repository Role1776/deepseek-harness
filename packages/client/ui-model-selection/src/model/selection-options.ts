/**
 * Framework-free projection of one Session's directory snapshot into the
 * /model popup's selectable rows and back to a model selection.
 */

import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SelectOption } from '@deepseek-ai/dsh-client-ui-commands/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelDirectoryState } from './directory.ts'
import { en, type ModelKey } from './locales.ts'

/** One selectable row's id: an opaque row key (resolved by lookup, never parsed). */
function rowId(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`
}

const BUILTIN_DESCRIPTION_KEYS: Readonly<Record<string, ModelKey>> = {
  'deepseek-official/deepseek-v4-flash': 'option.deepseekV4Flash.description',
  'deepseek-official/deepseek-v4-pro': 'option.deepseekV4Pro.description',
}

function descriptionOf(
  providerId: string,
  model: ModelDirectoryState['groups'][number]['models'][number],
  t: TranslateNS<'model'>,
): string | undefined {
  const key = BUILTIN_DESCRIPTION_KEYS[rowId(providerId, model.id)]
  return key !== undefined && model.description === en[key] ? t(key) : model.description
}

/** Flatten the directory into popup rows; failure rows are listed for visibility but never selectable.
 * @param directory - Model directory snapshot for the Session.
 * @param t - Locale translator for the model namespace.
 * @returns Popup rows, one per listed model. */
export function optionsOf(directory: ModelDirectoryState, t: TranslateNS<'model'>): SelectOption[] {
  const rows: SelectOption[] = []
  for (const group of directory.groups) {
    for (const model of group.models) {
      const description = descriptionOf(group.id, model, t)
      rows.push({
        id: rowId(group.id, model.id),
        label: model.name,
        detail: description !== undefined ? `${group.name} · ${description}` : group.name,
        ...(directory.current !== null
          && directory.current.provider === group.id
          && directory.current.model === model.id
          ? { active: true } : {}),
      })
    }
  }
  for (const failure of directory.failures) {
    rows.push({
      id: `failure/${failure.id}`,
      label: failure.name,
      detail: t('option.loadError', { message: failure.message }),
    })
  }
  return rows
}

/**
 * Resolve a picked row back to its model selection by matching against the loaded
 * groups (the same data the rows were built from — ids stay opaque).
 * @param state - the session's directory snapshot.
 * @param id - the picked row id.
 * @returns the row's model selection, or undefined for failure rows / stale ids.
 */
export function selectionOf(state: ModelDirectoryState, id: string): ModelSelection | undefined {
  for (const group of state.groups) {
    for (const model of group.models) {
      if (rowId(group.id, model.id) !== id) continue
      const sameRoute = state.current?.provider === group.id && state.current.model === model.id
      const reasoningEffort = sameRoute
        ? state.current?.reasoningEffort ?? model.reasoning?.defaultEffort
        : model.reasoning?.defaultEffort
      return {
        provider: group.id,
        model: model.id,
        ...reasoningEffort === undefined ? {} : { reasoningEffort },
      }
    }
  }
  return undefined
}
