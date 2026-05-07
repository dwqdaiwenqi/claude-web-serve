[English](./README.en.md) | 简体中文

# @claude-web/server

将 [Claude Code Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) 封装为 HTTP API 服务，同时提供 `claude-web` CLI 工具。

## 安装

```bash
npm install -g @claude-web/server
```

## CLI 命令

```
claude-web start [options]
  -p, --port <number>      监听端口（默认：8003）
  -H, --hostname <string>  绑定地址（默认：127.0.0.1）
```

启动后：

- Web UI：`http://127.0.0.1:8003`
- Swagger 文档：`http://127.0.0.1:8003/docs`

## HTTP API

Base URL：`http://127.0.0.1:8003/api`

---

### Project

| 方法 | 路径                                | 说明                                      |
| ---- | ----------------------------------- | ----------------------------------------- |
| GET  | `/project`                          | 列出所有已关联的项目                      |
| POST | `/project/link`                     | 添加项目，body: `{ "cwd": string }`       |
| GET  | `/project/:id/session`              | 获取项目下的会话列表                      |
| GET  | `/project/:id/tree?path=/`          | 获取文件目录树                            |
| GET  | `/project/:id/file?path=/src/a.ts`  | 读取文本文件内容（最大 1 MB）             |
| GET  | `/project/:id/file/raw?path=/a.png` | 读取二进制文件（图片 / 音频，最大 20 MB） |
| GET  | `/fs/dirs?path=/your/dir`           | 浏览本机目录（默认返回 Home 目录）        |

**Project 对象：**

```json
{
  "id": "a1b2c3d4e5f6a1b2",
  "cwd": "/your/project",
  "sessionCount": 3,
  "updatedAt": 1700000001000
}
```

Project ID 由目录路径推导，将路径分隔符替换为 `-`（如 `/home/user/proj` → `-home-user-proj`）。

**添加项目：**

```bash
curl -X POST 'http://127.0.0.1:8003/api/project/link' \
  -H 'Content-Type: application/json' \
  -d '{"cwd":"/your/project"}'
```

返回：`{ "ok": true, "id": "-your-project", "cwd": "/your/project" }`

- 目录必须存在于本机文件系统
- 若该项目已存在（`~/.claude/projects/` 下已有对应目录）则幂等，不会报错
- 新添加的项目 `sessionCount` 为 0，可直接发消息开始新会话

**浏览本机目录（用于目录选择器）：**

```bash
# 返回 Home 目录下的子目录
GET /api/fs/dirs

# 返回指定路径下的子目录
GET /api/fs/dirs?path=/Users/you/code
```

返回：`{ "path": "/Users/you/code", "dirs": [{ "name": "myproject", "path": "/Users/you/code/myproject" }, ...] }`

- 只返回目录，不含文件
- 以 `.` 开头的隐藏目录不返回
- 无权限访问的目录返回空 `dirs` 数组（不报错）

---

### Session

| 方法   | 路径                            | 说明                                                                |
| ------ | ------------------------------- | ------------------------------------------------------------------- |
| GET    | `/session/:id`                  | 获取会话信息（标题、状态、cwd 等）                                  |
| DELETE | `/session/:id`                  | 删除会话（清理 .jsonl 文件与运行时状态）                            |
| PATCH  | `/session/:id`                  | 重命名会话，body: `{ "title": string }`                             |
| POST   | `/session/:id/abort`            | 中止正在运行的会话                                                  |
| GET    | `/session/:id/message`          | 获取消息历史，query: `offset`                                       |
| POST   | `/session/:id/message`          | 发送消息（阻塞模式）                                                |
| POST   | `/session/:id/message?stream=1` | 发送消息（SSE 流式）                                                |
| POST   | `/session/:id/message/resolve`  | 回答 AskUserQuestion，body: `{ "answers": { [question]: string } }` |

**新建会话**：将 `:id` 设为 `new`，并在 body 中传入 `cwd`：

```bash
curl -X POST 'http://127.0.0.1:8003/api/session/new/message' \
  -H 'Content-Type: application/json' \
  -d '{"cwd":"/your/project","prompt":"你好"}'
```

**Session 对象：**

```json
{
  "id": "ses_abc123",
  "title": "第一条消息的预览...",
  "cwd": "/your/project",
  "status": "idle",
  "lastModified": 1700000001000,
  "gitBranch": "main"
}
```

`status` 取值：`idle`（空闲）| `busy`（处理中）。向 busy 的会话发送消息会返回 409。

---

### 发送消息

**请求 body：**

