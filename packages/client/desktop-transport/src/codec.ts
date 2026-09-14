/**
 * Framed byte codec shared by the desktop host process and its clients. Request
 * and response pipes use one 13-byte header (magic, type, stream id, payload
 * length) followed by the raw payload; frames are decoded incrementally so a
 * carrier may split or join them arbitrarily.
 * @module @deepseek-ai/dsh-client-desktop-transport/codec
 */

import {
  DESKTOP_PIPE_CHUNK_BYTES,
  type DesktopHostRequestFrame,
  type DesktopHostRequestStart,
  type DesktopHostResponseFrame,
} from './protocol.ts'

const FRAME_MAGIC = 0x44534833
const FRAME_HEADER_BYTES = 13
const MAX_CONTROL_PAYLOAD_BYTES = 1024 * 1024

const FRAME_START = 1
const FRAME_DATA = 2
const FRAME_END = 3
const FRAME_CANCEL = 4
const FRAME_ERROR = 4

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isHeaders(value: unknown): value is readonly [string, string][] {
  return Array.isArray(value) && value.every(header => Array.isArray(header) && header.length === 2
    && typeof header[0] === 'string' && typeof header[1] === 'string')
}

function assertStreamId(streamId: number): void {
  if (!Number.isInteger(streamId) || streamId < 1 || streamId > 0xffff_ffff) {
    throw new Error(`dsh desktop: invalid pipe stream id ${String(streamId)}`)
  }
}

/** Read a big-endian view over the whole slice without copying it. */
function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

/** Concatenate two byte runs into one fresh buffer. */
function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const joined = new Uint8Array(left.byteLength + right.byteLength)
  joined.set(left, 0)
  joined.set(right, left.byteLength)
  return joined
}

function encodeFrame(type: number, streamId: number, payload: Uint8Array): Uint8Array {
  assertStreamId(streamId)
  const limit = type === FRAME_DATA ? DESKTOP_PIPE_CHUNK_BYTES : MAX_CONTROL_PAYLOAD_BYTES
  if (payload.byteLength > limit) {
    throw new Error(`dsh desktop: pipe frame exceeds the ${String(limit)}-byte limit`)
  }
  const frame = new Uint8Array(FRAME_HEADER_BYTES + payload.byteLength)
  const view = viewOf(frame)
  view.setUint32(0, FRAME_MAGIC)
  view.setUint8(4, type)
  view.setUint32(5, streamId)
  view.setUint32(9, payload.byteLength)
  frame.set(payload, FRAME_HEADER_BYTES)
  return frame
}

function encodeJsonFrame(type: number, streamId: number, value: unknown): Uint8Array {
  return encodeFrame(type, streamId, new TextEncoder().encode(JSON.stringify(value)))
}

