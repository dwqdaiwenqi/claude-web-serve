import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fs from 'fs'
import path from 'path'
import { getSessionInfo, getSessionMessages, renameSession } from '@anthropic-ai/claude-agent-sdk'
import { logger } from '@/logger'
import {
  CLAUDE_PROJECTS_DIR,
  getProjectDirName,
  getSessionFile,
  getOrCreateRuntime,
  getRuntimeSession,
  deleteRuntimeSession,
  createPendingRuntime,
  resolvePendingApproval,
} from '@/store'
import { runAgent, runAgentStream, type IncomingBlock, type AgentOptions } from '@/agent'

export async function sessionRoutes(api: FastifyInstance) {
  // ── 获取 Session 信息 ────────────────────────────────────
  api.get('/session/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const runtime = getRuntimeSession(id)

    const info = await getSessionInfo(id, runtime?.cwd ? { dir: runtime.cwd } : undefined)
    if (!info) return reply.code(404).send({ error: 'Session not found' })

    return {
      id: info.sessionId,
      title: info.summary,
      cwd: info.cwd ?? runtime?.cwd,
      status: runtime?.status ?? 'idle',
      lastModified: info.lastModified,
      gitBranch: info.gitBranch,
    }
  })

  // ── 删除 Session（直接删 .jsonl 文件）───────────────────
  api.delete('/session/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const runtime = getRuntimeSession(id)

    runtime?.abort?.abort()
    deleteRuntimeSession(id)

    let deleted = false
    if (runtime?.cwd) {
      const dirName = getProjectDirName(runtime.cwd)
      const file = getSessionFile(dirName, id)
      if (fs.existsSync(file)) {
        fs.rmSync(file, { force: true })
        deleted = true
      }
    } else {
      if (fs.existsSync(CLAUDE_PROJECTS_DIR)) {
        for (const entry of fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue
          const file = path.join(CLAUDE_PROJECTS_DIR, entry.name, `${id}.jsonl`)
          if (fs.existsSync(file)) {
            fs.rmSync(file, { force: true })
            deleted = true
            break
          }
        }
      }
    }

    if (!deleted) return reply.code(404).send({ error: 'Session not found' })
    logger.info({ sessionId: id }, 'session deleted')
    return { ok: true }
  })

  // ── 中止正在运行的 Session ──────────────────────────────
  api.post('/session/:id/abort', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const runtime = getRuntimeSession(id)
    if (!runtime) return reply.code(404).send({ error: 'Session not found' })
    if (runtime.status !== 'busy') return reply.code(409).send({ error: 'Session is not busy' })
    runtime.abort?.abort()
    logger.info({ sessionId: id }, 'session aborted by user')
    return { ok: true }
  })

  // ── 重命名 Session ──────────────────────────────────────
  api.patch('/session/:id', async (req: FastifyRequest, _reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as { title?: string }
    if (typeof body.title !== 'string') return _reply.code(400).send({ error: 'title is required' })

    const runtime = getRuntimeSession(id)
    await renameSession(id, body.title.trim(), runtime?.cwd ? { dir: runtime.cwd } : undefined)
    return { ok: true }
  })

  // ── 消息历史 ────────────────────────────────────────────
  api.get('/session/:id/message', async (req: FastifyRequest, _reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const runtime = getRuntimeSession(id)
    const q = req.query as { limit?: string; offset?: string }
    // const limit = parseInt(q.limit ?? '200')
    const offset = parseInt(q.offset ?? '0')

    const messages = await getSessionMessages(id, {
      dir: runtime?.cwd,
      // limit,
      offset,
    })
    return messages
  })

  // ── 回答 AskUserQuestion（human-in-the-loop）───────────
  //
  api.post('/session/:id/message/resolve', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }

    // answers:     { [question原文]: "用户选中的 label"（多选用逗号拼接）}
    //              key 是 Claude 生成的问题文本，value 是前端选中/输入的答案
    //              例：{ "Which library?": "React Query" }
    //
    // annotations: { [question原文]: { preview?, notes? } }  （可选）
    //              仅当用户选中的 option 带有 preview 字段时才会出现对应 key
    //              例：{ "Which library?": { preview: "```ts\nimport {...}\n```" } }
    const body = (req.body ?? {}) as {
      answers?: Record<string, string>
      annotations?: Record<string, { preview?: string; notes?: string }>
    }
    if (!body.answers || typeof body.answers !== 'object') {
      return reply.code(400).send({ error: 'answers is required' })
    }

    // 传入的对象是 SDK PermissionResult 类型：
    //   behavior: 'allow'  → 告诉 SDK 允许执行这个工具
    //   updatedInput       → 替换工具的执行结果，作为 tool_result 传回给 Claude 模型
    //                        结构遵循 SDK AskUserQuestionOutput 规范：{ answers, annotations? }
    //                        Claude 读 answers 得知用户选了什么，然后继续生成回复
    const ok = resolvePendingApproval(id, {
      behavior: 'allow',
      updatedInput: {
        answers: body.answers,
        ...(body.annotations ? { annotations: body.annotations } : {}),
      },
    })

    // 409 说明 store 里没有该 session 的挂起 Promise，可能已超时或 session 不存在
    if (!ok) return reply.code(409).send({ error: 'No pending question for this session' })
    return { ok: true }
  })

  // ── 发送消息（阻塞 or SSE 流式）────────────────────────
  //
  // id = 已有 session UUID → resume 继续对话
  // id = 'new'            → 新建 session，body.cwd 必填
  //
  // 判断流式/阻塞：请求头 Accept: text/event-stream 或 query ?stream=1
  //   流式：持续推送 SSE 事件（message / ask_user / done / error）
  //   阻塞：等 agent 跑完后一次性返回 JSON
  api.post('/session/:id/message', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const isNew = id === 'new'

    // prompt:            纯文本消息（和 content 二选一）
    // content:           富文本块数组，支持 text + image（base64）
    // cwd:               项目根目录，新建 session 时必填，已有 session 可省略
    // bypassPermissions: true（默认）→ 跳过所有工具权限检查
    //                    false       → 启用 human-in-the-loop，工具调用前询问用户
    const body = (req.body ?? {}) as {
      prompt?: string
      content?: IncomingBlock[]
      cwd?: string
      bypassPermissions?: boolean
      options?: AgentOptions
    }

    let runtime
    if (isNew) {
      if (!body.cwd) return reply.code(400).send({ error: 'cwd is required for new sessions' })
      // createPendingRuntime：创建一个 sessionId=null 的 runtime，等 SDK 第一条 system 消息后赋值
      runtime = createPendingRuntime(body.cwd)
    } else {
      // cwd 优先级：body.cwd > 内存 runtime > SDK getSessionInfo（读 .jsonl 文件头）
      let cwd = body.cwd
      if (!cwd) {
        const existing = getRuntimeSession(id)
        cwd = existing?.cwd
        if (!cwd) {
          const info = await getSessionInfo(id)
          cwd = info?.cwd
        }
      }
      if (!cwd) return reply.code(400).send({ error: 'cwd not found for session' })
      runtime = getOrCreateRuntime(id, cwd)
    }

    // busy 说明上一条消息还在跑，拒绝并发请求
    if (runtime.status === 'busy') {
      logger.warn({ sessionId: id }, 'session busy, rejected')
      return reply.code(409).send({ error: 'Session is busy' })
    }

    // bypassPermissions 默认 true；显式传 false 才开启 human-in-the-loop
    const bypassPermissions = body.bypassPermissions !== false

    // 统一转成 IncomingBlock[]，方便后续处理图片等富文本
    let content: IncomingBlock[]
    if (body.content?.length) {
      content = body.content
    } else {
      const prompt = (body.prompt ?? '').trim()
      if (!prompt) return reply.code(400).send({ error: 'prompt is required' })
      content = [{ type: 'text', text: prompt }]
    }

    // plainText 只用于日志截断显示，不传给 SDK
    const plainText = content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join(' ')

    const wantsStream =
      req.headers['accept'] === 'text/event-stream' || (req.query as any).stream === '1'

    const agentOptions: AgentOptions = body.options ?? {}

    if (wantsStream) {
      logger.info({ sessionId: id, isNew }, 'starting agent in stream mode')
      // runAgentStream 内部调用 reply.hijack() 接管连接，自己写 SSE 帧，最后 reply.raw.end()
      await runAgentStream(runtime, content, plainText, reply, bypassPermissions, agentOptions)
      return reply
    }
    return runAgent(runtime, content, plainText, bypassPermissions, agentOptions)
  })
}
