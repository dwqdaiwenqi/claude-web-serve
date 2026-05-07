import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spin, App as AntdApp, Tooltip, Modal, Button } from 'antd'
import {
  FolderOpenOutlined,
  BranchesOutlined,
  PlusOutlined,
  RightOutlined,
  LoadingOutlined,
  HomeOutlined,
  CheckCircleFilled,
} from '@ant-design/icons'
import { api, type ProjectInfo } from '@/http/index'
import TerminalPanel from '@/components/Terminal/index.tsx'
import FullSpin from '@/components/FullSpin'
import { useIsMobile } from '@/hooks/useIsMobile'
import './index.less'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

function ProjectCard({ project, onClick }: { project: ProjectInfo; onClick: () => void }) {
  const name = project.cwd.split('/').pop() || project.cwd
  const parentPath = project.cwd.split('/').slice(0, -1).join('/')

  return (
    <div className="projectCard" onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="projectCard-icon">
          <FolderOpenOutlined style={{ color: '#1677ff', fontSize: 16 }} />
        </div>
        <div style={{ overflow: 'hidden', paddingRight: 8 }}>
          <div className="projectCard-name">{name}</div>
          <div className="projectCard-path">
            <Tooltip title={parentPath}>{parentPath}</Tooltip>
          </div>
        </div>
      </div>

      <div className="projectCard-meta">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <BranchesOutlined style={{ fontSize: 11 }} />
          <span>{project.sessionCount} 个会话</span>
        </div>
        <div className="projectCard-time">
          {project.updatedAt ? timeAgo(project.updatedAt) : '从未'}
        </div>
      </div>
    </div>
  )
}

// ── 目录浏览器 ─────────────────────────────────────────────────────────────
function DirPicker({ selected, onSelect }: { selected: string; onSelect: (path: string) => void }) {
  const [currentPath, setCurrentPath] = useState('')
  const [dirs, setDirs] = useState<{ name: string; path: string }[]>([])
  const [loadingPath, setLoadingPath] = useState<string | null>(null)

  async function navigate(path?: string) {
    const target = path ?? ''
    setLoadingPath(target || '__root__')
    try {
      const res = await api.listDirs(path)
      setCurrentPath(res.path)
      setDirs(res.dirs)
    } finally {
      setLoadingPath(null)
    }
  }

  useEffect(() => {
    navigate()
  }, [])

  // 面包屑：把路径拆成可点击的段
  const segments = currentPath ? currentPath.split('/').filter(Boolean) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 已选路径提示 */}
      {selected && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            background: '#f0f9ff',
            border: '1px solid #bae0ff',
            borderRadius: 6,
            fontSize: 12,
            color: '#0958d9',
          }}
        >
          <CheckCircleFilled style={{ color: '#1677ff' }} />
          <span
            style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {selected}
          </span>
        </div>
      )}

      {/* 面包屑导航 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
          padding: '4px 8px',
          background: '#fafafa',
          border: '1px solid #e8e8e8',
          borderRadius: 6,
          fontSize: 12,
          minHeight: 32,
        }}
      >
        <span
          style={{ cursor: 'pointer', color: '#1677ff', padding: '0 2px' }}
          onClick={() => navigate()}
        >
          <HomeOutlined />
        </span>
        {segments.map((seg, i) => {
          const segPath = '/' + segments.slice(0, i + 1).join('/')
          return (
            <span key={segPath} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <RightOutlined style={{ fontSize: 9, color: '#bbb' }} />
              <span
                style={{
                  cursor: 'pointer',
                  color: i === segments.length - 1 ? '#333' : '#1677ff',
                  padding: '0 2px',
                  fontWeight: i === segments.length - 1 ? 600 : undefined,
                }}
                onClick={() => i < segments.length - 1 && navigate(segPath)}
              >
                {seg}
              </span>
            </span>
          )
        })}
      </div>

      {/* 目录列表 */}
      <div
        style={{
          border: '1px solid #e8e8e8',
          borderRadius: 6,
          overflow: 'auto',
          maxHeight: 280,
          background: '#fff',
        }}
      >
        {loadingPath !== null ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <LoadingOutlined style={{ color: '#1677ff', fontSize: 20 }} />
          </div>
        ) : dirs.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: '#bbb', fontSize: 12 }}>
            没有子目录
          </div>
        ) : (
          dirs.map((dir) => {
            const isSelected = selected === dir.path
            return (
              <div
                key={dir.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '7px 12px',
                  cursor: 'pointer',
                  background: isSelected ? '#e6f4ff' : undefined,
                  borderBottom: '1px solid #f5f5f5',
                  transition: 'background 0.1s',
                }}
                onClick={() => onSelect(dir.path)}
                onDoubleClick={() => navigate(dir.path)}
              >
                <FolderOpenOutlined
                  style={{
                    color: isSelected ? '#1677ff' : '#faad14',
                    marginRight: 8,
                    fontSize: 14,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: isSelected ? '#1677ff' : '#333',
                    fontWeight: isSelected ? 600 : undefined,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {dir.name}
                </span>
                <RightOutlined
                  style={{ color: '#ccc', fontSize: 11 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(dir.path)
                  }}
                />
              </div>
            )
          })
        )}
      </div>

      <div style={{ fontSize: 11, color: '#aaa' }}>
        单击选中目录，双击或点击 <RightOutlined style={{ fontSize: 9 }} /> 进入子目录
      </div>
    </div>
  )
}

