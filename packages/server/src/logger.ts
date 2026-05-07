import pino from 'pino'
import os from 'os'
import path from 'path'
import fs from 'fs'

export const logDir = path.join(os.homedir(), '.claude-web', 'logs')

// Ensure log directory exists (sync, runs once at module load)
fs.mkdirSync(logDir, { recursive: true })

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? 'info',
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.transport({
    targets: [
      {
        target: 'pino-pretty',
        level: process.env.LOG_LEVEL ?? 'info',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'time',
          messageFormat: '{msg}',
          singleLine: false,
        },
      },
      {
        target: 'pino-roll',
        level: process.env.LOG_LEVEL ?? 'info',
        options: {
          file: path.join(logDir, 'server.log'),
          frequency: 'daily',
          mkdir: true,
          dateFormat: 'yyyy-MM-dd',
          extension: '.log',
          size: '50m',
        },
      },
    ],
  })
)
