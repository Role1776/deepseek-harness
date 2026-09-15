# 桌面原生客户端（React Native spike）

[English](README.md) | 中文

`apps/desktop-native` 是跨平台原生桌面客户端（见 [NATIVE_PLAN.md](../../NATIVE_PLAN.md)）的 Phase 0 React Native spike。它是一个 react-native-macos 0.81.9 / React Native 0.81.6 应用，在原生客户端工作推进前，针对真实 dsh 宿主验证四个 go/no-go 点：

- 暗色主面板窗口，以及原生 `NSVisualEffectView` 毛玻璃侧边栏；
- 原生模块启动 `apps/desktop-host`，通过 fd 3/4 使用 wire v3 通信，包括一次 `/api` 调用与一个远程 NDJSON 流；
- 从磁盘加载的 JS 插件 bundle 在运行时求值，并渲染进一个 slot；
- 5000 行流式 markdown，并测量帧时序。

四个点均在 macOS 上通过。[PHASE0-RESULTS.md](PHASE0-RESULTS.md) 记录证据、启动崩溃修复，以及传输在 Hermes 下所需的增量 `createResponse` 选项；[windows/README.zh.md](windows/README.zh.md) 给出 Windows spike 计划。
