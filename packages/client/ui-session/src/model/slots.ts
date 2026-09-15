/**
 * Session hook seats contributed to the Slots standard-props maps. These are
 * package API types, not components, so they live in the framework-free model.
 */
import type {
  SessionListState,
  SessionSnapshot,
  UseProjection,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  MaybeSnapshotSelectorHook,
  SnapshotSelectorHook,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { UseSessionPendingInteraction } from './pending-interactions.ts'

/** Selector hook over the Session Controller list and current selection. */
export type UseSessions = SnapshotSelectorHook<SessionListState>
/** Selector hook over one Session's lifecycle and control state. */
export type SessionSnapshotSelector = SnapshotSelectorHook<SessionSnapshot>
/** Public name for the Session lifecycle selector hook. */
export type UseSession = SessionSnapshotSelector

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface GlobalStandardProps {
    /** Session list and current selection. */
    useSessions: UseSessions
    /** Pending user interaction presented by a Session-scoped UI consumer. */
    useSessionPendingInteraction: UseSessionPendingInteraction
  }

  interface SessionStandardProps {
    /** Current Session lifecycle and control state. */
    useSession: SessionSnapshotSelector
    /** Current Session identity. */
    sessionId: SessionId
    /** Host-computed projection values addressed by projection key. */
    useProjection: UseProjection
  }

  interface SessionMaybeStandardProps {
    /** Current Session state, absent while no Session is selected. */
    useSession: MaybeSnapshotSelectorHook<SessionSnapshot>
    /** Current Session identity, absent while no Session is selected. */
    sessionId: SessionId | undefined
    /** Host-computed projection values; every key is absent without a Session. */
    useProjection: UseProjection
  }
}
