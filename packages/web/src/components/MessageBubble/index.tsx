import React, { useState } from 'react'
import { Space, Typography, theme, Image, Modal } from 'antd'
import {
  RobotOutlined,
  UserOutlined,
  ToolOutlined,
  LoadingOutlined,
  FileOutlined,
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { SessionMessage } from '@/http/index'

export interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  sdkMessages: SessionMessage[]
  error?: string
  cost?: number
}

const { Text } = Typography

function DiffView({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  const { token } = theme.useToken()
  return (
    <div
      style={{
        fontSize: 11,
        fontFamily: 'monospace',
        marginTop: 4,
        borderRadius: 4,
        overflow: 'hidden',
        border: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      {oldStr &&
        oldStr.split('\n').map((line, i) => (
          <div
            key={`-${i}`}
            style={{
              background: '#fff2f0',
              color: '#cf1322',
              padding: '0 6px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            - {line}
          </div>
        ))}
      {newStr &&
        newStr.split('\n').map((line, i) => (
          <div
            key={`+${i}`}
            style={{
              background: '#f6ffed',
              color: '#389e0d',
              padding: '0 6px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            + {line}
          </div>
        ))}
    </div>
  )
}

function ToolCallBlock({ block }: { block: any }) {
  const { token } = theme.useToken()
  const input = block.input ?? {}
  const name: string = block.name ?? ''
  const type = block.type

  // 每种工具定制显示
  let header: string
  let detail: React.ReactNode = null

  if (name === 'Edit' || name === 'MultiEdit') {
    header = input.file_path ?? ''
    detail = <DiffView oldStr={input.old_string ?? ''} newStr={input.new_string ?? ''} />
  } else if (name === 'Write') {
    header = input.file_path ?? ''
    detail = input.content ? (
      <div
        style={{
          fontSize: 11,
          fontFamily: 'monospace',
          color: token.colorTextSecondary,
          marginTop: 4,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: 120,
          overflow: 'hidden',
        }}
      >
        {String(input.content).slice(0, 300)}
        {String(input.content).length > 300 ? '…' : ''}
      </div>
    ) : null
  } else if (name === 'Bash') {
    header = String(input.command ?? '').slice(0, 120)
  } else if (name === 'Read') {
    header = input.file_path ?? ''
  } else if (name === 'Glob') {
    header = input.pattern ?? ''
  } else if (name === 'Grep') {
    header = `${input.pattern ?? ''}${input.path ? ` in ${input.path}` : ''}`
  } else {
    header = (input.file_path ??
      input.command ??
      input.pattern ??
      input.path ??
      input.query ??
      '') as string
  }

  // thinking 从type区分，而不是name
  if (type === 'thinking') {
    header = block.thinking ?? 'thinking'
  } else if (type === 'redacted_thinking') {
    header = block.data ?? 'redacted_thinking'
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: token.colorTextTertiary,
          fontSize: 12,
        }}
      >
        <ToolOutlined style={{ fontSize: 11, flexShrink: 0 }} />
        <span style={{ fontWeight: 500 }}>{name}</span>
        {header && (
          <span
            style={{
              opacity: 0.75,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            · {header}
          </span>
        )}
      </div>
      {detail}
    </div>
  )
}

function FileCard({ name, content, token }: { name: string; content: string; token: any }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 6,
          background: token.colorFillAlter,
          marginTop: 4,
          maxWidth: 240,
          cursor: 'pointer',
        }}
      >
        <FileOutlined style={{ fontSize: 13, color: token.colorTextSecondary, flexShrink: 0 }} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: token.colorText,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </span>
      </div>
      <Modal
        title={name}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={720}
        styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
      >
        <pre
          style={{
            margin: 0,
            fontSize: 13,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            color: token.colorText,
          }}
        >
          {content}
        </pre>
      </Modal>
    </>
  )
}

function ToolResultBlock({ block }: { block: any }) {
  const { token } = theme.useToken()

  // block.content 有三种形态：
  // 1. 数组：混合内容块（文字+图片），来自 tool_result 或用户输入
  // 2. 字符串：旧格式兼容，直接包一层
  // 3. block.text：部分旧消息直接挂 text 字段
  let items: any[]
  if (Array.isArray(block.content)) {
    items = block.content
  } else if (typeof block.content === 'string') {
    items = [{ type: 'text', text: block.content }]
  } else if (block.text) {
    items = [{ type: 'text', text: block.text }]
  } else {
    items = []
  }

  if (items.length === 0) return null

  return (
    <div style={{ padding: '2px 0 2px 18px' }}>
      {items.map((item: any, i: number) => {
        if (item.type === 'image') {
          // 两种图片格式：
          // - source 嵌套：来自 SDK 回传的 tool_result（{ source: { type, media_type, data } }）
          // - 扁平格式：来自前端 buildContent 组装的用户输入（{ media_type, data }）
          let src: string | null = null
          if (item.source?.type === 'base64') {
            src = `data:${item.source.media_type};base64,${item.source.data}`
          } else if (item.data) {
            src = `data:${item.media_type};base64,${item.data}`
          }
          if (!src) return null
          return (
            <Image
              key={i}
              src={src}
              style={{ maxHeight: 240, borderRadius: 4, display: 'block', marginTop: 4 }}
            />
          )
        }

        const text = String(item.text ?? '')

        if (!text) return null

        // 检测文本附件：<file name="...">内容</file>
        // 文本文件附件走这个格式存储，渲染成文件卡片而不是纯文字
        const fileMatch = text.match(/^<file name="([^"]+)">\n([\s\S]*?)\n?<\/file>$/)
        if (fileMatch) {
          const [, name, content] = fileMatch
          return <FileCard key={i} name={name} content={content} token={token} />
        }

        return (
          <span key={i} style={{ fontSize: 13, color: token.colorText, wordBreak: 'break-all' }}>
            {text.slice(0, 500)}
            {text.length > 500 ? '…' : ''}
          </span>
        )
      })}
    </div>
  )
}

function SdkMessageView({ m }: { m: SessionMessage }) {
  const msg = m.message as any
  const content: any[] = Array.isArray(msg?.content) ? msg.content : []

  const { token } = theme.useToken()

  // console.log('content', content, 'type', m.type)

  if (m.type === 'assistant') {
    return (
      <>
        {content.map((b, i) => {
          if (b.type === 'text' && b.text)
            return (
              <div key={i} className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{b.text}</ReactMarkdown>
              </div>
            )
          if (b.type === 'tool_use') return <ToolCallBlock key={i} block={b} />

          if (b.type === 'thinking') return <ToolCallBlock key={i} block={b} />

          if (b.type === 'redacted_thinking') return <ToolCallBlock key={i} block={b} />

          if (b.type === '')
            return (
              <span className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{JSON.stringify(b) || ''}</ReactMarkdown>
              </span>
            )
        })}
      </>
    )
  }

  if (m.type === 'user') {
    // 把 content 分成两组：
    // - inlineBlocks：文字 + 粘贴图片（按位置顺序，富文本混排）
    // - attachmentBlocks：通过附件按钮上传的图片和文件（底部单独展示）
    // 区分依据：文字附件用 <file name="..."> 包裹，附件图片紧跟在文字块之后（末尾）
    // 简化策略：text 块中含 <file> 标签 或 image 块在所有 text 块之后 → 归为附件区
    const FILE_RE = /^<file name="([^"]+)">\n([\s\S]*?)\n?<\/file>$/

    // 找到最后一个非附件 text block 的位置，之后的 image 块视为附件
    let lastInlineTextIdx = -1
    content.forEach((b: any, i: number) => {
      if (b.type === 'text' && b.text && !FILE_RE.test(b.text)) {
        lastInlineTextIdx = i
      }
    })

    const inlineBlocks: any[] = []
    const attachmentBlocks: any[] = []
    content.forEach((b: any, i: number) => {
      if (b.type === 'tool_result') {
        inlineBlocks.push({ ...b, _idx: i })
      } else if (b.type === 'text' && FILE_RE.test(b.text)) {
        attachmentBlocks.push({ ...b, _idx: i })
      } else if (b.type === 'image' && i > lastInlineTextIdx) {
        // image 在所有普通文字之后 → 附件区
        attachmentBlocks.push({ ...b, _idx: i })
      } else {
        inlineBlocks.push({ ...b, _idx: i })
      }
    })

    return (
      <>
        {/* 文字 + 粘贴图片区 */}
        {inlineBlocks.map((b: any) => {
          if (b.type === 'tool_result') return <ToolResultBlock key={b._idx} block={b} />
          if (b.type === 'image') {
            let src: string | null = null
            if (b.source?.type === 'base64')
              src = `data:${b.source.media_type};base64,${b.source.data}`
            else if (b.data) src = `data:${b.media_type};base64,${b.data}`
            if (!src) return null
            return (
              <Image
                key={b._idx}
                src={src}
                style={{ maxHeight: 240, borderRadius: 4, display: 'block', marginTop: 4 }}
              />
            )
          }
          if (b.type === 'text' && b.text) {
            return (
              <div key={b._idx} className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{b.text}</ReactMarkdown>
              </div>
            )
          }
          return null
        })}

        {/* 附件区：图片卡片 + 文件卡片横排 */}
        {attachmentBlocks.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {attachmentBlocks.map((b: any) => {
              if (b.type === 'image') {
                let src: string | null = null
                if (b.source?.type === 'base64')
                  src = `data:${b.source.media_type};base64,${b.source.data}`
                else if (b.data) src = `data:${b.media_type};base64,${b.data}`
                if (!src) return null
                return (
                  <div
                    key={b._idx}
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 6,
                      overflow: 'hidden',
                      flexShrink: 0,
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <Image
                      src={src}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  </div>
                )
              }
              if (b.type === 'text') {
                const m = b.text.match(FILE_RE)
                if (!m) return null
                const [, name, content] = m
                return <FileCard key={b._idx} name={name} content={content} token={token} />
              }
              return null
            })}
          </div>
        )}
      </>
    )
  }

  return null
}

