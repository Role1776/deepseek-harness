# Phase 1 — logic extraction progress

Convention: `packages/client/ui-<name>/src/model/` holds framework-free state, selectors, actions, formatters, locale dictionaries, and slot declarations/types (no `react-dom`, no DOM globals, no `.tsx`); views stay elsewhere in `src`, conventionally `src/client/`. Enforced by `pnpm run verify-client-model-purity`. See [the Agent Note](.agents/notes/implemented/architecture/2026-09-15-client-model-view-split.md).

| Package | Status |
|---|---|
| ui-agent-preset | done |
| ui-approval | done |
| ui-attachment | pending |
| ui-brand-official | view-only |
| ui-chat | pending |
| ui-commands | done |
| ui-conversation | pending |
| ui-deliverables | done |
| ui-directory-picker-browse | done |
| ui-directory-picker-native | done |
| ui-dockkit | pending |
| ui-goal | done |
| ui-input-trigger | pending |
| ui-jobs | done |
| ui-layout | pending |
| ui-message-feedback | done |
| ui-model-selection | done |
| ui-open-in-app | done |
| ui-permission-presets | done |
| ui-plan | done |
| ui-primitives | pending |
| ui-reference | done |
| ui-renderer | pending |
| ui-schedule | done |
| ui-session | done |
| ui-settings | pending |
| ui-settings-general | pending |
| ui-settings-models | pending |
| ui-settings-plugin-inventory | done |
| ui-settings-plugins | pending |
| ui-sidebar | pending |
| ui-sidebar-documentpreview | pending |
| ui-sidebar-files | done |
| ui-sidebar-right | pending |
| ui-skill | done |
| ui-slots | pending |
| ui-subagent | done |
| ui-theme | pending |
| ui-tool | pending |
| ui-trajectory | pending |
| ui-user-questions | done |
| ui-workflow-run | done |
| ui-workspace | pending |

## Notes for next session

