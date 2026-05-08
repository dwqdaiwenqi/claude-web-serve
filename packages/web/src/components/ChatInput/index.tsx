import { useCallback, useRef, useState } from 'react'
import { theme, App } from 'antd'
import { PlusOutlined, CloseOutlined, FileOutlined } from '@ant-design/icons'
import { MentionsInput, Mention, type SuggestionDataItem } from 'react-mentions'
import { api } from '@/http/index'

// 附件统一用这个结构，图片和文本文件都走这里
export interface Attachment {
  name: string
  // 图片：base64 data
  // 文本文件：文件内容字符串
  content: string
  // 图片类型时有值，文本文件为 null
  mediaType: string | null
}

interface Props {
  value: string
  onChange: (value: string) => void
  // 粘贴图片：插入到输入框光标位置（富文本模式，走 [Image N] token）
  onPasteImage: (file: File) => void
  // attachments 一起传出，让 useProjectPage 的 buildContent 追加到末尾
  onSend: (attachments: Attachment[]) => void
  disabled?: boolean
  activeProjectID: string | null
}

const COMMANDS: SuggestionDataItem[] = [
  { id: 'init', display: 'init（分析项目结构，生成CLAUDE.md）' },
  { id: 'cost', display: 'cost（当前会话的 Token 消耗量与预估）' },
  { id: 'context', display: 'context（可视化上下文窗口使用量）' },
  { id: 'clear', display: 'clear（清除当前会话的全部消息）' },
]

const MAX_SIZE_IMAGE = 2 * 1024 * 1024 // 图片 2MB，超过 base64 传输慢且 token 消耗高
const MAX_SIZE_TEXT = 200 * 1024 // 文本文件 200KB，避免占满 context window

// 支持的文本/代码文件扩展名白名单
const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'log',
  'env',
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'cjs',
  'py',
  'go',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'rs',
  'rb',
  'php',
  'swift',
  'kt',
  'json',
  'yaml',
  'yml',
  'toml',
  'xml',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'sh',
  'bash',
  'zsh',
  'fish',
  'sql',
  'graphql',
  'proto',
  'vue',
  'svelte',
  'astro',
])

const ACCEPT_INPUT = ['image/*', ...Array.from(TEXT_EXTENSIONS).map((ext) => `.${ext}`)].join(',')

type FileSuggestion = SuggestionDataItem & { size?: number }

function flattenTree(nodes: Awaited<ReturnType<typeof api.getFileTree>>): FileSuggestion[] {
  const result: FileSuggestion[] = []
  for (const node of nodes) {
    if (node.type === 'file') {
      result.push({ id: node.path, display: node.path, size: node.size })
    } else if (node.children) {
      result.push(...flattenTree(node.children))
    }
  }
  return result
}

