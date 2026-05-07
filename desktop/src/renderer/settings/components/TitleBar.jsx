import React, { useEffect, useState } from 'react'

/**
 * Custom Mastercard-editorial title bar.
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ [译]  翻译工具                            ─   ▢   ✕         │  ← drag region
 *   └────────────────────────────────────────────────────────────┘
 *
 * The whole bar is `-webkit-app-region: drag` (handled in styles.css);
 * the three control buttons opt back out via `no-drag` so they stay
 * clickable. Min/max/close round-trip through IPC to the main process.
 *
 * The brand mark is the new "orange tile + 译" — explicitly NOT the
 * Mastercard two-circle logo.
 */
export default function TitleBar({ title = '翻译工具' }) {
  const [isMax, setIsMax] = useState(false)

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    api.windowIsMaximized?.().then(setIsMax)
    const off = api.onWindowMaximizedChanged?.(setIsMax)
    return () => { if (typeof off === 'function') off() }
  }, [])

  const onMin   = () => window.electronAPI?.windowMinimize?.()
  const onMax   = () => window.electronAPI?.windowToggleMaximize?.()
  const onClose = () => window.electronAPI?.windowClose?.()

  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <span className="titlebar-mark" aria-hidden="true">译</span>
        <span className="titlebar-title">{title}</span>
      </div>
      <div className="titlebar-controls">
        <button
          type="button"
          className="titlebar-btn"
          onClick={onMin}
          aria-label="最小化"
          title="最小化"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="6" width="10" height="1.2" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          className="titlebar-btn"
          onClick={onMax}
          aria-label={isMax ? '还原' : '最大化'}
          title={isMax ? '还原' : '最大化'}
        >
          {isMax ? (
            // restore icon (two stacked rectangles)
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2.5" y="2.5" width="6" height="6" stroke="currentColor" strokeWidth="1.1" fill="none" />
              <rect x="3.5" y="3.5" width="6" height="6" stroke="currentColor" strokeWidth="1.1" fill="#F3F0EE" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="2" width="8" height="8" stroke="currentColor" strokeWidth="1.1" fill="none" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-btn--close"
          onClick={onClose}
          aria-label="关闭"
          title="关闭"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
