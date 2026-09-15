import type { PlanProjection } from '@deepseek-ai/dsh-plan-mode/client'

/**
 * Effective plan-mode target from the host-computed `plan` projection.
 *
 * While a plan transition is pending the projection's `active` flag still
 * reports the previous mode, so the pending flag inverts it; this is a folded
 * host value, not client optimism.
 *
 * @param plan - the session's current plan projection.
 * @returns true while plan mode is the effective target.
 */
export function effectivePlanTarget(plan: PlanProjection): boolean {
  return plan.pending ? !plan.active : plan.active
}
