---
description: "用于桌面宿主 wire v3 的与载体无关的 TypeScript 客户端：共享帧编解码器、请求/响应流式传输，以及在调用方提供的字节双工之上的 NDJSON 远程流。"
kind: "package-reference"
---
# @deepseek-ai/dsh-client-desktop-transport

[English](README.md) | 中文

## 概述

当 Electron 外壳以外的进程需要说桌面宿主 wire 协议时，使用此包。[桌面宿主](../../../apps/desktop/README.zh.md)不暴露网络端口；它通过两个子描述符以成帧字节承载请求与响应（fd 3 承载请求，fd 4 承载响应），并将生命周期消息保留在 Node IPC 上。此包唯一地拥有该线上格式：`DesktopHostRequestDecoder` 与各响应编码器服务宿主，而导出的编码器、`DesktopHostResponseDecoder` 与 `DesktopTransport` 服务任意客户端。`DesktopTransport` 接收字节双工而非进程，因此同一客户端可运行在子进程管道、套接字或内存测试载体之上。

## 目录

- [Use this package](#use-this-package)
  - [Talk to a host](#talk-to-a-host)
  - [Stream a remote endpoint](#stream-a-remote-endpoint)
- [Understand the implementation](#understand-the-implementation)
  - [Frame format](#frame-format)
  - [Failures](#failures)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

<a id="talk-to-a-host"></a>
### Talk to a host

提供一个 `DesktopTransportCarrier`：`write` 接收一个已编码帧，`onBytes` 投递响应字节，`onClose` 报告终止完成。随后调用 `request({ url, method, headers, body })`；它一旦收到响应元数据即解析，并通过返回的 `Response` 流式传输响应体。无请求体的请求只编码 `start`；缓冲请求体按 `DESKTOP_PIPE_CHUNK_BYTES` 分块。

<a id="stream-a-remote-endpoint"></a>
### Stream a remote endpoint

`openStream(endpoint, payload, signal)` 将 `{ endpoint, payload }` POST 到 `DESKTOP_STREAM_PATH`，随后每行 NDJSON 产出一个已解析的 JSON 值，包括结尾没有换行的最后一行。取消该信号会取消底层请求。

<a id="understand-the-implementation"></a>
## Understand the implementation

<a id="frame-format"></a>
### Frame format

每一帧是 13 字节头部——大端魔数 `0x44534833`、一个类型字节、一个 1..2^32-1 的流 id，以及载荷长度——后接原始载荷。start 与 error 载荷是 UTF-8 JSON；data 载荷是受 `DESKTOP_PIPE_CHUNK_BYTES` 限制的原始请求体字节，而控制载荷限制为 1 MiB。

<a id="failures"></a>
### Failures

各解码器校验标记、流 id、载荷边界以及 JSON 控制载荷字段，并拒绝帧内 EOF。宿主的 `error` 响应帧会拒绝挂起的请求；载体关闭或 `dispose()` 会拒绝所有挂起请求并拒绝后续请求。

<a id="model-experience"></a>
## Model Experience

None，因为此包在进程之间搬运字节，不注册任何面向模型的内容。

#### KV Cache effect

None；此包不组装模型请求。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **仅支持缓冲请求体。** `request()` 接受 `Uint8Array` 或字符串体并对其分块；流式上传背压推迟到原生客户端需要时再实现。
- **不拥有传输进程生命周期。** 载体与任何子进程由调用方拥有；此包既不启动也不停止宿主。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作上下文——点击展开</summary>

None。

</details>

**Runtime invariant:** No companion is published. 帧编解码器与传输不拥有任何独立观测可能产生分歧的关系；单元与集成测试固定其行为。
