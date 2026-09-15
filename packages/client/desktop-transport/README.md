---
description: "Carrier-agnostic TypeScript client for the desktop host wire v3: shared frame codec, request/response streaming, and NDJSON remote streams over a caller-supplied byte carrier."
kind: "package-reference"
---
# @deepseek-ai/dsh-client-desktop-transport

English | [中文](README.zh.md)

## Summary

Use this package when a process other than the Electron shell must speak the desktop host wire protocol. The [desktop host](../../../apps/desktop/README.md) exposes no network port; it carries requests and responses as framed bytes over two child descriptors (fd 3 for requests, fd 4 for responses) and keeps lifecycle messages on Node IPC. This package owns that wire format once: `DesktopHostRequestDecoder` and the response encoders serve the host, while the exported encoders, `DesktopHostResponseDecoder`, and `DesktopTransport` serve any client. `DesktopTransport` takes a byte duplex rather than a process, so the same client rides child pipes, sockets, or an in-memory test carrier.

## Table of Contents

- [Use this package](#use-this-package)
  - [Talk to a host](#talk-to-a-host)
  - [Stream a remote endpoint](#stream-a-remote-endpoint)
- [Understand the implementation](#understand-the-implementation)
  - [Frame format](#frame-format)
  - [Failures](#failures)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

<a id="talk-to-a-host"></a>
### Talk to a host

Supply a `DesktopTransportCarrier`: `write` accepts one encoded frame, `onBytes` delivers response bytes, and `onClose` reports terminal completion. Then call `request({ url, method, headers, body })`; it resolves as soon as response metadata arrives and streams the response body through the returned `Response`. A request with no body encodes only `start`; a buffered body is chunked at `DESKTOP_PIPE_CHUNK_BYTES`.

<a id="stream-a-remote-endpoint"></a>
### Stream a remote endpoint

`openStream(endpoint, payload, signal)` posts `{ endpoint, payload }` to `DESKTOP_STREAM_PATH`, then yields one parsed JSON value per NDJSON line, including a final line without a trailing newline. Cancelling the signal cancels the underlying request.

<a id="understand-the-implementation"></a>
## Understand the implementation

<a id="frame-format"></a>
### Frame format

Every frame is a 13-byte header — big-endian magic `0x44534833`, one type byte, a 1..2^32-1 stream id, and a payload length — followed by the raw payload. Start and error payloads are UTF-8 JSON; data payloads are raw body bytes bounded to `DESKTOP_PIPE_CHUNK_BYTES`, while control payloads are bounded to 1 MiB.

<a id="failures"></a>
### Failures

The decoders validate the marker, stream id, payload bounds, and the JSON control payload fields, and reject EOF inside a frame. A host response `error` frame rejects the pending request; a carrier close or `dispose()` rejects every pending request and refuses later ones.

<a id="model-experience"></a>
## Model Experience

None, as this package moves bytes between processes and registers nothing model-facing.

#### KV Cache effect

None; this package does not assemble model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Buffered request bodies only.** `request()` accepts a `Uint8Array` or string body and chunks it; streaming upload backpressure is deferred until a native client needs it.
- **No transport-owned process lifecycle.** The caller owns the carrier and any child process; this package neither spawns nor stops the host.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The frame codec and transport own no relationship that an independent observation could diverge from; the unit and integration suites pin their behavior.
