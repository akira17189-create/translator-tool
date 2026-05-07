import { app, BrowserWindow, Menu, ipcMain, shell, screen, nativeImage } from 'electron'
import { join } from 'path'
import {
  initDatabase,
  getApiConfigs, addApiConfig, updateApiConfig, deleteApiConfig, setActiveConfig,
  getSelectionApiId, setSelectionApiConfig,
  getSettings, setSetting,
  addWordToWordbook, deleteWordFromWordbook, getWordbook,
  getGlossary, addGlossaryTerm, updateGlossaryTerm, deleteGlossaryTerm,
} from './database.js'
import { startServer, stopServer } from './server.js'
import { setupTray } from './tray.js'
import { initDictionary, lookupWord } from './dictionary.js'
import { initGlobalHook, enableHook, disableHook, isHookEnabled, updateHotkey, destroyGlobalHook, setAutoSelect } from './globalHook.js'
import { translate, buildChatCompletionsUrl } from './translate.js'

let mainWindow = null
let popupWindow = null
let popupPinned = false

// ─── 设置窗口 ─────────────────────────────────────────────────────────────────

function createSettingsWindow() {
  // Load the app icon (used for taskbar + Alt+Tab; the in-window title bar
  // also references it via electronAPI.iconPath if needed).
  let iconImg = undefined
  try {
    const p = join(__dirname, '../../resources/icon.png')
    const img = nativeImage.createFromPath(p)
    if (!img.isEmpty()) iconImg = img
  } catch {}

  const win = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 720,
    minHeight: 500,
    title: '翻译工具',
    icon: iconImg,
    backgroundColor: '#F3F0EE',
    // Drop the native Windows chrome and the app menu bar; we render a
    // custom title bar inside the page (see renderer/settings/App.jsx).
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setMenu(null)

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/settings/index.html')
  } else {
    win.loadFile(join(__dirname, '../renderer/settings/index.html'))
  }

  win.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault()
      win.hide()
    }
  })

  // Notify the renderer when maximize state changes so the title bar's
  // restore/maximize icon stays in sync.
  win.on('maximize',   () => win.webContents.send('win:maximizedChanged', true))
  win.on('unmaximize', () => win.webContents.send('win:maximizedChanged', false))

  // F12 toggles DevTools — only in unpackaged (dev) builds. End users of
  // the shipped .exe don't get this shortcut.
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        win.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
  }

  return win
}

// ─── 翻译弹窗 ─────────────────────────────────────────────────────────────────

