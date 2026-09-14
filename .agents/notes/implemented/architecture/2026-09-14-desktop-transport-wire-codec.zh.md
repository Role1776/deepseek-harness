# Agent Note: Desktop transport wire codec extraction

Status: implemented

[English](2026-09-14-desktop-transport-wire-codec.md) | 中文

## Problem

桌面宿主通过两条成帧字节管道（fd 3 承载请求，fd 4 承载响应）使用协议 v3 通信。宿主的解码器与响应编码器位于 `apps/desktop-host/src/wire.ts`，而 Electron 客户端在 `apps/desktop/src/host-protocol.ts` 中重复了完全相同的帧布局。原生客户端计划的 Phase 0a 需要一个不拥有进程的 TypeScript 客户端来使用该线协议，因此第二份格式副本会成为第二处漂移点。

## Decision

包 `@deepseek-ai/dsh-client-desktop-transport`（`packages/client/desktop-transport`）唯一地拥有该协议。`src/protocol.ts` 承载描述符常量以及帧与 IPC 载荷类型。`src/codec.ts` 承载 `DesktopHostRequestDecoder`、`DesktopHostResponseDecoder`、四个请求编码器与四个响应编码器，基于 `Uint8Array` 与 `DataView`。`src/transport.ts` 承载 `DesktopTransport`，一个基于 `DesktopTransportCarrier` 字节双工、与载体无关的客户端，提供 `request()`（流式 `Response`）与 `openStream()`（NDJSON 远程流）。Node 面（`src/index.ts`）与浏览器及 JS 引擎面（`src/client/index.ts`）导出同一实现。

`apps/desktop-host/src/wire.ts` 现在重新导出共享编解码器，因此宿主与其客户端编码、解码出完全相同的帧。`apps/desktop/src/host-protocol.ts` 保留其 Electron 专用客户端，仅将 `DesktopHostResponseDecoder.push` 放宽为接受 `Uint8Array`。

编解码器基于 `Uint8Array` 而非 `Buffer`，因此浏览器面与运行时环境无关；宿主与 Electron 在各自的管道边界处适配，而 `Buffer` 本身已经是 `Uint8Array`。宿主的 `runDesktopHost` 响应写入器由 `Buffer` 放宽为 `Uint8Array` 以保持一致。

### Integration proof

`tests/integration.host.spec.ts` 通过 fd 3 与 fd 4 以及 IPC 启动真实构建的 `apps/desktop-host`，通过 `healProfilesModuleFallback` 修复临时 profile，并执行一次 `POST /api/session/list` RPC，断言状态码 200 与 `result.ok`。当已构建的宿主依赖图缺失时该用例自行跳过。包的编译器面（`tsconfig.host.json` 与 `tsconfig.client.json`）与 `clientBundle(..., { hostPhase: true })` 在 Host pass 构建 Node 面，在 Client pass 构建浏览器面。

## Alternatives considered

- **将编解码器保留在 `apps/desktop-host` 并复制进包。** 第二份 13 字节头部及其载荷校验副本会静默漂移，原生客户端与 Electron 客户端将产生分歧。已拒绝。
- **把包放在 `packages/util/`，作为没有浏览器面的纯 Node 包。** 原生客户端需要浏览器与 JS 引擎产物，且 `verify-client-packages` 的模式门禁要求 `packages/client` 下的包要么是动态 `dsh.client` 行，要么使用 `staticLinked` 预设。`staticLinked` 会覆盖宿主导入的 Node 产物。已拒绝。
- **在编解码器中保留 `Buffer`。** 原生客户端所针对的浏览器与 Hermes 运行时环境没有 `Buffer`；基于 `Uint8Array` 的编解码器为两个面保留同一实现，而 Node 调用方原样传入 `Buffer`。

## Consequences

线协议现在只有一个所有者，宿主导入它而不是内联自己的副本。Electron 客户端仍携带自己的请求编码器；仅其响应解码器被放宽，因此在原生客户端计划淘汰该应用之前，`apps/desktop` 中既有的重复仍然存在。

`DesktopTransport` 拥有流 id、请求上传、响应解复用与取消，但不拥有载体或子进程；需要进程控制的调用方自行提供并停止它们。请求体是缓冲式的（`Uint8Array` 或字符串）而非流式的；流式上传背压推迟到有消费者需要时再实现。

验证：`tests/codec.host.spec.ts` 与 `tests/transport.host.spec.ts` 使包保持在逐文件 100% 覆盖率门禁之上，`tests/integration.host.spec.ts` 固定真实宿主的往返行为。
