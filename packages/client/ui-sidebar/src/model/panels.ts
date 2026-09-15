/** Pure projection of registered sidebar panel entries into row metadata. */
import { resolveSlotLabel, type StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SidebarPanelMetadata } from './slots.ts'

/**
 * Project `sidebar.panellist` entries into ordered panel rows.
 * @param entries - stored list registrations.
 * @returns rows sorted by ascending order, ties in registration order.
 */
export function selectPanels(entries: readonly StoredEntry[]): SidebarPanelMetadata[] {
  return entries.map(({ options }) => {
    // The list registration requires an id; StoredEntry erases the slot kind.
    const id = options.id as MainPanelId
    return { id, order: options.order ?? 0, label: resolveSlotLabel(options.label) ?? id }
  }).sort((a, b) => a.order - b.order)
}

/**
 * Whether two panel row sets are equal by id, order, and label.
 * @param previous - the published rows.
 * @param next - the candidate rows.
 * @returns true when publishing the candidate would be a no-op.
 */
export function panelsEqual(
  previous: readonly SidebarPanelMetadata[],
  next: readonly SidebarPanelMetadata[],
): boolean {
  return previous.length === next.length && previous.every((panel, index) => {
    const candidate = next[index] as SidebarPanelMetadata
    return panel.id === candidate.id && panel.order === candidate.order && panel.label === candidate.label
  })
}
