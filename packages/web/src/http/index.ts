const BASE = '/api'
export interface ProjectInfo {
  id: string
  cwd: string
  sessionCount: number
  updatedAt: number
}

export interface SessionSummary {
  id: string
  title: string
  cwd: string
  status: 'idle' | 'busy'
  lastModified: number
  gitBranch?: string
  createdAt?: number
}

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  children?: FileTreeNode[]
}

// 发送给后端的 content block
export type ContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
      data: string
    }

export interface AskUserQuestion {
  question: string
  header: string
  options: { label: string; description: string; preview?: string }[]
  multiSelect: boolean
}

// SSE done 事件数据
export interface SseDone {
  sessionId: string | null
  cost?: number
  tokens?: { input: number; output: number; cache: { read: number; write: number } }
}

// SDK 原生 SessionMessage 类型
export type SessionMessage = {
  type: 'user' | 'assistant' | 'system'
  uuid: string
  session_id: string
  message: unknown
  parent_tool_use_id: null
}

// SSE part 事件数据
export interface SsePart {
  type: 'text' | 'tool_call' | 'tool_result'
  text?: string
  callID?: string
  tool?: string
  input?: Record<string, unknown>
  content?: string
}

export const api = {
  listProjects: (): Promise<ProjectInfo[]> => fetch(`${BASE}/project`).then((r) => r.json()),

  linkProject: (
    cwd: string
  ): Promise<{ ok: boolean; id: string; cwd: string } | { error: string }> =>
    fetch(`${BASE}/project/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd }),
    }).then((r) => r.json()),

  listDirs: (dirPath?: string): Promise<{ path: string; dirs: { name: string; path: string }[] }> =>
    fetch(`${BASE}/fs/dirs${dirPath ? `?path=${encodeURIComponent(dirPath)}` : ''}`).then((r) =>
      r.json()
    ),

  listProjectSessions: (projectID: string): Promise<SessionSummary[]> =>
    fetch(`${BASE}/project/${projectID}/session`).then((r) => r.json()),

  getFileTree: (projectID: string, path = '/'): Promise<FileTreeNode[]> =>
    fetch(`${BASE}/project/${projectID}/tree?path=${encodeURIComponent(path)}`).then((r) =>
      r.json()
    ),

  getFile: (projectID: string, filePath: string): Promise<{ path: string; content: string }> =>
    fetch(`${BASE}/project/${projectID}/file?path=${encodeURIComponent(filePath)}`).then((r) =>
      r.json()
    ),

  deleteSession: (id: string): Promise<{ ok: boolean }> =>
    fetch(`${BASE}/session/${id}`, { method: 'DELETE' }).then((r) => r.json()),

  renameSession: (id: string, title: string): Promise<{ ok: boolean }> =>
    fetch(`${BASE}/session/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).then((r) => r.json()),

  getMessages: (id: string): Promise<SessionMessage[]> =>
    fetch(`${BASE}/session/${id}/message`).then((r) => r.json()),

  /**
   * 发送消息（SSE 流式）
   * id = 已有 session UUID，或 'new'（新建 session，需要传 cwd）
   * done 事件里的 sessionId 是 SDK 分配的真实 ID（新建时才需要关注）
   */
  sendMessageStream: (
    id: string,
    content: ContentBlock[],
    bypassPermissions: boolean,
    cwd: string | undefined,
    callbacks: {
      onMessage: (msg: SessionMessage) => void
      onDone: (done: SseDone) => void
      onError: (err: string) => void
      onAskUser?: (questions: AskUserQuestion[]) => void
    }
  ): Promise<void> =>
    fetch(`${BASE}/session/${id}/message?stream=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, bypassPermissions, ...(cwd ? { cwd } : {}) }),
    }).then(async (r) => {
      if (!r.ok) {
        const err = await r.json()
        throw new Error(err.error ?? r.statusText)
      }
      const reader = r.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const chunk of parts) {
          const eventLine = chunk.match(/^event: (\w+)/)
          const dataLine = chunk.match(/^data: (.+)/m)
          if (!eventLine || !dataLine) continue
          const event = eventLine[1]
          const data = JSON.parse(dataLine[1])
          if (event === 'message') callbacks.onMessage(data)
          else if (event === 'done') callbacks.onDone(data)
          else if (event === 'error') callbacks.onError(data.message)
          else if (event === 'ask_user') callbacks.onAskUser?.(data.questions)
        }
      }
    }),

  abortSession: (id: string): Promise<{ ok: boolean }> =>
    fetch(`${BASE}/session/${id}/abort`, { method: 'POST' }).then((r) => r.json()),

  resolveApproval: (
    id: string,
    answers: Record<string, string>,
    annotations?: Record<string, { preview?: string; notes?: string }>
  ): Promise<{ ok: boolean }> =>
    fetch(`${BASE}/session/${id}/message/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, ...(annotations ? { annotations } : {}) }),
    }).then((r) => r.json()),
}
