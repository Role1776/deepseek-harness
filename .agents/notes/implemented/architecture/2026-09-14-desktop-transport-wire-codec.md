# Agent Note: Desktop transport wire codec extraction

Status: implemented

English | [中文](2026-09-14-desktop-transport-wire-codec.zh.md)

## Problem

The desktop host speaks protocol v3 over two framed byte pipes (fd 3 for requests, fd 4 for responses). The host's decoder and response encoders lived in `apps/desktop-host/src/wire.ts`, while the Electron client duplicated the same frame layout in `apps/desktop/src/host-protocol.ts`. Phase 0a of the native-client plan needs one TypeScript client for that wire that does not own a process, so a second copy of the format would be a second place to drift.

## Decision

The package `@deepseek-ai/dsh-client-desktop-transport` (`packages/client/desktop-transport`) owns the protocol once. `src/protocol.ts` carries the descriptor constants and the frame and IPC payload types. `src/codec.ts` carries `DesktopHostRequestDecoder`, `DesktopHostResponseDecoder`, the four request encoders, and the four response encoders over `Uint8Array` and `DataView`. `src/transport.ts` carries `DesktopTransport`, a carrier-agnostic client over a `DesktopTransportCarrier` byte duplex with `request()` (streamed `Response`) and `openStream()` (NDJSON remote streams). The Node face (`src/index.ts`) and the browser and JS-engine face (`src/client/index.ts`) export the same implementation.

`apps/desktop-host/src/wire.ts` now re-exports the shared codec, so the host and its clients encode and decode identical frames. `apps/desktop/src/host-protocol.ts` keeps its Electron-specific client and widens only `DesktopHostResponseDecoder.push` to accept `Uint8Array`.

The codec is `Uint8Array`-based rather than `Buffer`-based so the browser face is realm-agnostic; host and Electron adapt at their pipe boundary, where `Buffer` is already a `Uint8Array`. The host's `runDesktopHost` response writer widened from `Buffer` to `Uint8Array` to match.

### Integration proof

`tests/integration.host.spec.ts` boots the real built `apps/desktop-host` over fd 3 and fd 4 plus IPC, heals a temporary profile through `healProfilesModuleFallback`, and performs one `POST /api/session/list` RPC, asserting status 200 and `result.ok`. The case self-skips when the built host graph is absent. The package's compiler faces (`tsconfig.host.json` and `tsconfig.client.json`) and `clientBundle(..., { hostPhase: true })` build the Node face during the Host pass and the browser face during the Client pass.

## Alternatives considered

- **Keep the codec in `apps/desktop-host` and copy it into the package.** A second copy of the 13-byte header and its payload validation drifts silently, and the native and Electron clients would diverge. Rejected.
- **Place the package under `packages/util/` as a Node-only package without a browser face.** The native client needs a browser and JS-engine artifact, and the `verify-client-packages` mode gate requires a package under `packages/client` to be a dynamic `dsh.client` row or use the `staticLinked` preset. `staticLinked` would overwrite the Node artifact the host imports. Rejected.
- **Keep `Buffer` in the codec.** `Buffer` is unavailable in the browser and Hermes realms the native client targets; a `Uint8Array` codec keeps one implementation for both faces, and Node callers pass `Buffer` unchanged.

## Consequences

The wire format now has one owner, and the host imports it instead of inlining its own copy. The Electron client still carries its own request encoders; only its response decoder was widened, so the pre-existing duplication in `apps/desktop` remains until the native-client plan retires that application.

`DesktopTransport` owns stream ids, request upload, response demultiplexing, and cancellation, but not the carrier or the child process; a caller that needs process control supplies and stops them. Request bodies are buffered (`Uint8Array` or string) rather than streamed; streaming upload backpressure is deferred until a consumer needs it.

Verification: `tests/codec.host.spec.ts` and `tests/transport.host.spec.ts` hold the package at the per-file 100% coverage gate, and `tests/integration.host.spec.ts` pins the real-host round-trip.
