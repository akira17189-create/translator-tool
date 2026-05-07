import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

let db = null

export function initDatabase() {
  const userDataPath = app.getPath('userData')
  const dbPath = join(userDataPath, 'data.db')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      model TEXT NOT NULL,
      system_prompt TEXT,
      is_active INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wordbook (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      phonetic TEXT,
      definition TEXT,
      source_sentence TEXT,
      translation TEXT,
      source_url TEXT,
      added_at TEXT DEFAULT (datetime('now')),
      review_count INTEGER DEFAULT 0,
      next_review TEXT
    );

    CREATE TABLE IF NOT EXISTS glossary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_term TEXT NOT NULL,
      target_term TEXT NOT NULL,
      category TEXT,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // 写入默认设置（已存在则跳过）
  const insertDefault = db.prepare(
    `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`
  )
  const defaults = [
    ['hotkey', 'Alt+Z'],
    ['popup_position', 'near_cursor'],
    ['theme', 'light'],
    ['auto_detect_lang', '1'],
    ['source_lang', 'en'],
    ['target_lang', 'zh'],
    ['port', '27463'],
  ]
  for (const [key, value] of defaults) {
    insertDefault.run(key, value)
  }

  console.log('[DB] Initialized at', dbPath)
  return db
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

// ─── API 配置 ──────────────────────────────────────────────────────────────

export function getApiConfigs() {
  return getDb().prepare('SELECT * FROM api_configs ORDER BY created_at DESC').all()
}

export function getActiveApiConfig() {
  return getDb().prepare('SELECT * FROM api_configs WHERE is_active = 1').get() || null
}

export function addApiConfig(config) {
  const { name, base_url, api_key, model, system_prompt } = config
  const result = getDb()
    .prepare(
      `INSERT INTO api_configs (name, base_url, api_key, model, system_prompt)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(name, base_url, api_key, model, system_prompt || null)
  return { id: result.lastInsertRowid }
}

export function updateApiConfig(id, config) {
  const { name, base_url, api_key, model, system_prompt } = config
  getDb()
    .prepare(
      `UPDATE api_configs SET name=?, base_url=?, api_key=?, model=?, system_prompt=? WHERE id=?`
    )
    .run(name, base_url, api_key, model, system_prompt || null, id)
}

export function deleteApiConfig(id) {
  getDb().prepare('DELETE FROM api_configs WHERE id=?').run(id)
}

export function setActiveConfig(id) {
  const d = getDb()
  d.prepare('UPDATE api_configs SET is_active=0').run()
  d.prepare('UPDATE api_configs SET is_active=1 WHERE id=?').run(id)
}

// ─── 划词翻译专用配置 ──────────────────────────────────────────────────────
// Stored in settings table as `selection_api_id`. If unset, selection
// translation falls back to the active config (current behaviour).

export function getApiConfigById(id) {
  if (!id) return null
  return getDb().prepare('SELECT * FROM api_configs WHERE id=?').get(id) || null
}

export function getSelectionApiConfig() {
  const raw = getSetting('selection_api_id', '')
  const id  = parseInt(raw, 10)
  if (Number.isFinite(id) && id > 0) {
    const cfg = getApiConfigById(id)
    if (cfg) return cfg
  }
  return getActiveApiConfig()
}

export function setSelectionApiConfig(id) {
  setSetting('selection_api_id', id ? String(id) : '')
}

export function getSelectionApiId() {
  const raw = getSetting('selection_api_id', '')
  const id  = parseInt(raw, 10)
  return Number.isFinite(id) && id > 0 ? id : null
}

// ─── 设置 ──────────────────────────────────────────────────────────────────

export function getSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all()
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key=?').get(key)
  return row ? row.value : fallback
}

export function setSetting(key, value) {
  getDb()
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`)
    .run(key, String(value))
}

// ─── 术语表 ────────────────────────────────────────────────────────────────

export function getGlossary() {
  return getDb().prepare('SELECT * FROM glossary ORDER BY source_term ASC').all()
}

export function addGlossaryTerm(term) {
  const { source_term, target_term, category, note } = term
  const result = getDb()
    .prepare(
      `INSERT INTO glossary (source_term, target_term, category, note) VALUES (?, ?, ?, ?)`
    )
    .run(source_term, target_term, category || null, note || null)
  return { id: result.lastInsertRowid }
}

export function updateGlossaryTerm(id, term) {
  const { source_term, target_term, category, note } = term
  getDb()
    .prepare('UPDATE glossary SET source_term=?, target_term=?, category=?, note=? WHERE id=?')
    .run(source_term, target_term, category || null, note || null, id)
}

export function deleteGlossaryTerm(id) {
  getDb().prepare('DELETE FROM glossary WHERE id=?').run(id)
}

// ─── 生词本 ────────────────────────────────────────────────────────────────

export function getWordbook() {
  return getDb().prepare('SELECT * FROM wordbook ORDER BY added_at DESC').all()
}

export function addWordToWordbook(entry) {
  const { word, phonetic, definition, source_sentence, translation, source_url } = entry
  const result = getDb()
    .prepare(
      `INSERT INTO wordbook (word, phonetic, definition, source_sentence, translation, source_url)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      word,
      phonetic || null,
      definition || null,
      source_sentence || null,
      translation || null,
      source_url || null
    )
  return { id: result.lastInsertRowid }
}

export function deleteWordFromWordbook(id) {
  getDb().prepare('DELETE FROM wordbook WHERE id=?').run(id)
}
