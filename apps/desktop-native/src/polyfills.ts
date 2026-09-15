/**
 * React Native lacks the web streams and UTF-8 text codecs that
 * `@deepseek-ai/dsh-client-desktop-transport` uses. This module installs the
 * stream constructors before the transport singleton is constructed. Streamed
 * response bodies do not route through the runtime global: `hostSession` passes
 * {@link StreamingResponse} to the transport's `createResponse` option.
 */

import { ReadableStream as WebStreamsReadableStream } from 'web-streams-polyfill'
import 'fast-text-encoding'
import { StreamingResponse } from './host/streamingResponse.ts'

type MutableScope = typeof globalThis & {
  ReadableStream?: unknown
  Response?: unknown
}

const scope = globalThis as MutableScope

/**
 * Install a global with `defineProperty` when a plain assignment is ignored,
 * which happens if the runtime pre-defined the name as a read-only property.
 */
function installGlobal(name: 'ReadableStream' | 'Response', value: unknown): void {
  try {
    Object.defineProperty(scope, name, { value, writable: true, configurable: true, enumerable: false })
  } catch {
    scope[name] = value
  }
}

installGlobal('ReadableStream', WebStreamsReadableStream)
installGlobal('Response', StreamingResponse)
