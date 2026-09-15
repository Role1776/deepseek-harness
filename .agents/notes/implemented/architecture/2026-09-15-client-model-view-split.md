# Agent Note: Client UI model/view split

Status: implemented

English | [中文](2026-09-15-client-model-view-split.zh.md)

## Problem

Every `packages/client/ui-*` feature package mixed state, selectors, actions, formatters, locale dictionaries, and slot declarations with React components in one `src/client/` tree. The native-client plan rewrites each package's views onto React Native, so logic that does not need a browser must be identifiable and reusable before that rewrite starts. A convention that lives only in prose cannot stop a selector from reaching for `document` or a formatter from importing `react-dom`, and neither can a hand-maintained list.

## Decision

A Client UI package keeps framework-free logic under `packages/client/ui-<name>/src/model/`: state, selectors, actions, formatters, locale dictionaries, and slot declarations and types. Model code imports no `react-dom`, references no DOM global (`document`, `window`, `localStorage`, `sessionStorage`, `HTMLElement`, or an `HTML*Element` type), and is never a `.tsx` file. Views stay elsewhere in the package's `src`, conventionally `src/client/`, and may use React and the DOM. Model and view share the package, so moved code keeps its existing tests and public exports; the package's `./client` entrypoint re-exports the same names from their new paths.

`scripts/verify-client-model-purity.ts` enforces the convention. It discovers `packages/client/ui-*/src/model/**/*.{ts,tsx}` with a TypeScript AST walk, so a `document` property access or string literal is not a reference and a renamed `react-dom` import is still caught. Its spec pins the admitted and excluded forms. The scan fails loud when it finds fewer than 40 Client UI packages, because an empty or narrowed glob must not pass by scanning nothing. The gate runs in `pnpm run verify-client-model-purity` and is wired into the CI static and hygiene gate leaves in `scripts/run-gates.ts`.

The pilot split covers three packages:

- `ui-plan` moved `effectivePlanTarget` to `src/model/plan-target.ts` and its locale dictionary to `src/model/locales.ts`.
- `ui-jobs` moved job classification, status markers and words, duration formatting, ordering, and its locale dictionary to `src/model/job-presentation.ts` and `src/model/locales.ts`.
- `ui-goal` moved its activation source, goal command input projection, locale dictionary, and injected-face types to `src/model/`, and extracted the strip's visibility, phase label, pause, and resume selectors into `src/model/goal-presentation.ts`.

### Scope boundary

The gate forbids `react-dom` and DOM globals, not `react` itself: React types and hook-free React imports erase at build and a selector may legitimately depend on a React-typed value. Slot declarations and injected-face interfaces stay in `model` because they are package API types, not components. A model file that needs a React component is wrong by definition; the component belongs in the view.

## Alternatives considered

- **Line-wise regex scanning.** A regex reads `document` inside `obj.document`, a string, or a comment as a reference, and misses a `react-dom` specifier written through a re-export. The `scripts/AGENTS.md` source-ownership rule requires syntax-aware discovery with tests for each boundary form. Rejected.
- **A separate `ui-*-model` package per feature.** It doubles the package count, forces every moved test and internal import onto a cross-package path, and adds build and dependency wiring before the native rewrite proves the split is worth that cost. The `src/model` directory keeps the boundary inside the package that owns the code. Rejected.
- **Forbidding `react` imports in model code too.** A formatter that accepts a React-typed callback would be rejected even though it uses no framework runtime, and the AST walk would need to distinguish type-only and value imports of a package whose presence is not itself the DOM risk. The gate targets `react-dom` and browser globals, which are the actual native-client blockers.

## Consequences

The convention is now enforced, so a `src/model` file that regresses to a DOM global or `react-dom` fails CI. The per-file 100% coverage gate applies to every moved model file, and the pilot moves are covered by their existing package tests. The split is a pilot: the remaining `ui-*` packages still carry mixed `src/client/` trees and must be migrated package by package, after which `src/model` is the reviewable seam for the native rewrite. Because the web client is not required to keep working after the native rewrite, view tests are only removed together with the view they test; moved model tests are never deleted.

Verification: `scripts/verify-client-model-purity.spec.ts` covers the gate's detection boundary, and `packages/client/ui-plan`, `ui-jobs`, and `ui-goal` hold their model and view files at the per-file coverage gate.
