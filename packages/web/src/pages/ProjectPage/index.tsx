import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Layout,
  List,
  Button,
  Typography,
  Space,
  Tag,
  Tooltip,
  Popconfirm,
  Spin,
  App as AntdApp,
  Splitter,
} from 'antd'
import type { TreeDataNode } from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  FileOutlined,
  HomeOutlined,
  CloseOutlined,
} from '@ant-design/icons'
import {
  api,
  type SessionSummary,
  type SessionMessage,
  type ContentBlock,
  type AskUserQuestion,
} from '@/http/index'
import { type DisplayMessage } from '@/components/MessageBubble/index.tsx'
import TerminalPanel from '@/components/Terminal/index.tsx'
import FileViewer from '@/components/FileViewer/index.tsx'
import ChatPanel from '@/components/ChatPanel/index.tsx'
import { FileTreePanel, toTreeData } from '@/components/FileTreePanel/index.tsx'
import FullSpin from '@/components/FullSpin'
import './index.less'

const { Text } = Typography

interface ImageData {
  data: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
}

const C = {
  bg0: '#f7f7f8',
  bg1: '#ffffff',
  bg2: '#f0f0f2',
  bg3: '#e8e8ec',
  text0: '#1a1a1a',
  text1: '#888888',
  text2: '#bbb',
  sidebar: '#efefef',
}

