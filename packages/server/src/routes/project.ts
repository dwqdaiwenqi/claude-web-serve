import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fs from 'fs'
import path from 'path'
import { listSessions } from '@anthropic-ai/claude-agent-sdk'
import { CLAUDE_PROJECTS_DIR } from '@/store'
import { logger } from '@/logger'

/**
 * 规范化路径用于比较：统一用小写、正斜杠、去掉末尾斜杠
 * Windows: C:\Users\foo → c:/users/foo
 * Unix:    /Users/foo   → /users/foo  (保持首 /)
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/**
 * 安全检查：absPath 是否在 cwd 目录内（跨平台）
 */
function isPathInside(absPath: string, cwd: string): boolean {
  const a = normalizePath(absPath)
  const b = normalizePath(cwd)
  return a === b || a.startsWith(b + '/')
}

/**
 * 将 project 目录名反推为真实路径。
 * 策略：目录名如 -Users-daiwenqi-code-test-claude，按 - 分割后
 * 用 DFS 尝试所有可能的路径组合，优先选择实际存在于文件系统的路径。
 * 找不到时降级读 .jsonl 里的 cwd 字段。
 */
function dirNameToCwd(dirName: string): string {
  const parts = dirName.split('-').slice(1) // 去掉开头空串

  function tryResolve(idx: number, current: string): string | null {
    if (idx === parts.length) return fs.existsSync(current) ? current : null
    let segment = ''
    for (let end = idx; end < parts.length; end++) {
      segment = segment ? segment + '-' + parts[end] : parts[end]
      const next = path.join(current, segment)
      if (fs.existsSync(next)) {
        const result = tryResolve(end + 1, next)
        if (result !== null) return result
      }
    }
    return null
  }

  // Unix: 从根 / 开始搜索
  const unixResult = tryResolve(0, '/')
  if (unixResult) return unixResult

  // Windows: 尝试常见盘符 C: D: E:
  for (const drive of ['C', 'D', 'E', 'F']) {
    const result = tryResolve(0, drive + ':' + path.sep)
    if (result) return result
  }

  // 降级：读 .jsonl 里的 cwd 字段
  const dirPath = path.join(CLAUDE_PROJECTS_DIR, dirName)
  try {
    for (const file of fs.readdirSync(dirPath).filter((f) => f.endsWith('.jsonl'))) {
      for (const line of fs.readFileSync(path.join(dirPath, file), 'utf8').split('\n')) {
        if (!line.includes('"cwd"')) continue
        try {
          const obj = JSON.parse(line)
          if (typeof obj.cwd === 'string') return obj.cwd
        } catch {}
      }
    }
  } catch {}

  // 最终降级：用正斜杠拼出 Unix 风格路径
  return '/' + parts.join('/')
}

export interface ProjectInfo {
  id: string // 目录名，如 -Users-daiwenqi-code-claude-code-web
  cwd: string // 实际路径，如 /Users/daiwenqi/code/claude-code-web
  sessionCount: number
  updatedAt: number
}

