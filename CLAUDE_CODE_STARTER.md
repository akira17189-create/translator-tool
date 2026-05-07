# Claude Code 会话启动提示词

> 每次开始新的 Claude Code 会话时，把这段话贴给它。

---

请先阅读项目根目录的 `ARCHITECTURE.md`，了解整个项目的架构、技术栈、通信协议和数据库设计。

这是一个 Windows 桌面端翻译工具（Electron + React）+ 浏览器插件（Chrome Extension MV3）的 monorepo 项目。所有关键决策都记录在 `ARCHITECTURE.md` 里，请严格遵守文件中的约定，不要自行改变架构。

读完之后，请告诉我你理解了哪些核心点，然后我会告诉你今天要做什么。

---

**当前进展（每次更新这里）：**

- [x] 项目结构和配置文件已创建
- [x] Phase 1：Electron 基础框架 + 设置页 + 翻译核心 + HTTP Server
  - [x] `desktop/src/main/index.js` — 主进程入口，窗口管理、IPC 注册
  - [x] `desktop/src/main/database.js` — SQLite 封装（api_configs / wordbook / glossary / settings）
  - [x] `desktop/src/main/translate.js` — 调用自定义 API，含术语表注入
  - [x] `desktop/src/main/server.js` — Express HTTP Server（端口 27463），/translate、/status、/glossary、/wordbook/add、/lookup
  - [x] `desktop/src/main/tray.js` — 系统托盘（开关划词、状态显示）
  - [x] `desktop/src/preload/index.js` — contextBridge IPC 桥（window.electronAPI）
  - [x] `desktop/src/renderer/settings/` — 设置页 React UI（API 配置增删改激活 + 连接测试 + 通用设置 + 快捷键配置）
  - [x] `desktop/tailwind.config.js` + `postcss.config.js`
- [x] Phase 2：桌面全局取词 + 弹窗 + ECDICT 词典
  - [x] `desktop/src/main/globalHook.js` — uiohook-napi 全局鼠标监听 + globalShortcut 快捷键，PowerShell Ctrl+C 模拟取词
  - [x] `desktop/src/main/dictionary.js` — ECDICT SQLite 查询，内置词形还原（-ing/-ed/-s/-er/-ly）
  - [x] `desktop/src/renderer/popup/` — 翻译弹窗（frame:false，alwaysOnTop，鼠标附近定位，Pin 固定，失焦隐藏）
  - [x] 弹窗显示：单词模式（音标 + Collins 星级 + 词形变化 + 词典释义 + AI 译）+ 句子模式（AI 译）
  - [x] 弹窗「加入生词本」按钮（IPC 写入数据库）
  - [x] 设置页：划词开关 + 快捷键配置（热更新，无需重启）
- [x] Phase 3：浏览器插件
  - [x] `extension/manifest.json` — MV3，host_permissions: 127.0.0.1:*
  - [x] `extension/background/service-worker.js` — 转发 content script 请求到桌面端
  - [x] `extension/content/selectionPopup.js` — 网页划词弹窗（调用 /translate 或 /lookup）
  - [x] `extension/content/bilingual.js` — 双语对照注入（IntersectionObserver，AO3 选择器适配）
  - [x] `extension/popup/` — 插件 popup，连接状态检测（/status），双语 + 划词开关
  - [x] `extension/options/` — 扩展设置页（端口配置 + 功能开关 + 连接测试）
  - [x] Mastercard 设计系统：Sofia Sans + Canvas Cream + 橙色 accent，全面应用于插件 UI
- [x] Phase 4：生词本 + 术语表
  - [x] `desktop/src/renderer/wordbook/index.jsx` — 生词本 CRUD 页面（完整实现）
  - [x] `desktop/src/renderer/glossary/index.jsx` — 术语表 CRUD 页面（完整实现）
  - [x] 生词本导出（CSV / Anki 格式）

**当前任务：** Phase 4 完成 ✅。下一步可做：OCR 截图翻译、生词本 Anki 同步、macOS 支持。

---

**关键约定（给 Claude Code 看）：**
- IPC 命名：`db:<操作>` → 渲染进程用 `window.electronAPI.<方法名>()`
- HTTP Server 只监听 127.0.0.1，非本地 IP 返回 403
- translate.js 失败返回 `{ offline: true, error: '...' }`，不抛异常
- 数据库路径：`app.getPath('userData')/data.db`（Windows 下 `%APPDATA%/translator-tool/data.db`）
- 设置页样式在 `src/renderer/settings/styles.css`（纯 CSS 变量，不依赖 Tailwind 运行时）
- 插件 UI 使用 Mastercard 设计系统变量（Sofia Sans、Canvas Cream `#f5f0e8`、橙色 `#f37021`）
- popup Pin 状态由主进程 `popupPinned` 变量维护，blur 事件检查后决定是否隐藏