function createPopupWindow() {
  const win = new BrowserWindow({
    width: 360,
    height: 260,
    minWidth: 280,
    maxWidth: 480,
    maxHeight: 520,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    show: false,
    title: '翻译',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/popup/index.html')
  } else {
    win.loadFile(join(__dirname, '../renderer/popup/index.html'))
  }

  win.on('blur', () => {
    if (!popupPinned) win.hide()
  })

  return win
}

/**
 * 在鼠标附近显示翻译弹窗
 */
async function showPopup({ text, x, y }) {
  if (!popupWindow || popupWindow.isDestroyed()) {
    popupWindow = createPopupWindow()
  }

  popupPinned = false

  // 发送加载中状态
  popupWindow.webContents.send('popup:loading', { text })

  // 计算弹窗位置（在鼠标右下角，避免超出屏幕）
  const display = screen.getDisplayNearestPoint({ x, y })
  const { bounds } = display
  const winW = 360
  const winH = 260

  let posX = x + 16
  let posY = y + 16
  if (posX + winW > bounds.x + bounds.width)  posX = x - winW - 8
  if (posY + winH > bounds.y + bounds.height) posY = y - winH - 8
  posX = Math.max(bounds.x + 4, posX)
  posY = Math.max(bounds.y + 4, posY)

  popupWindow.setPosition(Math.round(posX), Math.round(posY))
  popupWindow.setSize(winW, winH)
  popupWindow.show()

  // 判断是否是单词（用于决定是否查词典）
  const trimmed = text.trim()
  const isSingleWord = trimmed.split(/\s+/).length <= 2 && /^[a-zA-Z''-]+$/.test(trimmed.replace(/\s+/g, ''))

  // 并发执行：词典查询 + AI 翻译
  const [dictResult, transResult] = await Promise.allSettled([
    isSingleWord ? Promise.resolve(lookupWord(trimmed)) : Promise.resolve(null),
    translate({ text: trimmed, mode: isSingleWord ? 'word' : 'sentence' }),
  ])

  const dictData  = dictResult.status === 'fulfilled'  ? dictResult.value  : null
  const transData = transResult.status === 'fulfilled' ? transResult.value : { translation: '', offline: true }

  if (!popupWindow || popupWindow.isDestroyed()) return

  const payload = {
    text: trimmed,
    isSingleWord,
    dict: dictData,
    translation: transData.translation,
    engine: transData.engine,
    offline: transData.offline,
    error: transData.error,
  }

  popupWindow.webContents.send('popup:data', payload)

  // 根据内容自动调整高度
  const hasDict = dictData?.found && dictData?.definitions?.length > 0
  const newH = hasDict ? Math.min(420, winH + dictData.definitions.length * 22 + 80) : winH
  popupWindow.setSize(winW, newH)
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

function registerIpcHandlers() {
  // API 配置
  ipcMain.handle('db:getApiConfigs', () => getApiConfigs())
  ipcMain.handle('db:addApiConfig', (_, config) => addApiConfig(config))
  ipcMain.handle('db:updateApiConfig', (_, id, config) => updateApiConfig(id, config))
  ipcMain.handle('db:deleteApiConfig', (_, id) => deleteApiConfig(id))
  ipcMain.handle('db:setActiveConfig', (_, id) => setActiveConfig(id))
  ipcMain.handle('db:getSelectionApiId', () => getSelectionApiId())
  ipcMain.handle('db:setSelectionApiConfig', (_, id) => setSelectionApiConfig(id))

  // 设置
  ipcMain.handle('db:getSettings', () => getSettings())
  ipcMain.handle('db:setSetting', (_, key, value) => {
    setSetting(key, String(value))
    if (key === 'hotkey')      updateHotkey(value)
    if (key === 'auto_select') setAutoSelect(value === '1' || value === true)
  })

  // 生词本
  ipcMain.handle('db:getWordbook', () => getWordbook())
  ipcMain.handle('db:addWord', (_, entry) => addWordToWordbook(entry))
  ipcMain.handle('db:deleteWord', (_, id) => deleteWordFromWordbook(id))

  // 术语表
  ipcMain.handle('db:getGlossary', () => getGlossary())
  ipcMain.handle('db:addGlossaryTerm', (_, term) => addGlossaryTerm(term))
  ipcMain.handle('db:updateGlossaryTerm', (_, id, term) => updateGlossaryTerm(id, term))
  ipcMain.handle('db:deleteGlossaryTerm', (_, id) => deleteGlossaryTerm(id))

  // 全局 Hook 开关
  ipcMain.handle('hook:isEnabled', () => isHookEnabled())
  ipcMain.handle('hook:enable', () => {
    enableHook()
    setSetting('hook_enabled', '1')
    mainWindow?.webContents.send('hook:statusChanged', true)
  })
  ipcMain.handle('hook:disable', () => {
    disableHook()
    setSetting('hook_enabled', '0')
    mainWindow?.webContents.send('hook:statusChanged', false)
  })

  // 弹窗控制
  ipcMain.handle('popup:close', () => { popupWindow?.hide() })
  ipcMain.handle('popup:pin', (_, pinned) => { popupPinned = pinned })

  // 自定义标题栏的窗口控制（min / max-restore / close / state）
  function senderWindow(e) {
    return BrowserWindow.fromWebContents(e.sender)
  }
  ipcMain.handle('win:minimize', (e) => { senderWindow(e)?.minimize() })
  ipcMain.handle('win:toggleMaximize', (e) => {
    const w = senderWindow(e)
    if (!w) return false
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
    return w.isMaximized()
  })
  ipcMain.handle('win:close', (e) => { senderWindow(e)?.close() })
  ipcMain.handle('win:isMaximized', (e) => !!senderWindow(e)?.isMaximized())

  // 词典直查
  ipcMain.handle('dict:lookup', (_, word) => lookupWord(word))

  // 翻译直调
  ipcMain.handle('translate:run', (_, opts) => translate(opts))

  // 服务状态检查（主进程直接返回，不走 fetch）
  ipcMain.handle('server:status', () => ({ running: true, version: '0.1.0' }))

  // API 连接测试（在主进程发请求，绕过 CORS）
  ipcMain.handle('api:test', async (_, { base_url, api_key, model }) => {
    const url = buildChatCompletionsUrl(base_url)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api_key}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the single word: OK' }], max_tokens: 10 }),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) {
        const txt = await res.text()
        return { ok: false, msg: `HTTP ${res.status}: ${txt.slice(0, 200)}` }
      }
      const data  = await res.json()
      const reply = data.choices?.[0]?.message?.content || '(empty)'
      return { ok: true, msg: `✓ 连接成功，回复：${reply}` }
    } catch (e) {
      return { ok: false, msg: e.message }
    }
  })

  // 其他
  ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url))
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Kill the default "File / Edit / View / Window / Help" menu bar
  // globally — every BrowserWindow we create afterwards inherits this.
  Menu.setApplicationMenu(null)

  initDatabase()
  initDictionary()
  registerIpcHandlers()
  startServer()

  mainWindow  = createSettingsWindow()
  popupWindow = createPopupWindow()

  const settings   = getSettings()
  const hotkey     = settings.hotkey || 'Alt+Z'
  const hookActive = settings.hook_enabled === '1'

  initGlobalHook({
    hotkey,
    autoSelect: settings.auto_select === '1',
    onSelection: (text, x, y) => showPopup({ text, x, y }),
  })

  if (hookActive) enableHook()

  setupTray(app, mainWindow, {
    isHookEnabled,
    enableHook: () => {
      enableHook()
      setSetting('hook_enabled', '1')
      mainWindow?.webContents.send('hook:statusChanged', true)
    },
    disableHook: () => {
      disableHook()
      setSetting('hook_enabled', '0')
      mainWindow?.webContents.send('hook:statusChanged', false)
    },
  })

  app.on('activate', () => { if (mainWindow) mainWindow.show() })
})

app.on('before-quit', () => {
  app.isQuiting = true
  destroyGlobalHook()
  stopServer()
})

app.on('window-all-closed', () => {
  // 托盘保持运行
})