/** 扫描 ~/.claude/projects，列出所有有 .jsonl 文件的项目 */
async function listProjects(): Promise<ProjectInfo[]> {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return []

  const entries = fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
  const projects: ProjectInfo[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dirName = entry.name
    const dirPath = path.join(CLAUDE_PROJECTS_DIR, dirName)

    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.jsonl'))
    if (files.length === 0) continue

    // 用 dirNameToCwd 作为 dir 参数调用 listSessions，从 session 元数据拿 cwd
    const fallbackCwd = dirNameToCwd(dirName)
    let cwd = fallbackCwd
    let updatedAt = 0

    try {
      const sessions = await listSessions({ dir: fallbackCwd })
      // 取 lastModified 最大的 session 的 cwd
      for (const s of sessions) {
        if (s.lastModified > updatedAt) {
          updatedAt = s.lastModified
          if (s.cwd) cwd = s.cwd
        }
      }
    } catch {}

    // listSessions 失败或没有 cwd 时，降级用文件 mtime
    if (updatedAt === 0) {
      for (const f of files) {
        try {
          const stat = fs.statSync(path.join(dirPath, f))
          if (stat.mtimeMs > updatedAt) updatedAt = stat.mtimeMs
        } catch {}
      }
    }

    projects.push({ id: dirName, cwd, sessionCount: files.length, updatedAt })
  }

  return projects.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function projectRoutes(api: FastifyInstance) {
  // ── Project 列表 ────────────────────────────────────────
  api.get('/project', async () => listProjects())

  // ── Project sessions ────────────────────────────────────
  api.get('/project/:id/session', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const dirPath = path.join(CLAUDE_PROJECTS_DIR, id)
    if (!fs.existsSync(dirPath)) return reply.code(404).send({ error: 'Project not found' })

    const cwd = dirNameToCwd(id)

    const sessions = await listSessions({ dir: cwd })
    return sessions
      .sort((a, b) => b.lastModified - a.lastModified)
      .map((s) => ({
        id: s.sessionId,
        title: s.summary,
        cwd,
        lastModified: s.lastModified,
        gitBranch: s.gitBranch,
        createdAt: s.createdAt,
      }))
  })

  // ── 文件树 ──────────────────────────────────────────────
  api.get('/project/:id/tree', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const cwd = dirNameToCwd(id)
    logger.debug({ id, cwd, exists: fs.existsSync(cwd) }, 'tree request')
    if (!fs.existsSync(cwd)) return reply.code(404).send({ error: 'Project not found' })

    const q = req.query as { path?: string }
    const relPath = q.path ?? '/'
    const absPath = path.resolve(cwd, relPath.replace(/^[/\\]/, ''))

    if (!isPathInside(absPath, cwd)) return reply.code(403).send({ error: 'Forbidden' })
    if (!fs.existsSync(absPath)) return reply.code(404).send({ error: 'Path not found' })

    const IGNORE = new Set(['.git', 'node_modules', '.next', 'dist', '.cache', '.DS_Store'])
    const root = cwd

    function buildTree(dir: string, depth = 0): object[] {
      if (depth > 8) return []
      let entries
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch (err) {
        logger.warn({ dir, err }, 'buildTree: readdirSync failed')
        return []
      }
      return entries
        .filter((e) => !IGNORE.has(e.name) && !e.name.startsWith('.'))
        .sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        .map((e) => {
          const fullPath = path.join(dir, e.name)
          const relToRoot = '/' + path.relative(root, fullPath).replace(/\\/g, '/')
          if (e.isDirectory()) {
            return {
              name: e.name,
              path: relToRoot,
              type: 'dir',
              children: buildTree(fullPath, depth + 1),
            }
          }
          let size: number | undefined
          try { size = fs.statSync(fullPath).size } catch {}
          return { name: e.name, path: relToRoot, type: 'file', size }
        })
    }

    return buildTree(absPath)
  })

  // ── 文件内容（文本） ─────────────────────────────────────
  api.get('/project/:id/file', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const cwd = dirNameToCwd(id)
    if (!fs.existsSync(cwd)) return reply.code(404).send({ error: 'Project not found' })

    const q = req.query as { path?: string }
    if (!q.path) return reply.code(400).send({ error: 'path is required' })

    const absPath = path.resolve(cwd, q.path.replace(/^[/\\]/, ''))
    if (!isPathInside(absPath, cwd)) return reply.code(403).send({ error: 'Forbidden' })
    if (!fs.existsSync(absPath)) return reply.code(404).send({ error: 'File not found' })

    const stat = fs.statSync(absPath)
    if (!stat.isFile()) return reply.code(400).send({ error: 'Not a file' })
    if (stat.size > 1024 * 1024) return reply.code(413).send({ error: 'File too large' })

    const content = fs.readFileSync(absPath, 'utf8')
    return { path: q.path, content, size: stat.size }
  })

  // ── 文件原始内容（图片/音频二进制） ─────────────────────
  api.get('/project/:id/file/raw', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const cwd = dirNameToCwd(id)
    if (!fs.existsSync(cwd)) return reply.code(404).send({ error: 'Project not found' })

    const q = req.query as { path?: string }
    if (!q.path) return reply.code(400).send({ error: 'path is required' })

    const absPath = path.resolve(cwd, q.path.replace(/^[/\\]/, ''))
    if (!isPathInside(absPath, cwd)) return reply.code(403).send({ error: 'Forbidden' })
    if (!fs.existsSync(absPath)) return reply.code(404).send({ error: 'File not found' })

    const stat = fs.statSync(absPath)
    if (!stat.isFile()) return reply.code(400).send({ error: 'Not a file' })
    if (stat.size > 20 * 1024 * 1024) return reply.code(413).send({ error: 'File too large' })

    const ext = path.extname(absPath).toLowerCase()
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.bmp': 'image/bmp',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.flac': 'audio/flac',
      '.aac': 'audio/aac',
    }
    const mime = mimeMap[ext] ?? 'application/octet-stream'
    const buffer = fs.readFileSync(absPath)
    reply.header('Content-Type', mime)
    reply.header('Cache-Control', 'no-cache')
    return reply.send(buffer)
  })
}