```json
{
  "prompt": "你好",
  "cwd": "/your/project",
  "bypassPermissions": true,
  "options": {
    "model": "claude-opus-4-6",
    "maxTurns": 10,
    "systemPrompt": "你是一个 TypeScript 专家",
    "allowedTools": ["Read", "Write", "Bash"],
    "maxBudgetUsd": 0.5,
    "effort": "high",
    "additionalDirectories": ["/shared/libs"],
    "env": { "NODE_ENV": "development" },
    "thinking": { "type": "enabled", "budget_tokens": 8000 }
  }
}
```

或者使用结构化 `content` 块（支持文本 + 图片）：

```json
{
  "content": [
    { "type": "text", "text": "这张图里有什么？" },
    { "type": "image", "mediaType": "image/png", "data": "<base64>" }
  ]
}
```

**`options` 字段说明：**

| 字段                    | 类型                                         | 说明                                                          |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `model`                 | `string`                                     | 指定模型（如 `claude-opus-4-6`、`claude-haiku-4-5-20251001`） |
| `maxTurns`              | `number`                                     | 限制 agent 最大轮次，防止无限循环                             |
| `systemPrompt`          | `string`                                     | 追加自定义 system prompt                                      |
| `allowedTools`          | `string[]`                                   | 覆盖默认工具白名单                                            |
| `maxBudgetUsd`          | `number`                                     | 限制单次最大花费（美元）                                      |
| `effort`                | `'low'｜'medium'｜'high'｜'xhigh'｜'max'`    | 控制响应质量 vs 速度                                          |
| `additionalDirectories` | `string[]`                                   | 允许 agent 访问的额外目录（项目目录之外）                     |
| `env`                   | `Record<string, string>`                     | 注入到 agent 进程的环境变量                                   |
| `thinking`              | `{ type: 'enabled', budget_tokens: number }` | 开启扩展思考模式                                              |

> **注**：安全相关字段（`permissionMode`、`abortController`）由服务端固定，不会被 `options` 覆盖。

**阻塞模式** — 等待 Agent 完成后一次性返回：

```bash
# 第一步：新建会话并发消息
curl -X POST 'http://127.0.0.1:8003/api/session/new/message' \
  -H 'Content-Type: application/json' \
  -d '{"cwd":"/your/project","prompt":"列出当前目录的文件"}'

# 第二步：继续对话（使用返回的 sessionId）
curl -X POST 'http://127.0.0.1:8003/api/session/<sessionId>/message' \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"请解释一下 package.json"}'
```

返回结构：

```json
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

**SSE 流式模式** — 加 `Accept: text/event-stream` 头或 `?stream=1`，消息实时逐条推送：

```bash
curl -N -X POST 'http://127.0.0.1:8003/api/session/<sessionId>/message?stream=1' \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"prompt":"帮我写一个 README"}'
```

**返回数据流**

```
event: message
data: {"type":"assistant","message":{...}}

event: message
data: {"type":"user","message":{...}}

// ...

event: done
data: {"sessionId":"xxx","cost":0.001,"tokens":{...}}
```

**SSE 事件类型：**

| 事件       | data 格式                                                 | 说明                                                 |
| ---------- | --------------------------------------------------------- | ---------------------------------------------------- |
| `message`  | `{ type, uuid, session_id, message, parent_tool_use_id }` | SDK 原始消息（文本 / 工具调用 / 工具结果），会来多次 |
| `done`     | `{ sessionId, cost, tokens }`                             | Agent 完成，含费用与 token 用量，只来一次            |
| `error`    | `{ message: string }`                                     | 执行出错或被中止                                     |
| `ask_user` | `{ questions: [...] }`                                    | Agent 触发 AskUserQuestion，等待客户端回答           |

**处理 `ask_user`：** 收到事件后，调用 resolve 接口提交答案，Agent 才会继续执行：

```bash
curl -X POST 'http://127.0.0.1:8003/api/session/<sessionId>/message/resolve' \
  -H 'Content-Type: application/json' \
  -d '{"answers":{"请确认操作":"yes"}}'
```

---

### 终端

```
WebSocket  /api/terminal?cwd=/your/project
```

建立 WebSocket 连接后即获得一个完整的交互式 PTY 终端。

- **服务端 → 客户端**：终端输出（字符串）
- **客户端 → 服务端**：输入字符串，或 JSON `{ "type": "resize", "cols": 120, "rows": 30 }` 调整窗口大小

---

## 数据存储

会话数据直接使用 Claude CLI 原生的 `~/.claude/projects/` 目录（JSONL 格式），与 CLI 完全共享：

```
~/.claude/projects/
└── -your-project-path/
    ├── <sessionId>.jsonl   # 每个会话一个文件，每行一条消息
    └── ...
```

运行时状态（status、abort controller）仅保存在内存中，服务重启后会重置为 `idle`。

---

## 环境要求

- Node.js >= 20
- 已安装并登录 Claude Code CLI（`claude` 命令可用）

## License

MIT