function formatSize(bytes?: number): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export default function ChatInput({
  value,
  onChange,
  onPasteImage,
  onSend,
  disabled,
  activeProjectID,
}: Props) {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])

  const fetchFiles = useCallback(
    async (query: string, callback: (data: SuggestionDataItem[]) => void) => {
      if (!activeProjectID) return callback([])
      try {
        const tree = await api.getFileTree(activeProjectID)
        const all = flattenTree(tree)
        const filtered = query
          ? all.filter((f) => (f.display ?? '').toLowerCase().includes(query.toLowerCase()))
          : all
        callback(filtered)
      } catch {
        callback([])
      }
    },
    [activeProjectID]
  )

  function addFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const isImage = file.type.startsWith('image/')
    const isText = TEXT_EXTENSIONS.has(ext)

    if (!isImage && !isText) {
      message.warning(`不支持的文件类型 ".${ext}"`)
      return
    }

    const limit = isImage ? MAX_SIZE_IMAGE : MAX_SIZE_TEXT
    const limitLabel = isImage ? '2MB' : '200KB'

    if (file.size > limit) {
      message.warning(`文件 "${file.name}" 超过 ${limitLabel} 限制，请压缩后再上传`)
      return
    }

    if (isImage) {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        setAttachments((prev) => [
          ...prev,
          { name: file.name, content: base64, mediaType: file.type },
        ])
      }
      reader.readAsDataURL(file)
    } else {
      const reader = new FileReader()
      reader.onload = () => {
        setAttachments((prev) => [
          ...prev,
          { name: file.name, content: reader.result as string, mediaType: null },
        ])
      }
      reader.readAsText(file)
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find((item) => item.type.startsWith('image/'))
    if (imageItem) {
      e.preventDefault()
      const file = imageItem.getAsFile()
      // 粘贴图片走富文本模式：插入 [Image N] token 到光标位置
      if (file) onPasteImage(file)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    files.forEach(addFile)
    // 重置 input，允许重复选同一文件
    e.target.value = ''
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSend() {
    onSend(attachments)
    setAttachments([])
  }

  return (
    <div style={{ flex: 1, position: 'relative', opacity: disabled ? 0.5 : 1 }}>
      {/* 附件预览区 */}
      {attachments.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            padding: '6px 4px',
            marginBottom: 4,
          }}
        >
          {attachments.map((att, i) => (
            <div
              key={i}
              style={{
                position: 'relative',
                borderRadius: 6,
                overflow: 'hidden',
                border: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillAlter,
                flexShrink: 0,
              }}
            >
              {att.mediaType ? (
                // 图片缩略图
                <img
                  src={`data:${att.mediaType};base64,${att.content}`}
                  style={{ width: 56, height: 56, objectFit: 'cover', display: 'block' }}
                />
              ) : (
                // 非图片文件显示图标+文件名
                <div
                  style={{
                    width: 56,
                    height: 56,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    padding: 4,
                  }}
                >
                  <FileOutlined style={{ fontSize: 20, color: token.colorTextSecondary }} />
                  <span
                    style={{
                      fontSize: 10,
                      color: token.colorTextSecondary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      width: '100%',
                      textAlign: 'center',
                    }}
                  >
                    {att.name}
                  </span>
                </div>
              )}
              {/* 删除按钮 */}
              <div
                onClick={() => removeAttachment(i)}
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.55)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#fff',
                  fontSize: 9,
                }}
              >
                <CloseOutlined />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
        {/* 添加附件按钮 */}
        <div
          onClick={() => {
            if (!disabled) {
              fileInputRef.current?.click()
            }
          }}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: `1px solid ${token.colorBorderSecondary}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            color: token.colorTextTertiary,
            flexShrink: 0,
            marginBottom: 2,
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!disabled) e.currentTarget.style.color = token.colorText
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = token.colorTextTertiary
          }}
        >
          <PlusOutlined style={{ fontSize: 13 }} />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_INPUT}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <MentionsInput
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          disabled={disabled}
          placeholder="输入消息… (Enter 发送，Shift+Enter 换行，粘贴图片，@ 引用文件，/ 使用命令)"
          style={{
            flex: 1,
            '&multiLine': {
              control: { minHeight: 64, maxHeight: 200, overflowY: 'auto' },
              highlighter: { padding: '8px 12px', border: '1px solid transparent' },
              input: {
                padding: '8px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: 8,
                outline: 'none',
                resize: 'none',
                minHeight: 64,
                maxHeight: 200,
                overflowY: 'auto',
                fontFamily: 'inherit',
                fontSize: 14,
                lineHeight: '1.5',
                wordBreak: 'break-all',
              },
            },
            suggestions: {
              zIndex: 100,
              bottom: '100%',
              top: 'unset',
              width: '100%',
              marginBottom: 8,
              list: {
                background: '#fff',
                border: '1px solid #e8e8e8',
                borderRadius: 8,
                boxShadow: '0 -4px 12px rgba(0,0,0,0.1)',
                fontSize: 13,
                maxHeight: 220,
                overflowY: 'auto',
                width: '100%',
              },
              item: {
                padding: '6px 12px',
                cursor: 'pointer',
                '&focused': { background: '#e6f4ff' },
              },
            },
          }}
        >
          <Mention
            trigger="@"
            data={fetchFiles}
            displayTransform={(_id, display) => `@${display}`}
            markup="@[__display__](__id__)"
            style={{ backgroundColor: '#e6f4ff', borderRadius: 3 }}
            renderSuggestion={(suggestion) => {
              const s = suggestion as FileSuggestion
              const name = String(s.display).split('/').pop() ?? ''
              return (
                <div style={{ width: '100%', display: 'flex' }}>
                  <span style={{ fontWeight: 'bold', paddingRight: '8px' }}>{name}</span>
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      minWidth: 0,
                      color: token.colorTextLabel,
                    }}
                  >
                    {s.display}
                  </span>
                  <span style={{ paddingLeft: '8px', color: token.colorTextLabel, flexShrink: 0 }}>
                    {formatSize(s.size)}
                  </span>
                </div>
              )
            }}
          />
          <Mention
            trigger="/"
            data={COMMANDS}
            displayTransform={(_id) => `/${_id}`}
            markup="/__id__"
            style={{ backgroundColor: '#f6ffed', borderRadius: 3 }}
          />
        </MentionsInput>
      </div>
    </div>
  )
}
