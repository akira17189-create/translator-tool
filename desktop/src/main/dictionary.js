import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import { existsSync } from 'fs'

let db = null

/**
 * 获取 ECDICT 数据库路径
 * 生产环境：extraResources 里的 ecdict.db
 * 开发环境：desktop/resources/ecdict.db
 */
function getEcdictPath() {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'ecdict.db')
  }
  // 开发时，electron-vite 的 __dirname 是 out/main/，向上两级到 desktop/
  return join(app.getAppPath(), 'resources', 'ecdict.db')
}

export function initDictionary() {
  const dbPath = getEcdictPath()
  if (!existsSync(dbPath)) {
    console.warn('[dictionary] ECDICT not found at', dbPath, '— offline lookup disabled')
    return false
  }
  try {
    db = new Database(dbPath, { readonly: true })
    db.pragma('query_only = true')
    console.log('[dictionary] ECDICT loaded from', dbPath)
    return true
  } catch (err) {
    console.error('[dictionary] Failed to open ECDICT:', err.message)
    return false
  }
}

/**
 * 查询单词
 * @param {string} word
 * @returns {{ found: boolean, word: string, phonetic?: string, definitions?: Array, exchange?: string, collins?: number }}
 */
export function lookupWord(word) {
  if (!db) return { found: false, word, unavailable: true }

  const cleaned = word.trim().toLowerCase()
  if (!cleaned) return { found: false, word }

  try {
    // 精确查询
    let row = queryExact(cleaned)

    // 如果没找到，尝试词形还原
    if (!row) {
      const stems = getStemCandidates(cleaned)
      for (const stem of stems) {
        row = queryExact(stem)
        if (row) break
      }
    }

    if (!row) return { found: false, word: cleaned }
    return formatResult(row, word)
  } catch (err) {
    console.error('[dictionary] lookup error:', err.message)
    return { found: false, word: cleaned, error: err.message }
  }
}

function queryExact(word) {
  return db
    .prepare(
      `SELECT word, phonetic, translation, pos, exchange, collins, frq
       FROM stardict WHERE word = ? LIMIT 1`
    )
    .get(word)
}

/**
 * 将数据库行解析为标准格式
 */
function formatResult(row, originalWord) {
  // translation 字段格式：多行，每行形如 "adj. 短暂的；瞬息的\nn. 短暂的东西"
  const definitions = parseTranslation(row.translation || '')

  // exchange 字段格式："p:ran/d:ran/i:running/3:runs/r:run"
  const exchange = parseExchange(row.exchange || '')

  return {
    found: true,
    word: row.word,
    originalWord,
    phonetic: row.phonetic || '',
    definitions,              // [{ pos: 'adj', def: '短暂的；瞬息的' }, ...]
    exchange,                 // { past: 'ran', pastParticiple: 'run', ... }
    collins: row.collins || 0, // Collins 星级（1-5）
    frq: row.frq || 0,        // BNC 词频
    rawTranslation: row.translation || '',
  }
}

/**
 * 解析 ECDICT 的 translation 字段
 * 格式：每行 "pos. definition"，pos 可能是 adj/n/vt/vi/adv/prep 等
 */
function parseTranslation(translation) {
  if (!translation) return []
  const lines = translation.split('\n').filter(Boolean)
  return lines.map((line) => {
    // 匹配 "adj. " / "n. " / "vt. " 等前缀
    const m = line.match(/^([a-z]+)\.\s+(.+)/)
    if (m) return { pos: m[1], def: m[2].trim() }
    return { pos: '', def: line.trim() }
  })
}

/**
 * 解析 exchange 字段为可读格式
 * 原始："p:went/d:gone/i:going/3:goes/r:better/t:best/s:geese"
 * p: 过去式  d: 过去分词  i: 现在分词  3: 第三人称单数  r: 比较级  t: 最高级  s: 复数
 */
function parseExchange(exchange) {
  if (!exchange) return {}
  const result = {}
  const map = { p: 'past', d: 'pastParticiple', i: 'presentParticiple', '3': 'thirdPerson', r: 'comparative', t: 'superlative', s: 'plural' }
  for (const part of exchange.split('/')) {
    const [key, val] = part.split(':')
    if (key && val && map[key]) result[map[key]] = val
  }
  return result
}

/**
 * 简单英文词形还原 (rule-based stemming)
 */
function getStemCandidates(word) {
  const w = word.toLowerCase()
  const candidates = []

  // -ing: running→run, having→have, writing→write
  if (w.length > 5 && w.endsWith('ing')) {
    const base = w.slice(0, -3)
    candidates.push(base)                 // running → run
    candidates.push(base + 'e')           // having → have
    if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
      candidates.push(base.slice(0, -1))  // running → run (double consonant)
    }
  }

  // -ed: walked→walk, loved→love, stopped→stop
  if (w.length > 4 && w.endsWith('ed')) {
    const base = w.slice(0, -2)
    candidates.push(base)                 // walked → walk
    candidates.push(base + 'e')           // loved → love
    if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
      candidates.push(base.slice(0, -1))  // stopped → stop
    }
  }

  // -s/-es: cats→cat, boxes→box, flies→fly
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) {
    candidates.push(w.slice(0, -1))       // cats → cat
    if (w.endsWith('es')) {
      candidates.push(w.slice(0, -2))     // boxes → box
      if (w.endsWith('ies')) {
        candidates.push(w.slice(0, -3) + 'y') // flies → fly
      }
    }
  }

  // -er/-est: bigger→big, fastest→fast
  if (w.length > 4 && w.endsWith('er')) {
    candidates.push(w.slice(0, -2))
    candidates.push(w.slice(0, -1))
  }
  if (w.length > 5 && w.endsWith('est')) {
    candidates.push(w.slice(0, -3))
    candidates.push(w.slice(0, -2))
  }

  // -ly: quickly→quick
  if (w.length > 4 && w.endsWith('ly')) {
    candidates.push(w.slice(0, -2))
  }

  return [...new Set(candidates)].filter((s) => s.length > 1)
}
