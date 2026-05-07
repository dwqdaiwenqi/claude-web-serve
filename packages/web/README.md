[English](./README.en.md) | 简体中文

# @claude-web/ui

Claude Code 的 Web 前端，基于 React + Ant Design 构建。需配合 [@claude-web/server](https://www.npmjs.com/package/@claude-web/server) 使用。

## 功能

### 项目管理

首页展示所有已有的 Claude 项目，显示项目路径、会话数量与最近更新时间，点击进入项目会话页。

### 多会话对话

- 每个项目可创建多个独立会话，左侧面板列出所有历史会话
- 消息实时流式输出（SSE），支持工具调用过程可视化（文件读写、命令执行等）
- 支持 AskUserQuestion 交互：Agent 需要确认时，页面弹出问题等待回答后继续执行
- 会话支持重命名与删除

### 输入框

- `@` 触发文件补全，选中后将文件内容作为上下文一并发送
- `/` 触发预设命令补全
- 支持直接粘贴图片（PNG / JPEG / WebP），以 base64 格式发送给 Claude
- `Shift+Enter` 换行，`Enter` 发送

### Diff 预览

工具调用中的文件写入操作会自动展示 diff 视图，直观呈现 Claude 对文件的修改内容。

### 文件查看器

右侧面板内置文件查看器，支持：

- 代码语法高亮（基于 Shiki，覆盖主流语言）
- 图片预览（PNG / JPEG / GIF / WebP / SVG 等）
- 音频播放（MP3 / WAV / OGG 等）

### 交互式终端

右侧面板可切换为终端，基于 xterm.js 直连服务端 PTY，支持完整的交互式 Shell 操作。

---

## 本地开发

确保 `@claude-web/server` 已在本地启动（默认 `http://127.0.0.1:8003`），然后：

```bash
# 在项目根目录安装依赖
pnpm install

# 启动前端开发服务器
pnpm dev:web
```

访问 Vite 输出的本地地址（通常为 `http://localhost:5173`）。开发模式下 `/api` 请求自动代理到 `http://127.0.0.1:8003`。

如需指定不同的服务端地址：

```bash
VITE_API_URL=http://your-server:8003 pnpm dev:web
```

## 构建

```bash
pnpm build
```

产物在 `dist/` 目录。执行根目录的 `pnpm build` 会自动将产物复制到 `packages/server/public/`，由 Fastify 静态服务托管。

## 技术栈

- [React 19](https://react.dev)
- [Ant Design 5](https://ant.design)
- [react-router-dom v7](https://reactrouter.com)
- [xterm.js](https://xtermjs.org) — 终端
- [Shiki](https://shiki.style) — 语法高亮
- [react-mentions](https://github.com/signavio/react-mentions) — @文件引用

## License

MIT
