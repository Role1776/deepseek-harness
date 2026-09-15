/**
 * The Schedule catalog's presentation rules: reading a durable record's
 * frequency, target time, and relative distance, and ordering a set of records
 * for display.
 *
 * Each formatter is pure over a record and the namespace translate; the view
 * supplies `now` and the browser locale and owns no formatting logic.
 */
import type { ScheduleRecord } from '@deepseek-ai/dsh-schedule/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'

/** Milliseconds in one second, shared by the relative formatter and the view's ticking clock. */
export const SECOND_MS = 1_000

type TimeUnit = 'day' | 'hour' | 'minute' | 'second'

const SECOND_UNIT = { unit: 'second', seconds: 1 } as const
const UNIT_SECONDS: readonly { unit: TimeUnit; seconds: number }[] = [
  { unit: 'day', seconds: 86_400 },
  { unit: 'hour', seconds: 3_600 },
  { unit: 'minute', seconds: 60 },
  SECOND_UNIT,
]

/** Localized unit word for one integral magnitude. */
function unitLabel(unit: TimeUnit, value: number, t: TranslateNS<typeof NS>): string {
  const keys = {
    day: ['unit.day.one', 'unit.day.other'],
    hour: ['unit.hour.one', 'unit.hour.other'],
    minute: ['unit.minute.one', 'unit.minute.other'],
    second: ['unit.second.one', 'unit.second.other'],
  } as const
  const pair = keys[unit]
  return t(value === 1 ? pair[0] : pair[1], { count: value })
}

/** Pick the largest exact whole unit without rounding the durable interval. */
export function formatScheduleFrequency(
  record: ScheduleRecord,
  t: TranslateNS<typeof NS>,
): string {
  if (record.kind !== 'every') return t('frequency.once')
  let selected: { unit: TimeUnit; seconds: number } = SECOND_UNIT
  for (const candidate of UNIT_SECONDS) {
    if (record.everySeconds % candidate.seconds !== 0) continue
    selected = candidate
    break
  }
  const value = record.everySeconds / selected.seconds
  return t('frequency.every', { value, unit: unitLabel(selected.unit, value, t) })
}

/** Format the durable UTC target in the browser's current locale and time zone. */
export function formatScheduleLocalTime(scheduledAt: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(Date.parse(scheduledAt))
}

/** Human relative target using the largest natural clock unit. */
export function formatScheduleRelative(
  scheduledAt: string,
  now: number,
  t: TranslateNS<typeof NS>,
): string {
  const difference = Date.parse(scheduledAt) - now
  if (difference === 0) return t('relative.now')
  const absoluteSeconds = Math.abs(difference) / SECOND_MS
  const selected = UNIT_SECONDS.find(candidate => absoluteSeconds >= candidate.seconds)
    ?? SECOND_UNIT
  const value = Math.max(1, difference > 0
    ? Math.ceil(absoluteSeconds / selected.seconds)
    : Math.floor(absoluteSeconds / selected.seconds))
  const unit = unitLabel(selected.unit, value, t)
  return t(difference > 0 ? 'relative.future' : 'relative.overdue', { value, unit })
}

/** Overdue records first, then ascending target time; exact ties stay stable. */
export function orderScheduleRecords(
  records: readonly ScheduleRecord[],
  now: number,
): ScheduleRecord[] {
  return records.map((record, index) => ({ record, index })).sort((left, right) => {
    const leftTime = Date.parse(left.record.scheduledAt)
    const rightTime = Date.parse(right.record.scheduledAt)
    const leftOverdue = leftTime <= now
    const rightOverdue = rightTime <= now
    if (leftOverdue !== rightOverdue) return Number(rightOverdue) - Number(leftOverdue)
    return leftTime - rightTime || left.index - right.index
  }).map(({ record }) => record)
}
