/**
 * Injected faces and selector results of this package's two entries. The
 * 'conversation.session.header.lineage' and 'conversation.composer' slots are
 * declared and typed by ui-conversation; this package only contributes
 * entries, so no SlotMap merge lives here.
 */

import type { SubagentAddress } from '@deepseek-ai/dsh-subagent/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Business actions supplied by the slot registration. */
export interface SubagentCatalogInjected {
  openChild: (address: SubagentAddress) => void
  refresh: (parentSessionId: SessionId) => void
  setCatalogOpen: (parentSessionId: SessionId, open: boolean) => void
}

/** Why a catalog-addressed conversation cannot accept human input. */
export interface SubagentReadOnlyMatch {
  reason: 'one-shot' | 'parent-unavailable'
}
