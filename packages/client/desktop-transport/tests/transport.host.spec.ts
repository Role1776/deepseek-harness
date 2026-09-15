import { describe, expect, it } from 'vitest'
import {
  DESKTOP_PIPE_CHUNK_BYTES,
  DesktopHostRequestDecoder,
  DesktopTransport,
  encodeDesktopResponseData,
  encodeDesktopResponseEnd,
  encodeDesktopResponseError,
  encodeDesktopResponseStart,
  type DesktopTransportCarrier,
  type DesktopHostRequestFrame,
} from '../src/index.ts'

/** In-memory carrier recording request frames and replaying response bytes. */
class FakeCarrier implements DesktopTransportCarrier {
  readonly frames: Uint8Array[] = []
  writeError: Error | undefined
  onWrite: (() => void) | undefined
  private readonly byteListeners = new Set<(bytes: Uint8Array) => void>()
  private readonly closeListeners = new Set<(error?: Error) => void>()

  async write(frame: Uint8Array): Promise<void> {
    if (this.writeError !== undefined) throw this.writeError
    this.frames.push(frame)
    this.onWrite?.()
  }

  onBytes(listener: (bytes: Uint8Array) => void): () => void {
    this.byteListeners.add(listener)
    return () => { this.byteListeners.delete(listener) }
  }

  onClose(listener: (error?: Error) => void): () => void {
    this.closeListeners.add(listener)
    return () => { this.closeListeners.delete(listener) }
  }

  emit(bytes: Uint8Array): void {
    for (const listener of [...this.byteListeners]) listener(bytes)
  }

  close(error?: Error): void {
    for (const listener of [...this.closeListeners]) listener(error)
  }
}

/** Let pending upload microtasks settle before inspecting carrier frames. */
function flush(): Promise<void> {
  return new Promise((resolveFlush) => { setTimeout(resolveFlush, 0) })
}

/** Decode the request frames a carrier has written so far. */
function requestFrames(carrier: FakeCarrier): DesktopHostRequestFrame[] {
  const decoder = new DesktopHostRequestDecoder()
  return carrier.frames.flatMap(frame => decoder.push(frame))
}

function startedFrame(streamId: number, hasBody: boolean, status = 200): Uint8Array {
  return encodeDesktopResponseStart(streamId, { status, headers: [], hasBody })
}

