/**
 * Minimal analog of `ui-slots`: a named component registry plus a hook that
 * re-renders when a contribution is registered. This is enough to prove that a
 * runtime-loaded bundle can render a component into a slot.
 */

import { useEffect, useState, type ComponentType } from 'react'

/** Component contract a slot contribution must satisfy. */
export type SlotComponent = ComponentType<Record<string, unknown>>

const contributions = new Map<string, SlotComponent>()
const listeners = new Set<() => void>()

/** Register one component under a slot name. */
export function registerSlot(name: string, component: SlotComponent): void {
  contributions.set(name, component)
  for (const listener of listeners) listener()
}

/** Read the current contribution for a slot name. */
export function getSlot(name: string): SlotComponent | undefined {
  return contributions.get(name)
}

/** Subscribe a component to one slot's current contribution. */
export function useSlot(name: string): SlotComponent | undefined {
  const [component, setComponent] = useState<SlotComponent | undefined>(() => getSlot(name))
  useEffect(() => {
    const listener = (): void => { setComponent(() => getSlot(name)) }
    listeners.add(listener)
    listener()
    return () => { listeners.delete(listener) }
  }, [name])
  return component
}
