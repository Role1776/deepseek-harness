/**
 * Spawns the desktop host and exposes the shipped `DesktopTransport` over the
 * native-module byte carrier.
 */

import { DesktopTransport } from '@deepseek-ai/dsh-client-desktop-transport'
import { DshHostCarrier, trace, type HostReadyInfo } from './DshHost.ts'
import { createStreamingResponse } from './streamingResponse.ts'

/** One running host plus its transport. */
export interface HostSession {
  readonly transport: DesktopTransport
  readonly ready: HostReadyInfo
  readonly pid: number
  stop(): Promise<void>
}

/** Spawn the launcher and resolve once the host reports readiness. */
export async function startHostSession(): Promise<HostSession> {
  const carrier = new DshHostCarrier()
  const transport = new DesktopTransport(carrier, { createResponse: createStreamingResponse })
  const { pid } = await carrier.spawn()
  const ready = await carrier.ready()
  await trace(`host ready pid=${String(pid)} version=${String(ready.version)}`)
  return {
    transport,
    ready,
    pid,
    async stop() {
      transport.dispose()
      await carrier.stop()
    },
  }
}