function decodeJson(payload: Uint8Array, subject: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as unknown
  } catch (error) {
    throw new Error(`dsh desktop: ${subject} payload is not JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Encode the metadata opening one request stream.
 * @param streamId - request pipe stream id in 1..2^32-1.
 * @param request - request metadata carried by the start payload.
 * @returns the encoded start frame.
 */
export function encodeDesktopRequestStart(streamId: number, request: DesktopHostRequestStart): Uint8Array {
  return encodeJsonFrame(FRAME_START, streamId, request)
}

/**
 * Encode one bounded raw request-body chunk.
 * @param streamId - request pipe stream id in 1..2^32-1.
 * @param data - raw body bytes, at most {@link DESKTOP_PIPE_CHUNK_BYTES}.
 * @returns the encoded data frame.
 */
export function encodeDesktopRequestData(streamId: number, data: Uint8Array): Uint8Array {
  return encodeFrame(FRAME_DATA, streamId, data)
}

/**
 * Encode normal request-body completion.
 * @param streamId - request pipe stream id in 1..2^32-1.
 * @returns the encoded end frame.
 */
export function encodeDesktopRequestEnd(streamId: number): Uint8Array {
  return encodeFrame(FRAME_END, streamId, new Uint8Array(0))
}

/**
 * Encode cancellation of one request and its response.
 * @param streamId - request pipe stream id in 1..2^32-1.
 * @returns the encoded cancel frame.
 */
export function encodeDesktopRequestCancel(streamId: number): Uint8Array {
  return encodeFrame(FRAME_CANCEL, streamId, new Uint8Array(0))
}

/**
 * Encode response metadata before any body frames.
 * @param streamId - response pipe stream id in 1..2^32-1.
 * @param response - response status, headers, and whether a body follows.
 * @returns the encoded start frame.
 */
export function encodeDesktopResponseStart(
  streamId: number,
  response: {
    readonly status: number
    readonly headers: readonly [string, string][]
    readonly hasBody: boolean
  },
): Uint8Array {
  return encodeJsonFrame(FRAME_START, streamId, response)
}

/**
 * Encode one bounded raw response-body chunk.
 * @param streamId - response pipe stream id in 1..2^32-1.
 * @param data - raw body bytes, at most {@link DESKTOP_PIPE_CHUNK_BYTES}.
 * @returns the encoded data frame.
 */
export function encodeDesktopResponseData(streamId: number, data: Uint8Array): Uint8Array {
  return encodeFrame(FRAME_DATA, streamId, data)
}

/**
 * Encode normal response completion.
 * @param streamId - response pipe stream id in 1..2^32-1.
 * @returns the encoded end frame.
 */
export function encodeDesktopResponseEnd(streamId: number): Uint8Array {
  return encodeFrame(FRAME_END, streamId, new Uint8Array(0))
}

/**
 * Encode one response failure without exposing an Error object across processes.
 * @param streamId - response pipe stream id in 1..2^32-1.
 * @param message - failure text carried by the error payload.
 * @returns the encoded error frame.
 */
export function encodeDesktopResponseError(streamId: number, message: string): Uint8Array {
  return encodeJsonFrame(FRAME_ERROR, streamId, { message })
}

/** One validated frame header and its raw payload. */
interface RawFrame {
  readonly type: number
  readonly streamId: number
  readonly payload: Uint8Array
}

/** Incremental header reader over one byte pipe direction. */
class FrameDecoder<T> {
  private buffer: Uint8Array = new Uint8Array(0)

  /**
   * @param label - pipe direction used in framing diagnostics.
   * @param decode - typed mapping for one validated frame.
   */
  constructor(
    private readonly label: string,
    private readonly decode: (frame: RawFrame) => T,
  ) {}

  /**
   * Append bytes and return every complete mapped frame.
   * @param chunk - next bytes read from the pipe.
   * @returns complete frames in pipe order.
   */
  push(chunk: Uint8Array): T[] {
    this.buffer = this.buffer.byteLength === 0 ? chunk : concatBytes(this.buffer, chunk)
    const frames: T[] = []
    for (;;) {
      const frame = this.next()
      if (frame === undefined) return frames
      frames.push(this.decode(frame))
    }
  }

  /** Reject EOF that splits a frame. */
  finish(): void {
    if (this.buffer.byteLength !== 0) throw new Error(`dsh desktop: ${this.label} pipe ended inside a frame`)
  }

  private next(): RawFrame | undefined {
    if (this.buffer.byteLength < FRAME_HEADER_BYTES) return undefined
    const view = viewOf(this.buffer)
    if (view.getUint32(0) !== FRAME_MAGIC) throw new Error(`dsh desktop: invalid ${this.label} frame marker`)
    const type = view.getUint8(4)
    const streamId = view.getUint32(5)
    const payloadLength = view.getUint32(9)
    assertStreamId(streamId)
    const limit = type === FRAME_DATA ? DESKTOP_PIPE_CHUNK_BYTES : MAX_CONTROL_PAYLOAD_BYTES
    if (payloadLength > limit) {
      throw new Error(`dsh desktop: ${this.label} frame exceeds the ${String(limit)}-byte limit`)
    }
    const frameLength = FRAME_HEADER_BYTES + payloadLength
    if (this.buffer.byteLength < frameLength) return undefined
    const payload = this.buffer.subarray(FRAME_HEADER_BYTES, frameLength)
    this.buffer = this.buffer.subarray(frameLength)
    return { type, streamId, payload }
  }
}

function parseRequestStart(streamId: number, payload: Uint8Array): DesktopHostRequestFrame {
  const value = decodeJson(payload, 'request start')
  if (!isRecord(value) || typeof value.url !== 'string' || typeof value.method !== 'string'
    || !isHeaders(value.headers) || typeof value.hasBody !== 'boolean') {
    throw new Error('dsh desktop: invalid request start payload')
  }
  return {
    type: 'start',
    streamId,
    url: value.url,
    method: value.method,
    headers: value.headers,
    hasBody: value.hasBody,
  }
}

function decodeRequestFrame(frame: RawFrame): DesktopHostRequestFrame {
  switch (frame.type) {
    case FRAME_START:
      return parseRequestStart(frame.streamId, frame.payload)
    case FRAME_DATA:
      return { type: 'data', streamId: frame.streamId, data: frame.payload }
    case FRAME_END:
      if (frame.payload.byteLength !== 0) throw new Error('dsh desktop: request end frame carried a payload')
      return { type: 'end', streamId: frame.streamId }
    case FRAME_CANCEL:
      if (frame.payload.byteLength !== 0) throw new Error('dsh desktop: request cancel frame carried a payload')
      return { type: 'cancel', streamId: frame.streamId }
    default:
      throw new Error(`dsh desktop: unknown request frame type ${String(frame.type)}`)
  }
}

function parseResponseStart(streamId: number, payload: Uint8Array): DesktopHostResponseFrame {
  const value = decodeJson(payload, 'response start')
  if (!isRecord(value) || !Number.isInteger(value.status) || (value.status as number) < 100
    || (value.status as number) > 599 || !isHeaders(value.headers) || typeof value.hasBody !== 'boolean') {
    throw new Error('dsh desktop: invalid response start payload')
  }
  return {
    type: 'start',
    streamId,
    status: value.status as number,
    headers: value.headers,
    hasBody: value.hasBody,
  }
}

function parseResponseError(streamId: number, payload: Uint8Array): DesktopHostResponseFrame {
  const value = decodeJson(payload, 'response error')
  if (!isRecord(value) || typeof value.message !== 'string') {
    throw new Error('dsh desktop: invalid response error payload')
  }
  return { type: 'error', streamId, message: value.message }
}

function decodeResponseFrame(frame: RawFrame): DesktopHostResponseFrame {
  switch (frame.type) {
    case FRAME_START:
      return parseResponseStart(frame.streamId, frame.payload)
    case FRAME_DATA:
      return { type: 'data', streamId: frame.streamId, data: frame.payload }
    case FRAME_END:
      if (frame.payload.byteLength !== 0) throw new Error('dsh desktop: response end frame carried a payload')
      return { type: 'end', streamId: frame.streamId }
    case FRAME_ERROR:
      return parseResponseError(frame.streamId, frame.payload)
    default:
      throw new Error(`dsh desktop: unknown response frame type ${String(frame.type)}`)
  }
}

/** Incrementally decode validated request frames from a carrier byte run. */
export class DesktopHostRequestDecoder {
  private readonly frames = new FrameDecoder<DesktopHostRequestFrame>('request', decodeRequestFrame)

  /**
   * Append bytes and return every complete request frame.
   * @param chunk - next bytes read from the request pipe.
   * @returns complete frames in pipe order.
   */
  push(chunk: Uint8Array): DesktopHostRequestFrame[] {
    return this.frames.push(chunk)
  }

  /** Reject EOF that splits a frame. */
  finish(): void {
    this.frames.finish()
  }
}

/** Incrementally decode validated response frames from a carrier byte run. */
export class DesktopHostResponseDecoder {
  private readonly frames = new FrameDecoder<DesktopHostResponseFrame>('response', decodeResponseFrame)

  /**
   * Append bytes and return every complete response frame.
   * @param chunk - next bytes read from the response pipe.
   * @returns complete frames in pipe order.
   */
  push(chunk: Uint8Array): DesktopHostResponseFrame[] {
    return this.frames.push(chunk)
  }

  /** Reject EOF that splits a frame. */
  finish(): void {
    this.frames.finish()
  }
}
