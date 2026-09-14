import { describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_PIPE_CHUNK_BYTES,
  DesktopHostRequestDecoder,
  DesktopHostResponseDecoder,
  encodeDesktopRequestCancel,
  encodeDesktopRequestData,
  encodeDesktopRequestEnd,
  encodeDesktopRequestStart,
  encodeDesktopResponseData,
  encodeDesktopResponseEnd,
  encodeDesktopResponseError,
  encodeDesktopResponseStart,
} from '../src/index.ts'

const MAGIC = 0x44534833
const HEADER = 13

/** Build a raw frame so tests can construct payloads no encoder would emit. */
function rawFrame(type: number, streamId: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  const frame = new Uint8Array(HEADER + payload.byteLength)
  const view = new DataView(frame.buffer)
  view.setUint32(0, MAGIC)
  view.setUint8(4, type)
  view.setUint32(5, streamId)
  view.setUint32(9, payload.byteLength)
  frame.set(payload, HEADER)
  return frame
}

function jsonPayload(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

describe('desktop request codec', () => {
  it('round-trips every request frame type', () => {
    const decoder = new DesktopHostRequestDecoder()
    const frames = [
      ...decoder.push(encodeDesktopRequestStart(1, {
        url: 'http://127.0.0.1/api/session/list',
        method: 'POST',
        headers: [['content-type', 'application/json']],
        hasBody: true,
      })),
      ...decoder.push(encodeDesktopRequestData(1, new Uint8Array([1, 2, 3]))),
      ...decoder.push(encodeDesktopRequestEnd(1)),
      ...decoder.push(encodeDesktopRequestCancel(2)),
    ]
    expect(frames).toEqual([
      {
        type: 'start',
        streamId: 1,
        url: 'http://127.0.0.1/api/session/list',
        method: 'POST',
        headers: [['content-type', 'application/json']],
        hasBody: true,
      },
      { type: 'data', streamId: 1, data: new Uint8Array([1, 2, 3]) },
      { type: 'end', streamId: 1 },
      { type: 'cancel', streamId: 2 },
    ])
    expect(() => { decoder.finish() }).not.toThrow()
  })

  it('joins split chunks and leaves trailing partial bytes buffered', () => {
    const decoder = new DesktopHostRequestDecoder()
    const frame = encodeDesktopRequestStart(3, {
      url: '/a',
      method: 'GET',
      headers: [],
      hasBody: false,
    })
    expect(decoder.push(frame.subarray(0, 5))).toEqual([])
    expect(decoder.push(frame.subarray(5, 20))).toEqual([])
    expect(decoder.push(frame.subarray(20))).toEqual([{
      type: 'start',
      streamId: 3,
      url: '/a',
      method: 'GET',
      headers: [],
      hasBody: false,
    }])
  })

  it('reports a non-Error JSON parse failure', () => {
    const parse = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => { throw 'raw' })
    try {
      expect(() => new DesktopHostResponseDecoder().push(
        rawFrame(1, 1, jsonPayload({ status: 200, headers: [], hasBody: false })),
      )).toThrow('response start payload is not JSON: raw')
    } finally {
      parse.mockRestore()
    }
  })

  it('rejects EOF inside a request frame', () => {
    const decoder = new DesktopHostRequestDecoder()
    decoder.push(encodeDesktopRequestEnd(1).subarray(0, 5))
    expect(() => { decoder.finish() }).toThrow('request pipe ended inside a frame')
  })

  it('rejects an invalid request marker', () => {
    const frame = rawFrame(1, 1)
    frame[0] = 0
    expect(() => new DesktopHostRequestDecoder().push(frame)).toThrow('invalid request frame marker')
  })

  it('rejects invalid and unknown request frames', () => {
    expect(() => new DesktopHostRequestDecoder().push(rawFrame(1, 0))).toThrow('invalid pipe stream id 0')
    expect(() => new DesktopHostRequestDecoder().push(rawFrame(9, 1))).toThrow('unknown request frame type 9')
    expect(() => new DesktopHostRequestDecoder().push(rawFrame(3, 1, new Uint8Array([1]))))
      .toThrow('request end frame carried a payload')
    expect(() => new DesktopHostRequestDecoder().push(rawFrame(4, 1, new Uint8Array([1]))))
      .toThrow('request cancel frame carried a payload')
  })

  it('rejects oversized request frames', () => {
    expect(() => encodeDesktopRequestData(1, new Uint8Array(DESKTOP_PIPE_CHUNK_BYTES + 1)))
      .toThrow(`pipe frame exceeds the ${String(DESKTOP_PIPE_CHUNK_BYTES)}-byte limit`)
    expect(() => encodeDesktopRequestStart(1, {
      url: 'x'.repeat(1024 * 1024 + 1),
      method: 'GET',
      headers: [],
      hasBody: false,
    })).toThrow('pipe frame exceeds the 1048576-byte limit')
    expect(() => new DesktopHostRequestDecoder().push(
      rawFrame(1, 1, new Uint8Array(1024 * 1024 + 1)),
    )).toThrow('request frame exceeds the 1048576-byte limit')
    expect(() => new DesktopHostRequestDecoder().push(
      rawFrame(2, 1, new Uint8Array(DESKTOP_PIPE_CHUNK_BYTES + 4)),
    )).toThrow(`request frame exceeds the ${String(DESKTOP_PIPE_CHUNK_BYTES)}-byte limit`)
  })

  it('rejects a request start that is not a valid JSON object', () => {
    expect(() => new DesktopHostRequestDecoder().push(rawFrame(1, 1, new TextEncoder().encode('{'))))
      .toThrow('request start payload is not JSON')
    for (const value of [
      null,
      [],
      { url: 1, method: 'GET', headers: [], hasBody: false },
      { url: '/', method: 1, headers: [], hasBody: false },
      { url: '/', method: 'GET', headers: 'x', hasBody: false },
      { url: '/', method: 'GET', headers: [['a', 1]], hasBody: false },
      { url: '/', method: 'GET', headers: [['a']], hasBody: false },
      { url: '/', method: 'GET', headers: [], hasBody: 'no' },
    ]) {
      expect(() => new DesktopHostRequestDecoder().push(rawFrame(1, 1, jsonPayload(value))))
        .toThrow('invalid request start payload')
    }
  })

  it('rejects an invalid request stream id on encode', () => {
    expect(() => encodeDesktopRequestEnd(0)).toThrow('invalid pipe stream id 0')
    expect(() => encodeDesktopRequestEnd(0x1_0000_0000)).toThrow('invalid pipe stream id 4294967296')
  })
})

