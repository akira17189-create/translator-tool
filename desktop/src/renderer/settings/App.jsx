import React, { useState, useEffect } from 'react'
import ApiConfigSection from './components/ApiConfigSection.jsx'
import GeneralSettings from './components/GeneralSettings.jsx'
import TitleBar from './components/TitleBar.jsx'

const NAV = [
  { id: 'api',     label: 'API 配置' },
  { id: 'general', label: '通用设置' },
]

export default function App() {
  const [tab, setTab] = useState('api')
  const [serverStatus, setServerStatus] = useState('checking')

  useEffect(() => {
    const check = async () => {
      try {
        const data = await window.electronAPI?.getServerStatus()
        setServerStatus(data?.running ? 'online' : 'offline')
      } catch {
        setServerStatus('offline')
      }
    }
    check()
    const interval = setInterval(check, 10_000)
    return () => clearInterval(interval)
  }, [])

  const statusLabel =
    serverStatus === 'online'  ? '服务运行中'
    : serverStatus === 'offline' ? '服务离线'
    : '检测中…'
  const statusMeta = serverStatus === 'online' ? '127.0.0.1 : 27463' : ''

  return (
    <div className="app-shell">
      <TitleBar title="翻译工具" />
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark sidebar-brand-mark--tile">译</span>
          <div className="sidebar-brand-text">
            <div className="sidebar-brand-name">翻译工具</div>
            <div className="sidebar-brand-sub">Settings</div>
          </div>
        </div>

        <ul className="sidebar-nav">
          {NAV.map(n => (
            <li key={n.id}>
              <button
                type="button"
                className={`sidebar-nav-item ${tab === n.id ? 'active' : ''}`}
                onClick={() => setTab(n.id)}
              >
                {n.label}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="main-wrap">
        <main className="main-content">
          {tab === 'api'     && <ApiConfigSection />}
          {tab === 'general' && <GeneralSettings />}
        </main>

        <div className="status-bar">
          <span className={`status-dot status-dot--${serverStatus}`} />
          <span className="status-label">{statusLabel}</span>
          <span className="status-spacer" />
          {statusMeta && <span className="status-meta">{statusMeta}</span>}
        </div>
      </div>
    </div>
  )
}
