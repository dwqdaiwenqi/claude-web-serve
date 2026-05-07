import { Button, Spin } from 'antd'
import { FileOutlined } from '@ant-design/icons'
import FileViewer from '@/components/FileViewer/index.tsx'
import DiffReview, { type FileDiff } from '@/components/DiffReview/index.tsx'

const C = {
  bg0: '#f7f7f8',
  bg1: '#ffffff',
  bg3: '#e8e8ec',
  text2: '#bbb',
}

interface Props {
  projectId: string
  rightPanel: 'review' | 'file'
  onPanelChange: (p: 'review' | 'file') => void
  fileDiffs: FileDiff[]
  selectedFile: { path: string; content: string } | null
  fileLoading: boolean
}

export default function RightPanel({
  projectId,
  rightPanel,
  onPanelChange,
  fileDiffs,
  selectedFile,
  fileLoading,
}: Props) {
  const isReview = rightPanel === 'review'

  return (
    <>
      <div
        style={{
          height: 36,
          background: C.bg0,
          borderBottom: `1px solid ${C.bg3}`,
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          gap: 8,
          paddingLeft: 12,
        }}
      >
        <Button
          color={isReview ? 'primary' : 'default'}
          variant={isReview ? 'filled' : 'text'}
          size="small"
          onClick={() => onPanelChange('review')}
        >
          变更 {fileDiffs.length || ''}
        </Button>

        {selectedFile && (
          <Button
            color={isReview ? 'default' : 'primary'}
            variant={isReview ? 'text' : 'filled'}
            size="small"
            icon={<FileOutlined style={{ fontSize: 10 }} />}
            onClick={() => onPanelChange('file')}
          >
            <span>{selectedFile.path.split('/').pop()}</span>
          </Button>
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
        {isReview ? (
          <DiffReview diffs={fileDiffs} />
        ) : (
          <>
            {fileLoading && <Spin style={{ display: 'block', margin: '40px auto' }} />}
            {!fileLoading && selectedFile && (
              <FileViewer
                projectID={projectId}
                filePath={selectedFile.path}
                content={selectedFile.content}
              />
            )}
            {!fileLoading && !selectedFile && (
              <div style={{ color: C.text2, fontSize: 12, textAlign: 'center', marginTop: 60 }}>
                暂未查看文件
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
