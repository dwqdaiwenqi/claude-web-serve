English | [简体中文](./README.md)

# Claude Web

Wraps the [Claude Code Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) as a **REST/SSE HTTP service** with a built-in Web UI.

**Any language, any platform** can drive Claude Code over HTTP — no SDK knowledge required.

> **Prerequisite**: Claude Code CLI must be installed and logged in (`claude` command available)

<image src="./preview1.gif" style="margin:0 auto;width:900px;"/>

---

## Why Claude Web?

```
Your code / scripts / workflows
        │  HTTP / SSE
        ▼
  claude-web server          ← this project
        │
        ▼
 Claude Code Agent SDK
        │
        ▼
     Claude API
```

- **API-first**: exposes a clean REST + SSE interface — call it from curl, Python, Node, or any HTTP client
- **Zero database**: reuses Claude CLI's native JSONL format, no extra infrastructure needed
- **UI included**: same process serves both the API and a visual interface, trivial to deploy
- **Streaming output**: SSE pushes Claude's reasoning and tool calls in real time

---

## Use Cases

### Case 1 — Call Claude Code from any language

Don't know TypeScript? No problem. Use curl or Python:

```bash
# Start a session and ask Claude to analyze your code
curl -X POST 'http://127.0.0.1:8003/api/session/new/message' \
  -H 'Content-Type: application/json' \
  -d '{"cwd":"/your/project","prompt":"Find all potential memory leaks in this project"}'
```

```python
# Python example
import requests

resp = requests.post("http://127.0.0.1:8003/api/session/new/message", json={
    "cwd": "/your/project",
    "prompt": "Write full unit test coverage for src/utils.py"
})
print(resp.json()["messages"][-1])
```

### Case 2 — Plug into n8n / Dify / any AI workflow platform

claude-web exposes a standard HTTP API, so it works as an HTTP Request node in n8n or a custom tool backend in Dify:

- Automated Code Review (PR triggers → Claude reviews → comment posted back)
- Scheduled audits (daily security scan across your repos)
- Parallel multi-project processing

### Case 3 — Shared Claude Code instance for a team

Run one claude-web server; team members hit the HTTP API or Web UI without each person needing a local Claude CLI setup.

---

## Quick Start

**1. Install**

```bash
npm install -g @claude-web/server
```

**2. Start the server**

```bash
claude-web start

→ server: http://127.0.0.1:8003
→ docs:   http://127.0.0.1:8003/docs
```

**3. Open the Web UI**

Visit http://127.0.0.1:8003 — the home page lists all linked projects.

<img src="./image.png" style="margin:0 auto;width:700px;"/>

Click a project to open the session view:

<img src="./image-1.png" style="margin:0 auto;width:700px;"/>

---

## REST API

Full docs: Swagger → http://127.0.0.1:8003/docs

<img src="./image-2.png" style="margin:0 auto;width:700px;"/>

### Core endpoints

```bash
# List all projects
GET  /api/project

# Create a new session and send the first message (pass cwd to auto-create)
POST /api/session/new/message
  body: { "cwd": "/path/to/project", "prompt": "..." }

# Continue an existing session (blocking)
POST /api/session/:sessionId/message
  body: { "prompt": "..." }

# Continue an existing session (SSE streaming)
POST /api/session/:sessionId/message
  headers: Accept: text/event-stream
  body: { "prompt": "..." }
```

SSE event types: `part` (incremental content) / `done` (finished + stats) / `error` / `ask_user` (tool interaction)

---

## Web UI Features

#### Rich text input

<image src="./preview3.gif" style="margin:0 auto;width:900px;"/>

| Feature | Description |
| --- | --- |
| `@` file reference | Type `@` to search and reference any project file; path is injected into the prompt automatically |
| `/` slash commands | `/init` generates CLAUDE.md, `/cost` shows token usage, `/clear` resets the session |
| Image paste | `Ctrl+V` / `Cmd+V` pastes screenshots directly; auto-converted to base64 (multimodal) |
| `Shift+Enter` | Insert a newline without submitting |

#### Built-in terminal

Interactive terminal attached to the project directory — no window switching needed.

---

## Detailed Docs

- [packages/server/README.md](./packages/server/README.md) — REST API service
- [packages/web/README.md](./packages/web/README.md) — Web UI

## License

MIT
