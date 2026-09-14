/**
 * Carrier-agnostic wire v3 client. The caller supplies a byte carrier (a
 * child-process pipe pair, a socket, or an in-memory test double); this
 * transport owns stream ids, request frame upload, response body demultiplexing,
 * and NDJSON remote-stream decoding.
 * @module @deepseek-ai/dsh-client-desktop-transport/transport
 */

import {
  DESKTOP_PIPE_CHUNK_BYTES,
  DESKTOP_STREAM_PATH,
} from './protocol.ts'
import {
  DesktopHostResponseDecoder,
  encodeDesktopRequestCancel,
  encodeDesktopRequestData,
  encodeDesktopRequestEnd,
  encodeDesktopRequestStart,
} from './codec.ts'

/** Byte carrier the transport writes request frames to and reads response frames from. */
export interface DesktopTransportCarrier {
  /** Write one encoded frame; resolves after the carrier accepts it. */
  write(frame: Uint8Array): Promise<void>
  /**
   * Subscribe to response bytes.
   * @param listener - receives each byte run the carrier emits.
   * @returns an unsubscribe function.
   */
  onBytes(listener: (bytes: Uint8Array) => void): () => void
  /**
   * Subscribe to terminal carrier completion or failure.
   * @param listener - receives the failure, or undefined for a clean end.
   * @returns an unsubscribe function.
   */
  onClose(listener: (error?: Error) => void): () => void
}

/** One request accepted by {@link DesktopTransport.request}. */
export interface DesktopTransportRequest {
  /** Absolute request URL; the host routes on its pathname. */
  readonly url: string
  /** HTTP method; defaults to `GET`. */
  readonly method?: string
  /** Raw request headers. */
  readonly headers?: readonly (readonly [string, string])[]
  /** Buffered request body. */
  readonly body?: Uint8Array | string | null
  /** Cancellation for the request and its response stream. */
  readonly signal?: AbortSignal
}

interface PendingResponse {
  readonly resolve: (response: Response) => void
  readonly reject: (error: Error) => void
  responseStarted: boolean
  controller?: ReadableStreamDefaultController<Uint8Array>
  removeAbort?: () => void
}

function toBodyBytes(body: DesktopTransportRequest['body']): Uint8Array | null {
  if (body === undefined || body === null) return null
  return typeof body === 'string' ? new TextEncoder().encode(body) : body
}

function errorOf(reason: unknown, fallback: string): Error {
  return reason instanceof Error ? reason : new Error(fallback)
}

/** One wire v3 client over a caller-supplied byte carrier. */
export class DesktopTransport {
  private readonly decoder = new DesktopHostResponseDecoder()
  private readonly pending = new Map<number, PendingResponse>()
  private nextStreamId = 1
  private closed: Error | undefined

  /**
   * @param carrier - byte carrier for request writes and response reads.
   */
  constructor(private readonly carrier: DesktopTransportCarrier) {
    carrier.onBytes((bytes) => { this.acceptBytes(bytes) })
    carrier.onClose((error) => { this.fail(error ?? new Error('dsh desktop: transport closed')) })
  }

  /**
   * Send one request and resolve its response as soon as response metadata
   * arrives; the body streams through the returned `Response`.
   * @param request - request URL, method, headers, buffered body, and signal.
   * @returns the streamed response.
   */
  async request(request: DesktopTransportRequest): Promise<Response> {
    if (this.closed !== undefined) throw this.closed
    const method = (request.method ?? 'GET').toUpperCase()
    const body = toBodyBytes(request.body)
    const hasBody = body !== null && method !== 'GET' && method !== 'HEAD'
    if (this.nextStreamId > 0xffff_ffff) throw new Error('dsh desktop: transport exhausted its stream ids')
    const streamId = this.nextStreamId++
    return await new Promise<Response>((resolve, reject) => {
      const pending: PendingResponse = { resolve, reject, responseStarted: false }
      const signal = request.signal
      const abort = (): void => {
        /* v8 ignore next 2 -- settling a stream removes this listener, so the guard is defensive only */
        if (!this.pending.has(streamId)) return
        const error = errorOf(signal?.reason, 'request aborted')
        this.carrier.write(encodeDesktopRequestCancel(streamId)).catch((writeError: unknown) => {
          this.fail(errorOf(writeError, 'request pipe failed'))
        })
        this.failPending(streamId, error)
      }
      if (signal?.aborted === true) {
        reject(errorOf(signal.reason, 'request aborted'))
        return
      }
      signal?.addEventListener('abort', abort, { once: true })
      pending.removeAbort = () => { signal?.removeEventListener('abort', abort) }
      this.pending.set(streamId, pending)
      this.upload(streamId, request, body, hasBody).catch((error: unknown) => {
        this.failPending(streamId, errorOf(error, 'request upload failed'))
      })
    })
  }

