import { List, Button, Typography, Space, Tag, Popconfirm } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import type { SessionSummary } from '@/http/index'
import { NEW_SESSION_ID } from '../useProjectPage'

const { Text } = Typography

const C = {
  bg0: '#f7f7f8',
  bg1: '#ffffff',
  bg3: '#e8e8ec',
  text0: '#1a1a1a',
  text1: '#888888',
}

interface Props {
  projectCwd: string
  sessions: SessionSummary[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

export default function SessionList({
  projectCwd,
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: Props) {
  return (
    <>
      <div style={{ padding: '10px 10px 8px', borderBottom: `1px solid ${C.bg3}`, flexShrink: 0 }}>
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
          onClick={onNew}
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
              onClick={() => s.id !== NEW_SESSION_ID && onSelect(s.id)}
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
                <Popconfirm key="del" title="删除此会话？" onConfirm={() => onDelete(s.id)}>
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
    </>
  )
}
