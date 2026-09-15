/**
 * Direct unit coverage for the renderer-agnostic outlet resolution plan: cell
 * selection, dry cells, chain election and list row ordering without React.
 */
import { describe, expect, it, vi } from 'vitest'
import type { SlotEntryDef, SlotRendererHost, SlotSpec, StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { resolveOutletPlan } from '../src/model/outlet-plan.ts'

/** Build a ledger entry with only the fields the plan reads. */
function entry(options: { key?: string; id?: string; order?: number }, extra: object = {}): StoredEntry {
  return { options, ...extra } as unknown as StoredEntry
}

/** Build a host face backed by fixed winner and raw entry lists. */
function host(entries: StoredEntry[], winners: StoredEntry[]): SlotRendererHost {
  return {
    entriesOf: () => entries,
    entriesOfSlot: () => winners,
  } as unknown as SlotRendererHost
}

/** Cast a partial spec to the declared-spec parameter type. */
function spec(kind: string): SlotSpec<SlotEntryDef> {
  return { kind } as unknown as SlotSpec<SlotEntryDef>
}

describe('resolveOutletPlan', () => {
  it('selects the single winner', () => {
    const winner = entry({})
    expect(resolveOutletPlan(host([winner], [winner]), spec('single'), 'k', {}, undefined))
      .toEqual({ kind: 'single', entry: winner })
  })

  it('marks a dry single cell and empties an unregistered one', () => {
    const dead = entry({})
    expect(resolveOutletPlan(host([dead], []), spec('single'), 'k', {}, undefined))
      .toEqual({ kind: 'dead-cell' })
    expect(resolveOutletPlan(host([], []), spec('single'), 'k', {}, undefined))
      .toEqual({ kind: 'empty' })
  })

  it('routes keyed slots by entry key', () => {
    const winner = entry({ key: 'a' })
    expect(resolveOutletPlan(host([winner], [winner]), spec('keyed'), 'k', {}, { entryKey: 'a' }))
      .toEqual({ kind: 'keyed', entry: winner })
    const dead = entry({ key: 'a' })
    expect(resolveOutletPlan(host([dead], []), spec('keyed'), 'k', {}, { entryKey: 'a' }))
      .toEqual({ kind: 'dead-cell' })
    expect(resolveOutletPlan(host([], []), spec('keyed'), 'k', {}, { entryKey: 'a' }))
      .toEqual({ kind: 'empty' })
  })

  it('elects the first chain entry accepting the owner props', () => {
    const declined = entry({}, { select: () => null })
    const elected = entry({}, { select: (owner: { id: number }) => owner.id })
    const plan = resolveOutletPlan(host([declined, elected], []), spec('chain'), 'k', { id: 7 }, undefined)
    expect(plan).toEqual({ kind: 'chain', elected: { entry: elected, matched: 7 } })
  })

  it('degrades a throwing chain selector to a decline', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const breaker = entry({}, { select: () => { throw new Error('boom') } })
    const plan = resolveOutletPlan(host([breaker], []), spec('chain'), 'k', {}, undefined)
    expect(plan).toEqual({ kind: 'chain', elected: null })
    expect(spy).toHaveBeenCalledOnce()
    spy.mockRestore()
  })

  it('orders list rows, anchors dry cells, and applies the only filter', () => {
    const first = entry({ id: 'a', order: 2 })
    const second = entry({ id: 'b' })
    const dry = entry({ id: 'c' })
    const plan = resolveOutletPlan(host([first, second, dry], [first, second]), spec('list'), 'k', {}, undefined)
    expect(plan).toEqual({
      kind: 'list',
      rows: [
        { entry: second, id: 'b' },
        { entry: undefined, id: 'c' },
        { entry: first, id: 'a' },
      ],
    })
    expect(resolveOutletPlan(host([first], [first]), spec('list'), 'k', {}, { only: 'a' }))
      .toEqual({ kind: 'list', rows: [{ entry: first, id: 'a' }] })
    expect(resolveOutletPlan(host([], []), spec('list'), 'k', {}, undefined))
      .toEqual({ kind: 'list', rows: [] })
  })
})
