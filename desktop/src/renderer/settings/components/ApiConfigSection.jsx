import React, { useState, useEffect } from 'react'

const EMPTY_FORM = {
  name: '',
  base_url: '',
  api_key: '',
  model: '',
  system_prompt: '',
}

// ─── Prompt 模板 ───────────────────────────────────────────────────────
// 每条 prompt 都包含一条「严格保留标点」的硬约束 —— 实测国内 LLM 经常
// 把英文双引号、单引号、省略号丢掉，导致对话和心理活动混在一起读不出来。
//
// {sourceLang}/{targetLang} 占位符在 translate.js 里会被替换成实际语言。
const PUNCT_RULE =
  '严格保留原文中所有标点符号（引号、单引号、省略号、破折号、问号、感叹号、括号等）—— ' +
  '它们用于区分对话、心理活动、引语、强调，丢失会导致语义混淆。'

const PROMPT_TEMPLATES = [
  {
    id: 'default',
    label: '通用 · 默认翻译助手',
    prompt:
      '你是一个专业翻译助手。将用户提供的{sourceLang}文本准确翻译为{targetLang}。\n' +
      PUNCT_RULE + '\n' +
      '只输出译文，不要解释、不要前言、不要总结。',
  },
  {
    id: 'fanfic',
    label: 'AO3 / 同人小说 · 叙事连贯',
    prompt:
      '你是一位翻译同人小说的资深译者，擅长 Fanfiction、特别是 AO3 风格的英文叙事。\n' +
      '将{sourceLang}文本翻译为流畅自然的{targetLang}：\n' +
      '- 保持叙事视角、人物语气、情感张力\n' +
      '- 对话用中文引号「」或""保留原文标点风格\n' +
      '- 角色名、地名、原作专有名词可适度直译或保留英文\n' +
      '- 心理活动、内心独白、动作描写要清晰区分\n' +
      PUNCT_RULE + '\n' +
      '只输出译文，不要解释。',
  },
  {
    id: 'news',
    label: '新闻 / 资讯 · 客观正式',
    prompt:
      '你是一位资深新闻编辑。将{sourceLang}新闻翻译为简洁、客观、符合中文媒体习惯的{targetLang}。\n' +
      '- 第三人称、不加主观评价\n' +
      '- 数字、单位、专有名词准确\n' +
      '- 保持新闻段落的紧凑节奏\n' +
      PUNCT_RULE + '\n' +
      '只输出译文，不要解释。',
  },
  {
    id: 'tech',
    label: '技术 / 文档 · 保留术语',
    prompt:
      '你是一位技术文档译者。将{sourceLang}技术文档翻译为{targetLang}：\n' +
      '- 代码片段、API 名、函数名、命令、文件路径**保留英文原文**，不翻译\n' +
      '- 通用技术术语首次出现时给中英对照（如 "回调函数 (callback)"），之后用中文\n' +
      '- 句式简洁清晰，不加感情色彩\n' +
      PUNCT_RULE + '\n' +
      '只输出译文。',
  },
  {
    id: 'email',
    label: '邮件 / 商务 · 礼貌得体',
    prompt:
      '你是一位商务文书翻译。将{sourceLang}邮件/商务文本翻译为符合中文商务礼仪的{targetLang}：\n' +
      '- 语气得体、不卑不亢\n' +
      '- 称呼、结尾用中文商务习惯（如 "您好"、"此致"）\n' +
      '- 日期、金额、合同条款准确\n' +
      PUNCT_RULE + '\n' +
      '只输出译文。',
  },
  {
    id: 'custom',
    label: '自定义 · 自己写下面的内容',
    prompt: '',
  },
]

function matchPromptTemplate(text) {
  if (!text) return 'default'
  const hit = PROMPT_TEMPLATES.find(t => t.id !== 'custom' && t.prompt === text)
  return hit ? hit.id : 'custom'
}

