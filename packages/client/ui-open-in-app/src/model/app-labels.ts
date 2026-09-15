/** Catalog-id to locale-key lookup and the nameable-app selector. */
import type { OpenInAppKey } from './locales.ts'

/**
 * Label keys per catalog id: the browser renders only ids it can name, so a
 * host catalog extension without a matching dictionary entry stays invisible
 * instead of showing a raw id.
 */
const APP_LABEL_KEY: Record<string, OpenInAppKey | undefined> = {
  finder: 'app.finder',
  explorer: 'app.explorer',
  filemanager: 'app.filemanager',
  cursor: 'app.cursor',
  vscode: 'app.vscode',
  vscodeinsiders: 'app.vscodeinsiders',
  windsurf: 'app.windsurf',
  zed: 'app.zed',
  sublimetext: 'app.sublimetext',
  xcode: 'app.xcode',
  androidstudio: 'app.androidstudio',
  intellij: 'app.intellij',
  pycharm: 'app.pycharm',
  webstorm: 'app.webstorm',
  phpstorm: 'app.phpstorm',
  goland: 'app.goland',
  rider: 'app.rider',
  rustrover: 'app.rustrover',
  fork: 'app.fork',
  sourcetree: 'app.sourcetree',
  github: 'app.github',
  tower: 'app.tower',
  gitkraken: 'app.gitkraken',
  smartgit: 'app.smartgit',
  sublimemerge: 'app.sublimemerge',
  ghostty: 'app.ghostty',
  warp: 'app.warp',
  iterm: 'app.iterm',
  kitty: 'app.kitty',
  terminal: 'app.terminal',
  windowsterminal: 'app.windowsterminal',
  gitbash: 'app.gitbash',
  gnometerminal: 'app.gnometerminal',
  konsole: 'app.konsole',
}

/** One catalog id the browser can name through the dictionary. */
export interface NameableApp {
  /** Host-probed application id. */
  id: string
  /** Dictionary key for the application's product name. */
  labelKey: OpenInAppKey
}

/**
 * Keep only host-probed ids that have a dictionary entry.
 * @param available - host availability list, or null before the read settles.
 * @returns nameable apps in host menu order.
 */
export function nameableApps(available: readonly string[] | null): NameableApp[] {
  return (available ?? [])
    .map(id => ({ id, labelKey: APP_LABEL_KEY[id] }))
    .filter((entry): entry is NameableApp => entry.labelKey !== undefined)
}
