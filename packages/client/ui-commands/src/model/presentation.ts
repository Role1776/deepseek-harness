/** Composer menu grouping and localized sectioning. */
import type { InputTriggerCandidate } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'

/** The menu's two sections. */
export type MenuSection = 'add' | 'commands'

/** Row names per section, highest usage first; rows outside both lists close the Commands section in catalog order. */
const SECTION_ROWS: Readonly<Record<MenuSection, readonly string[]>> = {
  add: ['file', 'goal', 'plan', 'feedback'],
  commands: ['compact', 'permission', 'model', 'export'],
}

/**
 * Arrange the empty-query menu: the Add section, then the Commands section,
 * each in usage order, with unlisted rows closing Commands in their input
 * order; each row carries its section heading.
 * @param rows - the visible candidates in catalog-then-contribution order.
 * @param t - the `command` namespace translator.
 * @returns the sectioned rows.
 */
export function sectionRows(rows: readonly InputTriggerCandidate[], t: TranslateNS<'command'>): readonly InputTriggerCandidate[] {
  const listed = new Set([...SECTION_ROWS.add, ...SECTION_ROWS.commands])
  const byName = new Map(rows.map(row => [row.name, row]))
  const pick = (names: readonly string[]): InputTriggerCandidate[] =>
    names.flatMap((name) => {
      const row = byName.get(name)
      return row === undefined ? [] : [row]
    })
  const add = pick(SECTION_ROWS.add).map(row => ({ ...row, section: t('section.add') }))
  const commands = [...pick(SECTION_ROWS.commands), ...rows.filter(row => !listed.has(row.name))]
    .map(row => ({ ...row, section: t('section.commands') }))
  return [...add, ...commands]
}
