import { getActiveApiConfig, getSelectionApiConfig, getGlossary, getSetting } from './database.js'

const DEFAULT_SYSTEM_PROMPT = `你是一个专业翻译助手。将用户提供的{sourceLang}文本准确翻译为{targetLang}。
严格保留原文中所有标点符号（引号、单引号、省略号、破折号、问号、感叹号、括号等），它们用于区分对话、心理活动、引语和强调，不可省略或替换。
只输出译文，不要解释、不要前言、不要总结。`

// Lightweight prompt for 划词 (word/sentence) translation. No glossary,
// no formatting hints — keeps the prompt short so a fast model returns
// in 1-3 seconds. The selected text is sent as user content as-is.
const SELECTION_SYSTEM_PROMPT = `将用户输入翻译为简体中文。直接输出译文，不要解释、不要前缀、不要引号。`

/**
 * Build the OpenAI-style /chat/completions URL for an arbitrary provider.
 *
 *   base_url 以版本段结尾（/v1, /v3, /paas/v4 …）→ 直接拼 /chat/completions
 *   否则按 OpenAI 标准约定，自动追加 /v1/chat/completions
 *
 * Handles all the common cases:
 *   https://api.deepseek.com           → https://api.deepseek.com/v1/chat/completions
 *   https://api.deepseek.com/v1        → https://api.deepseek.com/v1/chat/completions
 *   https://open.bigmodel.cn/api/paas/v4 → https://open.bigmodel.cn/api/paas/v4/chat/completions
 *   https://api.siliconflow.cn/v1      → https://api.siliconflow.cn/v1/chat/completions
 *   https://dashscope.aliyuncs.com/compatible-mode → /compatible-mode/v1/chat/completions
 */
export function buildChatCompletionsUrl(baseUrl) {
  const cleaned = String(baseUrl || '').replace(/\/+$/, '')
  if (/\/v\d+$/.test(cleaned)) {
    return `${cleaned}/chat/completions`
  }
  return `${cleaned}/v1/chat/completions`
}

/**
 * 构建 system prompt
 * - 段落模式：使用 config 的自定义 prompt 或默认 prompt + 注入术语表
 * - 划词模式（word / sentence）：使用极简 prompt，跳过术语表，加快响应
 */
function buildSystemPrompt(config, sourceLang, targetLang, isSelection) {
  if (isSelection) return SELECTION_SYSTEM_PROMPT

  let base = config.system_prompt?.trim() || DEFAULT_SYSTEM_PROMPT
  base = base.replace('{sourceLang}', sourceLang).replace('{targetLang}', targetLang)

  const glossary = getGlossary()
  if (glossary.length > 0) {
    const lines = glossary.map((t) => `${t.source_term} → ${t.target_term}`)
    base += `\n\n以下术语表必须严格遵守（不得更改这些词的译法）：\n${lines.join('\n')}`
  }

  return base
}

/**
 * 主翻译函数
 * @param {Object} opts
 * @param {string} opts.text - 要翻译的文本
 * @param {string} [opts.sourceLang='en'] - 源语言
 * @param {string} [opts.targetLang='zh'] - 目标语言
 * @param {string} [opts.context=''] - 可选上下文
 * @param {'word'|'sentence'|'paragraph'} [opts.mode='sentence'] - 翻译模式
 * @returns {Promise<{translation: string, engine: string, offline: boolean}>}
 */
export async function translate({ text, sourceLang, targetLang, context = '', mode = 'sentence' }) {
  const resolvedSource = sourceLang || getSetting('source_lang', 'en')
  const resolvedTarget = targetLang || getSetting('target_lang', 'zh')

  // 划词翻译（word / sentence）优先使用专用配置，找不到则回退到当前激活配置。
  const isSelection = mode === 'word' || mode === 'sentence'
  const config = isSelection ? getSelectionApiConfig() : getActiveApiConfig()

  if (!config) {
    return {
      translation: '',
      engine: null,
      offline: true,
      error: '未配置翻译 API，请在设置页添加 API 配置并激活。',
    }
  }

  const systemPrompt = buildSystemPrompt(config, resolvedSource, resolvedTarget, isSelection)

  let userPrompt = text
  if (context && context !== text) {
    userPrompt = `上下文：${context}\n\n请翻译以下${mode === 'word' ? '单词' : '文本'}：${text}`
  }

  try {
    const url = buildChatCompletionsUrl(config.base_url)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: isSelection ? 0.1 : 0.3,
        // Selection translates short text; capping max_tokens hard means the
        // model can't pad and finishes faster.
        max_tokens: isSelection ? 256 : 2048,
      }),
      signal: AbortSignal.timeout(isSelection ? 12_000 : 90_000),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`API 错误 ${response.status}: ${errText}`)
    }

    const data = await response.json()
    const translation = data.choices?.[0]?.message?.content?.trim() || ''

    // Chinese-cloud LLMs (mimo / 千帆 / 通义 etc.) often return HTTP 200 with
    // a moderation-rejection sentence as the "translation". Detect those so
    // the UI can show a clear error instead of letting it look like a parse
    // failure further downstream.
    const REJECTION_PATTERNS = [
      /request was rejected because it was considered high risk/i,
      /content (was )?(blocked|filtered|rejected) (by|due to)/i,
      /对不起.{0,20}(无法|不能|不便).{0,10}(回答|提供|翻译)/,
      /涉及.{0,10}(敏感|违规|不当)/,
      /违反.{0,10}(规定|政策|社区准则)/,
      /我不能.{0,20}(翻译|处理).{0,20}(内容|文本)/,
    ]
    const looksRejected = REJECTION_PATTERNS.some(re => re.test(translation))
    if (looksRejected) {
      console.error('[translate] LLM returned a moderation rejection:', translation.slice(0, 200))
      return {
        translation: '',
        engine: config.name,
        offline: false,
        error: 'LLM 内容审核拒绝（' + translation.slice(0, 60) + '）。请切换到无审核的接口（DeepSeek 官方 / OpenAI / 本地 Ollama 等）。',
      }
    }

    return {
      translation,
      engine: config.name,
      offline: false,
    }
  } catch (err) {
    console.error('[translate] API call failed:', err.message)
    return {
      translation: '',
      engine: config.name,
      offline: true,
      error: err.message,
    }
  }
}
