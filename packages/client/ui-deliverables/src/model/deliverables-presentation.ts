/** Framework-free selectors and injected faces for the closing-turn file row. */
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { PresentedOpenController } from './present-open.ts'
import { presentedForClosing, selectProducedFiles, type PresentedPath } from './turn-deliverables.ts'

/** Produced and declared files selected for one closing turn. */
export interface DeliverablesMatch {
  /** Successful mutation paths in first-seen order. */
  produced: readonly string[]
  /** Explicitly declared files with their open coordinates. */
  presented: readonly PresentedPath[]
}

/** Native-open callbacks and shared gesture status supplied by the plugin. */
export interface DeliverablesInjected {
  hooks: {
    presentedOpen: ObservableSnapshot<ReturnType<PresentedOpenController['state']['getSnapshot']>>
    presentedHost: ObservableSnapshot<ReturnType<PresentedOpenController['host']['getSnapshot']>>
  }
  reloadPresentedHost: PresentedOpenController['loadHost']
  openPresented: PresentedOpenController['open']
}

/**
 * Claim turns containing modified paths or declared files.
 * @param owner - closing turn.
 * @returns matched files, or null for an empty turn.
 */
export function selectDeliverables(owner: TurnTailOwnerProps): DeliverablesMatch | null {
  const produced = selectProducedFiles(owner) ?? []
  const presented = presentedForClosing(owner)
  return produced.length + presented.length === 0 ? null : { produced, presented }
}
