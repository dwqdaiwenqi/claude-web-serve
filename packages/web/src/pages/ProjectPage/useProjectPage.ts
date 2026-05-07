import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { App as AntdApp } from 'antd'
import type { TreeDataNode } from 'antd'
import {
  api,
  type SessionSummary,
  type SessionMessage,
  type ContentBlock,
  type AskUserQuestion,
} from '@/http/index'
import { type DisplayMessage } from '@/components/MessageBubble/index.tsx'
import { FileTreePanel, toTreeData } from '@/components/FileTreePanel/index.tsx'
import { type FileDiff } from '@/components/DiffReview/index.tsx'
import { mergeDiffs, extractDiffsFromMessages } from '@/components/DiffReview/utils'
import { isMediaFile } from '@/utils/file'

export interface ImageData {
  data: string
  media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
}

export const NEW_SESSION_ID = 'new'

export function useProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()

  const [projectCwd, setProjectCwd] = useState('')
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [preLoading, setPreLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [msgLoading, setMsgLoading] = useState(false)
  const [imageMap, setImageMap] = useState<Map<string, ImageData>>(new Map())
  const [termOpen, setTermOpen] = useState(true)
  const [fileTree, setFileTree] = useState<TreeDataNode[]>([])
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null)
  const [rightPanel, setRightPanel] = useState<'review' | 'file'>('review')
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([])
  const [fileLoading, setFileLoading] = useState(false)
  const [treeSearch, setTreeSearch] = useState('')
  const [bypassPermissions, setBypassPermissions] = useState(true)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<'chat' | 'review'>('chat')
  const [pendingQuestion, setPendingQuestion] = useState<{
    sessionId: string
    questions: AskUserQuestion[]
  } | null>(null)

  const pendingNewCwd = useRef<string | null>(null)

  const activeSession = sessions.find((s) => s.id === activeId)

  const hasRealInput = (content: any[]): boolean =>
    content.some(
      (b: any) =>
        b.type === 'image_url' ||
        b.type === 'image' ||
        (b.type === 'text' && !b?.text?.trimStart?.()?.startsWith?.('<ide_'))
    )

  const hasRealAssistantContent = (sdkMessage: SessionMessage): boolean => {
    const content: any[] = Array.isArray((sdkMessage.message as any)?.content)
      ? (sdkMessage.message as any).content
      : []
    return content.some((b: any) => b.type !== 'redacted_thinking')
  }

  const filterSdkMsg = (sdkMessage: SessionMessage) => {
    // @ts-ignore
    const content = sdkMessage.message.content
    const filteredContent = content.filter(
      (b: any) => !(b.type === 'text' && b.text?.trimStart?.()?.startsWith?.('<ide_'))
    )
    return { ...sdkMessage, message: { ...(sdkMessage.message as any), content: filteredContent } }
  }

  async function loadMessages(id: string) {
    setMsgLoading(true)
    try {
      const sdkMsgs = await api.getMessages(id)
      const displayed: DisplayMessage[] = []
      for (const m of sdkMsgs) {
        if (m.type === 'user') {
          const msg = m.message as any
          const content: any[] = Array.isArray(msg?.content) ? msg.content : []
          if (hasRealInput(content)) {
            displayed.push({ id: m.uuid, role: 'user', sdkMessages: [filterSdkMsg(m)] })
          }
        } else if (m.type === 'assistant') {
          if (hasRealAssistantContent(m)) {
            displayed.push({ id: m.uuid, role: 'assistant', sdkMessages: [m] })
          }
        }
      }
      setMessages(displayed)
      setFileDiffs(extractDiffsFromMessages(sdkMsgs))
    } finally {
      setMsgLoading(false)
    }
  }

  async function selectSession(id: string) {
    setActiveId(id)
    setFileDiffs([])
    await loadMessages(id)
  }

  function startNewSession() {
    setActiveId(NEW_SESSION_ID)
    setMessages([])
    setSessions((prev) => {
      if (prev.some((s) => s.id === NEW_SESSION_ID)) return prev
      return [
        {
          id: NEW_SESSION_ID,
          title: '新建会话',
          cwd: projectCwd,
          status: 'idle',
          lastModified: Date.now(),
        },
        ...prev,
      ]
    })
  }

  async function deleteSession(id: string) {
    if (id === NEW_SESSION_ID) {
      setSessions((prev) => prev.filter((s) => s.id !== NEW_SESSION_ID))
      if (activeId === NEW_SESSION_ID) {
        setActiveId(null)
        setMessages([])
      }
      return
    }
    await api.deleteSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (activeId === id) {
      setActiveId(null)
      setMessages([])
    }
  }

  function handlePasteImage(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      const media_type = file.type as ImageData['media_type']
      const key = `[Image ${imageMap.size + 1}]`
      setImageMap((prev) => new Map(prev).set(key, { data: base64, media_type: media_type }))
      setInput((prev) => prev + key)
    }
    reader.readAsDataURL(file)
  }

  async function buildContent(raw: string): Promise<ContentBlock[]> {
    const TOKEN_RE = /(\[Image \d+\]|@\[[^\]]*\]\([^)]+\))/g
    const blocks: ContentBlock[] = []
    let last = 0
    let match: RegExpExecArray | null
    while ((match = TOKEN_RE.exec(raw)) !== null) {
      if (match.index > last) blocks.push({ type: 'text', text: raw.slice(last, match.index) })
      const token = match[0]
      if (token.startsWith('[Image')) {
        const img = imageMap.get(token)
        if (img) blocks.push({ type: 'image', media_type: img.media_type, data: img.data })
        else blocks.push({ type: 'text', text: token })
      } else {
        const filePath = token.match(/\(([^)]+)\)$/)?.[1]
        blocks.push({ type: 'text', text: filePath ?? token })
      }
      last = match.index + token.length
    }
    if (last < raw.length) blocks.push({ type: 'text', text: raw.slice(last) })
    return blocks.reduce<ContentBlock[]>((acc, block) => {
      const prev = acc[acc.length - 1]
      if (block.type === 'text' && prev?.type === 'text') prev.text += block.text
      else acc.push(block)
      return acc
    }, [])
  }

  async function handleResolve(
    answers: Record<string, string>,
    annotations?: Record<string, { preview?: string; notes?: string }>
  ) {
    if (!pendingQuestion) return
    setPendingQuestion(null)
    await api.resolveApproval(pendingQuestion.sessionId, answers, annotations)
  }

  async function handleAbort() {
    if (!activeId || activeId === NEW_SESSION_ID) return
    try {
      await api.abortSession(activeId)
    } catch {
      /* ignore */
    }
  }

  async function openFile(filePath: string) {
    if (!projectId) return
    if (isMediaFile(filePath)) {
      setSelectedFile({ path: filePath, content: '' })
      setRightPanel('file')
      return
    }
    setFileLoading(true)
    try {
      const f = await api.getFile(projectId, filePath)
      setSelectedFile(f)
      setRightPanel('file')
    } finally {
      setFileLoading(false)
    }
  }
  async function sendMessage() {
    if (!input.trim() || !activeId || loading) return
    const raw = input.trim()
    const sessionId = activeId
    const isNew = sessionId === NEW_SESSION_ID

    setInput('')
    setImageMap(new Map())
    setLoading(true)

    const content = await buildContent(raw)

    const userSdkMsg: SessionMessage = {
      type: 'user',
      uuid: 'tmp_user',
      session_id: '',
      parent_tool_use_id: null,
      message: { role: 'user', content: content as any },
    }

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'user' as DisplayMessage['role'],
        sdkMessages: [userSdkMsg],
      },
    ])
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, status: 'busy' as const } : s))
    )

    const sendId = isNew ? NEW_SESSION_ID : sessionId
    const cwd = isNew ? projectCwd : undefined

    try {
      await api.sendMessageStream(sendId, content, bypassPermissions, cwd, {
        onAskUser: (questions) => {
          setPendingQuestion({ sessionId: pendingNewCwd.current ? '' : sessionId, questions })
        },
        onMessage: (sdkMsg) => {
          if (sdkMsg.type === 'assistant') {
            const incoming = extractDiffsFromMessages([sdkMsg])
            if (incoming.length > 0) setFileDiffs((prev) => mergeDiffs(prev, incoming))
          }
          setMessages((prev) => {
            if (sdkMsg.type === 'user') {
              const content: any[] = Array.isArray((sdkMsg.message as any)?.content)
                ? (sdkMsg.message as any).content
                : []
              if (!hasRealInput(content)) return prev
              // 用真实消息替换临时的 tmp_user 占位
              return prev.map((m) =>
                m.id === 'tmp_user' || m.sdkMessages[0]?.uuid === 'tmp_user'
                  ? { ...m, id: sdkMsg.uuid, sdkMessages: [filterSdkMsg(sdkMsg)] }
                  : m
              )
            } else if (sdkMsg.type === 'assistant') {
              if (!hasRealAssistantContent(sdkMsg)) return prev
              return [
                ...prev,
                {
                  id: sdkMsg.uuid,
                  role: 'assistant' as DisplayMessage['role'],
                  sdkMessages: [sdkMsg],
                },
              ]
            }
            return prev
          })
        },
        onDone: (doneData) => {
          setPendingQuestion(null)
          const realId = doneData.sessionId
          setActiveId(realId)
          setSessions((prev) =>
            prev.map((s) => (s.id === realId ? { ...s, status: 'idle' as const } : s))
          )
          if (projectId) {
            api
              .getFileTree(projectId)
              .then((nodes) => setFileTree(toTreeData(nodes)))
              .catch(() => {})
          }
        },
        onError: (errMsg) => {
          if (/aborted/.test(errMsg)) message.warning('已取消')
          else message.error(errMsg)
        },
      })
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : 'Unknown error'
      message.error(errStr)
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: 'idle' as const } : s))
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!projectId) return
    setPreLoading(true)
    ;(async () => {
      try {
        const projects = await api.listProjects()
        const p = projects.find((x) => x.id === projectId)
        if (!p) {
          navigate('/')
          return
        }
        setProjectCwd(p.cwd)
      } catch {
        /* ignore */
      }
      try {
        const ss = await api.listProjectSessions(projectId)
        setSessions(ss)
        if (ss.length > 0) selectSession(ss[0].id)
      } catch {
        /* ignore */
      }
      try {
        const nodes = await api.getFileTree(projectId)
        setFileTree(toTreeData(nodes))
      } catch {
        /* ignore */
      }
      setPreLoading(false)
    })()
  }, [projectId])

  useEffect(() => {
    console.log('messages', messages)
  }, [messages])

  return {
    projectId,
    projectCwd,
    sessions,
    activeId,
    activeSession,
    messages,
    input,
    setInput,
    preLoading,
    loading,
    msgLoading,
    termOpen,
    setTermOpen,
    fileTree,
    selectedFile,
    rightPanel,
    setRightPanel,
    fileDiffs,
    fileLoading,
    treeSearch,
    setTreeSearch,
    bypassPermissions,
    setBypassPermissions,
    mobileDrawerOpen,
    setMobileDrawerOpen,
    mobileTab,
    setMobileTab,
    pendingQuestion,
    selectSession,
    startNewSession,
    deleteSession,
    sendMessage,
    handleAbort,
    handleResolve,
    handlePasteImage,
    openFile,
  }
}
