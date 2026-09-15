# Phase 0 spike — results (macOS)

Scaffold: `apps/desktop-native` (react-native-macos 0.81.9 / react-native 0.81.6 / React 19.3.0),
Release app at `macos/build/xcode/Build/Products/Release/desktop-native.app`, embedded Hermes
`main.jsbundle`. Launch command:

```sh
APP=macos/build/xcode/Build/Products/Release/desktop-native.app/Contents/MacOS/desktop-native
"$APP" -ApplePersistenceIgnoreState YES > .app.log 2>&1
```

## Launch crash — FIXED

Original symptom (`.app.log`): after the plugin registered, the process aborted with

```
libc++abi: terminating due to uncaught exception of type facebook::jsi::JSError:
Unhandled JS Exception: Error: Element type is invalid: expected a string ... but got: object.
  createFiberFromTypeAndProps@13394:28
```

Root cause (not RN/Xcode): `src/slots/slotRegistry.ts` called `setComponent(getSlot(name))`.
React interprets a function passed to a `useState` setter as an **updater**, so the registered
component function was invoked immediately and its *return value* (an element / `null`) became
the slot state. Rendering `<PluginSlot />` then tried to use that element object as a component
type. Verified by returning `null` from the plugin: the error changed to `... but got: null`.

Fix: `setComponent(() => getSlot(name))`. After the fix the app launches and stays alive.

No `.ips` crash report was produced for the app (`~/Library/Logs/DiagnosticReports` contains none);
the abort is a Hermes JSError via `libc++abi`, not a Mach exception. Saved application state was
cleared (`~/Library/Saved Application State/org.reactjs.native.desktop-native.savedState`).

## Item 1 — window, dark theme, vibrancy sidebar: WORKS

Evidence: app runs; `.spike/screenshot.png` (captured by the `DshHost` native module at 12 s)
shows the window, dark main pane, and sidebar. Sidebar check row reads:

```
NSVisualEffectView material=sidebar, blending=behindWindow, state=active
```

`AppDelegate` sets `NSAppearanceNameDarkAqua`; the sidebar is the native `DshVibrancyView`
(`NSVisualEffectView`), visible as a distinct sidebar tone behind the window. GO.

## Item 3 — load JS bundle from disk, render into a slot: WORKS

Evidence (`.app.log`, after the slotRegistry fix):

```
dsh-trace: plugin: writing bundle
dsh host: writeTextFile .../.spike/plugins/sample-plugin.js
dsh-trace: plugin: reading bundle back
dsh-trace: plugin: read 558 chars, evaluating
dsh-trace: plugin: function constructed
dsh-trace: plugin: factory executed
dsh-trace: plugin: component typeof=function
dsh-trace: plugin: slot registered
dsh-trace: render: PluginSlot typeof=function
dsh-trace: plugin render: typeof React=object View=object Text=function
```

The runtime-evaluated component is rendered inside the slot; screenshot shows the
"Runtime plugin component" card. GO.

## Item 2 — desktop-host over fd 3/4: WORKS

Host spawn and `POST /api/session/list` already returned `HTTP 200` with
`{"type":"server-response","rpcId":"native-spike","result":{"ok":true,"value":{"items":[]}}}`.

Remaining failure: the remote NDJSON stream failed with
`Cannot read property 'getReader' of undefined`. The transport resolved requests
with React Native's global `Response`, whose `.body` is `undefined`; replacing the
global from JS (`polyfills.ts`) was not honored by the transport, and the app
therefore never received the streamed body.

Fix (additive to the shipped transport):
- `packages/client/desktop-transport/src/transport.ts`: new optional
  `DesktopTransportOptions.createResponse` factory. It defaults to
  `new Response(body, init)`, so web behavior is unchanged; a runtime whose
  `Response` drops the stream supplies its own. Exported from `src/index.ts`.
- `apps/desktop-native/src/host/streamingResponse.ts`: `StreamingResponse` +
  `createStreamingResponse`, a response that keeps the real
  `ReadableStream<Uint8Array>` body and implements `status`/`headers`/`ok`/
  `body`/`arrayBuffer`/`text`/`json`.
- `apps/desktop-native/src/host/hostSession.ts`: constructs
  `new DesktopTransport(carrier, { createResponse: createStreamingResponse })`.
- `apps/desktop-native/src/App.tsx`: `firstStreamFrame` now reads the body reader
  directly and decodes complete NDJSON lines from bytes. Hermes' `TextDecoder`
  rejects the `{ stream: true }` option (`Failed to decode: the 'stream' option is
  unsupported.`), so the shipped `openStream` decoder cannot run there; the app
  splits on byte `0x0a` and decodes each complete line without the option.

Evidence (`.app.log`):

```
Response ctor=t own=true
api raw HTTP 200 ... body={"type":"server-response","rpcId":"native-spike","result":{"ok":true,"value":{"items":[]}}}
stream response ctor=t bodyType=object status=200
stream first frame {"type":"ready","clientId":"87845580-9046-444c-b650-f62fde053160","host":{"home":"/Users/fedor"}}
```

GO.

## Item 4 — streaming markdown timing: WORKS

`App.tsx` enables the 5000-line stream (`ENABLE_MARKDOWN = true`) and logs:
time to first committed render (effect on first non-empty `streamed`, measured
from stream start), plus total, frame count, average/max frame gap, and
dropped/long frame counts (>32 ms / >100 ms). Fixtures and parser are
`src/spike/markdownStream.ts` and `src/markdown/MinimalMarkdown.tsx`.

Evidence (`.app.log`, Release Hermes, 100 lines per `requestAnimationFrame`):

```
markdown first render 10 ms after stream start
markdown metrics lines=5000 chunks=50 totalMs=1984 frames=50 avgFrameMs=40 maxFrameMs=73 droppedFrames>32ms=31 longFrames>100ms=0
```

5000 lines render; first paint is immediate and the whole stream settles in
~2 s with no frame gap above 100 ms. GO.

## Verdict — GO

All four go/no-go points pass on react-native-macos 0.81.9: vibrancy window
(1), desktop-host transport including one `/api` call and one remote NDJSON
stream (2), runtime JS bundle loaded from disk into a slot (3), and 5000-line
streamed markdown with measured frame timings (4). The only shipped-package
change required was the additive `createResponse` option, covered by a unit test;
no core, API, host, or session-format change was needed.
