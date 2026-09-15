/** Composer menu localized labels, descriptions, and icons. */
import type { ComponentType } from 'react'
import type { InputTriggerCandidate } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import {
  IconCompactOutline16, IconDownloadOutline16, IconGoalOutline16, IconPlanOutline14, IconSendOutline16,
  IconShieldOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { CommandDescriptor } from '@deepseek-ai/dsh-commands/types'
import type { CommandKey } from '../model/locales.ts'
import { builtinCommandName } from '../model/resolution.ts'
import type { BuiltinCommandName } from '../model/resolution.ts'

/** The dictionary keys and glyph of one built-in Host command's client face. */
interface HostFace {
  readonly label: CommandKey
  readonly description: CommandKey
  readonly icon: ComponentType<IconProps>
}

/** One built-in Host command's face, keyed by its dictionary entries. */
function hostFace(name: BuiltinCommandName, icon: ComponentType<IconProps>): readonly [BuiltinCommandName, HostFace] {
  return [name, {
    label: `label.${name}`,
    description: `description.${name}`,
    icon,
  }]
}

/** Built-in Host commands whose client face this package owns. */
const HOST_FACES: ReadonlyMap<BuiltinCommandName, HostFace> = new Map([
  hostFace('goal', IconGoalOutline16),
  hostFace('plan', IconPlanOutline14),
  hostFace('feedback', IconSendOutline16),
  hostFace('compact', IconCompactOutline16),
  hostFace('permission', IconShieldOutline16),
  hostFace('export', IconDownloadOutline16),
])

/**
 * The localized menu face of a catalog row.
 * @param descriptor - effective Host command descriptor.
 * @param t - the `command` namespace translator.
 * @returns title, description, and glyph for a built-in command; undefined
 * for any other row, which keeps its catalog description.
 */
export function builtinRowFace(
  descriptor: CommandDescriptor,
  t: TranslateNS<'command'>,
): Pick<InputTriggerCandidate, 'label' | 'description' | 'icon'> | undefined {
  const name = builtinCommandName(descriptor)
  const face = name === undefined ? undefined : HOST_FACES.get(name)
  return face === undefined ? undefined : { label: t(face.label), description: t(face.description), icon: face.icon }
}
