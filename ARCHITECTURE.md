# ARCHITECTURE.md
# 翻译工具 · 架构文档（Claude Code 工作上下文）

> **每次开始新的 Claude Code 会话前，先读这个文件。**
> 这里记录了所有关键决策，不要在没有读此文件的情况下修改架构。

---

## 项目概述

一个面向游戏本地化团队内部使用的翻译辅助工具，同时满足个人英文网页（如 AO3 同人文）沉浸式阅读需求。

**核心诉求：**
- 桌面端全局划词翻译（任意 Windows 应用内）
- 浏览器插件：网页双语对照 + 划词弹窗
- 翻译引擎完全使用用户自定义 API（OpenAI 兼容格式，用户输入 Base URL + Key）
- 离线词典兜底（无网络/API 不可用时仍能查基本释义）
- 生词本（本地存储）
- 术语表（本地存储，翻译时自动注入 prompt）
- 免费内部工具，不需要账号系统

**不在范围内（不要做）：**
- 团队数据同步 / Git 同步
- OCR 截图翻译（后期再说）
- 游戏本地化 CAT 工作流集成
- 任何需要自建服务器的功能

---

## 技术栈

| 层 | 技术 | 原因 |
|---|---|---|
| 桌面端框架 | **Electron** | JS 生态，Windows 支持成熟，打包方便 |
| 桌面端 UI | **React 18 + Tailwind CSS** | 组件化，适合多窗口（弹窗/设置/生词本） |
| 构建工具 | **Vite + electron-vite** | 现代工具链，开发体验好 |
| 插件-桌面通信 | **本地 HTTP Server**（端口 `27463`） | 比 Native Messaging 简单，容易调试 |
| 离线词典 | **ECDICT**（SQLite 格式） | 免费开源，词条量大，直接 SQL 查询 |
| 本地数据库 | **better-sqlite3** | 同步 API，稳定，无需异步处理 |
| 全局取词 | **uiohook-napi + globalShortcut** | 见下方"划词实现"说明 |
| 浏览器插件 | **Chrome Extension Manifest V3** | 兼容 Chrome / Edge |
| 包管理 | **pnpm + monorepo（pnpm workspaces）** | 共享代码，统一管理 |

---

## 目录结构

```
translator-tool/
│
├── ARCHITECTURE.md          ← 你正在读的文件
├── CLAUDE_CODE_STARTER.md   ← 会话启动提示词（含当前进度）
├── README.md
├── package.json             ← 根 package.json（pnpm workspaces）
├── pnpm-workspace.yaml
│
├── desktop/                 ← Electron 桌面端
│   ├── package.json
│   ├── electron.vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   │
│   ├── resources/
│   │   └── ecdict.db        # ECDICT 离线词典（需单独下载，约 200MB）
│   │
│   └── src/
│       ├── main/            ← 主进程（Node.js）
│       │   ├── index.js         # 入口：窗口管理、IPC、App 生命周期
│       │   ├── server.js        # 本地 HTTP Server（端口 27463）
│       │   ├── translate.js     # 调用自定义 API 的翻译逻辑
│       │   ├── dictionary.js    # 查询 ECDICT 离线词典 ✅ Phase 2
│       │   ├── database.js      # SQLite 封装（生词本、术语表、配置）
│       │   ├── globalHook.js    # 全局划词监听 ✅ Phase 2
│       │   └── tray.js          # 系统托盘图标和菜单
│       │
│       └── renderer/        ← 渲染进程（React）
│           ├── popup/           # 翻译弹窗 ✅ Phase 2
│           ├── settings/        # 设置页（API 配置、外观等）✅ Phase 1
│           ├── wordbook/        # 生词本页面 ✅ Phase 4
│           └── glossary/        # 术语表页面 ✅ Phase 4
│
└── extension/               ← 浏览器插件 ✅ Phase 3
    ├── manifest.json            # MV3，host_permissions: 127.0.0.1:*
    ├── background/
    │   └── service-worker.js    # 转发 content → 桌面端请求
    ├── content/
    │   ├── index.js             # content script 入口
    │   ├── bilingual.js         # 双语对照注入（IntersectionObserver）
    │   ├── selectionPopup.js    # 划词弹窗
    │   └── styles.css           # 插件注入样式（Mastercard 设计系统）
    ├── popup/
    │   ├── popup.html
    │   └── popup.js             # 连接状态 + 功能开关
    ├── options/
    │   ├── options.html         # 扩展设置页
    │   └── options.js
    └── icons/
```

---

