import React, { useState, useEffect, useCallback } from 'react'
import { createRoot } from 'react-dom/client'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  cream:'#F3F0EE', creamLifted:'#FCFBFA', ink:'#141413',
  white:'#FFFFFF', slate:'#696969', orange:'#F37338', signal:'#CF4500',
}
const FONT = "'Sofia Sans', Arial, sans-serif"
const SHADOW_SOFT = '0 4px 16px rgba(0,0,0,0.08)'
const SHADOW_LIFT = '0 24px 48px rgba(0,0,0,0.10), 0 8px 16px rgba(0,0,0,0.04)'
const POS_LABELS = {
  n:'n.',vt:'v.',vi:'v.',v:'v.',adj:'adj.',adv:'adv.',
  prep:'prep.',conj:'conj.',pron:'pron.',num:'num.',
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const PinIcon = ({ active }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M10.5 1.5l4 4-3 1-1.5 4-2-2-3 3-.5-.5 3-3-2-2 4-1.5 1-3z"
      stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
      fill={active ? 'currentColor' : 'none'} />
  </svg>
)
const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M2.5 2.5l9 9M11.5 2.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)
const BookmarkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M3 1.75h8v10.5L7 9.75l-4 2.5V1.75z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
)
const SpeakerIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M2 5.25h2.25L7.5 2.5v9L4.25 8.75H2v-3.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M9.75 4.75a3 3 0 010 4.5M11.25 3.25a5 5 0 010 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)

// ── Styles ────────────────────────────────────────────────────────────────────
const ps = {
  shell: {
    width:'100%', height:'100%', background:C.cream, fontFamily:FONT, color:C.ink,
    overflow:'hidden', position:'relative', display:'flex', flexDirection:'column',
    animation:'tp-rise 0.2s ease-out both', WebkitAppRegion:'drag', userSelect:'none',
  },
  topActions: {
    position:'absolute', top:14, right:14, display:'flex', gap:7, zIndex:2, WebkitAppRegion:'no-drag',
  },
  iconCircle: {
    width:32, height:32, borderRadius:'50%', background:C.white, border:'none',
    display:'flex', alignItems:'center', justifyContent:'center',
    cursor:'pointer', color:C.ink, boxShadow:SHADOW_SOFT, padding:0,
    transition:'transform 0.15s ease, background 0.15s ease',
  },
  iconCircleActive: { background:C.ink, color:C.cream },
  loadingBody: {
    flex:1, padding:'40px 28px 32px', display:'flex', flexDirection:'column', gap:20,
  },
  loadingLabel: {
    fontSize:14, fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase',
    color:C.slate, display:'flex', alignItems:'center', gap:8,
  },
  eyebrowDot: { width:6, height:6, borderRadius:'50%', background:C.orange },
  loadingWord: {
    fontSize:24, fontWeight:500, letterSpacing:'-0.02em', color:C.ink, lineHeight:1.1, wordBreak:'break-word',
  },
  progressTrack: {
    height:2, width:'100%', background:'rgba(243,115,56,0.18)',
    borderRadius:999, overflow:'hidden', position:'relative',
  },
  progressBar: {
    position:'absolute', top:0, left:0, bottom:0, width:'40%',
    background:C.orange, borderRadius:999, animation:'tp-progress 1.2s ease-in-out infinite',
  },
  readyTop: { padding:'24px 24px 14px' },
  word: {
    fontSize:26, fontWeight:500, letterSpacing:'-0.02em', color:C.ink,
    lineHeight:1.1, paddingRight:82, wordBreak:'break-word',
  },
  phonetic: { marginTop:5, fontSize:15, fontWeight:450, letterSpacing:'-0.01em', color:C.slate },
  exchangeRow: { display:'flex', flexWrap:'wrap', gap:'3px 10px', marginTop:6 },
  exchangeItem: { fontSize:12, color:C.slate, fontWeight:450 },
  posRow: { display:'flex', flexWrap:'wrap', gap:5, marginTop:12 },
  posTag: {
    background:C.cream, color:C.ink, border:'1px solid rgba(20,20,19,0.10)',
    borderRadius:8, padding:'3px 7px', fontSize:13, fontWeight:700,
    letterSpacing:'0.04em', textTransform:'uppercase', lineHeight:1.1,
  },
  accentDivider: {
    height:1.5, margin:'12px 24px 0', background:C.orange, borderRadius:999, width:'calc(100% - 48px)',
  },
  defsList: {
    listStyle:'none', padding:'14px 24px 4px', display:'flex', flexDirection:'column', gap:8,
    flex:1, overflow:'auto', WebkitAppRegion:'no-drag', userSelect:'text',
  },
  defRow: {
    display:'flex', alignItems:'flex-start', gap:10,
    fontSize:14, fontWeight:450, letterSpacing:'-0.01em', color:C.ink, lineHeight:1.45,
  },
  defBullet: { width:5, height:5, borderRadius:'50%', background:C.orange, marginTop:8, flexShrink:0 },
  noticeBar: {
    margin:'0 24px 10px', padding:'8px 14px', background:'rgba(207,69,0,0.08)',
    borderRadius:10, fontSize:13, fontWeight:450, color:C.signal, lineHeight:1.4,
    WebkitAppRegion:'no-drag', userSelect:'text',
  },
  footer: {
    background:C.ink, color:C.white, padding:'13px 16px',
    display:'flex', alignItems:'center', gap:8,
    WebkitAppRegion:'no-drag', flexShrink:0,
  },
  primaryBtn: {
    flex:1, background:C.ink, color:C.cream, border:`1.5px solid ${C.cream}`,
    borderRadius:20, padding:'8px 14px', fontFamily:FONT, fontSize:14, fontWeight:500,
    letterSpacing:'-0.02em', cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center', gap:7,
    transition:'transform 0.15s ease, background 0.15s ease',
  },
  primaryBtnDone: { background:C.cream, color:C.ink, borderColor:C.cream },
  secondaryBtn: {
    background:C.white, color:C.ink, border:'none', borderRadius:999,
    padding:'8px 13px', fontFamily:FONT, fontSize:13, fontWeight:500,
    letterSpacing:'-0.02em', cursor:'pointer',
    display:'flex', alignItems:'center', gap:5, boxShadow:SHADOW_SOFT,
  },
}