const NEW_SESSION_ID = 'new'

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()

  const [projectCwd, setProjectCwd] = useState<string>('')
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
  const [fileLoading, setFileLoading] = useState(false)
  const [treeSearch, setTreeSearch] = useState('')
  const [bypassPermissions, setBypassPermissions] = useState(true)
  const [pendingQuestion, setPendingQuestion] = useState<{
    sessionId: string
    questions: AskUserQuestion[]
  } | null>(null)

  // 新建 session 时临时持有 cwd，等 done 事件拿到真实 sessionId 后清除
  const pendingNewCwd = useRef<string | null>(null)

  const activeSession = sessions.find((s) => s.id === activeId)

  const init = async () => {
    if (!projectId) return

    setPreLoading(true)

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
  }
  useEffect(() => {
    init()
  }, [projectId, navigate])

  async function openFile(filePath: string) {
    if (!projectId) return
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
    const isMedia = [
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.webp',
      '.svg',
      '.ico',
      '.bmp',
      '.mp3',
      '.wav',
      '.ogg',
      '.m4a',
      '.flac',
      '.aac',
    ].includes(ext)
    if (isMedia) {
      setSelectedFile({ path: filePath, content: '' })
      return
    }
    setFileLoading(true)
    try {
      const f = await api.getFile(projectId, filePath)
      setSelectedFile(f)
    } finally {
      setFileLoading(false)
    }
  }

  const hasRealInput = (content: any[]): boolean => {
    // @ts-ignore
    return content.some(
      (b: any) =>
        b.type === 'image_url' ||
        b.type === 'image' ||
        (b.type === 'text' && !b?.text?.trimStart?.()?.startsWith?.('<ide_'))
    )
  }

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
          // 跳过 tool_result 回传，只保留真实用户输入（过滤 IDE 注入块）
          const msg = m.message as any
          const content: any[] = Array.isArray(msg?.content) ? msg.content : []

          if (hasRealInput(content)) {
            const newMMsg = filterSdkMsg(m)
            // console.log('newMsg', newMMsg)
            displayed.push({ id: m.uuid, role: 'user', sdkMessages: [newMMsg] })
          } else {
          }
        } else if (m.type === 'assistant') {
          if (hasRealAssistantContent(m)) {
            displayed.push({ id: m.uuid, role: 'assistant', sdkMessages: [m] })
          }
        }
      }
      setMessages(displayed)

      console.log('displayed', displayed)
    } finally {
      setMsgLoading(false)
    }
  }

  async function selectSession(id: string) {
    setActiveId(id)
    await loadMessages(id)
  }

  function startNewSession() {
    // 在 session 列表里插入一条占位，点击后 activeId = 'new'
    // 真正的 session 在第一条消息发出后由 SDK 创建
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

  function handlePasteImage(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      const mediaType = file.type as ImageData['mediaType']
      const key = `[Image ${imageMap.size + 1}]`
      setImageMap((prev) => new Map(prev).set(key, { data: base64, mediaType }))
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
        if (img) blocks.push({ type: 'image', mediaType: img.mediaType, data: img.data })
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
      // ignore
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
    const previewText = content.map((b) => (b.type === 'text' ? b.text : '[图片]')).join('')

    const tempUserId = 'tmp_user'
    const userSdkMsg: SessionMessage = {
      type: 'user',
      uuid: 'tmp_user',
      session_id: '',
      parent_tool_use_id: null,
      message: { role: 'user', content: [{ type: 'text', text: previewText }] },
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

    // 新建 session 时传 cwd，用 'new' 作为 id
    const sendId = isNew ? NEW_SESSION_ID : sessionId
    const cwd = isNew ? projectCwd : undefined

    try {
      await api.sendMessageStream(sendId, content, bypassPermissions, cwd, {
        onAskUser: (questions) => {
          setPendingQuestion({ sessionId: pendingNewCwd.current ? '' : sessionId, questions })
        },
        onMessage: (sdkMsg) => {
          setMessages((prev) => {
            if (sdkMsg.type === 'user') {
              const content: any[] = Array.isArray((sdkMsg.message as any)?.content)
                ? (sdkMsg.message as any).content
                : []

              if (!hasRealInput(content)) return prev

              return [
                ...prev,
                {
                  id: sdkMsg.uuid,
                  role: 'user' as DisplayMessage['role'],
                  sdkMessages: [filterSdkMsg(sdkMsg)],
                },
              ]
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
          console.log('messages', messages)

          setPendingQuestion(null)

          const realId = doneData.sessionId

          setActiveId(realId)

          setSessions((prev) =>
            prev.map((s) => (s.id === realId ? { ...s, status: 'idle' as const } : s))
          )

          // 刷新文件树
          if (projectId) {
            api
              .getFileTree(projectId)
              .then((nodes) => setFileTree(toTreeData(nodes)))
              .catch(() => {})
          }
        },
        onError: (errMsg) => {
          if (/aborted/.test(errMsg)) {
            message.warning('已取消')
          } else {
            message.error(errMsg)
          }
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

  return (
    <Layout
      className="projectPage"
      style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg0 }}
    >
      {preLoading && <FullSpin />}

      {!preLoading && (
        <>
          <Splitter layout="vertical" style={{ flex: 1, overflow: 'hidden' }}>
            <Splitter.Panel
              style={{ display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: 0 }}
            >
              {/* 返回首页按钮 */}
              <Tooltip title="返回主页" placement="right">
                <div
                  onClick={() => navigate('/')}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    margin: '8px 6px 0',
                    color: C.text1,
                    fontSize: 14,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = C.text0)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = C.text1)}
                >
                  <HomeOutlined />
                </div>
              </Tooltip>

              <Splitter style={{ flex: 1, overflow: 'hidden' }}>
                {/* Session 列表 */}
                <Splitter.Panel
                  defaultSize="14%"
                  min="6%"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: C.bg0,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '10px 10px 8px',
                      borderBottom: `1px solid ${C.bg3}`,
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ marginBottom: 8, paddingLeft: 2 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: C.text0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {projectCwd.split('/').pop()}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: C.text1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginTop: 1,
                        }}
                      >
                        ~/{projectCwd.split('/').slice(-2, -1)[0]}
                      </div>
                    </div>
                    <Button
                      icon={<PlusOutlined />}
                      block
                      type="dashed"
                      onClick={startNewSession}
                      style={{ borderRadius: 6, fontWeight: 500 }}
                    >
                      新建会话
                    </Button>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                    <List
                      dataSource={sessions}
                      renderItem={(s) => (
                        <List.Item
                          onClick={() => s.id !== NEW_SESSION_ID && selectSession(s.id)}
                          style={{
                            cursor: 'pointer',
                            padding: '6px 10px',
                            background: s.id === activeId ? C.bg1 : 'transparent',
                            borderRadius: 6,
                            margin: '1px 6px',
                            boxShadow: s.id === activeId ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            transition: 'all 0.1s',
                            border: 'none',
                          }}
                          actions={[
                            <Popconfirm
                              key="del"
                              title="删除此会话？"
                              onConfirm={() => deleteSession(s.id)}
                            >
                              <Button
                                type="text"
                                size="small"
                                icon={<DeleteOutlined />}
                                danger
                                onClick={(e) => e.stopPropagation()}
                              />
                            </Popconfirm>,
                          ]}
                        >
                          <List.Item.Meta
                            title={
                              <Space size={4}>
                                <Text
                                  ellipsis
                                  style={{
                                    maxWidth: 110,
                                    fontSize: 12.5,
                                    color: s.id === activeId ? C.text0 : C.text1,
                                  }}
                                >
                                  {s.title}
                                </Text>
                                {s.status === 'busy' && (
                                  <Tag
                                    color="orange"
                                    style={{ fontSize: 10, padding: '0 3px', lineHeight: '15px' }}
                                  >
                                    运行中
                                  </Tag>
                                )}
                              </Space>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  </div>
                </Splitter.Panel>

                {/* 聊天主区 */}
                <Splitter.Panel
                  defaultSize="44%"
                  min="20%"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: C.bg0,
                    overflow: 'hidden',
                  }}
                >
                  <ChatPanel
                    activeId={activeId}
                    sessionTitle={activeSession?.title}
                    messages={messages}
                    msgLoading={msgLoading}
                    loading={loading}
                    input={input}
                    onInputChange={setInput}
                    onSend={sendMessage}
                    onAbort={handleAbort}
                    onPasteImage={handlePasteImage}
                    activeProjectID={projectId ?? null}
                    pendingQuestion={pendingQuestion?.questions ?? null}
                    onResolve={handleResolve}
                    bypassPermissions={bypassPermissions}
                    onBypassPermissionsChange={setBypassPermissions}
                  />
                </Splitter.Panel>

                {/* 文件内容 */}
                <Splitter.Panel
                  defaultSize="30%"
                  min="20%"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: C.bg1,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: 36,
                      background: C.bg0,
                      borderBottom: `1px solid ${C.bg3}`,
                      display: 'flex',
                      alignItems: 'stretch',
                      flexShrink: 0,
                      overflowX: 'auto',
                    }}
                  >
                    {selectedFile ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 14px',
                          gap: 6,
                          background: C.bg1,
                          borderRight: `1px solid ${C.bg3}`,
                          borderTop: '2px solid #1677ff',
                          fontSize: 13,
                          color: C.text0,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {/* <Button
                          icon={<CloseOutlined />}
                          size="small"
                          color="default"
                          variant="text"
                          style={{ marginTop: 2, fontSize: 9, width: 18, height: 18 }}
                        ></Button> */}
                        <span>{selectedFile.path.split('/').pop()}</span>
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: '0 14px',
                          display: 'flex',
                          alignItems: 'center',
                          color: C.text2,
                          fontSize: 12,
                        }}
                      >
                        未选择文件
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {fileLoading && <Spin style={{ display: 'block', margin: '40px auto' }} />}
                    {!fileLoading && selectedFile && projectId && (
                      <FileViewer
                        projectID={projectId}
                        filePath={selectedFile.path}
                        content={selectedFile.content}
                      />
                    )}
                    {!fileLoading && !selectedFile && (
                      <div
                        style={{ color: C.text2, fontSize: 12, textAlign: 'center', marginTop: 60 }}
                      >
                        暂未查看文件
                      </div>
                    )}
                  </div>
                </Splitter.Panel>

                {/* 文件树 */}
                <Splitter.Panel
                  defaultSize="15%"
                  min="10%"
                  collapsible={{ start: true, end: true, showCollapsibleIcon: true }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: C.bg0,
                    overflow: 'hidden',
                  }}
                >
                  <FileTreePanel
                    fileTree={fileTree}
                    treeSearch={treeSearch}
                    onSearchChange={setTreeSearch}
                    onSelectFile={openFile}
                  />
                </Splitter.Panel>
              </Splitter>
            </Splitter.Panel>

            {termOpen && (
              <Splitter.Panel defaultSize={220} min={80} max={600} style={{ overflow: 'hidden' }}>
                <TerminalPanel cwd={projectCwd} onClose={() => setTermOpen(false)} />
              </Splitter.Panel>
            )}
          </Splitter>

          {/* 底部状态栏 */}
          <div
            style={{
              height: 24,
              background: C.sidebar,
              borderTop: `1px solid ${C.bg3}`,
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              gap: 12,
              flexShrink: 0,
            }}
          >
            <span
              onClick={() => setTermOpen((v) => !v)}
              style={{
                color: termOpen ? C.text0 : C.text1,
                fontSize: 11,
                cursor: 'pointer',
                userSelect: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                borderRadius: 4,
                background: termOpen ? C.bg3 : 'transparent',
                transition: 'all 0.12s',
              }}
            >
              ⌨ 终端
            </span>
            {activeSession && (
              <span style={{ color: C.text2, fontSize: 11, marginLeft: 'auto' }}>
                {activeSession.status === 'busy' ? '⟳ 运行中…' : '● 空闲'}
              </span>
            )}
          </div>
        </>
      )}
    </Layout>
  )
}