  /**
   * Open the Host's NDJSON remote stream and yield one parsed value per line.
   * @param endpoint - Typert remote endpoint (for example `session/list`).
   * @param payload - remote arguments forwarded to the gateway.
   * @param signal - cancellation for the request and the stream.
   * @returns parsed NDJSON values in stream order.
   * @throws when the Host rejects the stream request or a line is not JSON.
   */
  async *openStream<T>(endpoint: string, payload: unknown, signal?: AbortSignal): AsyncGenerator<T, void, undefined> {
    const response = await this.request({
      url: DESKTOP_STREAM_PATH,
      method: 'POST',
      headers: [['content-type', 'application/json']],
      body: JSON.stringify({ endpoint, payload }),
      ...(signal === undefined ? {} : { signal }),
    })
    if (!response.ok || response.body === null) {
      throw new Error(`dsh desktop: remote stream failed with HTTP ${String(response.status)}`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        pending += decoder.decode(value, { stream: !done })
        let newline = pending.indexOf('\n')
        while (newline !== -1) {
          const line = pending.slice(0, newline)
          pending = pending.slice(newline + 1)
          if (line !== '') yield JSON.parse(line) as T
          newline = pending.indexOf('\n')
        }
        if (done) break
      }
      if (pending !== '') yield JSON.parse(pending) as T
    } finally {
      reader.releaseLock()
    }
  }

  /** Reject every pending request and refuse later ones. */
  dispose(): void {
    this.fail(new Error('dsh desktop: transport disposed'))
  }

  private async upload(
    streamId: number,
    request: DesktopTransportRequest,
    body: Uint8Array | null,
    hasBody: boolean,
  ): Promise<void> {
    await this.carrier.write(encodeDesktopRequestStart(streamId, {
      url: request.url,
      method: (request.method ?? 'GET').toUpperCase(),
      headers: [...(request.headers ?? [])],
      hasBody,
    }))
    if (!hasBody || body === null) return
    for (let offset = 0; offset < body.byteLength; offset += DESKTOP_PIPE_CHUNK_BYTES) {
      if (!this.pending.has(streamId)) return
      await this.carrier.write(encodeDesktopRequestData(
        streamId,
        body.subarray(offset, offset + DESKTOP_PIPE_CHUNK_BYTES),
      ))
    }
    await this.carrier.write(encodeDesktopRequestEnd(streamId))
  }

  private acceptBytes(bytes: Uint8Array): void {
    try {
      for (const frame of this.decoder.push(bytes)) this.handleFrame(frame)
    } catch (error) {
      this.fail(errorOf(error, 'response pipe failed'))
    }
  }

  private handleFrame(frame: ReturnType<DesktopHostResponseDecoder['push']>[number]): void {
    const pending = this.pending.get(frame.streamId)
    // Frames for a settled stream (a cancel raced the Host's completion) carry
    // no observer and are dropped.
    if (pending === undefined) return
    switch (frame.type) {
      case 'start': {
        if (pending.responseStarted) throw new Error(`dsh desktop: response started twice for stream ${String(frame.streamId)}`)
        pending.responseStarted = true
        let body: ReadableStream<Uint8Array> | null = null
        if (frame.hasBody) {
          body = new ReadableStream<Uint8Array>({
            start: (controller) => { pending.controller = controller },
          })
        }
        pending.resolve(new Response(body, {
          status: frame.status,
          headers: new Headers(frame.headers.map(([name, value]) => [name, value] as [string, string])),
        }))
        return
      }
      case 'data': {
        const controller = pending.controller
        if (!pending.responseStarted || controller === undefined) {
          throw new Error(`dsh desktop: response body arrived before its start for stream ${String(frame.streamId)}`)
        }
        controller.enqueue(frame.data)
        return
      }
      case 'end':
        if (!pending.responseStarted) {
          throw new Error(`dsh desktop: response ended before its start for stream ${String(frame.streamId)}`)
        }
        pending.controller?.close()
        this.finishPending(frame.streamId)
        return
      case 'error':
        this.failPending(frame.streamId, new Error(frame.message))
        return
      /* v8 ignore next 2 -- the response frame union is closed; every case above returns */
      default:
        frame satisfies never
    }
  }

  private failPending(streamId: number, error: Error): void {
    const pending = this.pending.get(streamId)
    /* v8 ignore next -- a settled stream is removed before any later failure can reach it */
    if (pending === undefined) return
    pending.removeAbort?.()
    if (pending.controller === undefined) pending.reject(error)
    else pending.controller.error(error)
    this.pending.delete(streamId)
  }

  private finishPending(streamId: number): void {
    const pending = this.pending.get(streamId)
    /* v8 ignore next -- `end` is handled only for a pending stream */
    if (pending === undefined) return
    pending.removeAbort?.()
    this.pending.delete(streamId)
  }

  private fail(error: Error): void {
    if (this.closed !== undefined) return
    this.closed = error
    for (const pending of this.pending.values()) {
      pending.removeAbort?.()
      if (pending.controller === undefined) pending.reject(error)
      else pending.controller.error(error)
    }
    this.pending.clear()
  }
}
