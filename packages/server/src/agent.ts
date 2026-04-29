import { query } from '@anthropic-ai/claude-agent-sdk'
import type { FastifyReply } from 'fastify'
import { logger } from './logger'
import { setPendingApproval, assignSessionId, type RuntimeSession } from './store'

// 前端传来的 content block 类型
export type IncomingBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
      data: string
    }

// ── SSE 事件类型 ────────────────────────────────────────────────────────────
type SseEvent =
  | { event: 'message'; data: SseRawMessage }
  | { event: 'done'; data: SseDone }
  | { event: 'error'; data: { message: string } }
  | { event: 'ask_user'; data: { questions: unknown[] } }

// 透传给前端的原始 SDK 消息结构（assistant/user 两种）
export interface SseRawMessage {
  type: 'assistant' | 'user'
  uuid: string
  session_id: string
  message: unknown // BetaMessage (assistant) 或 MessageParam (user)
  parent_tool_use_id: string | null
}

// 保留供外部引用（MessageBubble 渲染层仍使用）
export interface SsePart {
  type: 'text' | 'tool_call' | 'tool_result'
  text?: string
  callID?: string
  tool?: string
  input?: Record<string, unknown>
  content?: string
}

export interface SseDone {
  sessionId: string | null
  cost?: number
  tokens?: { input: number; output: number; cache: { read: number; write: number } }
  messages?: SseRawMessage[]
}

