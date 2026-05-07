English | [简体中文](./README.md)

# @claude-web/ui

The web frontend for Claude Code, built with React + Ant Design. Requires [@claude-web/server](https://www.npmjs.com/package/@claude-web/server).

## Features

### Project Management

The home page lists all linked Claude projects, showing the project path, session count, and last-updated time. Click any project to enter its session view.

### Multi-session Conversations

- Each project supports multiple independent sessions; the left panel lists all history
- Messages stream in real time via SSE, with tool calls visualized (file reads/writes, shell commands, etc.)
- AskUserQuestion support: when the agent needs input, a prompt appears and execution resumes after you answer
- Sessions can be renamed and deleted

### Rich Input

- `@` triggers file completion; selecting a file injects its content as context
- `/` triggers preset slash command completion
- Paste images directly (`Ctrl+V` / `Cmd+V`) — PNG / JPEG / WebP are sent as base64 (multimodal)
- `Shift+Enter` to insert a newline, `Enter` to send

### Diff Preview

File-write tool calls automatically display a diff view, making Claude's edits easy to review at a glance.

### File Viewer

The right panel has a built-in file viewer supporting:

- Syntax-highlighted code (Shiki, covers all major languages)
- Image preview (PNG / JPEG / GIF / WebP / SVG, etc.)
- Audio playback (MP3 / WAV / OGG, etc.)

### Interactive Terminal

The right panel can be switched to a terminal — powered by xterm.js connected directly to the server's PTY for full interactive shell access.

---

## Local Development

Make sure `@claude-web/server` is running locally (default `http://127.0.0.1:8003`), then:

```bash
# Install dependencies from the repo root
pnpm install

# Start the frontend dev server
pnpm dev:web
```

Open the address printed by Vite (usually `http://localhost:5173`). In dev mode, `/api` requests are proxied automatically to `http://127.0.0.1:8003`.

To point at a different server:

```bash
VITE_API_URL=http://your-server:8003 pnpm dev:web
```

## Build

```bash
pnpm build
```

Output lands in `dist/`. Running `pnpm build` from the repo root automatically copies the output to `packages/server/public/`, where Fastify serves it as static files.

## Tech Stack

- [React 19](https://react.dev)
- [Ant Design 5](https://ant.design)
- [react-router-dom v7](https://reactrouter.com)
- [xterm.js](https://xtermjs.org) — terminal
- [Shiki](https://shiki.style) — syntax highlighting
- [react-mentions](https://github.com/signavio/react-mentions) — @file references

## License

MIT
