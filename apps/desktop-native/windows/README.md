# RN Windows — Phase 0 note (not built here)

Windows is out of scope for this macOS spike session; this directory is a
placeholder so the app layout already reserves the platform.

To run the same go/no-go on a Windows machine:

1. `npx react-native-windows-init --overwrite` (react-native-windows 0.81.x,
   matching react-native 0.81.6) creates `windows/`.
2. Build/run with `npx react-native run-windows`.
3. Re-check the four Phase 0 points there:
   - window + dark theme; sidebar material (Mica/`SystemBackdrop` instead of
     NSVisualEffectView — the RN Windows equivalent is not the same API);
   - native module that spawns `apps/desktop-host` with fd 3/4 (Windows has no
     fd inheritance for arbitrary numbers; use named pipes plus the same wire
     v3 frames) and one `/api` call plus one remote stream;
   - runtime JS bundle loading from disk (Hermes eval);
   - 5000-line streaming markdown timing.
4. Windows autolinking/`windows/` project must be generated on Windows; it is
   not committed from macOS.
