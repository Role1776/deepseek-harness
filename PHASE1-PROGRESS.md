# Phase 1 — logic extraction progress

Convention: `packages/client/ui-<name>/src/model/` holds framework-free state, selectors, actions, formatters, locale dictionaries, and slot declarations/types (no `react-dom`, no DOM globals, no `.tsx`); views stay elsewhere in `src`, conventionally `src/client/`. Enforced by `pnpm run verify-client-model-purity`. See [the Agent Note](.agents/notes/implemented/architecture/2026-09-15-client-model-view-split.md).

| Package | Status |
|---|---|
| ui-agent-preset | pending |
| ui-approval | pending |
| ui-attachment | pending |
| ui-brand-official | pending |
| ui-chat | pending |
| ui-commands | pending |
| ui-conversation | pending |
| ui-deliverables | pending |
| ui-directory-picker-browse | pending |
| ui-directory-picker-native | pending |
| ui-dockkit | pending |
| ui-goal | done |
| ui-input-trigger | pending |
| ui-jobs | done |
| ui-layout | pending |
| ui-message-feedback | pending |
| ui-model-selection | pending |
| ui-open-in-app | pending |
| ui-permission-presets | pending |
| ui-plan | done |
| ui-primitives | pending |
| ui-reference | pending |
| ui-renderer | pending |
| ui-schedule | pending |
| ui-session | pending |
| ui-settings | pending |
| ui-settings-general | pending |
| ui-settings-models | pending |
| ui-settings-plugin-inventory | pending |
| ui-settings-plugins | pending |
| ui-sidebar | pending |
| ui-sidebar-documentpreview | pending |
| ui-sidebar-files | pending |
| ui-sidebar-right | pending |
| ui-skill | pending |
| ui-slots | pending |
| ui-subagent | pending |
| ui-theme | pending |
| ui-tool | pending |
| ui-trajectory | pending |
| ui-user-questions | pending |
| ui-workflow-run | pending |
| ui-workspace | pending |

## Notes for next session

- **Test import paths.** Moving a file from `src/client/` to `src/model/` requires updating every package test relative import (`../src/client/x.ts` → `../src/model/x.ts`). Grep the package's `tests/` for the old filename before running the suite; a missed path fails at collect, not assertion.
- **Index re-exports.** Keep the `./client` entrypoint's exported names stable. Update `src/client/index.ts` to import and re-export from `../model/...`; do not drop a public type or re-point it to an internal view. Verify with `git diff` that no `export` name disappeared.
- **Coverage.** Model files are new files in the per-file 100% gate. Their existing tests usually cover them, but a helper left in the view and now calling a model function can change which branches execute. Run the package's tests with coverage scoped to it (`pnpm exec vitest run --coverage --coverage.include='packages/client/ui-<name>/src/**/*.{ts,tsx}' packages/client/ui-<name>`) before moving on.
- **Keep type-only framework imports out.** A slot-declaration or injected-face interface that imports `HostObservable` from `ui-slots` as `import type` is allowed in `model`; a runtime React component import is not. Check `ui-goal/src/model/slots.ts` as the precedent.
- **Do not move views to make the gate pass.** Views legitimately use React and the DOM. Only move a file that is framework-free; split one that mixes both.
- **Gate corpus guard.** `scripts/verify-client-model-purity.ts` requires at least 40 `ui-*` packages. Adding or removing a package directory can trip it; update the bound only with a real corpus change.
