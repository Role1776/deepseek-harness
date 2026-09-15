# Desktop Native (React Native spike)

English | [中文](README.zh.md)

`apps/desktop-native` is the Phase 0 React Native spike for the cross-platform native desktop client planned in [NATIVE_PLAN.md](../../NATIVE_PLAN.md). It is a react-native-macos 0.81.9 / React Native 0.81.6 app that validates four go/no-go points against the real dsh host before the native client work proceeds:

- a window with a dark main pane and a native `NSVisualEffectView` vibrancy sidebar;
- a native module that spawns `apps/desktop-host` and speaks wire v3 over fd 3/4, including one `/api` call and one remote NDJSON stream;
- a JS plugin bundle loaded from disk, evaluated at runtime, and rendered into a slot;
- 5000-line streamed markdown with measured frame timings.

All four points pass on macOS. [PHASE0-RESULTS.md](PHASE0-RESULTS.md) records the evidence, the launch crash fix, and the additive `createResponse` option the transport needed under Hermes; [windows/README.md](windows/README.md) gives the Windows spike plan.
