# agy-compact-button

Antigravity 输入框底栏**一键上下文压缩**扩展，基于 [chuanban-antigravity-theme-patch](https://github.com/Anarcadia/chuanban-antigravity-theme-patch) 的 `user/custom.js` + `user/custom.css` 钩子机制。

## 功能特性

- **底栏一键触发**：在输入框底栏右侧挂载 `压缩` 按钮（悬停提示 `（压缩上下文）`）。
- **自动转换并提交 `/compact`**：自动写入 `/compact`、选中斜杠补全胶囊（兼容 `slashCommand:compact` 与旧版属性）并触发发送，无需手动补选和二次回车。
- **隐藏冗余气泡**：自动隐藏纯 `/compact` 触发的用户消息气泡，保持对话流整洁。
- **运行态生命周期提示**：
  - 点击提交后弹出顶部状态浮窗 `正在压缩上下文…`。
  - 实时追踪生成态按钮（`[data-testid="input-cancel-button"]`）与 `Ctx` 指标变化，避免压缩未完误报超时。
  - 若期间 `Ctx` 下降明显则直接提示压缩前后百分比；若 `Ctx` 需下轮对话刷新，则在运行完成后提示 `上下文压缩已完成（Ctx 指标将在下轮对话刷新）`。
- **热重载安全**：内置 `cleanupAll` 清理钩子，不残留 DOM 和定时器。

## 安装方式

前置条件：已安装并启用 [chuanban-antigravity-theme-patch](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)。

1. 下载本仓库中的 `custom.js` 和 `custom.css`（或 Release 压缩包）。
2. 将两份文件放入 `theme-patch` 的 `user/` 目录：
   - Windows 默认常见路径：`%USERPROFILE%\.gemini\antigravity\theme-patch\user\`
   - 若已启用过其它 `user/custom.js`（例如划词翻译扩展），可将各自 IIFE 代码段与 CSS 样式直接合并进同一份 `custom.js` / `custom.css`。
3. 常驻守护进程通常会在数秒内自动热重载；如未立即生效，可执行：
   ```bash
   node install.mjs verify
   ```

## 说明

- `Ctx` 百分比由 `theme-patch` 读取会话 `gen_metadata` 表生成，`/compact` 在后台生成摘要截断历史后，该指标通常会在下一次对话回包时刷新，本扩展已针对该行为做生命周期适配。
- 本扩展仅作前端 UI 挂载与指令触发，不修改 Antigravity 核心二进制文件。

## License

MIT
