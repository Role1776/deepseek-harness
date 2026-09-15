# Agent Note: Client UI model/view split

Status: implemented

[English](2026-09-15-client-model-view-split.md) | 中文

## Problem

每个 `packages/client/ui-*` 功能包都把状态、选择器、动作、格式化器、语言字典与插槽声明和 React 组件混在同一棵 `src/client/` 树中。原生客户端计划会把每个包的视图改写为 React Native，因此不需要浏览器的逻辑必须在改写开始前可辨识、可复用。仅存在于文字中的约定无法阻止选择器去访问 `document`，也无法阻止格式化器导入 `react-dom`，手工维护的清单同样做不到。

## Decision

Client UI 包将无框架依赖的逻辑放在 `packages/client/ui-<name>/src/model/` 下：状态、选择器、动作、格式化器、语言字典，以及插槽声明与类型。模型代码不导入 `react-dom`，不引用任何 DOM 全局（`document`、`window`、`localStorage`、`sessionStorage`、`HTMLElement` 或 `HTML*Element` 类型），且永远不是 `.tsx` 文件。视图留在包的 `src` 其他位置，约定为 `src/client/`，可以使用 React 与 DOM。模型与视图共享同一个包，因此迁移的代码保留其既有测试与公开导出；包的 `./client` 入口从新路径重新导出相同名称。

`scripts/verify-client-model-purity.ts` 执行该约定。它通过 TypeScript AST 遍历发现 `packages/client/ui-*/src/model/**/*.{ts,tsx}`，因此 `document` 的属性访问或字符串字面量不算引用，改名的 `react-dom` 导入仍会被捕获。其 spec 固定了被接受与被排除的形式。当发现的 Client UI 包少于 40 个时扫描会显式失败，因为空的或被缩窄的 glob 绝不能因未扫描任何内容而通过。该门禁由 `pnpm run verify-client-model-purity` 运行，并接入 `scripts/run-gates.ts` 中的 CI 静态与 hygiene 门禁叶子。

试点拆分覆盖三个包：

- `ui-plan` 将 `effectivePlanTarget` 移到 `src/model/plan-target.ts`，语言字典移到 `src/model/locales.ts`。
- `ui-jobs` 将任务分类、状态标记与文字、时长格式化、排序以及语言字典移到 `src/model/job-presentation.ts` 与 `src/model/locales.ts`。
- `ui-goal` 将激活源、目标命令输入投影、语言字典与注入面类型移到 `src/model/`，并把条带的可见性、阶段标签、暂停与恢复选择器抽取到 `src/model/goal-presentation.ts`。

### Scope boundary

门禁禁止 `react-dom` 与 DOM 全局，而非 `react` 本身：React 类型与无 hook 的 React 导入会在构建时擦除，选择器也可以合法依赖 React 类型的值。插槽声明与注入面接口留在 `model`，因为它们是包 API 类型而非组件。需要 React 组件的模型文件从定义上就是错误的；组件属于视图。

## Alternatives considered

- **逐行正则扫描。** 正则会把 `obj.document`、字符串或注释中的 `document` 读作引用，并会漏掉通过重新导出书写的 `react-dom` 说明符。`scripts/AGENTS.md` 的源码归属规则要求语法感知的发现方式，并为每种边界形式编写测试。已拒绝。
- **为每个功能单独建 `ui-*-model` 包。** 这会使包数量翻倍，迫使每个迁移的测试与内部导入走跨包路径，并在原生改写证明该拆分值得之前就增加构建与依赖接线。`src/model` 目录把边界保留在拥有该代码的包内。已拒绝。
- **同时禁止模型代码导入 `react`。** 接受 React 类型回调的格式化器即使不使用任何框架运行时也会被拒绝，而且 AST 遍历还必须区分某个包的仅类型导入与值导入，而该包的存在本身并非 DOM 风险。门禁针对 `react-dom` 与浏览器全局，它们是原生客户端真正的阻碍。

## Consequences

该约定现在被强制执行，因此某个 `src/model` 文件若回退到 DOM 全局或 `react-dom` 会导致 CI 失败。逐文件 100% 覆盖率门禁适用于每个迁移的模型文件，试点迁移由各包既有测试覆盖。该拆分是试点：其余 `ui-*` 包仍携带混合的 `src/client/` 树，必须逐包迁移；完成之后 `src/model` 才是原生改写的可评审接缝。由于原生改写后不要求 Web 客户端继续工作，视图测试只在其所测视图一并移除时删除；迁移的模型测试绝不删除。

验证：`scripts/verify-client-model-purity.spec.ts` 覆盖门禁的检测边界，`packages/client/ui-plan`、`ui-jobs` 与 `ui-goal` 将其模型与视图文件保持在逐文件覆盖率门禁之上。
