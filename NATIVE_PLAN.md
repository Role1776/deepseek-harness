# Native Desktop Client — plan

Status: draft. Goal: replace the Electron + DOM client with a cross-platform native desktop client (macOS + Windows), Codex-desktop-like design, while keeping community plugins (host and UI halves) installable.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Host | Unchanged (`packages/core`, `api`, all host plugins) | Host is UI-agnostic; host plugins and their tests keep working. |
| Carrier | Reuse `apps/desktop-host` framed pipes (fd 3/4, protocol v3, `apps/desktop-host/src/wire.ts`) + `connection.createSharedFetchHandler('/api')` | Already carrier-neutral, no network port. |
| UI toolkit | React Native for macOS + React Native for Windows (candidate, validated in Phase 0) | Native views (AppKit / WinUI), TS stays, ReactNode contract of `ui-slots` stays, community UI plugins remain JS bundles registering components into slots. |
| Fallback toolkit | Slint (Rust) + declarative plugin UI protocol | Used only if Phase 0 spike fails (runtime bundle loading, vibrancy, text perf). |
| Linux | Out of scope (not supported today either) | `apps/desktop/README.md` |
| Electron | Removed after Phase 5 parity | `apps/desktop` shell logic (profile, pnpm, updates) is ported, not deleted blindly. |
| Web client | Removed together with Electron (`apps/web`, `dsh web`, webserver/frontend-static, DOM `ui-*` views) | Single native client; no DOM compatibility to maintain. |
| Branch | All work on `dev` (pushed to `fork` = Role1776/deepseek-harness); `master` tracks upstream | Keep upstream syncable. |

## Reused as-is (no DOM, no React dependency)

- `packages/client/store`, `ui-slots`, `connection` (client half), `modules` (boot graph), `locale`, `resources`
- Typert Remote client + generated descriptors (`packages/typert/*`, `packages/api/*`)
- Plugin manifest `dsh.client` — extended with `platform: 'native'`

## Rewritten

- `packages/client/ui-renderer` → `ui-renderer-native` (same `SlotRenderer` contract)
- `packages/client/ui-primitives`, `ui-dockkit`, `ui-theme` → native primitives (Markdown, code, diff, ANSI, TeX)
- Every `packages/client/ui-*` feature package → `ui-*` native component files next to existing logic; view-model/logic code is extracted first and shared
- `apps/desktop` (Electron) → `apps/desktop-native` (RN macOS/Windows app + native module that spawns the host and speaks wire v3)

## Plugin compatibility

- Host-only plugins: unchanged.
- UI plugins: `dsh.client.platform: 'native'` bundle, loaded at runtime into the JS engine, registering RN components via `ctx.slots.register` (same API).
- Legacy `platform: 'web'` UI plugins: not loaded by the native client; host half still works. Documented migration guide.
- Plugin manager (install/remove/update via bundled pnpm) ported from `apps/desktop/src/project-manager.ts`.

## Phases

Each phase ends green: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, `pnpm run test:coverage`, `pnpm run test:snapshot`, plus the phase's own acceptance check. Host packages must not change unless a phase says so.

### Phase 0a — TS transport core (no Xcode needed)
- New package `packages/client/desktop-transport`: TypeScript client for wire v3 (frame encode/decode shared with `apps/desktop-host/src/wire.ts`, request/response, NDJSON remote streams), carrier-agnostic (takes a byte duplex).
- Acceptance: unit tests with 100% coverage, plus an integration test that spawns the real built `apps/desktop-host` over fd 3/4 and performs one `/api` call.

### Phase 0 — spike (go/no-go, on `dev` under `apps/desktop-native`; requires Xcode + CocoaPods, Windows machine for RN Windows)
1. RN macOS + RN Windows hello app with vibrancy sidebar and dark theme.
2. Native module spawns `apps/desktop-host`, sends one `/api` request over wire v3, streams one remote stream.
3. Load a JS bundle at runtime from disk and render its component in a slot.
4. Render a 5k-line streaming markdown message; measure frame time.
Go/no-go: all four work on both OSes → RN. Otherwise → Slint fallback, revise plan.

### Phase 1 — logic extraction
- Split every `ui-*` package into `model` (state, selectors, actions, formatters — no DOM, no react-dom) and `view`. Tests of logic move with the model; DOM-only view tests are removed only together with the view they test.
- Web client does not need to keep working after this phase; host tests and snapshots must.
- Acceptance: gate forbids `react-dom`/DOM globals in `model` files; model tests pass.

### Phase 2 — native shell + transport
- `apps/desktop-native`: window, sidebar, host process lifecycle (port `host-process.ts`, `backend-controller.ts`), wire v3 client, `__DSH_TRANSPORT__` equivalent.
- `ui-renderer-native` implementing `SlotRenderer`.
- Acceptance: native app boots host, lists sessions from the real API.

### Phase 3 — core flow (Codex parity MVP)
- Thread list grouped by workspace, new thread, conversation stream, composer (model selector, attachments, `@` files, `/` commands), approvals, user questions, tool cards.
- Acceptance: run a recorded snapshot session through the native client; transcript matches web client.

### Phase 4 — remaining surfaces
- Settings (general, models, plugins, permission presets), file sidebar, document preview, plan, jobs, schedule, subagents, goal, workflow runs, deliverables, trajectory.

### Phase 5 — plugins + distribution
- `platform: 'native'` bundle loading in `packages/client/modules`, plugin manager UI, signing/notarization, auto-update, Windows installer.
- Port first-party UI plugins; publish native plugin authoring guide.

### Phase 6 — remove Electron
- Delete `apps/desktop` (Electron), `apps/web`, `packages/client/web`, `packages/host/webserver`, `packages/host/frontend-static`, `packages/bundle/web-app`, DOM views and their tests; update CLI (`dsh web`), docs, gates and snapshots accordingly.

## Design reference

Codex desktop: translucent sidebar (New thread / Automations / Skills, threads grouped by workspace with relative time), dark main pane, centered empty state, suggestion cards, bottom composer with model + effort picker, Local/Worktree/Cloud tabs, branch indicator, top bar with Open / Commit / diff stats. Use platform materials (NSVisualEffectView / Mica), system fonts, native menus and shortcuts.

## Rules for the coding agent

- Work one phase / one package at a time; never edit `packages/core`, `packages/api`, host plugins or session format.
- Never delete or weaken a test to make it pass. Moved logic keeps its tests.
- After each package: run typecheck + tests for affected packages, then the full gates listed above before finishing a phase.
- Follow `AGENTS.md` conventions (ESM, JSDoc, i18n via locale dictionaries, Agent Note per non-trivial change).

## Risks

- RN Windows/macOS maturity and runtime bundle loading — gated by Phase 0.
- Markdown/TeX/diff rendering quality and security without DOM.
- Two clients (web + native) during migration double UI maintenance.
- 100% per-file coverage gate applies to new native packages.