// 国产 LLM 服务商预设。统统永久免费、不需要充钱。
//
// 推荐组合：
//   网页正文翻译  → GLM-4-Flash       (质量最好的免费 LLM)
//   桌面端划词    → GLM-4-FlashX      (响应最快的免费 LLM)
//   长文/复杂段落 → GLM-Z1-Flash      (有思维链的推理型，慢但更聪明)
//   智谱挂了的备选 → SiliconFlow GLM-4-9B (不同厂商的同代开源 9B)
//
// 智谱三个模型共用同一把 API Key，只填一次即可。
const PRESETS = [
  {
    label: '智谱 GLM-4-Flash',
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    note: '永久免费 · 速度快、质量好的旗舰免费款 · 不知道选哪个就用它，覆盖 90% 网页正文翻译场景',
    register: 'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys',
    suggest: 'web',
  },
  {
    label: '智谱 GLM-4-FlashX',
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flashx',
    note: '永久免费 · 比 Flash 更快但质量略低 · 适合划词这种要"按下立刻出"的短文本',
    register: 'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys',
    suggest: 'selection',
  },
  {
    label: '智谱 GLM-Z1-Flash',
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-z1-flash',
    note: '永久免费 · 带思维链的推理型 · 比 Flash 慢一倍但更聪明 · 处理小说、文学性长段落、复杂上下文时质量明显更好',
    register: 'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys',
    suggest: 'reasoning',
  },
  {
    label: '硅基流动 GLM-4-9B',
    base_url: 'https://api.siliconflow.cn/v1',
    model: 'THUDM/glm-4-9b-chat',
    note: '永久免费 · 不同厂商的同代开源 9B · 仅作为智谱被限流或挂掉时的应急备用，平时不用切',
    register: 'https://cloud.siliconflow.cn/account/ak',
    suggest: 'backup',
  },
]

