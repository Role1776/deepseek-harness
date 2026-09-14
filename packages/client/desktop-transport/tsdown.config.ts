import { clientBundle } from '../tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-client-desktop-transport',
  ['lib/types/index.js'],
  { hostPhase: true },
)