describe('DesktopTransport request', () => {
  it('sends a bodyless GET and resolves the streamed response', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const responsePromise = transport.request({ url: 'http://host/api/session/list' })
    expect(requestFrames(carrier)).toEqual([{
      type: 'start',
      streamId: 1,
      url: 'http://host/api/session/list',
      method: 'GET',
      headers: [],
      hasBody: false,
    }])
    carrier.emit(startedFrame(1, true))
    carrier.emit(encodeDesktopResponseData(1, new TextEncoder().encode('hello ')))
    carrier.emit(encodeDesktopResponseData(1, new TextEncoder().encode('world')))
    carrier.emit(encodeDesktopResponseEnd(1))
    const response = await responsePromise
    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('hello world')
  })

  it('uses a supplied response factory instead of the global Response', async () => {
    const carrier = new FakeCarrier()
    const created: string[] = []
    const transport = new DesktopTransport(carrier, {
      createResponse: (body, init) => {
        created.push(`${String(init.status)}:${init.headers.get('x-test') ?? ''}`)
        return new Response(body, init)
      },
    })
    const responsePromise = transport.request({ url: '/a' })
    carrier.emit(encodeDesktopResponseStart(1, { status: 201, headers: [['x-test', 'yes']], hasBody: true }))
    carrier.emit(encodeDesktopResponseData(1, new TextEncoder().encode('hi')))
    carrier.emit(encodeDesktopResponseEnd(1))
    const response = await responsePromise
    expect(created).toEqual(['201:yes'])
    await expect(response.text()).resolves.toBe('hi')
  })

  it('chunks a buffered body and encodes its end', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const bytes = new Uint8Array(DESKTOP_PIPE_CHUNK_BYTES + 3).fill(7)
    const responsePromise = transport.request({
      url: 'http://host/api/upload',
      method: 'post',
      headers: [['content-type', 'application/octet-stream']],
      body: bytes,
    })
    await flush()
    const frames = requestFrames(carrier)
    expect(frames[0]).toMatchObject({ type: 'start', method: 'POST', hasBody: true })
    expect((frames[1] as { data: Uint8Array }).data).toHaveLength(DESKTOP_PIPE_CHUNK_BYTES)
    expect((frames[2] as { data: Uint8Array }).data).toHaveLength(3)
    expect(frames[3]).toEqual({ type: 'end', streamId: 1 })
    carrier.emit(startedFrame(1, false))
    carrier.emit(encodeDesktopResponseEnd(1))
    await expect((await responsePromise).text()).resolves.toBe('')
  })

  it('encodes a string body and ignores it for GET and HEAD', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const post = transport.request({ url: '/p', method: 'POST', body: '{}' })
    const get = transport.request({ url: '/g', method: 'GET', body: 'ignored' })
    const head = transport.request({ url: '/h', method: 'HEAD', body: 'ignored' })
    await flush()
    const frames = requestFrames(carrier)
    expect(frames.filter(frame => frame.type === 'data')).toHaveLength(1)
    expect(frames.filter(frame => frame.type === 'start').map(frame => frame.hasBody))
      .toEqual([true, false, false])
    for (const streamId of [1, 2, 3]) {
      carrier.emit(startedFrame(streamId, false))
      carrier.emit(encodeDesktopResponseEnd(streamId))
    }
    await post
    await get
    await head
  })

  it('rejects a host error frame', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const responsePromise = transport.request({ url: '/e' })
    carrier.emit(encodeDesktopResponseError(1, 'boom'))
    await expect(responsePromise).rejects.toThrow('boom')
  })

  it('rejects a pre-aborted request without writing frames', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    await expect(transport.request({ url: '/a', signal: AbortSignal.abort(new Error('request aborted')) }))
      .rejects.toThrow('request aborted')
    expect(carrier.frames).toEqual([])
  })

  it('cancels an in-flight request when the signal aborts', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const controller = new AbortController()
    const responsePromise = transport.request({ url: '/a', signal: controller.signal })
    controller.abort(new Error('request aborted'))
    await expect(responsePromise).rejects.toThrow('request aborted')
    expect(requestFrames(carrier).some(frame => frame.type === 'cancel')).toBe(true)
  })

  it('ignores an abort that arrives after the request settles', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const controller = new AbortController()
    const responsePromise = transport.request({ url: '/a', signal: controller.signal })
    carrier.emit(startedFrame(1, false))
    carrier.emit(encodeDesktopResponseEnd(1))
    await responsePromise
    controller.abort(new Error('late'))
    expect(requestFrames(carrier).some(frame => frame.type === 'cancel')).toBe(false)
  })

  it('propagates a cancel-write failure as a transport failure', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const controller = new AbortController()
    const responsePromise = transport.request({ url: '/a', signal: controller.signal })
    carrier.writeError = new Error('pipe gone')
    controller.abort(new Error('request aborted'))
    await expect(responsePromise).rejects.toThrow('request aborted')
    await expect(transport.request({ url: '/b' })).rejects.toThrow('pipe gone')
  })

  it('rejects pending requests when an upload write fails', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    carrier.writeError = new Error('upload failed')
    await expect(transport.request({ url: '/a', method: 'POST', body: 'x' })).rejects.toThrow('upload failed')
  })

  it('stops uploading once the request has settled', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const controller = new AbortController()
    carrier.onWrite = () => {
      if (carrier.frames.length >= 2) controller.abort(new Error('request aborted'))
    }
    const body = new Uint8Array(DESKTOP_PIPE_CHUNK_BYTES * 2)
    await expect(transport.request({ url: '/a', method: 'POST', body, signal: controller.signal }))
      .rejects.toThrow('request aborted')
    expect(requestFrames(carrier).filter(frame => frame.type === 'data')).toHaveLength(1)
  })

  it('falls back to a generic error for a non-Error abort reason', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    await expect(transport.request({ url: '/a', signal: AbortSignal.abort('why') }))
      .rejects.toThrow('request aborted')
  })

  it('exhausts its stream ids', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    ;(transport as unknown as { nextStreamId: number }).nextStreamId = 0x1_0000_0000
    await expect(transport.request({ url: '/a' })).rejects.toThrow('exhausted its stream ids')
  })
})

describe('DesktopTransport frame handling', () => {
  it('fails the transport on a malformed response frame', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const responsePromise = transport.request({ url: '/a' })
    const bad = startedFrame(1, false)
    bad[0] = 0
    carrier.emit(bad)
    await expect(responsePromise).rejects.toThrow('invalid response frame marker')
  })

  it('closes the transport when a response starts twice', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const responsePromise = transport.request({ url: '/a' })
    carrier.emit(startedFrame(1, false))
    carrier.emit(startedFrame(1, false))
    await expect(responsePromise).resolves.toBeDefined()
    await expect(transport.request({ url: '/b' })).rejects.toThrow('response started twice for stream 1')
  })

  it('fails the transport on body data and end frames before a start', async () => {
    const first = new FakeCarrier()
    const firstTransport = new DesktopTransport(first)
    const firstPromise = firstTransport.request({ url: '/a' })
    first.emit(encodeDesktopResponseData(1, new Uint8Array([1])))
    await expect(firstPromise).rejects.toThrow('response body arrived before its start for stream 1')

    const second = new FakeCarrier()
    const secondTransport = new DesktopTransport(second)
    const secondPromise = secondTransport.request({ url: '/a' })
    second.emit(encodeDesktopResponseEnd(1))
    await expect(secondPromise).rejects.toThrow('response ended before its start for stream 1')
  })

  it('drops frames for a settled stream', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const responsePromise = transport.request({ url: '/a' })
    carrier.emit(startedFrame(9, false))
    carrier.emit(startedFrame(1, false))
    carrier.emit(encodeDesktopResponseEnd(1))
    await responsePromise
    carrier.emit(encodeDesktopResponseError(1, 'late'))
    const nextPromise = transport.request({ url: '/b' })
    carrier.emit(startedFrame(2, false))
    carrier.emit(encodeDesktopResponseEnd(2))
    await expect(nextPromise).resolves.toBeDefined()
  })
})

