/**
 * Framework-free presentation logic for the read-only plugin inventory:
 * snapshot-derived selectors, formatters, status constants, and the
 * registration-side types. Views import these; none touch the DOM.
 */
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import type { StateDotState, TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginInventoryLocaleKey } from './locales.ts'

/** One inventory entry from the Host snapshot. */
export type PluginInventoryEntry = PluginInventorySnapshot['entries'][number]
/** One agent-preset group in the inventory snapshot. */
export type AgentPresetGroup = NonNullable<PluginInventorySnapshot['agentPresets']>[number]
/** One module row inside an agent-preset group. */
export type AgentPresetRow = AgentPresetGroup['rows'][number]
/** Root-fiber phase reported for one inventory entry or preset row. */
export type PluginFiberPhase = PluginInventoryEntry['fiberPhase']

/** Registration-side Remote face used by the section. */
export interface PluginInventorySettingsTabInjected {
  /** Read a current Host inventory snapshot. */
  list: () => Promise<PluginInventorySnapshot>
  /**
   * Display name for one preset: shipped presets resolve through the
   * agent-preset dictionaries, user-authored ones keep their own metadata.
   */
  presetName: (preset: AgentPresetGroup) => string
}

/** Full component props assembled by the Settings slot renderer. */
export type PluginInventorySettingsTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.pluginInventory'>
  & InjectFace<PluginInventorySettingsTabInjected>

/** Bound translation function for this section's namespace. */
export type Translate = PluginInventorySettingsTabProps['t']

/** Asynchronous load state behind the section body. */
export type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: PluginInventorySnapshot }

const PHASE_KEYS = {
  pending: 'pending',
  loading: 'loadingPhase',
  active: 'active',
  failed: 'failed',
  unloading: 'unloading',
} satisfies Record<Exclude<PluginFiberPhase, null>, PluginInventoryLocaleKey>

/**
 * Localized accessible label for one root Fiber phase.
 * @param phase - live phase, or null when no root fiber runs.
 * @param t - bound translation function.
 * @returns the localized phase name.
 */
export function phaseLabel(phase: PluginFiberPhase, t: Translate): string {
  return phase === null ? t('unobserved') : t(PHASE_KEYS[phase])
}

/**
 * Compact a module specifier without guessing whether its Loader id was generated.
 * @param moduleName - raw module specifier.
 * @returns the shortened module name.
 */
export function moduleShortName(moduleName: string): string {
  const unscoped = moduleName.startsWith('@') ? moduleName.slice(moduleName.indexOf('/') + 1) : moduleName
  return unscoped
    .replace(/^cordis:/, '')
    .replace(/^cordis-plugin-/, '')
    .replace(/^dsh-(?:host-|client-)?/, '')
}

/**
 * Display an entry identity without the composition-only `include:` marker.
 * @param entryId - raw Loader entry identity.
 * @returns the identity as displayed.
 */
export function entrySubtitle(entryId: string): string {
  return entryId.replace(/^include:/, '')
}

/**
 * Whether one row's module name or entry id matches the catalog query.
 * @param moduleName - row module specifier.
 * @param entryId - row entry identity, absent for preset-only rows.
 * @param normalizedQuery - trimmed, lower-cased query.
 * @returns whether the row matches.
 */
export function matches(moduleName: string, entryId: string | null, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  return [moduleName, ...entryId === null ? [] : [entryId]]
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

/**
 * The roster row shown when the preset switcher has no explicit choice.
 * @param presets - every preset group in the snapshot.
 * @returns the default preset, else the first, else undefined.
 */
export function fallbackPreset(presets: readonly AgentPresetGroup[]): AgentPresetGroup | undefined {
  return presets.find(preset => preset.isDefault) ?? presets[0]
}

/**
 * The switcher's display label for one preset.
 * @param preset - preset group to label.
 * @param t - bound translation function.
 * @param presetName - resolver for the preset's display name.
 * @returns the localized label.
 */
export function presetLabel(
  preset: AgentPresetGroup,
  t: Translate,
  presetName: (preset: AgentPresetGroup) => string,
): string {
  const name = presetName(preset)
  if (preset.broken !== undefined) return t('presetOptionBroken', { name })
  if (preset.isDefault) return t('presetOptionDefault', { name })
  return name
}

/**
 * Group the presets that actually enable each module.
 * @param presets - every preset group in the snapshot.
 * @returns enabled module name to the non-empty list of presets providing it.
 */
export function groupEnabledIn(
  presets: readonly AgentPresetGroup[],
): Map<string, [AgentPresetGroup, ...AgentPresetGroup[]]> {
  const found = new Map<string, [AgentPresetGroup, ...AgentPresetGroup[]]>()
  for (const preset of presets) {
    for (const row of preset.rows) {
      if (row.enabled !== true) continue
      const groups = found.get(row.moduleName)
      if (groups === undefined) found.set(row.moduleName, [preset])
      else if (!groups.includes(preset)) groups.push(preset)
    }
  }
  return found
}

/*
 * `pending` is the only phase with no work under way. `loading` and
 * `unloading` are both live transitions the Host is running — an async
 * disposer can hold `unloading` for a while — so both animate.
 */
export const PHASE_DOT_STATES = {
  pending: 'idle',
  loading: 'ongoing',
  active: 'done',
  failed: 'error',
  unloading: 'ongoing',
} as const satisfies Record<NonNullable<PluginFiberPhase>, StateDotState>

/** Enablement states one inventory row can report. */
export type EnablementKind = 'enabled' | 'disabled' | 'conditional' | 'preset' | 'failed'

export const TAG_TONES = {
  enabled: 'success',
  disabled: 'neutral',
  conditional: 'warning',
  preset: 'info',
  failed: 'danger',
} as const satisfies Record<EnablementKind, TagTone>
