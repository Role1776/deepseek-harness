# RN Windows — Phase 0 备注（尚未在此构建）

[English](README.md) | 中文

Windows 不在本次 macOS spike 的范围内；此目录是占位，使应用布局预先保留该平台。

要在 Windows 机器上运行同一套 go/no-go：

1. `npx react-native-windows-init --overwrite`（react-native-windows 0.81.x，匹配 react-native 0.81.6）创建 `windows/`。
2. 使用 `npx react-native run-windows` 构建／运行。
3. 在那里重新核对四个 Phase 0 要点：
   - 窗口与暗色主题；侧边栏材质（用 Mica／`SystemBackdrop` 代替 NSVisualEffectView——RN Windows 的对应 API 不同）；
   - 原生模块以 fd 3/4 启动 `apps/desktop-host`（Windows 没有任意编号的 fd 继承；改用命名管道加相同的 wire v3 帧），并进行一次 `/api` 调用与一个远程流；
   - 从磁盘加载运行时 JS bundle（Hermes eval）；
   - 5000 行流式 markdown 计时。
4. Windows autolinking／`windows/` 工程必须在 Windows 上生成；不从 macOS 提交。
