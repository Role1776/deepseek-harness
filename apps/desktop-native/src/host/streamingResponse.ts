/**
 * React Native's `Response` stores a non-string body via `String()`, so the
 * transport's streamed body collapses to `"[object ReadableStream]"` and the
 * `.body` getter is absent. This response keeps the real stream and is injected
 * into `DesktopTransport` through its `createResponse` option, so the shipped
 * transport reaches streamed data without relying on the runtime global.
 */

/** Minimal streaming response with the members `DesktopTransport` and callers use. */
export class StreamingResponse {
  readonly status: number
  readonly headers: Headers
  readonly ok: boolean
  readonly bodyUsed = false
  private readonly stream: ReadableStream<Uint8Array> | null

  constructor(body: ReadableStream<Uint8Array> | null = null, init: { status?: number; headers?: Headers } = {}) {
    this.stream = body
    this.status = init.status ?? 200
    this.headers = init.headers ?? new Headers()
    this.ok = this.status >= 200 && this.status < 300
  }

  get body(): ReadableStream<Uint8Array> | null {
    return this.stream
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.stream === null) return new ArrayBuffer(0)
    const reader = this.stream.getReader()
    const chunks: Uint8Array[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value !== undefined) chunks.push(value)
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
    const joined = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      joined.set(chunk, offset)
      offset += chunk.byteLength
    }
    return joined.buffer
  }

  async text(): Promise<string> {
    return new TextDecoder('utf-8').decode(new Uint8Array(await this.arrayBuffer()))
  }

  async json(): Promise<unknown> {
    return JSON.parse(await this.text()) as unknown
  }
}

/**
 * `createResponse` factory for `DesktopTransport`.
 * @param body - response body stream, or `null` for a bodyless response.
 * @param init - response status and headers.
 * @returns a streaming response that exposes `body`.
 */
export function createStreamingResponse(
  body: ReadableStream<Uint8Array> | null,
  init: { status: number; headers: Headers },
): Response {
  return new StreamingResponse(body, init) as unknown as Response
}
