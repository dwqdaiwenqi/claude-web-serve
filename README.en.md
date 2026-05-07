English | [简体中文](./README.md)

# Claude Web

[![License](https://img.shields.io/github/license/dwqdaiwenqi/claude-code-web)](https://github.com/dwqdaiwenqi/claude-code-web/blob/main/LICENSE)
<img src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white" alt="Node.js 20+">
<img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
<img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19">

Wraps the [Claude Code Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) as a **REST/SSE HTTP service** with a built-in Web UI.

**Any language, any platform** can drive Claude Code over HTTP — no SDK knowledge required.

> **Prerequisite**: Claude Code CLI must be installed and logged in (`claude` command available)

<image src="./docs/preview1.gif" style="margin:0 auto;width:900px;"/>

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

## Call Claude Code from any language

### Blocking mode

Waits for the Agent to finish and returns all messages at once.

**curl**

```bash
curl -X POST http://127.0.0.1:8003/api/session/new/message \
  -H "Content-Type: application/json" \
  -d '{"cwd": "/your/project", "prompt": "Analyze the project architecture"}'
```

**Response shape**

```js
{
  "sessionId": "xxxxxxxx",
  "messages": [
    { "type": "assistant", "message": {} },
    { "type": "assistant", "message": {} },
    { "type": "user", "message": {} }
    // ...
  ],
  "tokens": { "input": 100, "output": 200, "cache": { "read": 0, "write": 0 } }
}
```

**Python**

```python
import requests

resp = requests.post("http://127.0.0.1:8003/api/session/new/message", json={
    "cwd": "/your/project",
    "prompt": "Analyze the project architecture",
})
print(resp.json()["messages"][-1])
```

**Node.js**

```js
const res = await fetch('http://127.0.0.1:8003/api/session/new/message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ cwd: '/your/project', prompt: 'Analyze the project architecture' }),
}).then((r) => r.json())

console.log(res.messages)
```

---

### Non-blocking mode (SSE)

Add `?stream=1` or the `Accept: text/event-stream` header — messages are pushed one by one as they are produced.

**curl**

```bash
curl -N -X POST "http://127.0.0.1:8003/api/session/new/message?stream=1" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"cwd": "/your/project", "prompt": "Analyze the project architecture"}'
```

**Event stream**

```
event: message
data: {"type":"assistant","message":{...}}

event: message
data: {"type":"user","message":{...}}

// ...

event: done
data: {"sessionId":"xxx","cost":0.001,"tokens":{...}}
```

- `message` events: pushed each time the agent produces a message or tool result — fires multiple times
- `done` event: sent once when the agent finishes, carries `sessionId` and cost info; connection closes after

**Node.js** (using [eventsource-parser](https://github.com/rexxars/eventsource-parser))

```js
import { createParser } from 'eventsource-parser'

const response = await fetch('http://127.0.0.1:8003/api/session/new/message?stream=1', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  },
  body: JSON.stringify({ cwd: '/your/project', prompt: 'Analyze the project architecture' }),
})

const parser = createParser({
  onEvent(ev) {
    const payload = JSON.parse(ev.data)
    if (ev.event === 'message') {
      const blocks = payload.message?.content ?? []
      for (const block of blocks) {
        if (block.type === 'text') process.stdout.write(block.text)
      }
    }
    if (ev.event === 'done') {
      console.log('\n[done]', `sessionId=${payload.sessionId}`, `cost=$${payload.cost?.toFixed(5)}`)
    }
  },
})

const reader = response.body.getReader()
const decoder = new TextDecoder()
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  parser.feed(decoder.decode(value, { stream: true }))
}
```

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

<img src="./docs/image.png" style="margin:0 auto;width:900px;"/>

Click a project to open the session view:

<img src="./docs/image-1.png" style="margin:0 auto;width:900px;"/>

<img src="./docs/diff.png" style="margin:0 auto;width:900px;"/>

---

## Web UI Features

#### Rich text input

<image src="./docs/preview3.gif" style="margin:0 auto;width:900px;"/>

| Feature            | Description                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `@` file reference | Type `@` to search and reference any project file; path is injected into the prompt automatically |
| `/` slash commands | `/init` generates CLAUDE.md, `/cost` shows token usage, `/clear` resets the session               |
| Image paste        | `Ctrl+V` / `Cmd+V` pastes screenshots directly; auto-converted to base64 (multimodal)             |
| `Shift+Enter`      | Insert a newline without submitting                                                               |

#### Built-in terminal

Interactive terminal attached to the project directory — no window switching needed.

## REST API

Full docs: Swagger → http://127.0.0.1:8003/docs

<img src="./docs/image-2.png" style="margin:0 auto;width:900px;"/>

---

## Detailed Docs

- [packages/server/README.md](./packages/server/README.md) — REST API service
- [packages/web/README.md](./packages/web/README.md) — Web UI

## License

MIT