function ThinkingIndicator() {
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#999', fontSize: 12 }}
    >
      <LoadingOutlined spin style={{ fontSize: 11 }} />
      Thinking…
    </span>
  )
}

function BubbleBody({
  msg,
  pending,
  isUser,
}: {
  msg: DisplayMessage
  pending?: boolean
  isUser: boolean
}) {
  if (msg.error) return <Text type="danger">{msg.error}</Text>

  const hasContent = msg.sdkMessages.length > 0

  return (
    <>
      {msg.sdkMessages.map((m, i) => (
        <SdkMessageView key={m.uuid || i} m={m} />
      ))}
      {pending && !isUser && (
        <div style={{ marginTop: hasContent ? 6 : 0 }}>
          <ThinkingIndicator />
        </div>
      )}
    </>
  )
}

export function MessageBubble({ msg, pending }: { msg: DisplayMessage; pending?: boolean }) {
  const { token } = theme.useToken()
  const isUser = msg.role === 'user'

  // const avatar = isUser ? (
  //   <UserOutlined style={{ color: token.colorPrimary, fontSize: 12 }} />
  // ) : (
  //   <RobotOutlined style={{ color: '#10a37f', fontSize: 12 }} />
  // )

  // console.log('msg', msg)

  const bubbleStyle = {
    position: 'relative' as const,
    width: '100%',
    background: isUser ? token.colorFillAlter : '',
    borderRadius: 10,
    color: '#1a1a1a',
    padding: isUser ? '8px 2px' : '4px 13px',
    margin: isUser ? '28px 0 2px 0' : '0',
    lineHeight: 1.6,
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        marginBottom: 0,
      }}
    >
      <Space size={5} style={{ marginBottom: 5 }}>
        {msg.cost != null && msg.cost > 0 && (
          <Text style={{ fontSize: 10, color: '#bbb' }}>${msg.cost.toFixed(5)}</Text>
        )}
      </Space>
      <div style={bubbleStyle}>
        <BubbleBody msg={msg} pending={pending} isUser={isUser} />
      </div>
    </div>
  )
}
