import React from 'react'

const STATUS_MAP = {
  checking: { label: '检测中…', color: '#94a3b8' },
  online: { label: '服务运行中', color: '#22c55e' },
  offline: { label: '服务未响应', color: '#ef4444' },
}

export default function StatusBar({ status }) {
  const { label, color } = STATUS_MAP[status] || STATUS_MAP.checking

  return (
    <div className="status-bar">
      <span className="status-dot" style={{ backgroundColor: color }} />
      <span className="status-label">{label}</span>
    </div>
  )
}
