import { useEffect, useState } from 'react'
import { GROUP_COLORS, TabGroup, TabInfo, WindowSnapshot } from '../../../shared/types'

interface CtxMenu {
  x: number
  y: number
  tab?: TabInfo
  group?: TabGroup
}

// Favicon with graceful fallback when the URL 404s (e.g. bare /favicon.ico guesses).
function FavIcon({ url }: { url: string }): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  if (!url || failed) return <div className="favicon-placeholder" />
  return <img className="favicon" src={url} draggable={false} onError={() => setFailed(true)} />
}

type StripItem = { kind: 'tab'; tab: TabInfo } | { kind: 'pill'; group: TabGroup }

function buildItems(snap: WindowSnapshot): StripItem[] {
  const items: StripItem[] = []
  const pillDone = new Set<string>()
  for (const t of snap.tabs) {
    const group = snap.groups.find((g) => g.id === t.groupId)
    if (group && !pillDone.has(group.id)) {
      pillDone.add(group.id)
      items.push({ kind: 'pill', group })
    }
    if (group?.collapsed) continue
    items.push({ kind: 'tab', tab: t })
  }
  return items
}

export function TabStrip({
  snap,
  vertical = false
}: {
  snap: WindowSnapshot
  vertical?: boolean
}): React.JSX.Element {
  const [order, setOrder] = useState<string[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [ctx, setCtx] = useState<CtxMenu | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  useEffect(() => {
    setOrder(snap.tabs.map((t) => t.id))
  }, [snap])

  const byId = new Map(snap.tabs.map((t) => [t.id, t]))
  const orderedSnap: WindowSnapshot = {
    ...snap,
    tabs: order.map((id) => byId.get(id)).filter((t): t is TabInfo => !!t)
  }
  const items = buildItems(orderedSnap)

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

  const groupMembers = (groupId: string): TabInfo[] =>
    snap.tabs.filter((t) => t.groupId === groupId)

  const startRename = (g: TabGroup): void => {
    setRenamingId(g.id)
    setRenameText(g.name === 'Group' ? '' : g.name)
    setCtx(null)
  }

  const commitRename = (): void => {
    if (renamingId) {
      window.nyx.cmd('renameGroup', { id: renamingId, name: renameText.trim() || 'Group' })
    }
    setRenamingId(null)
  }

  return (
    <div
      className={'tabstrip' + (vertical ? ' vertical' : '')}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) window.nyx.cmd('newTab', {})
      }}
    >
      {items.map((item) =>
        item.kind === 'pill' ? (
          <div
            key={'pill-' + item.group.id}
            className={'group-pill' + (item.group.collapsed ? ' collapsed' : '')}
            style={{ ['--gc' as string]: item.group.color }}
            title={
              (item.group.name || 'Group') +
              ` — ${groupMembers(item.group.id).length} tab(s), click to ${item.group.collapsed ? 'expand' : 'collapse'}`
            }
            onClick={() => renamingId !== item.group.id && window.nyx.cmd('toggleGroupCollapse', { id: item.group.id })}
            onDoubleClick={(e) => {
              e.stopPropagation()
              startRename(item.group)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              setCtx({ x: e.clientX, y: e.clientY, group: item.group })
            }}
          >
            {renamingId === item.group.id ? (
              <input
                autoFocus
                value={renameText}
                placeholder="Group name"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setRenameText(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setRenamingId(null)
                }}
              />
            ) : (
              <>
                <span className="pill-dot" />
                <span className="pill-name">{item.group.name || 'Group'}</span>
                {item.group.collapsed && (
                  <span className="pill-count">{groupMembers(item.group.id).length}</span>
                )}
              </>
            )}
          </div>
        ) : (
          <div
            key={item.tab.id}
            className={
              'tab' +
              (item.tab.id === snap.activeTabId ? ' active' : '') +
              (item.tab.id === snap.splitTabId ? ' split' : '') +
              (item.tab.pinned ? ' pinned' : '') +
              (item.tab.id === dragId ? ' dragging' : '')
            }
            style={
              item.tab.groupId
                ? { ['--gc' as string]: snap.groups.find((g) => g.id === item.tab.groupId)?.color }
                : undefined
            }
            title={item.tab.title || item.tab.url}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              setDragId(item.tab.id)
            }}
            onDragEnter={() => dragEnter(item.tab.id)}
            onDragOver={(e) => e.preventDefault()}
            onDragEnd={dragEnd}
            onClick={() => window.nyx.cmd('activateTab', { tabId: item.tab.id })}
            onAuxClick={(e) => {
              if (e.button === 1) window.nyx.cmd('closeTab', { tabId: item.tab.id })
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              setCtx({ x: e.clientX, y: e.clientY, tab: item.tab })
            }}
          >
            {item.tab.loading ? <div className="spinner" /> : <FavIcon url={item.tab.favicon} />}
            {(!item.tab.pinned || vertical) && (
              <span className="tab-title">
                {item.tab.title || (item.tab.url ? item.tab.url : 'New Tab')}
              </span>
            )}
            {(item.tab.audible || item.tab.muted) && (
              <button
                className={'tab-audio' + (item.tab.muted ? ' muted' : '')}
                title={item.tab.muted ? 'Unmute tab' : 'Mute tab'}
                onClick={(e) => {
                  e.stopPropagation()
                  window.nyx.cmd('muteTab', { tabId: item.tab.id })
                }}
              >
                {item.tab.muted ? (
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
            {(!item.tab.pinned || vertical) && (
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  window.nyx.cmd('closeTab', { tabId: item.tab.id })
                }}
              >
                ×
              </button>
            )}
          </div>
        )
      )}
      <button className="newtab-btn" onClick={() => window.nyx.cmd('newTab', {})} title="New Tab (⌘T)">
        +
      </button>
      {snap.profile && snap.profile.id !== 'default' && (
        <span
          className="profile-chip"
          style={{ ['--gc' as string]: snap.profile.color }}
          title={`Profile: ${snap.profile.name}`}
        >
          <span className="pill-dot" />
          {snap.profile.name}
        </span>
      )}
      {ctx && (
        <>
          <div className="ctx-overlay" onMouseDown={() => setCtx(null)} onContextMenu={(e) => e.preventDefault()} />
          <div className="ctx-menu" style={{ left: Math.min(ctx.x, window.innerWidth - 190), top: ctx.y }}>
            {ctx.tab && (
              <>
                <button
                  onClick={() => {
                    window.nyx.cmd('setPinned', { tabId: ctx.tab!.id, pinned: !ctx.tab!.pinned })
                    setCtx(null)
                  }}
                >
                  {ctx.tab.pinned ? 'Unpin Tab' : 'Pin Tab'}
                </button>
                {!ctx.tab.pinned && !ctx.tab.groupId && (
                  <button
                    onClick={() => {
                      window.nyx.cmd('createGroupWithTab', { tabId: ctx.tab!.id })
                      setCtx(null)
                    }}
                  >
                    Add to New Group
                  </button>
                )}
                {!ctx.tab.pinned && snap.groups.length > 0 && !ctx.tab.groupId && (
                  <div className="ctx-sub">
                    {snap.groups.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => {
                          window.nyx.cmd('setTabGroup', { tabId: ctx.tab!.id, groupId: g.id })
                          setCtx(null)
                        }}
                      >
                        <span className="pill-dot" style={{ ['--gc' as string]: g.color }} /> Add to “
                        {g.name || 'Group'}”
                      </button>
                    ))}
                  </div>
                )}
                {ctx.tab.groupId && (
                  <button
                    onClick={() => {
                      window.nyx.cmd('setTabGroup', { tabId: ctx.tab!.id, groupId: null })
                      setCtx(null)
                    }}
                  >
                    Remove from Group
                  </button>
                )}
                <button
                  onClick={() => {
                    window.nyx.cmd('duplicateTab', { tabId: ctx.tab!.id })
                    setCtx(null)
                  }}
                >
                  Duplicate Tab
                </button>
                <button
                  onClick={() => {
                    window.nyx.cmd('closeTab', { tabId: ctx.tab!.id })
                    setCtx(null)
                  }}
                >
                  Close Tab
                </button>
                <button
                  onClick={() => {
                    for (const other of snap.tabs) {
                      if (other.id !== ctx.tab!.id && !other.pinned)
                        window.nyx.cmd('closeTab', { tabId: other.id })
                    }
                    setCtx(null)
                  }}
                >
                  Close Other Tabs
                </button>
              </>
            )}
            {ctx.group && (
              <>
                <button onClick={() => startRename(ctx.group!)}>Rename Group</button>
                <div className="ctx-colors">
                  {GROUP_COLORS.map((c) => (
                    <button
                      key={c}
                      className="ctx-color"
                      style={{ background: c }}
                      onClick={() => {
                        window.nyx.cmd('recolorGroup', { id: ctx.group!.id, color: c })
                        setCtx(null)
                      }}
                    />
                  ))}
                </div>
                <button
                  onClick={() => {
                    for (const t of groupMembers(ctx.group!.id)) {
                      window.nyx.cmd('setTabGroup', { tabId: t.id, groupId: null })
                    }
                    setCtx(null)
                  }}
                >
                  Ungroup Tabs
                </button>
                <button
                  onClick={() => {
                    window.nyx.cmd('closeGroup', { id: ctx.group!.id })
                    setCtx(null)
                  }}
                >
                  Close Group
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
