import { Layout, Button, Tag, Tabs, Drawer } from 'antd'
import { MenuOutlined, HomeOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import ChatPanel from '@/components/ChatPanel/index.tsx'
import DiffReview from '@/components/DiffReview/index.tsx'
import FullSpin from '@/components/FullSpin'
import SessionList from './components/SessionList'
import type { useProjectPage } from './useProjectPage'

const C = {
  bg0: '#f7f7f8',
  bg1: '#ffffff',
  bg3: '#e8e8ec',
  text0: '#1a1a1a',
}

type PageState = ReturnType<typeof useProjectPage>

interface Props extends PageState {}

export default function MobileLayout(p: Props) {
  const navigate = useNavigate()

  if (p.preLoading) {
    return (
      <Layout className="projectPage" style={{ height: '100vh', background: C.bg0 }}>
        <FullSpin />
      </Layout>
    )
  }

  return (
    <Layout
      className="projectPage"
      style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg0 }}
    >
      {/* Session drawer */}
      <Drawer
        title={null}
        placement="left"
        open={p.mobileDrawerOpen}
        onClose={() => p.setMobileDrawerOpen(false)}
        width="85%"
        closable={false}
        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderBottom: `1px solid ${C.bg3}`,
            }}
          >
            <HomeOutlined
              style={{ color: '#888', cursor: 'pointer', fontSize: 15 }}
              onClick={() => navigate('/')}
            />
          </div>
          <SessionList
            projectCwd={p.projectCwd}
            sessions={p.sessions}
            activeId={p.activeId}
            onSelect={(id) => {
              p.selectSession(id)
              p.setMobileDrawerOpen(false)
            }}
            onNew={() => {
              p.startNewSession()
              p.setMobileDrawerOpen(false)
            }}
            onDelete={p.deleteSession}
          />
        </div>
      </Drawer>

      {/* Top bar */}
      <div
        style={{
          height: 44,
          background: C.bg1,
          borderBottom: `1px solid ${C.bg3}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <Button
          type="text"
          icon={<MenuOutlined />}
          onClick={() => p.setMobileDrawerOpen(true)}
          style={{ padding: '0 6px' }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: C.text0,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {p.activeSession?.title ?? p.projectCwd.split('/').pop()}
        </span>
        {p.activeSession?.status === 'busy' && (
          <Tag color="orange" style={{ fontSize: 10, padding: '0 4px' }}>
            运行中
          </Tag>
        )}
      </div>

      {/* Tab bar */}
      <Tabs
        activeKey={p.mobileTab}
        onChange={(k) => p.setMobileTab(k as 'chat' | 'review')}
        size="small"
        style={{ flexShrink: 0, background: C.bg1, paddingLeft: 12 }}
        items={[
          { key: 'chat', label: '会话' },
          {
            key: 'review',
            label: `${p.fileDiffs.length ? p.fileDiffs.length + ' 个' : ''}文件变更`,
          },
        ]}
      />

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {p.mobileTab === 'chat' ? (
          <ChatPanel
            activeId={p.activeId}
            sessionTitle={p.activeSession?.title}
            messages={p.messages}
            msgLoading={p.msgLoading}
            loading={p.loading}
            input={p.input}
            onInputChange={p.setInput}
            onSend={p.sendMessage}
            onAbort={p.handleAbort}
            onPasteImage={p.handlePasteImage}
            activeProjectID={p.projectId ?? null}
            pendingQuestion={p.pendingQuestion?.questions ?? null}
            onResolve={p.handleResolve}
            bypassPermissions={p.bypassPermissions}
            onBypassPermissionsChange={p.setBypassPermissions}
          />
        ) : (
          <div
            style={{
              flex: 1,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              background: C.bg1,
            }}
          >
            <DiffReview diffs={p.fileDiffs} />
          </div>
        )}
      </div>
    </Layout>
  )
}
