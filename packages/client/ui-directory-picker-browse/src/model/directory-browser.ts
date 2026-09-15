/**
 * Framework-free directory-browser helpers: failure-text extraction, platform
 * separator inference, breadcrumb display, draft resolution, and row
 * visibility. The Miller-view component imports these; they touch no DOM and
 * no React.
 */
import type { DirectoryEntry, DirectoryListing } from '@deepseek-ai/dsh-api-remotes/client'

/** Failure text from the injected directory operation.
 * @param error - Error thrown by the directory operation.
 * @returns The RPC error message, an Error's message, or the error's string form. */
export function failureText(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'rpcError' in error) {
    const rpcError = error.rpcError
    if (rpcError !== null && typeof rpcError === 'object' && 'message' in rpcError
      && typeof rpcError.message === 'string') return rpcError.message
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * How long a scan may stay visually silent before the floating "Loading…"
 * pill appears. The stale view keeps rendering while a scan is in flight, so
 * a listing that settles inside this window swaps the panes with no
 * intermediate frame at all; only a genuinely slow host (a network mount, a
 * cold disk) surfaces the indicator.
 */
export const SLOW_SCAN_DELAY_MS = 300

/**
 * How long a navigation landing waits for its parent leg before committing
 * the target alone. Inside the window both legs land as ONE two-pane frame —
 * no single-pane flash between them; past it the target commits single-pane
 * at once (an Enter-submitted navigation is never held hostage by a stalled
 * parent) and the late parent leg upgrades the landing in place.
 */
export const PARENT_LEG_WAIT_MS = 200

/**
 * How long a typed draft rests before the panes follow it to a directory no
 * pane lists. The window absorbs the keystrokes that walk through
 * intermediate directory parts (every character of `/usr/lo` past the
 * separator would otherwise be its own scan) while staying short enough that
 * a pause reads as "the list moved with me".
 */
export const DRAFT_PREVIEW_DEBOUNCE_MS = 250

/**
 * Breadcrumb rows for display: inside the home subtree the chain starts at a
 * localized Home crumb; outside it the full ancestry shows, the root labeled
 * by its own path.
 * @param listing - Current directory listing with its crumbs and home path.
 * @param homeLabel - Localized label for the home crumb.
 * @returns Rows to render as breadcrumbs.
 */
export function displayCrumbs(listing: DirectoryListing, homeLabel: string): DirectoryEntry[] {
  const homeIndex = listing.crumbs.findIndex(crumb => crumb.path === listing.home)
  if (homeIndex === -1) return listing.crumbs
  const tail = listing.crumbs.slice(homeIndex + 1)
  return [{ name: homeLabel, path: listing.home, hidden: false }, ...tail]
}

/**
 * The listing's platform separator, inferred from the home path the host
 * stamped — never from typed text or entry paths, where a backslash is a
 * legal POSIX name character. Still a heuristic at the last step: a POSIX
 * home directory whose own name contains a backslash would misread.
 * TODO: replace with a host-stamped `separator` field on the wire
 * DirectoryListing so the platform fact travels verbatim (the trade-off is
 * recorded in the directory-picker capability seam Agent Note).
 * @param listing - Current directory listing whose home path carries the platform.
 * @returns The platform path separator.
 */
export function separatorOf(listing: DirectoryListing): '\\' | '/' {
  return listing.home.includes('\\') ? '\\' : '/'
}

/** The listed level as a directory part: its own path, separator-terminated (the root already is). */
function levelDirectory(listing: DirectoryListing): string {
  const sep = separatorOf(listing)
  return listing.path.endsWith(sep) ? listing.path : `${listing.path}${sep}`
}

/** The directory text a draft-following scan last sent, with the level path the host answered it with. */
export interface ScannedDirectory {
  /** The draft's directory part, verbatim as it went to the host. */
  readonly directory: string
  /** `path` of the listing that came back. */
  readonly landed: string
}

/**
 * The draft's directory part — everything through its last separator — or
 * null while no separator has been typed at all (nothing addresses a
 * directory yet). The platform comes from `listing`: on Windows a forward
 * slash separates too (the host's `resolve` accepts either), while on POSIX a
 * backslash is a legal name character and never separates.
 */
function draftDirectory(listing: DirectoryListing, draft: string): string | null {
  const cut = separatorOf(listing) === '\\'
    ? Math.max(draft.lastIndexOf('\\'), draft.lastIndexOf('/'))
    : draft.lastIndexOf('/')
  return cut === -1 ? null : draft.slice(0, cut + 1)
}

/**
 * How the draft reads against one level: the directory part it names, and —
 * when `listing` is the level that directory part addresses — the final
 * segment that prefix-filters it while the user types (case-insensitively,
 * downstream). A level answers a directory part when its own path is that
 * part, or when it is the level that very text just produced (`scanned`): the
 * host resolves what it is given, so `..` segments and Windows forward
 * slashes reach a level whose path spells the request differently.
 * @param listing - the level to read the draft against.
 * @param draft - the current path draft.
 * @param scanned - the last draft-following scan's directory and landing.
 * @returns the draft's directory part (null with no separator typed) and its
 * filtering tail (null when this level does not answer that directory).
 */
export function readDraft(
  listing: DirectoryListing,
  draft: string,
  scanned: ScannedDirectory | null,
): { directory: string | null; tail: string | null } {
  const directory = draftDirectory(listing, draft)
  if (directory === null) return { directory: null, tail: null }
  const answers = directory === levelDirectory(listing)
    || (scanned !== null && scanned.directory === directory && scanned.landed === listing.path)
  return { directory, tail: answers ? draft.slice(directory.length) : null }
}

/**
 * The rows one column renders. The selection is exempt from every filter: it
 * anchors the two-pane view (crumbs and the child pane point at it), so
 * neither the hidden filter after a dot-reveal pick nor a prefix miss may
 * orphan it. A prefix narrows the level only while some row it would actually
 * show matches — a tail nobody matches is a name being spelled, not a demand
 * for an empty pane, so the level shows whole and its hidden rows return to
 * obeying the toggle. Counting only displayable rows keeps that true because
 * every hidden name is dot-prefixed, and a matching prefix therefore reveals
 * it; otherwise the level could narrow to nothing.
 * @param entries - Rows of the listed level.
 * @param selectedPath - Path of the selected row, exempt from every filter.
 * @param showHidden - Whether hidden rows are visible.
 * @param filterPrefix - Typed prefix to narrow by, or null when unfiltered.
 * @returns Rows the column renders.
 */
export function visibleEntries(
  entries: readonly DirectoryEntry[],
  selectedPath: string | null,
  showHidden: boolean,
  filterPrefix: string | null,
): readonly DirectoryEntry[] {
  const needle = filterPrefix === null ? '' : filterPrefix.toLowerCase()
  // A dot-led prefix names hidden entries explicitly, so matching ones
  // surface even while the toggle keeps the rest hidden.
  const displayable = (entry: DirectoryEntry): boolean => showHidden || !entry.hidden || needle.startsWith('.')
  const matches = (entry: DirectoryEntry): boolean => displayable(entry) && entry.name.toLowerCase().startsWith(needle)
  const narrowing = needle !== '' && entries.some(matches)
  return entries.filter((entry) => {
    if (entry.path === selectedPath) return true
    if (narrowing) return matches(entry)
    return showHidden || !entry.hidden
  })
}