export default function ApiConfigSection() {
  const [configs, setConfigs] = useState([])
  const [selectionApiId, setSelectionApiIdState] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState(null)

  const api = window.electronAPI

  const loadConfigs = async () => {
    const [data, selId] = await Promise.all([
      api.getApiConfigs(),
      api.getSelectionApiId(),
    ])
    setConfigs(data)
    setSelectionApiIdState(selId)
  }

  useEffect(() => {
    loadConfigs()
  }, [])

  const handleSetSelection = async (id) => {
    // Toggle: clicking the active selection config clears it (fall back to active).
    const next = id === selectionApiId ? null : id
    await api.setSelectionApiConfig(next)
    await loadConfigs()
  }

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(true)
    setError('')
    setTestResult(null)
    setSelectedPreset(null)
  }

  const openEdit = (config) => {
    setForm({
      name: config.name,
      base_url: config.base_url,
      api_key: config.api_key,
      model: config.model,
      system_prompt: config.system_prompt || '',
    })
    setEditingId(config.id)
    setShowForm(true)
    setError('')
    setTestResult(null)
    // Match by base_url+model so editing a previously-imported preset still
    // surfaces its note + register link.
    const match = PRESETS.find(
      p => p.base_url === config.base_url && p.model === config.model,
    )
    setSelectedPreset(match || null)
  }

  const applyPreset = (preset) => {
    setForm((f) => ({
      ...f,
      name: f.name || preset.label,
      base_url: preset.base_url,
      model: preset.model,
    }))
    setSelectedPreset(preset)
  }

  const handleSave = async () => {
    if (!form.name.trim())     return setError('请填写配置名称')
    if (!form.base_url.trim()) return setError('请填写 Base URL')
    if (!form.api_key.trim())  return setError('请填写 API Key')
    if (!form.model.trim())    return setError('请填写模型名')

    setSaving(true)
    setError('')
    try {
      if (editingId) {
        await api.updateApiConfig(editingId, form)
      } else {
        await api.addApiConfig(form)
      }
      await loadConfigs()
      setShowForm(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('确认删除此配置？')) return
    await api.deleteApiConfig(id)
    await loadConfigs()
  }

  const handleSetActive = async (id) => {
    await api.setActiveConfig(id)
    await loadConfigs()
  }

  const handleTest = async () => {
    if (!form.base_url || !form.api_key || !form.model) {
      return setError('请先填写 Base URL、API Key 和模型名')
    }
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.electronAPI.testApiConfig({
        base_url: form.base_url,
        api_key:  form.api_key,
        model:    form.model,
      })
      setTestResult(result)
    } catch (e) {
      setTestResult({ ok: false, msg: e.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="section">
      <div className="section-eyebrow">
        <span className="section-eyebrow-dot" />
        <span>Endpoints</span>
      </div>

      <div className="section-header">
        <div>
          <h2 className="section-title">API 配置</h2>
          <p className="section-subtitle">添加任意 OpenAI 兼容的翻译接口，支持多配置并存与一键切换。</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openAdd}>
          + 新增配置
        </button>
      </div>

      {/* 配置列表 */}
      {configs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-eyebrow">
            <span className="empty-state-eyebrow-dot" />
            <span>Empty</span>
          </div>
          <div className="empty-state-title">还没有 API 配置</div>
          <div className="empty-state-hint">
            点击「新增配置」添加 DeepSeek / OpenAI / Kimi 等任意兼容接口。
          </div>
        </div>
      ) : (
        <div className="config-list">
          {configs.map((c) => {
            const isSelection = c.id === selectionApiId
            return (
              <div key={c.id} className={`config-card ${c.is_active ? 'active' : ''}`}>
                <div className="config-card-left">
                  {!!c.is_active && <span className="badge-active">网页翻译</span>}
                  {isSelection && <span className="badge-active" style={{ background: '#7C3AED' }}>划词翻译</span>}
                  <span className="config-name">{c.name}</span>
                  <span className="config-model">{c.model}</span>
                  <span className="config-url">{c.base_url}</span>
                </div>
                <div className="config-card-actions">
                  {!c.is_active && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => handleSetActive(c.id)}
                    >
                      网页用
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => handleSetSelection(c.id)}
                    title={isSelection ? '取消作为划词翻译模型' : '设为划词翻译模型（建议用快速小模型）'}
                  >
                    {isSelection ? '✓ 划词' : '划词用'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-subtle"
                    onClick={() => openEdit(c)}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger-ghost"
                    onClick={() => handleDelete(c.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 表单弹窗 */}
      {showForm && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
        >
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="modal-header-eyebrow">
                  <span className="modal-header-eyebrow-dot" />
                  <span>{editingId ? 'Edit' : 'New'}</span>
                </div>
                <h3>{editingId ? '编辑 API 配置' : '新增 API 配置'}</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowForm(false)}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* 快捷预设 */}
              <div className="form-group">
                <label className="form-label">
                  快捷预设
                  <span className="form-hint">三个都永久免费，免充钱</span>
                </label>
                <div className="preset-list">
                  {PRESETS.map((p) => {
                    const isSelected = selectedPreset?.label === p.label
                    const suggestText =
                      p.suggest === 'web'        ? '推荐网页' :
                      p.suggest === 'selection'  ? '推荐划词' :
                      p.suggest === 'reasoning'  ? '推理型'   :
                      p.suggest === 'backup'     ? '备用'     : null
                    return (
                      <button
                        key={p.label}
                        type="button"
                        className={`preset-chip${isSelected ? ' preset-chip-selected' : ''}`}
                        onClick={() => applyPreset(p)}
                      >
                        🆓 {p.label}
                        {suggestText && (
                          <span style={{
                            marginLeft: 6,
                            fontSize: 11,
                            opacity: 0.7,
                          }}>· {suggestText}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {selectedPreset && (
                  <div style={{
                    marginTop: 10,
                    padding: '10px 12px',
                    background: 'rgba(243,115,56,0.08)',
                    border: '1px solid rgba(243,115,56,0.25)',
                    borderRadius: 10,
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}>
                    <div style={{ color: '#141413', marginBottom: 6 }}>
                      {selectedPreset.note}
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => window.electronAPI.openExternal(selectedPreset.register)}
                    >
                      申请 API Key →
                    </button>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">
                  配置名称
                  <span className="form-hint">必填</span>
                </label>
                <input
                  className="form-input"
                  placeholder="例：DeepSeek"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Base URL
                  <span className="form-hint">必填</span>
                </label>
                <input
                  className="form-input"
                  placeholder="例：https://api.deepseek.com"
                  value={form.base_url}
                  onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  API Key
                  <span className="form-hint">必填</span>
                </label>
                <div className="input-with-btn">
                  <input
                    className="form-input"
                    type={showKey ? 'text' : 'password'}
                    placeholder="sk-..."
                    value={form.api_key}
                    onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? '隐藏' : '显示'}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  模型名
                  <span className="form-hint">必填</span>
                </label>
                <input
                  className="form-input"
                  placeholder="例：deepseek-chat"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  自定义 System Prompt
                  <span className="form-hint">从模板挑一个，或自己写</span>
                </label>
                <select
                  className="form-input"
                  style={{ marginBottom: 8 }}
                  value={matchPromptTemplate(form.system_prompt)}
                  onChange={(e) => {
                    const t = PROMPT_TEMPLATES.find(x => x.id === e.target.value)
                    if (!t) return
                    if (t.id === 'custom') {
                      // Keep current text — user wants to edit freely
                      return
                    }
                    setForm({ ...form, system_prompt: t.prompt })
                  }}
                >
                  {PROMPT_TEMPLATES.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <textarea
                  className="form-textarea"
                  rows={6}
                  placeholder="留空使用默认翻译提示词。{sourceLang} / {targetLang} 会被替换为实际语言。"
                  value={form.system_prompt}
                  onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                />
              </div>

              {error && <p className="form-error">{error}</p>}
              {testResult && (
                <p className={testResult.ok ? 'form-success' : 'form-error'}>
                  {testResult.msg}
                </p>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? '测试中…' : '测试连接'}
              </button>
              <div className="modal-footer-right">
                <button
                  type="button"
                  className="btn btn-subtle"
                  onClick={() => setShowForm(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
