import { Collapse } from 'antd'

export interface FileDiff {
  file: string
  status: 'added' | 'deleted' | 'modified'
  before: string
  after: string
  additions: number
  deletions: number
}

function DiffLines({ diff }: { diff: FileDiff }) {
  const beforeLines = diff.before.split('\n')
  const afterLines = diff.after.split('\n')
  const maxLen = Math.max(beforeLines.length, afterLines.length)
  const lineItems: { type: 'added' | 'removed' | 'unchanged'; content: string }[] = []
  for (let i = 0; i < maxLen; i++) {
    const b = beforeLines[i]
    const a = afterLines[i]
    if (b === a) {
      lineItems.push({ type: 'unchanged', content: a ?? '' })
    } else {
      if (b !== undefined) lineItems.push({ type: 'removed', content: b })
      if (a !== undefined) lineItems.push({ type: 'added', content: a })
    }
  }

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 11, overflowX: 'auto' }}>
      {lineItems.map((line, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            background:
              line.type === 'added' ? '#f6ffed' : line.type === 'removed' ? '#fff2f0' : undefined,
            borderLeft: `2px solid ${line.type === 'added' ? '#b7eb8f' : line.type === 'removed' ? '#ffa39e' : 'transparent'}`,
          }}
        >
          <span
            style={{
              width: 20,
              textAlign: 'center',
              flexShrink: 0,
              color: '#bbb',
              userSelect: 'none',
            }}
          >
            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
          </span>
          <span
            style={{
              padding: '0 8px',
              whiteSpace: 'pre',
              color:
                line.type === 'added' ? '#389e0d' : line.type === 'removed' ? '#cf1322' : '#333',
            }}
          >
            {line.content}
          </span>
        </div>
      ))}
    </div>
  )
}

function CollapseLabel({ diff }: { diff: FileDiff }) {
  const statusColor =
    diff.status === 'added' ? '#389e0d' : diff.status === 'deleted' ? '#cf1322' : '#888'
  const statusLabel = diff.status === 'added' ? 'A' : diff.status === 'deleted' ? 'D' : 'M'
  const fileName = diff.file.split('/').pop() ?? diff.file

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: '#fff',
          background: statusColor,
          borderRadius: 2,
          padding: '1px 4px',
          flexShrink: 0,
        }}
      >
        {statusLabel}
      </span>
      <span
        style={{
          fontSize: 12,
          color: '#1a1a1a',
          fontFamily: 'monospace',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '200px',
        }}
        title={diff.file}
      >
        {fileName}
        {diff.file !== fileName && (
          <span style={{ color: '#bbb', marginLeft: 6, fontSize: 11 }}>{diff.file}</span>
        )}
      </span>
      <span style={{ fontSize: 11, color: '#389e0d', flexShrink: 0 }}>+{diff.additions}</span>
      <span style={{ fontSize: 11, color: '#cf1322', flexShrink: 0, marginLeft: 4 }}>
        -{diff.deletions}
      </span>
    </div>
  )
}

export default function DiffReview({ diffs }: { diffs: FileDiff[] }) {
  if (diffs.length === 0) {
    return (
      <div style={{ color: '#bbb', fontSize: 12, textAlign: 'center', marginTop: 60 }}>
        暂无文件变更
      </div>
    )
  }

  const items = diffs.map((diff) => ({
    key: diff.file,
    label: <CollapseLabel diff={diff} />,
    children: <DiffLines diff={diff} />,
  }))

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
      <Collapse
        items={items}
        size="small"
        style={{ borderRadius: 0, border: 'none', borderBottom: '1px solid #e8e8ec' }}
        expandIconPosition="end"
      />
    </div>
  )
}