describe('desktop response codec', () => {
  it('round-trips every response frame type', () => {
    const decoder = new DesktopHostResponseDecoder()
    const frames = [
      ...decoder.push(encodeDesktopResponseStart(1, {
        status: 200,
        headers: [['content-type', 'text/plain']],
        hasBody: true,
      })),
      ...decoder.push(encodeDesktopResponseData(1, new Uint8Array([9, 8]))),
      ...decoder.push(encodeDesktopResponseEnd(1)),
      ...decoder.push(encodeDesktopResponseError(2, 'failed')),
    ]
    expect(frames).toEqual([
      { type: 'start', streamId: 1, status: 200, headers: [['content-type', 'text/plain']], hasBody: true },
      { type: 'data', streamId: 1, data: new Uint8Array([9, 8]) },
      { type: 'end', streamId: 1 },
      { type: 'error', streamId: 2, message: 'failed' },
    ])
    expect(() => { decoder.finish() }).not.toThrow()
  })

  it('joins split chunks and leaves trailing partial bytes buffered', () => {
    const decoder = new DesktopHostResponseDecoder()
    const frame = encodeDesktopResponseStart(5, { status: 204, headers: [], hasBody: false })
    expect(decoder.push(frame.subarray(0, 13))).toEqual([])
    expect(decoder.push(frame.subarray(13))).toEqual([
      { type: 'start', streamId: 5, status: 204, headers: [], hasBody: false },
    ])
  })

  it('rejects EOF inside a response frame', () => {
    const decoder = new DesktopHostResponseDecoder()
    decoder.push(encodeDesktopResponseEnd(1).subarray(0, 5))
    expect(() => { decoder.finish() }).toThrow('response pipe ended inside a frame')
  })

  it('rejects invalid and unknown response frames', () => {
    const frame = rawFrame(1, 1)
    frame[0] = 0
    expect(() => new DesktopHostResponseDecoder().push(frame)).toThrow('invalid response frame marker')
    expect(() => new DesktopHostResponseDecoder().push(rawFrame(1, 0))).toThrow('invalid pipe stream id 0')
    expect(() => new DesktopHostResponseDecoder().push(rawFrame(9, 1))).toThrow('unknown response frame type 9')
    expect(() => new DesktopHostResponseDecoder().push(rawFrame(3, 1, new Uint8Array([1]))))
      .toThrow('response end frame carried a payload')
  })

  it('rejects oversized response frames', () => {
    expect(() => encodeDesktopResponseData(1, new Uint8Array(DESKTOP_PIPE_CHUNK_BYTES + 1)))
      .toThrow(`pipe frame exceeds the ${String(DESKTOP_PIPE_CHUNK_BYTES)}-byte limit`)
    expect(() => new DesktopHostResponseDecoder().push(
      rawFrame(1, 1, new Uint8Array(1024 * 1024 + 1)),
    )).toThrow('response frame exceeds the 1048576-byte limit')
  })

  it('rejects an invalid response start or error payload', () => {
    expect(() => new DesktopHostResponseDecoder().push(rawFrame(1, 1, new TextEncoder().encode('{'))))
      .toThrow('response start payload is not JSON')
    expect(() => new DesktopHostResponseDecoder().push(rawFrame(4, 1, new TextEncoder().encode('{'))))
      .toThrow('response error payload is not JSON')
    for (const value of [
      null,
      [],
      { status: '200', headers: [], hasBody: false },
      { status: 99, headers: [], hasBody: false },
      { status: 600, headers: [], hasBody: false },
      { status: 200, headers: 'x', hasBody: false },
      { status: 200, headers: [], hasBody: 'no' },
    ]) {
      expect(() => new DesktopHostResponseDecoder().push(rawFrame(1, 1, jsonPayload(value))))
        .toThrow('invalid response start payload')
    }
    for (const value of [null, [], { message: 1 }]) {
      expect(() => new DesktopHostResponseDecoder().push(rawFrame(4, 1, jsonPayload(value))))
        .toThrow('invalid response error payload')
    }
  })
})
