/**
 * Public surface of the desktop host wire v3 client: the shared frame codec and
 * the carrier-agnostic {@link DesktopTransport}.
 * @module @deepseek-ai/dsh-client-desktop-transport
 */

export {
  DESKTOP_CONTROL_IPC_FD,
  DESKTOP_HOST_PROTOCOL_VERSION,
  DESKTOP_PIPE_CHUNK_BYTES,
  DESKTOP_REQUEST_PIPE_FD,
  DESKTOP_RESPONSE_PIPE_FD,
  DESKTOP_STREAM_PATH,
  type DesktopHostCommand,
  type DesktopHostEvent,
  type DesktopHostRequestFrame,
  type DesktopHostRequestStart,
  type DesktopHostResponseFrame,
} from './protocol.ts'

export {
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
} from './codec.ts'

export {
  DesktopTransport,
  type DesktopResponseFactory,
  type DesktopTransportCarrier,
  type DesktopTransportOptions,
  type DesktopTransportRequest,
} from './transport.ts'