describe('DesktopTransport lifecycle', () => {
  it('rejects pending and later requests after a carrier close', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const responsePromise = transport.request({ url: '/a' })
    carrier.close(new Error('carrier died'))
    await expect(responsePromise).rejects.toThrow('carrier died')
    await expect(transport.request({ url: '/b' })).rejects.toThrow('carrier died')
  })

  it('uses a generic failure for a clean carrier end', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const responsePromise = transport.request({ url: '/a' })
    carrier.close()
    await expect(responsePromise).rejects.toThrow('transport closed')
    await expect(transport.request({ url: '/b' })).rejects.toThrow('transport closed')
  })

  it('rejects pending and later requests after disposal', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const responsePromise = transport.request({ url: '/a' })
    transport.dispose()
    await expect(responsePromise).rejects.toThrow('transport disposed')
    transport.dispose()
    await expect(transport.request({ url: '/b' })).rejects.toThrow('transport disposed')
  })

  it('errors a streaming response body on disposal', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const responsePromise = transport.request({ url: '/a' })
    carrier.emit(startedFrame(1, true))
    const response = await responsePromise
    transport.dispose()
    await expect(response.text()).rejects.toThrow('transport disposed')
  })

  it('errors a streaming response body on a host error frame', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const responsePromise = transport.request({ url: '/a' })
    carrier.emit(startedFrame(1, true))
    const response = await responsePromise
    carrier.emit(encodeDesktopResponseError(1, 'stream failed'))
    await expect(response.text()).rejects.toThrow('stream failed')
  })
})

describe('DesktopTransport.openStream', () => {
  async function collect<T>(iterable: AsyncGenerator<T>): Promise<T[]> {
    const values: T[] = []
    for await (const value of iterable) values.push(value)
    return values
  }

  it('posts the endpoint and parses NDJSON across chunk boundaries', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const collected = collect(transport.openStream<{ n: number }>('session/list', { args: {} }))
    await flush()
    const frames = requestFrames(carrier)
    expect(frames[0]).toMatchObject({ type: 'start', method: 'POST' })
    const body = JSON.parse(new TextDecoder().decode((frames[1] as { data: Uint8Array }).data)) as unknown
    expect(body).toEqual({ endpoint: 'session/list', payload: { args: {} } })
    expect(frames[2]).toEqual({ type: 'end', streamId: 1 })

    carrier.emit(startedFrame(1, true))
    carrier.emit(encodeDesktopResponseData(1, new TextEncoder().encode('{"n":1}\n{"n"')))
    carrier.emit(encodeDesktopResponseData(1, new TextEncoder().encode(':2}\n\n{"n":3}')))
    carrier.emit(encodeDesktopResponseEnd(1))
    await expect(collected).resolves.toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
  })

  it('forwards a stream signal and completes when every line is newline-terminated', async () => {
    const carrier = new FakeCarrier()
    const transport = new DesktopTransport(carrier)
    const controller = new AbortController()
    const collected = collect(transport.openStream<number>('x', {}, controller.signal))
    await flush()
    carrier.emit(startedFrame(1, true))
    carrier.emit(encodeDesktopResponseData(1, new TextEncoder().encode('1\n2\n')))
    carrier.emit(encodeDesktopResponseEnd(1))
    await expect(collected).resolves.toEqual([1, 2])
  })

  it('rejects a non-OK stream response and one without a body', async () => {
    const bad = new FakeCarrier()
    const badTransport = new DesktopTransport(bad)
    const badCollected = collect(badTransport.openStream('x', {}))
    await flush()
    bad.emit(startedFrame(1, true, 503))
    bad.emit(encodeDesktopResponseEnd(1))
    await expect(badCollected).rejects.toThrow('remote stream failed with HTTP 503')

    const empty = new FakeCarrier()
    const emptyTransport = new DesktopTransport(empty)
    const emptyCollected = collect(emptyTransport.openStream('x', {}))
    await flush()
    empty.emit(startedFrame(1, false))
    empty.emit(encodeDesktopResponseEnd(1))
    await expect(emptyCollected).rejects.toThrow('remote stream failed with HTTP 200')
  })
})
