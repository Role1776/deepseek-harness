/**
 * Renderer-agnostic outlet resolution. Given a slot's declared spec and its
 * ledger entries, this decides which registered entries render, in what order,
 * and where a cell has no survivor. A native renderer reuses this plan while it
 * renders the same SlotRenderer contract with its own components.
 */
import type {
  ChainRenderOpts, RenderOpts, SlotEntryDef, SlotRendererHost, SlotSpec, StoredEntry,
} from '@deepseek-ai/dsh-client-ui-slots'

/** One rendered list row: a cell's winning entry, or a dry cell with no survivor. */
export interface OutletRow {
  /** Winning entry for the cell, absent when every registration of the cell abdicated. */
  readonly entry: StoredEntry | undefined
  /** Declared id of the cell (list routing), absent when the entry declares none. */
  readonly id: string | undefined
}

/** A chain election: the first entry whose selector accepted the owner props. */
export interface ChainElection {
  /** Elected entry. */
  readonly entry: StoredEntry
  /** Value the elected selector matched; the view appends it to the owner props. */
  readonly matched: unknown
}

/** What an outlet renders for one slot key under the current ledger state. */
export type OutletPlan =
  | { readonly kind: 'empty' }
  | { readonly kind: 'dead-cell' }
  | { readonly kind: 'single'; readonly entry: StoredEntry }
  | { readonly kind: 'keyed'; readonly entry: StoredEntry }
  | { readonly kind: 'chain'; readonly elected: ChainElection | null }
  | { readonly kind: 'list'; readonly rows: readonly OutletRow[] }

/**
 * Resolve the ordered render plan for one outlet pass. Entries arrive
 * priority-sorted from the ledger; a list's row sequence is registration order
 * refined by explicit order, and `opts.only` filters to one cell.
 *
 * @param host - renderer host face exposing the ledger views.
 * @param spec - declared spec of `slotKey`.
 * @param slotKey - slot key being rendered.
 * @param ownerProps - owner props passed to chain selectors.
 * @param opts - outlet render options carrying `entryKey` and `only` routing.
 * @returns the plan; `empty` when the owner's fallback applies.
 */
export function resolveOutletPlan(
  host: SlotRendererHost,
  spec: SlotSpec<SlotEntryDef>,
  slotKey: string,
  ownerProps: object,
  opts: (RenderOpts & ChainRenderOpts) | undefined,
): OutletPlan {
  const entries = host.entriesOf(slotKey)
  if (spec.kind === 'single') {
    const entry = host.entriesOfSlot(slotKey)[0]
    if (entry === undefined) return entries.length > 0 ? { kind: 'dead-cell' } : { kind: 'empty' }
    return { kind: 'single', entry }
  }
  if (spec.kind === 'keyed') {
    const entry = host.entriesOfSlot(slotKey).find(candidate => candidate.options.key === opts?.entryKey)
    if (entry !== undefined) return { kind: 'keyed', entry }
    return entries.some(candidate => candidate.options.key === opts?.entryKey)
      ? { kind: 'dead-cell' }
      : { kind: 'empty' }
  }
  if (spec.kind === 'chain') {
    return { kind: 'chain', elected: electChain(host, slotKey, ownerProps) }
  }
  return { kind: 'list', rows: orderListRows(host, entries, slotKey, opts) }
}

/**
 * Run the chain routing pass: the first selector accepting the owner props
 * wins, and a throwing selector degrades to a decline so the chain and its
 * fallback stay intact.
 *
 * @param host - renderer host face exposing the ledger views.
 * @param slotKey - chain slot key being rendered.
 * @param ownerProps - owner props passed to each selector.
 * @returns the elected entry and matched value, or null when every entry declined.
 */
function electChain(host: SlotRendererHost, slotKey: string, ownerProps: object): ChainElection | null {
  for (const entry of host.entriesOf(slotKey)) {
    let matched: unknown
    try {
      // Chain entries always carry select (SlotCore register validation).
      matched = (entry.select as (owner: object) => unknown)(ownerProps)
    } catch (error) {
      // A throwing selector is a registrant contract breach (select MUST be
      // pure and total), but it runs before the entry's error boundary exists —
      // uncontained it would black out the whole owner region. It degrades to a
      // decline and is reported like a crashed entry.
      console.error(
        `chain selector crashed in '${slotKey}' (${entry.registrant ?? 'unknown registrant'}), treating as declined:`,
        error)
      continue
    }
    if (matched !== null) return { entry, matched }
  }
  return null
}

/**
 * Build a list's ordered rows: one row per winning cell head, then a dry row
 * for each remaining cell, ordered by declared order and filtered by `only`.
 *
 * @param host - renderer host face exposing the ledger views.
 * @param entries - every registered entry for the slot, in ledger order.
 * @param slotKey - list slot key being rendered.
 * @param opts - outlet render options carrying the `only` cell filter.
 * @returns the rows to render, in row order.
 */
function orderListRows(
  host: SlotRendererHost,
  entries: readonly StoredEntry[],
  slotKey: string,
  opts: (RenderOpts & ChainRenderOpts) | undefined,
): OutletRow[] {
  const rows: { entry: StoredEntry | undefined; id: string | undefined; order: number }[] =
    host.entriesOfSlot(slotKey).map(entry => ({
      entry,
      id: entry.options.id,
      order: entry.options.order ?? 0,
    }))
  const rowIds = new Set(rows.map(row => row.id))
  for (const entry of entries) {
    if (rowIds.has(entry.options.id)) continue
    rowIds.add(entry.options.id)
    // Dry cells anchor their row at the cell head's declared order.
    rows.push({ entry: undefined, id: entry.options.id, order: entry.options.order ?? 0 })
  }
  const ordered = [...rows].sort((left, right) => left.order - right.order)
  const filtered = opts?.only === undefined ? ordered : ordered.filter(item => item.id === opts.only)
  return filtered.map(row => ({ entry: row.entry, id: row.id }))
}
