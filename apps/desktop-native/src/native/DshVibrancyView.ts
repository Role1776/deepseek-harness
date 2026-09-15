/** Native NSVisualEffectView binding used by the spike sidebar. */

import { requireNativeComponent, type ViewProps } from 'react-native'

/** Props accepted by the `DshVibrancyView` native component. */
export interface DshVibrancyViewProps extends ViewProps {
  readonly materialName?: string
  readonly blendingName?: string
}

/** AppKit `NSVisualEffectView` with material and blending driven from JS. */
export const DshVibrancyView = requireNativeComponent<DshVibrancyViewProps>('DshVibrancyView')
