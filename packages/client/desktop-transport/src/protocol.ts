/**
 * Carrier-neutral protocol vocabulary for the desktop host wire v3: pipe
 * descriptor numbers, frame payload types, and the Node IPC lifecycle
 * messages shared by the host process and its clients.
 * @module @deepseek-ai/dsh-client-desktop-transport/protocol
 */

/** Protocol version implemented by the desktop host and this client. */
export const DESKTOP_HOST_PROTOCOL_VERSION = 3 as const

/** Child descriptor that carries request frames to the desktop host. */
export const DESKTOP_REQUEST_PIPE_FD = 3

/** Child descriptor that carries response frames from the desktop host. */
export const DESKTOP_RESPONSE_PIPE_FD = 4

/** Child descriptor reserved for Node's lifecycle IPC channel. */
export const DESKTOP_CONTROL_IPC_FD = 5

/** Maximum raw body bytes carried by one data frame. */
export const DESKTOP_PIPE_CHUNK_BYTES = 64 * 1024

/** Path of the Host's NDJSON remote-stream endpoint on the shared `/api` channel. */
export const DESKTOP_STREAM_PATH = '/.dsh/remote-stream'

/** Metadata that opens one request body on the request pipe. */
export interface DesktopHostRequestStart {
  readonly url: string
  readonly method: string
  readonly headers: readonly (readonly [string, string])[]
  readonly hasBody: boolean
}

/** Commands retained on Node IPC because they carry no Fetch payload bytes. */
export type DesktopHostCommand = {
  readonly type: 'shutdown'
}

/** Lifecycle events retained on Node IPC. */
export type DesktopHostEvent = {
  readonly type: 'ready'
  readonly protocolVersion: typeof DESKTOP_HOST_PROTOCOL_VERSION
  readonly dshVersion: string
} | {
  readonly type: 'fatal'
  readonly message: string
}

/** One decoded request-pipe frame. */
export type DesktopHostRequestFrame = {
  readonly type: 'start'
  readonly streamId: number
  readonly url: string
  readonly method: string
  readonly headers: readonly [string, string][]
  readonly hasBody: boolean
} | {
  readonly type: 'data'
  readonly streamId: number
  readonly data: Uint8Array
} | {
  readonly type: 'end' | 'cancel'
  readonly streamId: number
}

/** One decoded response-pipe frame. */
export type DesktopHostResponseFrame = {
  readonly type: 'start'
  readonly streamId: number
  readonly status: number
  readonly headers: readonly [string, string][]
  readonly hasBody: boolean
} | {
  readonly type: 'data'
  readonly streamId: number
  readonly data: Uint8Array
} | {
  readonly type: 'end'
  readonly streamId: number
} | {
  readonly type: 'error'
  readonly streamId: number
  readonly message: string
}
