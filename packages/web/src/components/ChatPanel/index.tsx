import { useRef, useEffect, useState } from 'react'
import {
  Typography,
  Spin,
  Button,
  Card,
  Space,
  Tag,
  Badge,
  Switch,
  Tooltip,
  Input,
  Popover,
} from 'antd'
import { ArrowUpOutlined, XFilled } from '@ant-design/icons'
import type { AskUserQuestion, SsePart } from '@/http/index'
import type { SessionMessage } from '@/http/index'
import type { Attachment } from '@/components/ChatInput/index.tsx'

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  sdkMessages: SessionMessage[]
  error?: string
  cost?: number
}
import ChatInput from '@/components/ChatInput/index.tsx'
import { MessageBubble } from '@/components/MessageBubble/index.tsx'

function AskUserCard({
  questions,
  onResolve,
}: {
  questions: AskUserQuestion[]
  onResolve: (
    answers: Record<string, string>,
    annotations?: Record<string, { preview?: string; notes?: string }>
  ) => void
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(questions.map((q) => [q.question, []]))
  )
  const [otherInput, setOtherInput] = useState<Record<string, string>>({})
  const [showOther, setShowOther] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)

  const OTHER_KEY = '__other__'

  function toggle(question: string, label: string, multi: boolean) {
    if (label === OTHER_KEY) {
      setShowOther((prev) => {
        const next = !prev[question]
        if (!next) setOtherInput((p) => ({ ...p, [question]: '' }))
        setSelected((prev2) => ({ ...prev2, [question]: next ? [OTHER_KEY] : [] }))
        return { ...prev, [question]: next }
      })
      return
    }
    setShowOther((prev) => ({ ...prev, [question]: false }))
    setOtherInput((prev) => ({ ...prev, [question]: '' }))
    setSelected((prev) => {
      const cur = prev[question] ?? []
      const filtered = cur.filter((l) => l !== OTHER_KEY)
      if (multi) {
        return {
          ...prev,
          [question]: filtered.includes(label)
            ? filtered.filter((l) => l !== label)
            : [...filtered, label],
        }
      }
      return { ...prev, [question]: [label] }
    })
  }

  function submit() {
    if (submitting) return
    setSubmitting(true)
    const answers: Record<string, string> = {}
    const annotations: Record<string, { preview?: string; notes?: string }> = {}

    for (const q of questions) {
      const sel = selected[q.question] ?? []
      if (sel.includes(OTHER_KEY)) {
        answers[q.question] = otherInput[q.question] ?? ''
      } else {
        answers[q.question] = sel.join(', ')
        // 收集所有已选 option 的 preview
        const previews = sel
          .map((label) => q.options.find((o) => o.label === label)?.preview)
          .filter(Boolean) as string[]
        if (previews.length > 0) {
          annotations[q.question] = { preview: previews.join('\n\n') }
        }
      }
    }

    const hasAnnotations = Object.keys(annotations).length > 0
    onResolve(answers, hasAnnotations ? annotations : undefined)
  }

  const allAnswered = questions.every((q) => {
    const sel = selected[q.question] ?? []
    if (sel.includes(OTHER_KEY)) return (otherInput[q.question] ?? '').trim().length > 0
    return sel.length > 0
  })

  return (
    <Card
      size="small"
      style={{ margin: '8px 0', borderColor: '#1677ff33', background: '#f0f5ff' }}
      title={<span style={{ fontSize: 12 }}>您希望我如何处理</span>}
      bodyStyle={{
        paddingTop: '0px',
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        {questions.map((q) => (
          <div key={q.question}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>
              {q.header}: {q.question}
            </div>
            <Space size={6} wrap>
              {q.options.map((opt) => {
                const isSelected = (selected[q.question] ?? []).includes(opt.label)
                const tag = (
                  <Tag
                    key={opt.label}
                    color={isSelected ? 'blue' : 'default'}
                    style={{ cursor: 'pointer', userSelect: 'none', fontSize: 12 }}
                    onClick={() => toggle(q.question, opt.label, q.multiSelect)}
                  >
                    {opt.label}
                  </Tag>
                )
                if (opt.preview) {
                  return (
                    <Popover
                      key={opt.label}
                      content={
                        <pre
                          style={{
                            maxWidth: 360,
                            maxHeight: 240,
                            overflow: 'auto',
                            fontSize: 11,
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {opt.preview}
                        </pre>
                      }
                      title={opt.description || opt.label}
                      trigger="hover"
                    >
                      {tag}
                    </Popover>
                  )
                }
                return (
                  <Tooltip key={opt.label} title={opt.description} mouseEnterDelay={0.4}>
                    {tag}
                  </Tooltip>
                )
              })}
              <Tag
                color={showOther[q.question] ? 'blue' : 'default'}
                style={{ cursor: 'pointer', userSelect: 'none', fontSize: 12 }}
                onClick={() => toggle(q.question, OTHER_KEY, q.multiSelect)}
              >
                Other
              </Tag>
            </Space>
            {showOther[q.question] && (
              <Input
                size="small"
                style={{ marginTop: 6 }}
                placeholder="请输入自定义内容..."
                value={otherInput[q.question] ?? ''}
                onChange={(e) =>
                  setOtherInput((prev) => ({ ...prev, [q.question]: e.target.value }))
                }
                onPressEnter={() => {
                  if (allAnswered) submit()
                }}
                autoFocus
              />
            )}
          </div>
        ))}
        <Button
          type="primary"
          size="small"
          disabled={!allAnswered || submitting}
          onClick={submit}
          loading={submitting}
        >
          提交
        </Button>
      </Space>
    </Card>
  )
}

const { Text } = Typography

const C = {
  bg0: '#f7f7f8',
  bg1: '#ffffff',
  bg3: '#e8e8ec',
  text0: '#1a1a1a',
  text2: '#bbb',
}

function ChatContent({
  activeId,
  msgLoading,
  messages,
  loading,
}: {
  activeId: string | null
  msgLoading: boolean
  messages: DisplayMessage[]
  loading: boolean
}) {
  if (!activeId) {
    return (
      <div style={{ color: C.text2, fontSize: 13, textAlign: 'center', marginTop: 80 }}>
        选择或新建一个会话
      </div>
    )
  }
  if (msgLoading) {
    return (
      <Spin
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />
    )
  }
  return (
    <>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} msg={msg} pending={loading && msg.id === 'tmp_asst'} />
      ))}
    </>
  )
}