// ── Sub-components ────────────────────────────────────────────────────────────
function TopActions({ pinned, onPin, onClose }) {
  return (
    <div style={ps.topActions}>
      <button type="button" title={pinned ? '取消固定' : '固定窗口'} onClick={onPin}
        style={{ ...ps.iconCircle, ...(pinned ? ps.iconCircleActive : {}) }}>
        <PinIcon active={pinned} />
      </button>
      <button type="button" title="关闭" onClick={onClose} style={ps.iconCircle}>
        <CloseIcon />
      </button>
    </div>
  )
}

function LoadingBody({ query }) {
  return (
    <div style={ps.loadingBody}>
      <div style={ps.loadingLabel}><span style={ps.eyebrowDot} /><span>查询中</span></div>
      <div style={ps.loadingWord}>{query?.length > 50 ? query.slice(0, 50) + '…' : query || '…'}</div>
      <div style={ps.progressTrack}><div style={ps.progressBar} /></div>
    </div>
  )
}

function ReadyBody({ uiData, added, adding, onAdd, onSpeak }) {
  const { word, phonetic, exchange, pos, definitions, translation, engine, offline, error } = uiData || {}
  const hasDict = definitions?.length > 0
  const hasAI   = !!translation

  return (
    <>
      <div style={ps.readyTop}>
        <div style={ps.word}>{word}</div>
        {phonetic && <div style={ps.phonetic}>{phonetic}</div>}
        {exchange && Object.keys(exchange).length > 0 && (
          <div style={ps.exchangeRow}>
            {exchange.past              && <span style={ps.exchangeItem}>过去式: <em>{exchange.past}</em></span>}
            {exchange.pastParticiple    && <span style={ps.exchangeItem}>过去分词: <em>{exchange.pastParticiple}</em></span>}
            {exchange.presentParticiple && <span style={ps.exchangeItem}>现在分词: <em>{exchange.presentParticiple}</em></span>}
            {exchange.plural            && <span style={ps.exchangeItem}>复数: <em>{exchange.plural}</em></span>}
          </div>
        )}
        {pos?.length > 0 && (
          <div style={ps.posRow}>{pos.map((p, i) => <span key={i} style={ps.posTag}>{p}</span>)}</div>
        )}
      </div>

      {(hasDict || hasAI) && (
        <>
          <div style={ps.accentDivider} />
          <ul style={ps.defsList}>
            {hasDict && definitions.map((d, i) => (
              <li key={i} style={ps.defRow}><span style={ps.defBullet} /><span>{d}</span></li>
            ))}
            {hasAI && (
              <li style={{ ...ps.defRow, marginTop: hasDict ? 8 : 0 }}>
                <span style={{ ...ps.defBullet, background: '#696969' }} />
                <span style={{ color: '#696969' }}>
                  {engine && <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.03em', marginRight:5, textTransform:'uppercase' }}>{engine}</span>}
                  {translation}
                </span>
              </li>
            )}
          </ul>
        </>
      )}

      {(offline || error) && (
        <div style={ps.noticeBar}>
          {error?.includes('未配置') ? '请在设置页配置翻译 API' : (error || 'API 不可用')}
        </div>
      )}

      <div style={ps.footer}>
        <button type="button" onClick={onAdd} disabled={added || adding}
          style={{ ...ps.primaryBtn, ...(added ? ps.primaryBtnDone : {}), ...(adding ? { opacity:0.65, cursor:'wait' } : {}) }}>
          <BookmarkIcon />
          <span>{added ? '已加入生词本' : adding ? '添加中…' : '加入生词本'}</span>
        </button>
        <button type="button" onClick={onSpeak} style={ps.secondaryBtn} title="朗读">
          <SpeakerIcon /><span>朗读</span>
        </button>
      </div>
    </>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
function PopupApp() {
  const [state, setState]   = useState('idle')
  const [data, setData]     = useState(null)
  const [pinned, setPinned] = useState(false)
  const [added, setAdded]   = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    const removeLoading = window.electronAPI?.onPopupLoading(({ text }) => {
      setState('loading'); setData({ text }); setAdded(false)
    })
    const removeData = window.electronAPI?.onPopupData((payload) => {
      setData(payload); setState('ready')
    })
    return () => { removeLoading?.(); removeData?.() }
  }, [])

  const handleClose = useCallback(() => {
    window.electronAPI?.closePopup(); setState('idle')
  }, [])

  const handlePin = useCallback(async () => {
    const next = !pinned; setPinned(next)
    await window.electronAPI?.pinPopup(next)
  }, [pinned])

  const handleAdd = useCallback(async () => {
    if (!data?.text || added || adding) return
    setAdding(true)
    try {
      await window.electronAPI?.addWord({
        word:            data.isSingleWord ? data.text : data.text.slice(0, 100),
        phonetic:        data.dict?.phonetic || null,
        definition:      data.dict?.rawTranslation || null,
        source_sentence: data.isSingleWord ? null : data.text,
        translation:     data.translation || null,
        source_url:      null,
      })
      setAdded(true)
    } catch (err) {
      console.error('addWord error:', err)
    } finally {
      setAdding(false)
    }
  }, [data, added, adding])

  const handleSpeak = useCallback(() => {
    const word = data?.dict?.word || data?.text
    if (word) window.speechSynthesis?.speak(new SpeechSynthesisUtterance(word))
  }, [data])

  if (state === 'idle') return null

  // Convert Electron payload → UI format
  const uiData = (() => {
    if (!data) return null
    const { text, isSingleWord, dict, translation, engine, offline, error } = data
    const dictDefs = (isSingleWord && dict?.found && dict.definitions?.length)
      ? dict.definitions.map(d => d.def)
      : []
    return {
      word:        isSingleWord ? (dict?.word || text) : (text?.length > 50 ? text.slice(0, 50) + '…' : text),
      phonetic:    isSingleWord ? dict?.phonetic : null,
      exchange:    isSingleWord ? dict?.exchange : null,
      pos:         isSingleWord
        ? [...new Set((dict?.definitions || []).map(d => POS_LABELS[d.pos] || (d.pos ? d.pos + '.' : '')).filter(Boolean))]
        : [],
      definitions: dictDefs,
      translation, engine,
      offline, error,
    }
  })()

  return (
    <div style={ps.shell} data-state={state}>
      <TopActions pinned={pinned} onPin={handlePin} onClose={handleClose} />
      {state === 'loading' && <LoadingBody query={data?.text} />}
      {state === 'ready'   && <ReadyBody uiData={uiData} added={added} adding={adding} onAdd={handleAdd} onSpeak={handleSpeak} />}
    </div>
  )
}

// ── Global styles + keyframes ─────────────────────────────────────────────────
const styleEl = document.createElement('style')
styleEl.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Sofia+Sans:ital,wght@0,400;0,450;0,500;0,700;1,400&display=swap');
  @keyframes tp-rise { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes tp-progress {
    0%{left:-40%;width:40%} 50%{left:30%;width:50%} 100%{left:100%;width:40%}
  }
  *{box-sizing:border-box} body{margin:0;background:#F3F0EE;overflow:hidden}
  ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:rgba(20,20,19,0.15);border-radius:999px}
  button:focus-visible{outline:2px solid #F37338;outline-offset:2px}
`
document.head.appendChild(styleEl)

createRoot(document.getElementById('root')).render(<PopupApp />)
