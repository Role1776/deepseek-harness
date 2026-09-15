/**
 * JS face of the `DshHost` native module plus the byte-carrier that adapts its
 * base64 events to the shipped `DesktopTransportCarrier` contract.
 */

import { NativeEventEmitter, NativeModules } from 'react-native'
import type { DesktopTransportCarrier } from '@deepseek-ai/dsh-client-desktop-transport'
import { base64ToBytes, bytesToBase64 } from './base64.ts'
import {
  HOST_ENTRY,
  LAUNCHER_PATH,
  NODE_PATH,
  PATH_ENV,
  PROJECT_DIR,
  RUNTIME_DIR,
} from '../spike/config.ts'

interface DshHostNativeModule {
  startHost(config: {
    nodePath: string
    launcherPath: string
    hostEntry: string
    runtimeDir: string
    projectDir: string
    pathEnv: string
  }): Promise<{ pid: number }>
  writeToHost(base64: string): void
  stopHost(): Promise<boolean>
  readTextFile(path: string): Promise<string>
  writeTextFile(path: string, contents: string): Promise<boolean>
  trace(message: string): Promise<boolean>
  captureWindow(path: string): Promise<boolean>
}

const nativeModule = NativeModules.DshHost as DshHostNativeModule
const emitter = new NativeEventEmitter(NativeModules.DshHost)

/** Host readiness reported over the native module's lifecycle event. */
export interface HostReadyInfo {
  readonly version?: string
  readonly protocolVersion?: number
}

/** Byte carrier over the spawned host's request/response pipes. */
export class DshHostCarrier implements DesktopTransportCarrier {
  private readonly bytesListeners = new Set<(bytes: Uint8Array) => void>()
  private readonly closeListeners = new Set<(error?: Error) => void>()
  private readonly subscriptions: { remove: () => void }[]
  private readonly readyPromise: Promise<HostReadyInfo>
  private settleReady!: (info: HostReadyInfo) => void
  private settled = false

  constructor() {
    this.readyPromise = new Promise<HostReadyInfo>((resolve) => {
      this.settleReady = resolve
    })
    this.subscriptions = [
      emitter.addListener('dshHostBytes', (event: { data: string }) => {
        const bytes = base64ToBytes(event.data)
        for (const listener of this.bytesListeners) listener(bytes)
      }),
      emitter.addListener('dshHostReady', (info: HostReadyInfo) => {
        console.log('[dsh-host] ready', JSON.stringify(info))
        if (!this.settled) {
          this.settled = true
          this.settleReady(info)
        }
      }),
      emitter.addListener('dshHostFatal', (event: { message: string }) => {
        console.log('[dsh-host] fatal', event.message)
        this.close(new Error(event.message))
      }),
      emitter.addListener('dshHostExit', (event: { status: number }) => {
        console.log('[dsh-host] exit', event.status)
        this.close(new Error(`dsh host exited with status ${String(event.status)}`))
      }),
      emitter.addListener('dshHostLog', (event: { line: string }) => {
        console.log('[dsh-host]', event.line)
      }),
    ]
  }

  /** Resolve once the native module reports host readiness. */
  ready(): Promise<HostReadyInfo> {
    return this.readyPromise
  }

  /** Spawn the launcher through the native module. */
  async spawn(): Promise<{ pid: number }> {
    return await nativeModule.startHost({
      nodePath: NODE_PATH,
      launcherPath: LAUNCHER_PATH,
      hostEntry: HOST_ENTRY,
      runtimeDir: RUNTIME_DIR,
      projectDir: PROJECT_DIR,
      pathEnv: PATH_ENV,
    })
  }

  /** Terminate the launcher and release the native subscriptions. */
  async stop(): Promise<void> {
    for (const subscription of this.subscriptions) subscription.remove()
    this.subscriptions.length = 0
    await nativeModule.stopHost()
  }

  write(frame: Uint8Array): Promise<void> {
    nativeModule.writeToHost(bytesToBase64(frame))
    return Promise.resolve()
  }

  onBytes(listener: (bytes: Uint8Array) => void): () => void {
    this.bytesListeners.add(listener)
    return () => { this.bytesListeners.delete(listener) }
  }

  onClose(listener: (error?: Error) => void): () => void {
    this.closeListeners.add(listener)
    return () => { this.closeListeners.delete(listener) }
  }

  private close(error: Error): void {
    for (const listener of this.closeListeners) listener(error)
    this.closeListeners.clear()
  }
}

/** Read a UTF-8 text file through the native module. */
export async function readTextFile(path: string): Promise<string> {
  return await nativeModule.readTextFile(path)
}

/** Write a UTF-8 text file through the native module. */
export async function writeTextFile(path: string, contents: string): Promise<void> {
  await nativeModule.writeTextFile(path, contents)
}

/** Emit one JS progress marker to the native stderr log. */
export async function trace(message: string): Promise<void> {
  await nativeModule.trace(message)
}

/** Write a PNG of the app window through the native module. */
export async function captureWindow(path: string): Promise<void> {
  await nativeModule.captureWindow(path)
}
