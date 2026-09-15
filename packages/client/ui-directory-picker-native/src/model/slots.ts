/** Injected face of the native directory-flow occupant. */

/** Injected face: the wire call the flow drives (bound in apply's closure). */
export interface NativeFlowInjected {
  /** Ask the local Host to open its native single-directory chooser. */
  pick: () => Promise<string | null>
}
