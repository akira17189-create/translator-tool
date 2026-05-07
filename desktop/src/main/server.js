import express from 'express'
import cors from 'cors'
import { getSetting, getGlossary, addWordToWordbook } from './database.js'
import { translate } from './translate.js'
import { lookupWord } from './dictionary.js'

const VERSION = '0.1.0'
let server = null

function createApp() {
  const app = express()

  app.use(cors({
    origin: ['chrome-extension://*', 'null', 'http://localhost:*'],
    methods: ['GET', 'POST', 'OPTIONS'],
  }))
  app.use(express.json({ limit: '1mb' }))

  // 仅允许本地连接
  app.use((req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || ''
    const isLocal = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip) || ip.startsWith('::ffff:127.')
    if (!isLocal) return res.status(403).json({ error: 'Forbidden: only local connections allowed' })
    next()
  })

  // ── GET /status ──────────────────────────────────────────────────────────
  app.get('/status', (req, res) => {
    res.json({ running: true, version: VERSION })
  })

  // ── POST /translate ──────────────────────────────────────────────────────
  app.post('/translate', async (req, res) => {
    const { text, sourceLang, targetLang, context, mode } = req.body || {}
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' })

    try {
      const result = await translate({ text, sourceLang, targetLang, context, mode })
      res.json(result)
    } catch (err) {
      console.error('[server /translate]', err)
      res.status(500).json({ error: err.message, offline: true })
    }
  })

  // ── POST /lookup ─────────────────────────────────────────────────────────
  // Phase 2 完整实现：查询 ECDICT 离线词典
  app.post('/lookup', (req, res) => {
    const { word } = req.body || {}
    if (!word) return res.status(400).json({ error: 'word is required' })

    try {
      const result = lookupWord(word)
      res.json(result)
    } catch (err) {
      console.error('[server /lookup]', err)
      res.status(500).json({ error: err.message, found: false, word })
    }
  })

  // ── GET /glossary ────────────────────────────────────────────────────────
  app.get('/glossary', (req, res) => {
    try {
      res.json({ terms: getGlossary() })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // ── POST /wordbook/add ───────────────────────────────────────────────────
  app.post('/wordbook/add', (req, res) => {
    const { word, sentence, translation, source_url, phonetic, definition } = req.body || {}
    if (!word) return res.status(400).json({ error: 'word is required' })

    try {
      const result = addWordToWordbook({
        word,
        phonetic:        phonetic || null,
        definition:      definition || null,
        source_sentence: sentence || null,
        translation:     translation || null,
        source_url:      source_url || null,
      })
      res.json({ success: true, id: result.id })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // ── 404 ──────────────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` })
  })

  return app
}

export function startServer() {
  const port = parseInt(getSetting('port', '27463'), 10)
  const expressApp = createApp()

  server = expressApp.listen(port, '127.0.0.1', () => {
    console.log(`[server] HTTP server running on http://127.0.0.1:${port}`)
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] Port ${port} is in use. Change it in Settings.`)
    } else {
      console.error('[server]', err)
    }
  })
}

export function stopServer() {
  server?.close(() => console.log('[server] Stopped'))
  server = null
}
