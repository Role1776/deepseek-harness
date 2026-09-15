/** Existing changed-file chips and explicitly declared files for a closing turn. */
import { useEffect, useState } from 'react'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import { Button, IconChevronDownOutline14, IconChevronUpOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { GlobalStandardProps, InjectFace, PropsLocale, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { DeliverablesInjected, DeliverablesMatch } from '../model/deliverables-presentation.ts'
import { ProducedFiles } from './ProducedFiles.tsx'
import type { NS } from '../model/locales.ts'
import { presentedFileUrl } from '../presented.ts'
import { PresentedFileCard } from './PresentedFileCard.tsx'
import css from './Deliverables.module.css'

const COLLAPSED_PRESENTED_COUNT = 4

/**
 * Render workspace file actions and default-application buttons for declared files.
 * @param props - matched files, workspace opener, and localized copy.
 * @returns the closing turn's file rows.
 */
export function Deliverables({ matched, openFile, t, sessionId, useSessions, openPresented, usePresentedOpen, usePresentedHost, reloadPresentedHost }: Pick<TurnTailOwnerProps, 'openFile'> & {
  matched: DeliverablesMatch
} & PropsLocale<typeof NS> & Pick<SessionStandardProps, 'sessionId'> & Pick<GlobalStandardProps, 'useSessions'> & InjectFace<DeliverablesInjected>) {
  const [expanded, setExpanded] = useState(false)
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const states = usePresentedOpen(value => value)
  const host = usePresentedHost(value => value)
  const collapsible = matched.presented.length > COLLAPSED_PRESENTED_COUNT
  const presented = collapsible && !expanded
    ? matched.presented.slice(0, COLLAPSED_PRESENTED_COUNT)
    : matched.presented
  useEffect(() => {
    if (matched.presented.length > 0 && host === null) void reloadPresentedHost()
  }, [matched.presented.length, host, reloadPresentedHost])
  return <>
    {matched.produced.length > 0 && <ProducedFiles matched={matched.produced} openFile={openFile} t={t} />}
    {matched.presented.length > 0 && <div
      className={css.root}
      data-after-produced-files={matched.produced.length > 0 || undefined}
    >
      {host === 'error' && <div className={css.hostStatus}>
        <span>{t('presented.hostError')}</span>
        <Button size="sm" onClick={() => { void reloadPresentedHost() }}>{t('presented.retry')}</Button>
      </div>}
      {host !== null && host !== 'error' && !host.available && <span className={css.hostStatus}>{t('presented.unavailable')}</span>}
      <div className={css.presented} data-presented-files-row data-single={matched.presented.length === 1 ? true : undefined}>
        {presented.map(file => <PresentedFileCard key={`${file.seq}:${file.index}`} file={file} cwd={cwd}
          phase={states[presentedFileUrl(sessionId, file.seq, file.index)]}
          host={host === 'error' ? null : host} t={t}
          onPreview={() => { openFile(file.path) }}
          onAction={(action) => { void openPresented(sessionId, file.seq, file.index, action) }} />)}
      </div>
      {collapsible && <button type="button" className={css.toggle}
        aria-expanded={expanded}
        aria-label={t(expanded ? 'presented.collapseAria' : 'presented.expandAria', { count: matched.presented.length })}
        onClick={() => { setExpanded(value => !value) }}>
        <span>{t(expanded ? 'presented.collapse' : 'presented.all', { count: matched.presented.length })}</span>
        {expanded ? <IconChevronUpOutline14 /> : <IconChevronDownOutline14 />}
      </button>}
    </div>}
  </>
}
