/**
 * ModelDirectory and ModelCatalogDirectory failure, stale-response, lifecycle,
 * and option-projection branches. These were previously carried by the
 * coverage-exempt `src/client/directory.ts`; the model split gates them, so the
 * branches get direct unit coverage.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ModelCatalog, ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelSelectionProjection } from '@deepseek-ai/dsh-api-session-controller/types'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { ModelCatalogDirectory } from '../src/model/catalog.ts'
import { ModelDirectory, type ModelDirectoryState } from '../src/model/directory.ts'
import { optionsOf, selectionOf } from '../src/model/selection-options.ts'

const SELECTION: ModelSelection = { provider: 'p', model: 'm' }

const CATALOG: ModelCatalog = {
  default: SELECTION,
  routableProviders: ['p'],
  groups: [{ id: 'p', name: 'P', models: [{ id: 'm', name: 'M' }] }],
  failures: [],
}

type CatalogReply =
  | { ok: true; value: ModelCatalog }
  | { ok: false; error: { code: string; message: string } }

/** A directory over a controllable catalog remote and a fake selectModel. */
function bench(available = true) {
  const selectModel = vi.fn()
  const projected = createSnapshotStore<ModelSelectionProjection | undefined>({ lastUsed: null, next: null })
  let reply: CatalogReply = { ok: true, value: CATALOG }
  const modelCatalog = vi.fn(() => Promise.resolve(reply))
  const ctx = { remote: { session: { modelCatalog } } } as unknown as ClientContext
  const catalog = new ModelCatalogDirectory(ctx)
  const directory = new ModelDirectory(
    { selectModel },
    's1' as never,
    () => available,
    catalog,
    projected,
  )
  return { selectModel, catalog, directory, setReply: (next: CatalogReply) => { reply = next } }
}

const ok = (): CatalogReply => ({ ok: true, value: CATALOG })
const down = (): CatalogReply => ({ ok: false, error: { code: 'catalog-down', message: 'down' } })

describe('ModelDirectory failures and lifecycle', () => {
  it('surfaces a rejected selection on the store and throws', async () => {
    const b = bench()
    b.selectModel.mockResolvedValueOnce({ ok: false, error: { code: 'unavailable', message: 'busy' } })
    await expect(b.directory.select(SELECTION)).rejects.toThrow('unavailable: busy')
    expect(b.directory.store.getSnapshot()).toMatchObject({ status: 'error', error: 'unavailable: busy' })
  })

  it('drops a superseded successful selection response', async () => {
    const b = bench()
    let release!: (value: unknown) => void
    b.selectModel.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    b.selectModel.mockResolvedValueOnce({ ok: true, value: { selected: SELECTION } })
    const first = b.directory.select(SELECTION)
    await b.directory.select({ provider: 'p', model: 'm2' })
    release({ ok: true, value: { selected: SELECTION } })
    await expect(first).resolves.toBeUndefined()
  })

  it('drops a superseded failed selection response', async () => {
    const b = bench()
    let release!: (value: unknown) => void
    b.selectModel.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    b.selectModel.mockResolvedValueOnce({ ok: true, value: { selected: SELECTION } })
    const first = b.directory.select(SELECTION)
    await b.directory.select({ provider: 'p', model: 'm2' })
    release({ ok: false, error: { code: 'old', message: 'stale' } })
    await expect(first).rejects.toThrow('old: stale')
  })

  it('clears a selecting status on connection reset', async () => {
    const b = bench()
    let release!: (value: unknown) => void
    b.selectModel.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    const pending = b.directory.select(SELECTION)
    b.directory.resetConnected()
    expect(b.directory.store.getSnapshot().status).toBe('loading')
    release({ ok: true, value: { selected: SELECTION } })
    await pending
  })

  it('stays inert after dispose', async () => {
    const b = bench()
    b.directory.dispose()
    expect(() => { b.directory.resetConnected() }).not.toThrow()
    await b.directory.load()
  })

  it('publishes a catalog error before the first successful resolve', async () => {
    const b = bench()
    b.setReply(down())
    await expect(b.directory.load()).rejects.toThrow('catalog-down: down')
    expect(b.directory.store.getSnapshot()).toMatchObject({ status: 'error', error: 'catalog-down: down' })
  })

  it('reports a later catalog failure without dropping resolved inputs', async () => {
    const b = bench()
    await b.directory.load()
    expect(b.directory.store.getSnapshot().status).toBe('ready')
    b.setReply(down())
    b.catalog.refresh()
    await vi.waitFor(() => {
      expect(b.directory.store.getSnapshot()).toMatchObject({ status: 'error', error: 'catalog-down: down' })
    })
  })

  it('fails loud when model selection is unavailable', async () => {
    const b = bench(false)
    await expect(b.directory.load()).rejects.toThrow(/unavailable for addressed subagent/)
  })

  it('stays unresolved while the Session projects no selection', async () => {
    const selectModel = vi.fn()
    const modelCatalog = vi.fn(() => Promise.resolve(ok()))
    const ctx = { remote: { session: { modelCatalog } } } as unknown as ClientContext
    const directory = new ModelDirectory(
      { selectModel },
      's1' as never,
      () => true,
      new ModelCatalogDirectory(ctx),
      createSnapshotStore<ModelSelectionProjection | undefined>(undefined),
    )
    await directory.load()
    expect(directory.store.getSnapshot().status).toBe('loading')
  })
})

describe('model selection option projection', () => {
  const t = ((key: string, params?: Record<string, unknown>) => params === undefined
    ? key
    : `${key}:${JSON.stringify(params)}`) as unknown as TranslateNS<'model'>

  const state: ModelDirectoryState = {
    current: { provider: 'p', model: 'm', reasoningEffort: 'high' },
    routable: true,
    groups: [{
      id: 'p',
      name: 'P',
      models: [
        { id: 'm', name: 'M' },
        { id: 'other', name: 'Other', reasoning: { efforts: [], defaultEffort: 'low' } },
      ],
    }],
    failures: [{ id: 'f', name: 'F', message: 'boom' }],
    status: 'ready',
    error: null,
  }

  it('lists selectable rows, group names without descriptions, and failure rows', () => {
    const rows = optionsOf(state, t)
    expect(rows.map(row => row.id)).toEqual(['p/m', 'p/other', 'failure/f'])
    expect(rows[0]).toMatchObject({ detail: 'P', active: true })
    expect(rows[2]?.detail).toContain('option.loadError')
  })

  it('resolves a picked row through the current route or the model default, and rejects unknown ids', () => {
    expect(selectionOf(state, 'p/m')).toEqual({ provider: 'p', model: 'm', reasoningEffort: 'high' })
    expect(selectionOf(state, 'p/other')).toEqual({ provider: 'p', model: 'other', reasoningEffort: 'low' })
    expect(selectionOf({ ...state, current: { provider: 'p', model: 'other' } }, 'p/other'))
      .toEqual({ provider: 'p', model: 'other', reasoningEffort: 'low' })
    expect(selectionOf({ ...state, current: { provider: 'q', model: 'q' } }, 'p/m'))
      .toEqual({ provider: 'p', model: 'm' })
    expect(selectionOf(state, 'failure/f')).toBeUndefined()
  })
})
