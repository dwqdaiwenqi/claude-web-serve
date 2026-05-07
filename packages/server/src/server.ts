import Fastify from 'fastify'
import cors from '@fastify/cors'
import wsPlugin from '@fastify/websocket'
import staticPlugin from '@fastify/static'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { logger, logDir } from './logger'
import { findAvailablePort, getBestLocalIP } from './utils'
import { projectRoutes } from './routes/project'
import { sessionRoutes } from './routes/session'
import { terminalRoutes } from './routes/terminal'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'

export interface ServerOptions {
  port?: number
  hostname?: string
}

export async function startServer(opts: ServerOptions = {}): Promise<void> {
  const port = opts.port ?? 8003
  const hostname = opts.hostname ?? '127.0.0.1'

  const app = Fastify({ logger: false, forceCloseConnections: true })
  app.addContentTypeParser('*', { parseAs: 'string' }, (req, body, done) => {
    if (req.headers.upgrade?.toLowerCase() === 'websocket') return done(null, null)
    try {
      done(null, body ? JSON.parse(body as string) : {})
    } catch {
      done(null, {})
    }
  })
  await app.register(cors, { origin: '*' })
  await app.register(wsPlugin)

  await app.register(swagger, {
    openapi: {
      info: { title: 'claude-web API', version: '0.1.0' },
    },
  })
  await app.register(swaggerUi, {
    routePrefix: '/docs',
  })

  // 静态资源、favicon、健康检查 → debug；API → info；错误 → warn
  const STATIC_RE = /\.(js|css|html|ico|png|jpg|jpeg|gif|webp|svg|woff2?|ttf|map)(\?.*)?$/i
  function reqLevel(url: string, code: number): 'debug' | 'info' | 'warn' {
    if (code >= 400) return 'warn'
    if (STATIC_RE.test(url) || url === '/health' || url === '/api/health') return 'debug'
    return 'info'
  }

  app.addHook('onRequest', (req, _reply, done) => {
    const lvl = STATIC_RE.test(req.url) ? 'debug' : 'info'
    logger[lvl](`\x1b[36m→ ${req.method} ${req.url}\x1b[0m`)
    done()
  })
  app.addHook('onSend', (req, reply, payload, done) => {
    const code = reply.statusCode
    const lvl = reqLevel(req.url, code)
    const color = code >= 500 ? '\x1b[31m' : code >= 400 ? '\x1b[33m' : '\x1b[32m'
    logger[lvl](`${color}← ${req.method} ${req.url} ${code}\x1b[0m`)
    if (logger.isLevelEnabled('debug') && typeof payload === 'string') {
      try {
        const parsed = JSON.parse(payload)
        logger.debug({ body: parsed }, 'response body')
      } catch {
        // 非 JSON（SSE / 静态文件等），跳过
      }
    }
    done()
  })

  await app.register(
    async (api) => {
      api.get('/health', async () => ({ healthy: true, version: '0.1.0' }))
      await projectRoutes(api)
      await sessionRoutes(api)
      await terminalRoutes(api)
    },
    { prefix: '/api' }
  )

  // 静态文件（前端）
  const publicDir = path.join(path.dirname(new URL(import.meta.url).pathname), '../public')
  if (fs.existsSync(publicDir)) {
    await app.register(staticPlugin, { root: publicDir, prefix: '/' })
    app.setNotFoundHandler((_, reply) => reply.sendFile('index.html'))
  }

  const availablePort = await findAvailablePort(port)
  if (availablePort !== port) {
    logger.warn(
      { requested: port, using: availablePort },
      `port ${port} in use, using ${availablePort}`
    )
  }

  await app.listen({ port: availablePort, host: hostname })

  const localIP = getBestLocalIP()
  const urlLines = localIP
    ? `
→ http://127.0.0.1:${availablePort}
→ http://${localIP}:${availablePort}
   `
    : ''
  const docsLine = localIP
    ? `
docs:
→ http://127.0.0.1:${availablePort}/docs
→ http://${localIP}:${availablePort}/docs`
    : ''
  logger.info(`server started\n${urlLines}\n${docsLine}\n\nlogs: ${logDir}`)

  if (process.env.NODE_ENV !== 'development') {
    const openUrl = `http://${localIP}:${availablePort}`
    exec(`open "${openUrl}"`, (err) => {
      if (err) {
        logger.warn({ err }, 'failed to open browser')
      }
    })
  }
}