## 通信协议：插件 ↔ 桌面端

桌面端在本地运行一个 HTTP Server，监听端口 **27463**。
浏览器插件通过 `fetch` 调用这个接口，绕过跨域限制（已在 manifest 里声明 `127.0.0.1:*` 权限）。

### 接口列表

#### `POST /translate`
翻译文本。

**Request:**
```json
{
  "text": "要翻译的文字",
  "sourceLang": "en",
  "targetLang": "zh",
  "context": "可选的上下文段落",
  "mode": "word" | "sentence" | "paragraph"
}
```

**Response:**
```json
{
  "translation": "译文",
  "engine": "用了哪个 API 配置的名字",
  "offline": false
}
```

#### `POST /lookup`
查离线词典（Phase 2 已实现）。

**Request:**
```json
{ "word": "ephemeral" }
```

**Response:**
```json
{
  "found": true,
  "word": "ephemeral",
  "phonetic": "/ɪˈfem.ər.əl/",
  "definitions": [{ "pos": "adj", "def": "短暂的；瞬息的" }],
  "exchange": {},
  "collins": 3,
  "rawTranslation": "adj. 短暂的；瞬息的"
}
```

#### `GET /status`
检查桌面端是否在线。

**Response:** `{ "running": true, "version": "0.1.0" }`

#### `GET /glossary`
获取完整术语表。

**Response:** `{ "terms": [{ "source_term": "Mana", "target_term": "魔力" }] }`

#### `POST /wordbook/add`
添加生词。

**Request:** `{ "word": "ephemeral", "sentence": "原句", "translation": "译文" }`

---

## 数据库 Schema（SQLite）

数据库文件位于：`%APPDATA%/translator-tool/data.db`

```sql
-- API 配置（支持多个，可切换）
CREATE TABLE api_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  model TEXT NOT NULL,
  system_prompt TEXT,
  is_active INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 生词本
CREATE TABLE wordbook (
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

-- 术语表
CREATE TABLE glossary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_term TEXT NOT NULL,
  target_term TEXT NOT NULL,
  category TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 应用设置
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- 默认设置：
-- hotkey: "Alt+Z"
-- hook_enabled: "0"
-- popup_position: "near_cursor"
-- theme: "light"
-- auto_detect_lang: "1"
-- source_lang: "en"
-- target_lang: "zh"
-- port: "27463"
```

---

## 翻译逻辑（translate.js）

1. 从数据库读取当前激活的 `api_config`
2. 从数据库读取 `glossary` 术语表
3. 构建 prompt：system prompt = 用户自定义 + 术语表注入
4. 调用 `fetch(baseUrl + '/v1/chat/completions', ...)`，OpenAI 兼容格式
5. 若 API 调用失败，返回 `offline: true`

---

## 划词取词实现（globalHook.js）— Phase 2

### 工作方式

两种互补机制：

**方式一：快捷键触发（推荐）**
1. 用户在任意应用中选中文字
2. 按下配置的快捷键（默认 `Alt+Z`）
3. 应用通过 PowerShell `SendKeys("^c")` 模拟 Ctrl+C
4. 等待 ~200ms，读取剪贴板
5. 翻译 + 显示弹窗

**方式二：鼠标松开自动检测（Windows only）**
1. uiohook-napi 监听全局 `mouseup`（左键）
2. 松开后同样执行 Ctrl+C → 剪贴板读取
3. 若内容相比上次有变化，触发翻译

### 注意事项
- `simulateCtrlC()` 通过 PowerShell 实现，约 100-250ms 延迟，Windows 专属
- 超过 500 字符的剪贴板变化不视为划词（判断为粘贴操作）
- `uiohook-napi` 在 Windows 上不需要管理员权限
- 快捷键通过 Electron `globalShortcut` 注册，设置页修改后立即热更新

---

## 翻译弹窗（popup）— Phase 2

弹窗是一个独立的 `BrowserWindow`，配置：
- `frame: false`, `alwaysOnTop: true`, `skipTaskbar: true`
- 位置：鼠标右下角，自动避免超出屏幕边界
- 失去焦点时自动隐藏（可 Pin 固定）

**弹窗内容（单词模式）：**
- 单词 + 音标 + Collins 星级
- 词形变化（过去式、复数等）
- ECDICT 词典释义（按词性分类）
- AI 翻译结果 + 所用引擎名
- "加入生词本"按钮

**弹窗内容（句子/段落模式）：**
- 原文（截断显示）
- AI 翻译结果
- "加入生词本"按钮

