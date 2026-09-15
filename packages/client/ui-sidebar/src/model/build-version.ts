/** Format complete-build metadata for the local brand badge. */

/**
 * Format the brand badge text from the build-time environment.
 * @returns the version with optional commit and dirty suffixes, or undefined when no version was baked in.
 */
export function localBuildVersion(): string | undefined {
  const version = process.env.DSH_CLIENT_VERSION
  if (version === undefined) return undefined
  const commit = process.env.DSH_CLIENT_COMMIT_HASH
  return version
    + (commit === undefined ? '' : `-${commit}`)
    + (process.env.DSH_CLIENT_GIT_DIRTY === 'true' ? '-dirty' : '')
}
