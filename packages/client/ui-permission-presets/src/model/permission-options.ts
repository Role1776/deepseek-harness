/** Framework-free selectors turning a session's permissions projection into popup rows. */
import type { SessionFace } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SelectOption } from '@deepseek-ai/dsh-client-ui-commands/client'
import type { PermissionSelect } from '@deepseek-ai/dsh-permission-presets/client'
import { displayPermissionPreset, FULL_ACCESS_PRESET } from './presentation.ts'

/**
 * Read one session's current permissions projection value.
 * @param session - materialized session face, absent before materialization.
 * @returns the projected select, or undefined when the capability is absent.
 */
export function selectOf(session: SessionFace | undefined): PermissionSelect | undefined {
  return session?.projections.faceOf('permissions').getSnapshot() as PermissionSelect | undefined
}

/**
 * Flatten the projection select into popup rows; `custom` is display state,
 * never a target.
 * @param value - current permissions projection.
 * @param t - `permission.access` namespace translator.
 * @returns popup-select options with the active mark and the Full access gate.
 */
export function optionsOf(value: PermissionSelect, t: (key: string) => string): SelectOption[] {
  return value.options
    .filter(option => option.value !== 'custom')
    .map(option => ({
      id: option.value,
      label: displayPermissionPreset(option.value, option.name, t),
      ...(option.description !== undefined ? { detail: option.description } : {}),
      ...(option.value === value.currentValue ? { active: true } : {}),
      ...(option.value === FULL_ACCESS_PRESET
        ? {
          confirmation: {
            title: t('confirm.title'),
            description: t('confirm.description'),
            acknowledgeLabel: t('confirm.acknowledge'),
            cancelLabel: t('confirm.cancel'),
            confirmLabel: t('confirm.enable'),
          },
        }
        : {}),
    }))
}