function sseWrite(reply: FastifyReply, ev: SseEvent) {
  reply.raw.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`)
}

// ── 把普通数组包装成 SDK 要求的 AsyncIterable ────────────────────────────────
async function* arrayToAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item
  }
}

function buildSdkPrompt(content: IncomingBlock[], options: Record<string, unknown>) {
  if (content.length === 1 && content[0].type === 'text') {
    return { prompt: content[0].text, options }
  }

  const sdkContent = content.map((b) => {
    if (b.type === 'image') {
      return {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: b.mediaType, data: b.data },
      }
    }
    return { type: 'text' as const, text: b.text }
  })

  const userMessages = [
    {
      type: 'user' as const,
      message: { role: 'user' as const, content: sdkContent },
      parent_tool_use_id: null,
    },
  ]

  return { prompt: arrayToAsyncIterable(userMessages), options }
}

/** 构建 SDK options */
function buildOptions(
  runtime: RuntimeSession,
  sseWriter?: (ev: SseEvent) => void,
  bypassPermissions = true
): Record<string, unknown> {
  const log = logger.child({ sessionId: (runtime.sessionId ?? 'new').slice(0, 12) })

  const canUseTool = async (toolName: string, input: any) => {
    if (toolName === 'AskUserQuestion') {
      log.info({ questions: (input.questions ?? []).length }, 'AskUserQuestion triggered')
      if (!sseWriter) {
        return { behavior: 'deny', message: 'AskUserQuestion is only supported in stream mode' }
      }
      return new Promise<any>((resolve) => {
        // sessionId 在首次 system 消息后才确定，此时应该已经有了
        setPendingApproval(runtime.sessionId ?? '', resolve)
        sseWriter({ event: 'ask_user', data: { questions: input.questions ?? [] } })
      })
    }
    return { behavior: 'allow', updatedInput: input }
  }

  const options: Record<string, unknown> = {
    cwd: runtime.cwd,
    allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'AskUserQuestion'],
    // 有已有 sessionId 则 resume，否则新建
    ...(runtime.sessionId ? { resume: runtime.sessionId } : {}),
    ...(bypassPermissions ? { permissionMode: 'bypassPermissions' } : { canUseTool }),
    ...(runtime.abort ? { abortController: runtime.abort } : {}),
  }

  return options
}

/** 处理 SDK 消息流，收集 parts，触发 sseWriter（若有） */
function handleMessage(
  message: any,
  runtime: RuntimeSession,
  sseWriter?: (ev: SseEvent) => void
): void {
  const sessionId = runtime.sessionId ?? 'pending'
  const log = logger.child({ sessionId: sessionId.slice(0, 12) })
  const sub = message.subtype as string | undefined

  if (message.type === 'system') {
    // SDK 分配了真实 sessionId（新建 session 时）
    if (message.session_id && !runtime.sessionId) {
      assignSessionId(runtime, message.session_id as string)
      log.info({ sessionId: message.session_id }, 'sdk session id assigned')
    }
    if (sub !== 'status' && sub !== 'hook_progress') {
      log.debug({ subtype: sub, session_id: message.session_id }, 'system')
    }
    return
  }

  if (message.type === 'assistant') {
    for (const block of message.message?.content ?? []) {
      if (block.type === 'tool_use') {
        log.info(
          { tool: block.name, input: JSON.stringify(block.input).slice(0, 120) },
          'tool call'
        )
      }
    }
    // 透传整条原始消息给前端，与 SessionMessage 结构一致
    sseWriter?.({
      event: 'message',
      data: {
        type: 'assistant',
        uuid: message.uuid ?? '',
        session_id: message.session_id ?? '',
        message: message.message,
        parent_tool_use_id: message.parent_tool_use_id ?? null,
      },
    })
    return
  }

  if (message.type === 'user') {
    // 只推 tool_result 回传（跳过用户原始输入的 replay）
    const hasToolResult = (message.message?.content ?? []).some(
      (b: any) => b.type === 'tool_result'
    )
    if (hasToolResult) {
      sseWriter?.({
        event: 'message',
        data: {
          type: 'user',
          uuid: message.uuid ?? '',
          session_id: message.session_id ?? '',
          message: message.message,
          parent_tool_use_id: message.parent_tool_use_id ?? null,
        },
      })
    }
    return
  }

  if (message.type === 'result') {
    if (message.subtype === 'success') {
      const usage = (message as any).usage ?? {}
      log.info(
        {
          cost: `$${((message as any).total_cost_usd ?? 0).toFixed(5)}`,
          tokens: usage,
        },
        'agent done'
      )
    } else {
      log.warn(
        { subtype: message.subtype, errors: (message as any).errors },
        'agent result non-success'
      )
    }
    return
  }

  log.warn({ type: message.type, subtype: sub }, 'unknown message type')
}

/** 阻塞模式：等待 agent 完成后返回 done 数据 */
export async function runAgent(
  runtime: RuntimeSession,
  content: IncomingBlock[],
  plainText: string,
  bypassPermissions = true
): Promise<SseDone> {
  const log = logger.child({ sessionId: (runtime.sessionId ?? 'new').slice(0, 12) })
  log.info({ prompt: plainText.slice(0, 80) }, 'agent start (blocking)')
  runtime.status = 'busy'
  runtime.abort = new AbortController()

  const options = buildOptions(runtime, undefined, bypassPermissions)
  let cost: number | undefined
  let tokens: SseDone['tokens']
  const messages: SseRawMessage[] = []

  try {
    for await (const message of query(buildSdkPrompt(content, options))) {
      handleMessage(message, runtime)
      if (message.type === 'assistant' || message.type === 'user') {
        messages.push(message as unknown as SseRawMessage)
      }
      if (message.type === 'result' && message.subtype === 'success') {
        cost = (message as any).total_cost_usd
        const u = (message as any).usage ?? {}
        tokens = {
          input: u.input_tokens ?? 0,
          output: u.output_tokens ?? 0,
          cache: {
            read: u.cache_read_input_tokens ?? 0,
            write: u.cache_creation_input_tokens ?? 0,
          },
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      log.info('agent aborted by user')
    } else {
      const errMsg = err instanceof Error ? err.message : String(err)
      log.error({ err }, `agent error: ${errMsg}`)
    }
    throw err
  } finally {
    runtime.status = 'idle'
    runtime.abort = null
  }

  return { sessionId: runtime.sessionId, cost, tokens, messages }
}

/** 流式模式：边产生边通过 SSE 推送，完成后发 done 事件 */
export async function runAgentStream(
  runtime: RuntimeSession,
  content: IncomingBlock[],
  plainText: string,
  reply: FastifyReply,
  bypassPermissions = true
) {
  reply.hijack()
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  })

  const log = logger.child({ sessionId: (runtime.sessionId ?? 'new').slice(0, 12) })
  log.info({ prompt: plainText.slice(0, 80) }, 'agent start (stream)')
  runtime.status = 'busy'
  runtime.abort = new AbortController()

  const writer = (ev: SseEvent) => sseWrite(reply, ev)
  const options = buildOptions(runtime, writer, bypassPermissions)

  let cost: number | undefined
  let tokens: SseDone['tokens']

  try {
    for await (const message of query(buildSdkPrompt(content, options))) {
      handleMessage(message, runtime, writer)
      if (message.type === 'result' && message.subtype === 'success') {
        cost = (message as any).total_cost_usd
        const u = (message as any).usage ?? {}
        tokens = {
          input: u.input_tokens ?? 0,
          output: u.output_tokens ?? 0,
          cache: {
            read: u.cache_read_input_tokens ?? 0,
            write: u.cache_creation_input_tokens ?? 0,
          },
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      log.info('agent stream aborted by user')
      sseWrite(reply, { event: 'error', data: { message: 'aborted' } })
    } else {
      const errMsg = err instanceof Error ? err.message : String(err)
      log.error({ err }, `agent error: ${errMsg}`)
      sseWrite(reply, { event: 'error', data: { message: errMsg } })
    }
  } finally {
    runtime.status = 'idle'
    runtime.abort = null
  }

  sseWrite(reply, { event: 'done', data: { sessionId: runtime.sessionId, cost, tokens } })
  reply.raw.end()
}
