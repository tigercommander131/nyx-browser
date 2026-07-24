import { useEffect, useState } from 'react'
import type {
  BookmarkEntry,
  DownloadInfo,
  HistoryEntry,
  LibrarySection,
  Settings
} from '../../../shared/types'
import { SettingsPanel } from './SettingsPanel'

interface Props {
  section: LibrarySection
  downloads: DownloadInfo[]
  settings: Settings
  onSectionChange: (s: LibrarySection) => void
  onClose: () => void
  onNavigate: (url: string) => void
}

const SECTIONS: { id: LibrarySection; label: string }[] = [
  { id: 'history', label: 'History' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'reading', label: 'Reading List' },
  { id: 'settings', label: 'Settings' }
]

function timeAgo(seconds: number): string {
  const d = new Date(seconds * 1000)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return time
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + time
}

function formatBytes(n: number): string {
  if (n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  return (n / 1024 ** i).toFixed(i === 0 ? 0 : 1) + ' ' + units[i]
}

export function Library(p: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([])

  useEffect(() => {
    if (p.section === 'history') {
      window.nyx.cmd('getHistory', { query, limit: 300 }).then(setEntries)
    } else if (p.section === 'bookmarks' || p.section === 'reading') {
      window.nyx.cmd('getBookmarks', { reading: p.section === 'reading' }).then(setBookmarks)
    }
  }, [p.section, query])

  const bookmarkRows = (list: BookmarkEntry[], reading: boolean): React.JSX.Element[] =>
    list.map((b) => (
      <div
        key={b.id}
        className={'lib-row' + (reading && b.isRead ? ' read' : '')}
        onClick={() => {
          if (reading) void window.nyx.cmd('markRead', { id: b.id, read: true })
          p.onNavigate(b.url)
        }}
      >
        <span className="lib-dot" />
        <span className="lib-title">{b.title || b.url}</span>
        <span className="lib-detail">{b.url}</span>
        <span className="lib-time">{timeAgo(b.created)}</span>
        {reading && b.isRead && <span className="lib-flag">read</span>}
        <button
          className="lib-del"
          title="Remove"
          onClick={(ev) => {
            ev.stopPropagation()
            void window.nyx.cmd('deleteBookmark', { id: b.id }).then(() => {
              setBookmarks((cur) => cur.filter((x) => x.id !== b.id))
            })
          }}
        >
          ×
        </button>
      </div>
    ))

  return (
    <div className="library">
      <div className="library-header">
        <div className="segments">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={p.section === s.id ? 'seg active' : 'seg'}
              onClick={() => p.onSectionChange(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {p.section === 'history' && (
          <>
            <input
              className="library-search"
              placeholder="Search history"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
            />
            <button
              className="library-clear"
              onClick={() => {
                void window.nyx.cmd('clearHistory').then(() => setEntries([]))
              }}
            >
              Clear All
            </button>
          </>
        )}
        {p.section === 'downloads' && (
          <button className="library-clear" onClick={() => void window.nyx.cmd('clearDownloads')}>
            Clear List
          </button>
        )}
        <button className="library-close" onClick={p.onClose} title="Close (esc)">
          ×
        </button>
      </div>
      <div className="library-list">
        {p.section === 'settings' ? (
          <SettingsPanel settings={p.settings} />
        ) : p.section === 'history' ? (
          <>
            {entries.map((e) => (
              <div key={e.id} className="lib-row" onClick={() => p.onNavigate(e.url)}>
                <span className="lib-dot" />
                <span className="lib-title">{e.title || e.url}</span>
                <span className="lib-detail">{e.url}</span>
                <span className="lib-time">{timeAgo(e.lastVisit)}</span>
                <button
                  className="lib-del"
                  title="Remove from history"
                  onClick={(ev) => {
                    ev.stopPropagation()
                    void window.nyx.cmd('deleteHistoryEntry', { id: e.id }).then(() => {
                      setEntries((cur) => cur.filter((x) => x.id !== e.id))
                    })
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            {entries.length === 0 && (
              <div className="lib-empty">No history{query ? ' matching “' + query + '”' : ''}</div>
            )}
          </>
        ) : p.section === 'bookmarks' ? (
          <>
            {bookmarkRows(bookmarks, false)}
            {bookmarks.length === 0 && <div className="lib-empty">No bookmarks yet — ⌘D adds one</div>}
          </>
        ) : p.section === 'reading' ? (
          <>
            {bookmarkRows(bookmarks, true)}
            {bookmarks.length === 0 && (
              <div className="lib-empty">Reading list is empty — ⇧⌘D saves a page for later</div>
            )}
          </>
        ) : (
          <>
            {p.downloads.map((d) => (
              <div
                key={d.id}
                className="lib-row"
                onClick={() => d.state === 'completed' && window.nyx.cmd('openDownload', { id: d.id })}
              >
                <span className="lib-dot" />
                <span className="lib-title">{d.filename}</span>
                <span className="lib-detail">
                  {d.state === 'progressing'
                    ? `${formatBytes(d.receivedBytes)} of ${formatBytes(d.totalBytes)}`
                    : d.state === 'completed'
                      ? formatBytes(d.totalBytes || d.receivedBytes)
                      : d.state}
                </span>
                {d.state === 'progressing' && d.totalBytes > 0 && (
                  <progress value={d.receivedBytes} max={d.totalBytes} />
                )}
                {d.state === 'completed' && (
                  <button
                    className="lib-action"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      window.nyx.cmd('showDownload', { id: d.id })
                    }}
                  >
                    Show in Finder
                  </button>
                )}
                {d.state === 'progressing' && (
                  <button
                    className="lib-del"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      window.nyx.cmd('cancelDownload', { id: d.id })
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {p.downloads.length === 0 && <div className="lib-empty">No downloads yet</div>}
          </>
        )}
      </div>
    </div>
  )
}
