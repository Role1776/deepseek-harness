/**
 * Owner-local Phase 0 spike paths. A shipped native client would receive these
 * from its shell (app bundle resources and a resolved Node binary) instead of
 * hardcoding them; the spike runs from a checkout on this machine.
 */

export const REPO_ROOT = '/Users/fedor/deepseek-harness'

/** Node executable the native module launches. */
export const NODE_PATH = '/opt/homebrew/bin/node'

/** PATH handed to the launcher so `react-native-xcode`/host tooling can find Node. */
export const PATH_ENV = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'

/** Launcher that owns the host fd 3/4 + IPC spawn. */
export const LAUNCHER_PATH = `${REPO_ROOT}/apps/desktop-native/scripts/launcher.cjs`

/** Built desktop host entry. */
export const HOST_ENTRY = `${REPO_ROOT}/apps/desktop-host/lib/index.js`

/** Immutable dsh packages supplied by the shell (the desktop-host package dir). */
export const RUNTIME_DIR = `${REPO_ROOT}/apps/desktop-host`

/** Isolated profile + home the launcher prepares for this spike. */
export const PROJECT_DIR = `${REPO_ROOT}/apps/desktop-native/.spike/state`

/** File the point-3 plugin bundle is written to and loaded from at runtime. */
export const PLUGIN_BUNDLE_PATH = `${REPO_ROOT}/apps/desktop-native/.spike/plugins/sample-plugin.js`

/** PNG the app writes itself (macOS `screencapture` is blocked without TCC). */
export const SCREENSHOT_PATH = `${REPO_ROOT}/apps/desktop-native/.spike/screenshot.png`
