/**
 * Pure presentation selectors for the GoalBar strip: the phase label, the
 * resume affordance, and the strip's visibility. Framework- and DOM-free so
 * the native client reuses them unchanged.
 */

import type { GoalActivation, GoalSnapshot } from '@deepseek-ai/dsh-goal/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { GoalKey } from './locales.ts'

/** Strip label keys per visible phase; complete goals render nothing. */
const PHASE_LABELS = {
  active: 'phase.active',
  paused: 'phase.paused',
  blocked: 'phase.blocked',
} as const satisfies Record<string, GoalKey>

/** A phase the strip can label; complete goals have no strip. */
export type GoalStripPhase = Exclude<GoalSnapshot['phase'], 'complete'>

/**
 * Whether the strip renders at all. Loading, absent, and complete goals have no
 * strip, and a just-cleared goal is hidden until the projection confirms it.
 *
 * @param goal - the projected goal, undefined while loading and null when unset.
 * @param clearedGoalId - id of the goal whose clear call succeeded locally.
 * @returns true when the strip should render.
 */
export function goalStripVisible(
  goal: GoalSnapshot | null | undefined,
  clearedGoalId: GoalSnapshot['id'] | null,
): goal is GoalSnapshot & { readonly phase: GoalStripPhase } {
  return goal !== undefined && goal !== null && goal.phase !== 'complete' && goal.id !== clearedGoalId
}

/**
 * Strip label for a visible goal, using its process-local activation.
 *
 * @param phase - the goal's visible phase.
 * @param activation - process-local continuation state, absent while pending.
 * @param t - the `goal` namespace translator.
 * @returns the localized phase label.
 */
export function goalPhaseLabel(
  phase: GoalStripPhase,
  activation: GoalActivation | undefined,
  t: TranslateNS<'goal'>,
): string {
  if (phase === 'active') {
    return activation === 'disarmed' ? t('phase.active.disarmed') : t(PHASE_LABELS.active)
  }
  return t(PHASE_LABELS[phase])
}

/**
 * Whether the strip offers a resume action: a paused goal, or an active goal
 * whose continuation is disarmed.
 *
 * @param phase - the goal's visible phase.
 * @param activation - process-local continuation state, absent while pending.
 * @returns true when resume is the correct affordance.
 */
export function goalShowsResume(phase: GoalStripPhase, activation: GoalActivation | undefined): boolean {
  return phase === 'paused' || (phase === 'active' && activation === 'disarmed')
}

/**
 * Whether the strip offers a pause action: only an armed active goal.
 *
 * @param phase - the goal's visible phase.
 * @param activation - process-local continuation state, absent while pending.
 * @returns true when pause is the correct affordance.
 */
export function goalShowsPause(phase: GoalStripPhase, activation: GoalActivation | undefined): boolean {
  return phase === 'active' && activation === 'armed'
}
