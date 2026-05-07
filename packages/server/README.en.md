English | [简体中文](./README.md)

# @claude-web/server

Wraps the [Claude Code Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) as an HTTP API service, and ships a `claude-web` CLI tool.

## Installation

```bash
npm install -g @claude-web/server
```

## CLI

```
claude-web start [options]
  -p, --port <number>      Port to listen on (default: 8003)
  -H, --hostname <string>  Address to bind (default: 127.0.0.1)
```

Once running:

- Web UI: `http://127.0.0.1:8003`
- Swagger docs: `http://127.0.0.1:8003/docs`

## HTTP API

Base URL: `http://127.0.0.1:8003/api`

---

### Project

| Method | Path                                | Description                                 |
| ------ | ----------------------------------- | ------------------------------------------- |
| GET    | `/project`                          | List all linked projects                    |
| GET    | `/project/:id/session`              | List sessions under a project               |
| GET    | `/project/:id/tree?path=/`          | Get the file directory tree                 |
| GET    | `/project/:id/file?path=/src/a.ts`  | Read a text file (max 1 MB)                 |
| GET    | `/project/:id/file/raw?path=/a.png` | Read a binary file (image/audio, max 20 MB) |

**Project object:**

```json
{
  "id": "a1b2c3d4e5f6a1b2",
  "cwd": "/your/project",
  "sessionCount": 3,
  "updatedAt": 1700000001000
}
```

Project ID is derived from the directory path by replacing path separators with `-` (e.g. `/home/user/proj` → `-home-user-proj`).

**Add a project:**

```bash
curl -X POST 'http://127.0.0.1:8003/api/project/link' \
  -H 'Content-Type: application/json' \
  -d '{"cwd":"/your/project"}'
```

Returns: `{ "ok": true, "id": "-your-project", "cwd": "/your/project" }`

- The directory must exist on the local filesystem
- Idempotent — calling again for an already-linked project does not error
- Newly added projects have `sessionCount: 0`; send a message to start the first session

**Browse local directories (for directory pickers):**

```bash
# List subdirectories of the Home directory
GET /api/fs/dirs

# List subdirectories of a specific path
GET /api/fs/dirs?path=/Users/you/code
```

Returns: `{ "path": "/Users/you/code", "dirs": [{ "name": "myproject", "path": "/Users/you/code/myproject" }, ...] }`

- Only directories are returned, not files
- Hidden directories (starting with `.`) are excluded
- Directories that cannot be read (permission denied) return an empty `dirs` array without erroring

---

### Session

| Method | Path                            | Description                                                           |
| ------ | ------------------------------- | --------------------------------------------------------------------- |
| GET    | `/session/:id`                  | Get session info (title, status, cwd, etc.)                           |
| DELETE | `/session/:id`                  | Delete session (removes .jsonl file and runtime state)                |
| PATCH  | `/session/:id`                  | Rename session, body: `{ "title": string }`                           |
| POST   | `/session/:id/abort`            | Abort a running session                                               |
| GET    | `/session/:id/message`          | Get message history, query: `offset`                                  |
| POST   | `/session/:id/message`          | Send a message (blocking mode)                                        |
| POST   | `/session/:id/message?stream=1` | Send a message (SSE streaming)                                        |
| POST   | `/session/:id/message/resolve`  | Answer AskUserQuestion, body: `{ "answers": { [question]: string } }` |

**Create a new session**: set `:id` to `new` and include `cwd` in the body:

```bash
curl -X POST 'http://127.0.0.1:8003/api/session/new/message' \
  -H 'Content-Type: application/json' \
  -d '{"cwd":"/your/project","prompt":"Hello"}'
```

**Session object:**

```json
{
  "id": "ses_abc123",
  "title": "Preview of the first message...",
  "cwd": "/your/project",
  "status": "idle",
  "lastModified": 1700000001000,
  "gitBranch": "main"
}
```

`status` values: `idle` | `busy`. Sending a message to a busy session returns 409.

---

### Sending Messages

**Request body:**