- **Test import paths.** Moving a file from `src/client/` to `src/model/` requires updating every package test relative import (`../src/client/x.ts` → `../src/model/x.ts`). Grep the package's `tests/` for the old filename before running the suite; a missed path fails at collect, not assertion.
- **Index re-exports.** Keep the `./client` entrypoint's exported names stable. Update `src/client/index.ts` to import and re-export from `../model/...`; do not drop a public type or re-point it to an internal view. Verify with `git diff` that no `export` name disappeared.
- **Coverage.** Model files are new files in the per-file 100% gate. Their existing tests usually cover them, but a helper left in the view and now calling a model function can change which branches execute. Run the package's tests with coverage scoped to it (`pnpm exec vitest run --coverage --coverage.include='packages/client/ui-<name>/src/**/*.{ts,tsx}' packages/client/ui-<name>`) before moving on.
- **Keep type-only framework imports out.** A slot-declaration or injected-face interface that imports `HostObservable` from `ui-slots` as `import type` is allowed in `model`; a runtime React component import is not. Check `ui-goal/src/model/slots.ts` as the precedent.
- **Do not move views to make the gate pass.** Views legitimately use React and the DOM. Only move a file that is framework-free; split one that mixes both.
- **Gate corpus guard.** `scripts/verify-client-model-purity.ts` requires at least 40 `ui-*` packages. Adding or removing a package directory can trip it; update the bound only with a real corpus change.
- **Split compiler faces.** A package with `tsconfig.client.json`/`tsconfig.host.json` leaves (ui-deliverables) must add `src/model` to the client leaf's `include`; the single-`tsconfig.json` packages already include all of `src`. Without it, `tsc -b` reports TS6307 both in the package project and in the root `tsconfig.client.json` test program that imports the model source. Adding the model directory also fixes the root program, because the leaf then emits the declarations the test program resolves.
- **A moved file's own relative imports.** Repointing test paths is not enough: a moved file that imported a sibling (`../locales.ts`, `../draft-store.ts`, `./turn-deliverables.ts`) must repoint those too. In the ui-approval partial move `model/slots.ts` still said `../locales.ts`; only a compile/typecheck or a grep catches it, the purity gate does not.
- **Split combined view imports.** `import { View, type Injected } from './Foo.tsx'` breaks when the type moves; split into `View` from the view and `type Injected` from `../model/slots.ts`, and repoint that type out of the `index.ts` re-export.
- **README and JSDoc paths.** Moved-file prose references (`src/client/controller.ts` in ui-open-in-app README/zh, doc-comment `contract/slots.ts` in ui-user-questions index) go stale silently; grep the package README pair and index comments for the old path when a file moves.
- **Pure helpers inside a `.tsx` view still move.** A formatter or ordering helper defined in a component file (`orderEntries`, `failureLine` in ui-sidebar-files `FilesBody.tsx`) is model code by the convention; extract it to `src/model/` and repoint both the view import and the spec that imported it from the view. The view keeps only the call sites.
- **A moved locale file owns the namespace merge.** `locales.ts` may hold `declare module '@deepseek-ai/dsh-client-ui-slots'`; after the move, every consumer's `import type {} from './locales.ts'` must become `../model/locales.ts`, or the augmentation silently stops loading for that program.
- **A constant shared by a moved formatter and the view moves too.** ui-schedule's `SECOND_MS` was defined among the formatters but also drives the view's ticking interval; export it from the model file and import it back rather than duplicating the literal.
- **Move only framework-free helpers out of a `.tsx`.** The view keeps its `PropsRuntime`/`PropsLocale` props type, CSS imports, and `react-dom` calls (ui-schedule's `createPortal`); the model takes the pure formatters and ordering and imports `TranslateNS` type-only.
- **The plugin body's pure helpers are model code.** A selector or argument builder defined inside `src/client/index.ts` moves to `model/` alongside its result type, and the view/entry import it back (ui-subagent's `selectReadOnlySubagent`, ui-model-selection's row builders).
- **A removed `import type { X } from '@deepseek-ai/.../client'` may also have been the SlotMap merge.** That single type import can be doing double duty (a draft `ComposerChainProps` import also pulled the ui-conversation slot merge). Replace it with a bare `import type {} from '...'` side-effect import before running the root client program.
- **`import type { NS }` plus `TranslateNS<typeof NS>` works** for a model formatter: the const-typed namespace can be imported type-only because only `typeof` reads it.
- **A per-session controller that only uses `ClientContext` type-only and `ctx.remote` moves to model too** (ui-permission-presets `settings-store.ts` precedent); only a cordis `Service` subclass that registers itself stays in `src/client` (ui-model-selection `service.ts`).
- **Moving a `vitest.config.ts` coverage-exempt file activates the 100% gate.** Some `ui-*/src/client/*.ts` paths sit in the config's GUI-debt `coverage.exclude`; the moment the file lands in `src/model` it is gated, and its error/stale/disposed branches the existing suite never needed now fail. Remove the stale exclude path and add direct unit tests for those branches (ui-model-selection's `model-directory.client.spec.ts`). Do this before trusting the per-package coverage run.
- **Re-grep views, not just tests, when repointing a moved module.** `import type { X } from './slots.ts'` in a `.tsx` erases at run time so vitest passes, but `tsc` fails the root client program (TS2307 plus cascaded implicit-any errors). Check every `src/client/*.tsx` relative import.
- **A formerly exempt defensive guard can be genuinely unreachable.** ui-commands `popup.ts`'s `settle()` entry guard (`this.binding !== binding || !s.open || s.submitting`) is always false because `select()` and `confirm()` already enforce it synchronously before the call; no public sequence can trip it. The repo-sanctioned fix is a `/* v8 ignore next -- <reason> */` on the guard, not a `vitest.config.ts` exclusion. Cover the *reachable* uncovered branches with direct unit tests first (late options failure, non-Error failure text, repeat acknowledge, cancel without a confirmation).
- **A formatter stays in the view when it needs React component values.** ui-commands `presentation.ts` maps built-in host commands to icon components, so only its pure sectioning (`MenuSection`, `SECTION_ROWS`, `sectionRows`) moved to `model/presentation.ts`; the icon face (`builtinRowFace`) stayed in `src/client/presentation.ts`. `CommandDirectory`, `PopupSelectController`, `contract`, `resolution`, and `locales` were fully framework-free and moved whole.
- **README implementation prose names moved paths.** ui-commands README/zh `## Understand the implementation` named `src/client/contract.ts`, `resolution.ts`, and `presentation.ts`; update both sides and re-record with `pnpm run verify-translation-pairing --write <README.md>`.
- **Import only the model helpers the view still calls.** After moving ui-directory-picker-browse's pure helpers out of `DirectoryBrowser.tsx`, `draftDirectory` and `levelDirectory` were used only by the moved `readDraft`; importing them into the view failed `tsc` with TS6133. Keep such helpers module-private in the model file and import only what the view reads. The three debounce constants are shared by the model helpers and the view's timers, so they are exported and imported back rather than duplicated.