interface ChatPanelProps {
  activeId: string | null
  sessionTitle: string | undefined
  messages: DisplayMessage[]
  msgLoading: boolean
  loading: boolean
  input: string
  onInputChange: (v: string) => void
  onSend: (attachments: Attachment[]) => void
  onAbort?: () => void
  onPasteImage: (file: File) => void
  activeProjectID: string | null
  pendingQuestion: AskUserQuestion[] | null
  onResolve: (
    answers: Record<string, string>,
    annotations?: Record<string, { preview?: string; notes?: string }>
  ) => void
  bypassPermissions: boolean
  onBypassPermissionsChange: (v: boolean) => void
}

export default function ChatPanel({
  activeId,
  sessionTitle,
  messages,
  msgLoading,
  loading,
  input,
  onInputChange,
  onSend,
  onAbort,
  onPasteImage,
  activeProjectID,
  pendingQuestion,
  onResolve,
  bypassPermissions,
  onBypassPermissionsChange,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    bottomRef.current?.scrollIntoView()
  }, [messages])

  return (
    <>
      <div
        style={{
          padding: '6px 16px',
          borderBottom: `1px solid ${C.bg3}`,
          background: C.bg1,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ fontSize: 13, color: C.text0, fontWeight: 500 }}>
          {sessionTitle ?? '选择或新建一个会话'}
        </Text>
      </div>

      <div style={{ position: 'relative', display: 'flex', flex: 1, height: 0 }}>
        <div
          style={{
            position: 'relative',
            flex: 1,
            overflowY: 'auto',
            padding: '16px 16px',
            paddingBottom: '92px',
          }}
        >
          <ChatContent
            activeId={activeId}
            msgLoading={msgLoading}
            messages={messages}
            loading={loading}
          />
          {pendingQuestion && <AskUserCard questions={pendingQuestion} onResolve={onResolve} />}

          {/* <AskUserCard
            questions={[
              {
                question: '你希望如何处理这个文件？',
                header: '文件操作',
                multiSelect: false,
                options: [
                  { label: '覆盖', description: '直接覆盖现有文件内容' },
                  { label: '追加', description: '在文件末尾追加内容' },
                  { label: '跳过', description: '保留原文件，不做任何修改' },
                ],
              },
              {
                question: '是否同时更新相关测试文件？',
                header: '测试更新',
                multiSelect: true,
                options: [
                  { label: '是', description: '自动更新对应的测试用例' },
                  { label: '否', description: '仅修改源文件，不动测试' },
                ],
              },
            ]}
            onResolve={onResolve}
          /> */}

          <div ref={bottomRef} />
        </div>

        <div
          style={{
            position: 'absolute',
            left: 22,
            bottom: 14,
            border: `1px solid ${C.bg3}`,
            background: 'white',
            transition: '1s',
            opacity: loading ? 1 : 0,
            borderRadius: 12,
            color: C.text0,
            padding: '2px 12px',
          }}
        >
          <Badge status="processing" style={{ marginRight: '6px' }} />
          Thinking...
        </div>
      </div>
      <div
        style={{
          padding: '8px 12px',
          paddingBottom: '53px',
          borderTop: `1px solid ${C.bg3}`,
          background: C.bg1,
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <ChatInput
          value={input}
          onChange={onInputChange}
          onPasteImage={onPasteImage}
          onSend={onSend}
          disabled={!activeId || loading}
          activeProjectID={activeProjectID}
        />
        <div style={{ position: 'absolute', right: 12, bottom: 8 }}>
          <Space size={6}>
            <Tooltip
              title={
                !bypassPermissions ? '关闭后 Claude 不会询问用户权限' : '开启后主动进行权限询问'
              }
            >
              <Space size={6}>
                <Text style={{ fontSize: 11, color: C.text2 }}>Human-in-the-loop</Text>
                <Switch
                  size="small"
                  checked={!bypassPermissions}
                  onChange={(v) => onBypassPermissionsChange(!v)}
                />
              </Space>
            </Tooltip>

            {loading ? (
              <Button color="primary" variant="filled" icon={<XFilled />} onClick={onAbort} />
            ) : (
              <Button
                color="primary"
                variant="filled"
                icon={<ArrowUpOutlined />}
                onClick={() => onSend([])}
                disabled={!activeId || !input.trim()}
              />
            )}
          </Space>
        </div>
      </div>
    </>
  )
}
