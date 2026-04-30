import os from 'os'
import path from 'path'

// ~/.claude/projects 是 claude cli 原生目录
export const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects')

/**
 * 将文件系统路径转换为 claude cli 的 project 目录名
 * Unix:    /Users/foo/bar   → -Users-foo-bar
 * Windows: C:\Users\foo\bar → -C-Users-foo-bar
 */
export function cwdToProjectDirName(cwd: string): string {
  // 统一分隔符为 /，再去掉盘符冒号（C: → C），最后把所有 / 替换为 -
  return cwd.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1').replace(/\//g, '-')
}


/** 获取项目对应的目录名（project ID） */
export function getProjectDirName(cwd: string): string {
  // 规范化路径（去掉末尾斜杠等）
  const normalized = path.resolve(cwd)
  return cwdToProjectDirName(normalized)
}

/** 获取项目目录的完整路径 */
export function getProjectDir(dirName: string): string {
  return path.join(CLAUDE_PROJECTS_DIR, dirName)
}

/** 获取 session 的 .jsonl 文件路径 */
export function getSessionFile(dirName: string, sessionId: string): string {
  return path.join(getProjectDir(dirName), `${sessionId}.jsonl`)
}

// ── 运行时状态（内存）─────────────────────────────────────────────────────────

export interface RuntimeSession {
  /** SDK session UUID；新建 session 首次 query 前为 null */
  sessionId: string | null
  projectDirName: string // ~/.claude/projects 下的目录名
  cwd: string           // 工作目录路径
  status: 'idle' | 'busy'
  abort: AbortController | null
}

const runtimeSessions = new Map<string, RuntimeSession>()

export function getRuntimeSession(sessionId: string): RuntimeSession | null {
  return runtimeSessions.get(sessionId) ?? null
}

export function setRuntimeSession(session: RuntimeSession): void {
  if (session.sessionId) runtimeSessions.set(session.sessionId, session)
}

export function deleteRuntimeSession(sessionId: string): void {
  runtimeSessions.delete(sessionId)
}

/** 根据已知 sessionId 获取或新建运行时状态 */
export function getOrCreateRuntime(sessionId: string, cwd: string): RuntimeSession {
  const existing = runtimeSessions.get(sessionId)
  if (existing) return existing
  const session: RuntimeSession = {
    sessionId,
    projectDirName: getProjectDirName(cwd),
    cwd,
    status: 'idle',
    abort: null,
  }
  runtimeSessions.set(sessionId, session)
  return session
}

/** 为新 session（尚无 sessionId）创建运行时状态，query 完成后调用 assignSessionId */
export function createPendingRuntime(cwd: string): RuntimeSession {
  return {
    sessionId: null,
    projectDirName: getProjectDirName(cwd),
    cwd,
    status: 'idle',
    abort: null,
  }
}

/** SDK 分配了真实 sessionId 后，把 runtime 注册进 map */
export function assignSessionId(runtime: RuntimeSession, sessionId: string): void {
  runtime.sessionId = sessionId
  runtimeSessions.set(sessionId, runtime)
}

// ── Human-in-the-loop：等待用户回答 AskUserQuestion ──────────────────────────
const pendingApprovals = new Map<string, (decision: any) => void>()

export function setPendingApproval(sessionId: string, resolve: (decision: any) => void): void {
  pendingApprovals.set(sessionId, resolve)
}

export function resolvePendingApproval(sessionId: string, decision: any): boolean {
  const resolve = pendingApprovals.get(sessionId)
  if (!resolve) return false
  pendingApprovals.delete(sessionId)
  resolve(decision)
  return true
}
