import { useEffect, useState } from 'react'
import type { TabInfo, WindowSnapshot } from '../../../shared/types'

interface CtxMenu {
  x: number
  y: number
  tab: TabInfo
}

// Favicon with graceful fallback when the URL 404s (e.g. bare /favicon.ico guesses).
function FavIcon({ url }: { url: string }): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  if (!url || failed) return <div className="favicon-placeholder" />
  return <img className="favicon" src={url} draggable={false} onError={() => setFailed(true)} />
}

export function TabStrip({ snap }: { snap: WindowSnapshot }): React.JSX.Element {
  const [order, setOrder] = useState<string[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [ctx, setCtx] = useState<CtxMenu | null>(null)

  useEffect(() => {
    setOrder(snap.tabs.map((t) => t.id))
  }, [snap])

  const byId = new Map(snap.tabs.map((t) => [t.id, t]))
  const tabs = order.map((id) => byId.get(id)).filter((t): t is TabInfo => !!t)

  const dragEnter = (overId: string): void => {
    if (!dragId || dragId === overId) return
    setOrder((cur) => {
      const next = cur.filter((id) => id !== dragId)
      next.splice(next.indexOf(overId), 0, dragId)
      return next
    })
  }

  const dragEnd = (): void => {
    if (dragId) window.nyx.cmd('reorderTabs', { tabIds: order })
    setDragId(null)
  }

  return (
    <div className="tabstrip" onDoubleClick={() => window.nyx.cmd('newTab', {})}>
      {tabs.map((t) => (
        <div
          key={t.id}
          className={
            'tab' +
            (t.id === snap.activeTabId ? ' active' : '') +
            (t.pinned ? ' pinned' : '') +
            (t.id === dragId ? ' dragging' : '')
          }
          title={t.title || t.url}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            setDragId(t.id)
          }}
          onDragEnter={() => dragEnter(t.id)}
          onDragOver={(e) => e.preventDefault()}
          onDragEnd={dragEnd}
          onClick={() => window.nyx.cmd('activateTab', { tabId: t.id })}
          onAuxClick={(e) => {
            if (e.button === 1) window.nyx.cmd('closeTab', { tabId: t.id })
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            setCtx({ x: e.clientX, y: e.clientY, tab: t })
          }}
        >
          {t.loading ? <div className="spinner" /> : <FavIcon url={t.favicon} />}
          {!t.pinned && <span className="tab-title">{t.title || (t.url ? t.url : 'New Tab')}</span>}
          {(t.audible || t.muted) && (
            <button
              className={'tab-audio' + (t.muted ? ' muted' : '')}
              title={t.muted ? 'Unmute tab' : 'Mute tab'}
              onClick={(e) => {
                e.stopPropagation()
                window.nyx.cmd('muteTab', { tabId: t.id })
              }}
            >
              {t.muted ? (
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M2 4.5v3h2l3 2.5v-8l-3 2.5zM9 4l2.5 4M11.5 4L9 8" fill="currentColor" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M2 4.5v3h2l3 2.5v-8l-3 2.5z" fill="currentColor" strokeLinejoin="round" />
                  <path d="M8.7 4.2a2.6 2.6 0 0 1 0 3.6M10 2.8a4.6 4.6 0 0 1 0 6.4" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                </svg>
              )}
            </button>
          )}
          {!t.pinned && (
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation()
                window.nyx.cmd('closeTab', { tabId: t.id })
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button className="newtab-btn" onClick={() => window.nyx.cmd('newTab', {})} title="New Tab (⌘T)">
        +
      </button>
      {ctx && (
        <>
          <div className="ctx-overlay" onMouseDown={() => setCtx(null)} onContextMenu={(e) => e.preventDefault()} />
          <div className="ctx-menu" style={{ left: ctx.x, top: ctx.y }}>
            <button
              onClick={() => {
                window.nyx.cmd('setPinned', { tabId: ctx.tab.id, pinned: !ctx.tab.pinned })
                setCtx(null)
              }}
            >
              {ctx.tab.pinned ? 'Unpin Tab' : 'Pin Tab'}
            </button>
            <button
              onClick={() => {
                window.nyx.cmd('closeTab', { tabId: ctx.tab.id })
                setCtx(null)
              }}
            >
              Close Tab
            </button>
            <button
              onClick={() => {
                for (const other of snap.tabs) {
                  if (other.id !== ctx.tab.id && !other.pinned)
                    window.nyx.cmd('closeTab', { tabId: other.id })
                }
                setCtx(null)
              }}
            >
              Close Other Tabs
            </button>
          </div>
        </>
      )}
    </div>
  )
}