```json
{
  "prompt": "Hello",
  "cwd": "/your/project",
  "bypassPermissions": true,
  "options": {
    "model": "claude-opus-4-6",
    "maxTurns": 10,
    "systemPrompt": "You are a TypeScript expert",
    "allowedTools": ["Read", "Write", "Bash"],
    "maxBudgetUsd": 0.5,
    "effort": "high",
    "additionalDirectories": ["/shared/libs"],
    "env": { "NODE_ENV": "development" },
    "thinking": { "type": "enabled", "budget_tokens": 8000 }
  }
}
```

Or use structured `content` blocks (supports text + images):

```json
{
  "content": [
    { "type": "text", "text": "What's in this image?" },
    { "type": "image", "media_type": "image/png", "data": "<base64>" }
  ]
}
```

**`options` field reference:**

| Field                   | Type                                         | Description                                                        |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `model`                 | `string`                                     | Model to use (e.g. `claude-opus-4-6`, `claude-haiku-4-5-20251001`) |
| `maxTurns`              | `number`                                     | Maximum agent turns, prevents infinite loops                       |
| `systemPrompt`          | `string`                                     | Append a custom system prompt                                      |
| `allowedTools`          | `string[]`                                   | Override the default tool whitelist                                |
| `maxBudgetUsd`          | `number`                                     | Maximum spend per call (USD)                                       |
| `effort`                | `'low'｜'medium'｜'high'｜'xhigh'｜'max'`    | Trade off response quality vs. speed                               |
| `additionalDirectories` | `string[]`                                   | Extra directories the agent may access beyond cwd                  |
| `env`                   | `Record<string, string>`                     | Environment variables injected into the agent process              |
| `thinking`              | `{ type: 'enabled', budget_tokens: number }` | Enable extended thinking mode                                      |

> **Note**: Security-sensitive fields (`permissionMode`, `abortController`) are fixed server-side and cannot be overridden via `options`.

**Blocking mode** — waits for the agent to finish and returns everything at once:

```bash
# Step 1: create a session and send the first message
curl -X POST 'http://127.0.0.1:8003/api/session/new/message' \
  -H 'Content-Type: application/json' \
  -d '{"cwd":"/your/project","prompt":"List the files in the current directory"}'

# Step 2: continue the conversation (use the returned sessionId)
curl -X POST 'http://127.0.0.1:8003/api/session/<sessionId>/message' \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Explain package.json"}'
```

**SSE streaming mode** — add `Accept: text/event-stream` or `?stream=1` to receive events as they happen:

```bash
curl -X POST 'http://127.0.0.1:8003/api/session/<sessionId>/message?stream=1' \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Write me a README"}'
```

**SSE event types:**

| Event      | data shape                                                | Description                                               |
| ---------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `message`  | `{ type, uuid, session_id, message, parent_tool_use_id }` | Raw SDK message (text / tool call / tool result)          |
| `done`     | `{ sessionId, cost, tokens }`                             | Agent finished; includes cost and token usage breakdown   |
| `error`    | `{ message: string }`                                     | Execution error or aborted                                |
| `ask_user` | `{ questions: [...] }`                                    | Agent triggered AskUserQuestion; waiting for client reply |

**Handling `ask_user`:** after receiving the event, POST the answer so the agent can continue:

```bash
curl -X POST 'http://127.0.0.1:8003/api/session/<sessionId>/message/resolve' \
  -H 'Content-Type: application/json' \
  -d '{"answers":{"Confirm operation?":"yes"}}'
```

---

### Terminal

```
WebSocket  /api/terminal?cwd=/your/project
```

Connecting opens a full interactive PTY terminal.

- **Server → client**: terminal output (string)
- **Client → server**: input string, or JSON `{ "type": "resize", "cols": 120, "rows": 30 }` to resize

---

## Data Storage

Session data uses Claude CLI's native `~/.claude/projects/` directory (JSONL format), fully shared with the CLI:

```
~/.claude/projects/
└── -your-project-path/
    ├── <sessionId>.jsonl   # one file per session, one message per line
    └── ...
```

Runtime state (status, abort controller) is in-memory only and resets to `idle` on server restart.

---

## Requirements

- Node.js >= 20
- Claude Code CLI installed and logged in (`claude` command available)

## License

MIT