**数据流：**
```
用户划词 → globalHook.js → showPopup() → popup:loading (IPC)
                          → translate() + lookupWord() (并发)
                          → popup:data (IPC) → React 渲染
```

---

## 浏览器插件双语注入逻辑（bilingual.js）— Phase 3

**适用场景：** AO3 等英文长文阅读网站

**工作方式：**
1. 识别页面中的段落元素（`<p>`, `<div>` 等含纯文本的块）
2. 用 IntersectionObserver 监听哪些段落进入视口
3. 进入视口的段落 → 发请求到桌面端 `/translate`（mode: "paragraph"）
4. 收到译文后，在原段落**下方**插入 `<div class="tt-translation">译文</div>`

**AO3 特别处理：**
- 选择器：`div#chapters p`, `div.userstuff p`
- 跳过：章节标题、作者注、标签区域

---

## 插件 UI 设计系统 — Phase 3

插件 UI 全面应用 Mastercard 设计风格：
- **字体**：Sofia Sans（Google Fonts）
- **背景色**：Canvas Cream `#f5f0e8`
- **强调色**：Mastercard 橙 `#f37021`
- **卡片**：白色背景 + 细圆角 + 轻阴影

适用范围：`extension/popup/`、`extension/options/`、`extension/content/styles.css`

---

## 开发阶段规划

### ✅ Phase 1 — 翻译核心（已完成）
- [x] Electron 基础框架（electron-vite 初始化）
- [x] 设置页：添加/编辑/切换 API 配置
- [x] translate.js：调用自定义 API
- [x] 本地 HTTP Server 启动（端口 27463）
- [x] `/translate` 和 `/status` 接口可用

### ✅ Phase 2 — 桌面取词（已完成）
- [x] 系统托盘完善（开关划词、状态显示）
- [x] 全局划词监听（uiohook-napi + globalShortcut）
- [x] 翻译弹窗（frame:false 浮动窗口，鼠标附近定位）
- [x] 离线词典查询（dictionary.js + ECDICT，含词形还原）
- [x] 弹窗显示：单词模式（音标 + 词典 + AI 译）+ 句子模式（AI 译）
- [x] "加入生词本"按钮（弹窗内一键操作）
- [x] 设置页：划词开关 + 快捷键配置（热更新）
- [x] `/lookup` 接口接入真实词典（替换占位符）

### ✅ Phase 3 — 浏览器插件（已完成）
- [x] 插件基础框架 + manifest.json（MV3，host_permissions: 127.0.0.1:*）
- [x] 划词弹窗（content/selectionPopup.js → background → /translate or /lookup）
- [x] 连接状态检测（popup 检测 /status，未连接时显示 alert card）
- [x] AO3 双语对照注入（content/bilingual.js，IntersectionObserver，aoauto 开关）
- [x] 插件 popup 开关控制（双语对照 + 划词弹窗独立开关）
- [x] 扩展设置页（options/options.html，端口配置 + 功能开关 + 连接测试）
- [x] Mastercard 设计系统全面应用（Sofia Sans + Canvas Cream + 橙色 accent）

### ✅ Phase 4 — 词汇功能（已完成）
- [x] 生词本 CRUD + 页面（完整实现，含删除确认 + Toast）
- [x] 术语表 CRUD + 页面（Add/Edit/Delete 弹窗，分类标签，A-Z 导航）
- [x] 生词本导出（CSV / Anki 格式）

---

## 注意事项 & 已知约束

- **ECDICT 词典文件**需要用户手动下载（约 200MB），放到 `desktop/resources/ecdict.db`。下载地址：https://github.com/skywind3000/ECDICT/releases
- **uiohook-napi** 在 Windows 上不需要管理员权限（与鼠标/键盘钩子不同）
- **PowerShell SendKeys** 约 100-250ms，属于可接受范围；macOS 需另行实现（暂不支持）
- **端口 27463** 如果被占用，在设置页修改，插件的扩展设置页也需同步
- **API Key 安全**：存在 SQLite 里，不加密（内部工具可接受）
- **多窗口**：popup 和 settings 是独立 BrowserWindow，共用同一个 preload/index.js
- **popup Pin 功能**：popupPinned 变量在 index.js 主进程维护，blur 事件检查它
- **词形还原**：dictionary.js 内置简单规则（-ing/-ed/-s/-er/-ly），覆盖常见变形，不做完整词根分析
- **插件只支持 Chrome / Edge**（Chromium 内核），Firefox 使用 MV2 API，暂不兼容
