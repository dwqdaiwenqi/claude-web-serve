import { useIsMobile } from '@/hooks/useIsMobile'
import { useProjectPage } from './useProjectPage'
import MobileLayout from './MobileLayout'
import DesktopLayout from './DesktopLayout'
import './index.less'

export default function ProjectPage() {
  const isMobile = useIsMobile()
  const state = useProjectPage()

  return isMobile ? <MobileLayout {...state} /> : <DesktopLayout {...state} />
}
