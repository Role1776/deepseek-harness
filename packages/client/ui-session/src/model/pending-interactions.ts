/** Framework-free pending-interaction registry and its projection rules. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'

/** Common identity carried by every Session-scoped pending interaction. */
export interface SessionPendingInteractionBase {
  /** Opaque request identity; a replacement request must use a new key. */
  readonly key: string
  /** Domain-owned presentation discriminator. */
  readonly kind: string
  /** Session whose UI can answer this interaction. */
  readonly sessionId: SessionId
}

/** Declaration-merged roster of domain-owned pending interaction values. */
export interface SessionPendingInteractionMap {}

/** Every pending interaction contributed by the assembled Client. */
export type SessionPendingInteraction =
  [keyof SessionPendingInteractionMap] extends [never]
    ? SessionPendingInteractionBase
    : SessionPendingInteractionMap[keyof SessionPendingInteractionMap]

/** Current effective pending interaction by Session. */
export type SessionPendingInteractionSnapshot = ReadonlyMap<SessionId, SessionPendingInteraction>
/** Selector hook over Session-scoped pending interactions. */
export type UseSessionPendingInteraction = SnapshotSelectorHook<SessionPendingInteractionSnapshot>

/** Publish one pending interaction and define how plugin teardown delegates it. */
export type PendingInteractionPublisher<T extends SessionPendingInteractionBase> = (
  interaction: T,
  delegate: () => Promise<void>,
) => () => void

interface PendingInteractionEntry<T> {
  readonly interaction: T
  readonly delegate: () => Promise<void>
}

/** One domain's keyed pending values with a cross-domain precedence order. */
export class PendingInteractionDomain<T extends SessionPendingInteractionBase> {
  private readonly values = new Map<string, PendingInteractionEntry<T>>()

  /**
   * @param precedence - deterministic cross-domain precedence; larger values win.
   * @param changed - notifies the owning registry to republish.
   */
  constructor(
    readonly precedence: (interaction: T) => number,
    private readonly changed: () => void,
  ) {}

  /** Current interactions in insertion order. */
  valuesSnapshot(): readonly T[] {
    return [...this.values.values()].map(entry => entry.interaction)
  }

  /**
   * Add one interaction and return its removal.
   * @param interaction - the value to publish; its key must be unused.
   * @param delegate - settles the owner when the registry tears the domain down.
   * @returns idempotent removal for one publication.
   */
  publish(interaction: T, delegate: () => Promise<void>): () => void {
    if (this.values.has(interaction.key)) {
      throw new Error(`ui-session: duplicate pending interaction key '${interaction.key}'`)
    }
    this.values.set(interaction.key, { interaction, delegate })
    this.changed()
    let active = true
    return () => {
      if (!active) return
      active = false
      if (!this.values.delete(interaction.key)) return
      this.changed()
    }
  }

  /** Remove every pending value and return the operations that settle their owners. */
  release(): readonly (() => Promise<void>)[] {
    const delegates = [...this.values.values()].map(entry => entry.delegate)
    this.values.clear()
    return delegates
  }
}

/** Runtime view of a domain after its interaction generic erases. */
export type RuntimePendingDomain = PendingInteractionDomain<SessionPendingInteractionBase>

/**
 * Compare two pending-interaction projections by exact interaction object.
 * @param left - current snapshot.
 * @param right - candidate snapshot.
 * @returns whether both map keys to the same interaction objects.
 */
export function samePendingInteractions(
  left: ReadonlyMap<SessionId, SessionPendingInteractionBase>,
  right: ReadonlyMap<SessionId, SessionPendingInteractionBase>,
): boolean {
  if (left.size !== right.size) return false
  for (const [sessionId, interaction] of left) {
    if (right.get(sessionId) !== interaction) return false
  }
  return true
}
