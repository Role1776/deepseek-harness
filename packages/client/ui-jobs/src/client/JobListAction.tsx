import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { SessionJob as JobView } from '@deepseek-ai/dsh-api-session-controller/types'
import { IconChevronDownOutline14, StateDot, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { dotState, formatDuration, isLive, ordered, statusLabel } from '../model/job-presentation.ts'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './JobListAction.module.css'

/** Full props for the session-header background-job action. */
export type JobListActionProps =
  PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'job'>

/** Stable empty list so a session with no jobs keeps one array identity. */
const NO_TASKS: readonly JobView[] = []

/**
 * Session-header entry point for this session's background jobs. It renders
 * nothing at all until the session has at least one job, so an ordinary
 * conversation never grows a control for a capability it is not using.
 * @param props - runtime slot currency plus the namespace translator.
 * @returns the trigger and its popover list, or null when there is nothing to show.
 */
export function JobListAction({ sessionId, useSessions, t }: JobListActionProps) {
  const jobs = useSessions(state => state.jobsBySession[sessionId]) ?? NO_TASKS
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const rows = useMemo(() => ordered(jobs), [jobs])
  const liveCount = useMemo(() => jobs.filter(isLive).length, [jobs])

  useDismissOnOutsidePointer(rootRef, open, setOpen)

  // The clock only runs while an open list is showing something that moves.
  useEffect(() => {
    if (!open || liveCount === 0) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { clearInterval(timer) }
  }, [open, liveCount])

  // The last job disappearing removes this control; close first so focus does
  // not vanish from an unmounting node.
  useEffect(() => {
    if (jobs.length === 0 && open) setOpen(false)
  }, [jobs.length, open])

  if (jobs.length === 0) return null

  const countKey = liveCount > 0
    ? (liveCount === 1 ? 'count.live.one' : 'count.live.other')
    : (jobs.length === 1 ? 'count.idle.one' : 'count.idle.other')
  const countLabel = t(countKey, { count: liveCount > 0 ? liveCount : jobs.length })

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div ref={rootRef} className={css.root} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={css.trigger}
        aria-expanded={open}
        aria-label={countLabel}
        onClick={() => {
          // Sample the clock in the same commit that opens the list: the
          // mount-time value predates every job, so the first painted frame
          // would otherwise clamp a long-running row to zero until the
          // open effect corrects it a frame later.
          setNow(Date.now())
          setOpen(current => !current)
        }}
      >
        {liveCount > 0 ? <StateDot state="ongoing" className={css.triggerDot} /> : null}
        <span className={css.count}>{countLabel}</span>
        <IconChevronDownOutline14 className={open ? css.triggerOpen : undefined} />
      </button>
      {open
        ? (
          <ul className={css.menu} aria-label={t('list.aria')}>
            {rows.map((job) => {
              const live = isLive(job)
              const elapsed = live ? now - job.startedAt : (job.finishedAt ?? job.startedAt) - job.startedAt
              const duration = formatDuration(elapsed, t)
              const status = statusLabel(job.status, t)
              return (
                <li key={job.id} className={live ? css.row : `${css.row} ${css.rowSettled}`}>
                  <StateDot state={dotState(job.status)} className={css.rowDot} />
                  <span className={css.kind}>{job.kind}</span>
                  <span className={css.label} title={job.label}>{job.label}</span>
                  <span className={css.status} title={job.detail ?? status}>{job.detail ?? status}</span>
                  <span
                    className={css.duration}
                    title={t(live ? 'duration.title.live' : 'duration.title.done', { duration })}
                  >
                    {duration}
                  </span>
                </li>
              )
            })}
          </ul>
        )
        : null}
    </div>
  )
}