// ── 主页 ────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedCwd, setSelectedCwd] = useState('')
  const [linking, setLinking] = useState(false)
  const { message } = AntdApp.useApp()

  async function load(showLoading = false) {
    if (showLoading) setLoading(true)
    try {
      setProjects([...((await api.listProjects()) || [])])
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => {
    load(true)
  }, [])

  function openModal() {
    setSelectedCwd('')
    setModalOpen(true)
  }

  async function handleLink() {
    if (!selectedCwd) return
    setLinking(true)
    try {
      const res = await api.linkProject(selectedCwd)
      if ('error' in res) {
        message.error(res.error)
        return
      }
      message.success('项目已添加')
      setModalOpen(false)
      await load()
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className="homePage">
      {loading && <FullSpin />}

      <Modal
        title="选择项目目录"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleLink}
        okText="添加"
        cancelText="取消"
        confirmLoading={linking}
        okButtonProps={{ disabled: !selectedCwd }}
        width={520}
      >
        <div style={{ padding: '8px 0' }}>
          <DirPicker selected={selectedCwd} onSelect={setSelectedCwd} />
        </div>
      </Modal>

      {!loading && (
        <>
          <div className="homePage-content">
            <div className="homePage-header">
              <div className="homePage-header-title">Claude Web</div>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div className="homePage-header-subtitle">
                  当前有 {projects?.length} 个 Claude 项目
                </div>
                <Button
                  color="primary"
                  variant="filled"
                  icon={<PlusOutlined />}
                  onClick={openModal}
                >
                  添加项目
                </Button>
              </div>
              <div className="homePage-header-divider" />
            </div>

            <div className="homePage-grid">
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
                  <Spin size="large" />
                </div>
              ) : projects.length === 0 ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    paddingTop: 60,
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 40 }}>📁</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#555' }}>暂无项目</div>
                  <div style={{ fontSize: 12, color: '#aaa', marginBottom: 16 }}>
                    点击下方按钮，选择项目目录即可开始
                  </div>

                  <Button
                    color="primary"
                    variant="filled"
                    icon={<PlusOutlined />}
                    onClick={openModal}
                  >
                    添加项目
                  </Button>
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                    gap: 12,
                  }}
                >
                  {projects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      onClick={() => navigate(`/project/${p.id}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {!isMobile && (
            <>
              <div className="homePage-divider" />

              <div className="homePage-terminal">
                <TerminalPanel
                  welcomeMessage={[
                    '\x1b[1;36m╔══════════════════════════════════════════════════╗\x1b[0m\r\n',
                    '\x1b[1;36m║         欢迎使用 Claude Web  🤖                  ║\x1b[0m\r\n',
                    '\x1b[1;36m╚══════════════════════════════════════════════════╝\x1b[0m\r\n',
                    '\r\n',
                  ].join('')}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
