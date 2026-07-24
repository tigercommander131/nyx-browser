import { useEffect, useRef } from 'react'
import type { Suggestion, TabInfo, WindowSnapshot } from '../../../shared/types'

function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

interface Props {
  snap: WindowSnapshot
  activeTab: TabInfo | null
  focusTick: number
  editing: boolean
  text: string
  suggestions: Suggestion[]
  selIndex: number
  onStartEditing: () => void
  onTextChange: (text: string) => void
  onSelIndexChange: (i: number) => void
  onNavigate: (input: string) => void
  onCancel: () => void
  onOpenDownloads: () => void
  onOpenSettings: () => void
}

export function Toolbar(p: Props): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (p.focusTick > 0) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [p.focusTick])

  const displayed = p.editing ? p.text : prettyUrl(p.activeTab?.url ?? '')

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown' && p.suggestions.length > 0) {
      e.preventDefault()
      p.onSelIndexChange(Math.min(p.selIndex + 1, p.suggestions.length - 1))
    } else if (e.key === 'ArrowUp' && p.suggestions.length > 0) {
      e.preventDefault()
      p.onSelIndexChange(Math.max(p.selIndex - 1, 0))
    } else if (e.key === 'Enter') {
      const sel = p.suggestions[p.selIndex]
      p.onNavigate(sel ? sel.url : p.text)
      inputRef.current?.blur()
    } else if (e.key === 'Escape') {
      p.onCancel()
      inputRef.current?.blur()
    }
  }

  const wc = (cmd: string, payload?: unknown) => () => void window.nyx.cmd(cmd, payload)

  return (
    <div className="toolbar">
      <div className="nav-buttons">
        <button
          className="tb-btn"
          disabled={!p.activeTab?.canGoBack}
          onClick={wc('back')}
          title="Back (⌘[)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M10.5 3 5.5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          className="tb-btn"
          disabled={!p.activeTab?.canGoForward}
          onClick={wc('forward')}
          title="Forward (⌘])"
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M5.5 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          className="tb-btn"
          onClick={p.activeTab?.loading ? wc('stop') : wc('reload', {})}
          title={p.activeTab?.loading ? 'Stop (⌘.)' : 'Reload (⌘R)'}
        >
          {p.activeTab?.loading ? (
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M3 3l8 8M11 3l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
      <div className={'omnibox' + (p.editing ? ' editing' : '')}>
        {p.activeTab?.url.startsWith('https://') && !p.editing && (
          <svg className="lock" width="11" height="11" viewBox="0 0 11 11">
            <rect x="2" y="4.5" width="7" height="5" rx="1" fill="currentColor" />
            <path d="M3.5 4.5V3a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        )}
        <input
          ref={inputRef}
          value={displayed}
          placeholder="Search or enter address"
          spellCheck={false}
          onFocus={(e) => {
            p.onStartEditing()
            requestAnimationFrame(() => e.target.select())
          }}
          onBlur={() => {
            // Give suggestion mousedown handlers a beat before closing.
            setTimeout(p.onCancel, 120)
          }}
          onChange={(e) => p.onTextChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {!p.editing && p.activeTab?.url && !p.snap.incognito && (
          <button
            className={'star-btn' + (p.activeTab.bookmarked ? ' on' : '')}
            title={p.activeTab.bookmarked ? 'Remove Bookmark (⌘D)' : 'Bookmark This Page (⌘D)'}
            onClick={() => window.nyx.cmd('toggleBookmark', {})}
          >
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path
                d="M7 1.6l1.7 3.5 3.8.5-2.8 2.7.7 3.8L7 10.3l-3.4 1.8.7-3.8L1.5 5.6l3.8-.5z"
                fill={p.activeTab.bookmarked ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
      <div className="toolbar-right">
        {p.snap.incognito && <span className="incognito-badge">Incognito</span>}
        {p.activeTab?.readerable && (
          <button
            className="tb-btn"
            onClick={() => window.nyx.cmd('toggleReader')}
            title="Reader Mode (⌥⌘R)"
          >
            <svg width="15" height="15" viewBox="0 0 15 15">
              <path d="M2.5 3h10M2.5 6h10M2.5 9h6.5M2.5 12h6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <button
          className={'tb-btn shield' + (p.snap.settings.adblockEnabled ? ' on' : '')}
          onClick={() =>
            window.nyx.cmd('updateSetting', { adblockEnabled: !p.snap.settings.adblockEnabled })
          }
          title={p.snap.settings.adblockEnabled ? 'Adblock on' : 'Adblock off'}
        >
          <svg width="15" height="15" viewBox="0 0 15 15">
            <path d="M7.5 1.5 12.5 3v4c0 3-2 5.5-5 6.5-3-1-5-3.5-5-6.5V3z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </button>
        <button className="tb-btn" onClick={p.onOpenDownloads} title="Downloads (⇧⌘J)">
          <svg width="15" height="15" viewBox="0 0 15 15">
            <path d="M7.5 2v7M4.5 6.5l3 3 3-3M3 12.5h9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button className="tb-btn" onClick={p.onOpenSettings} title="Settings (⌘,)">
          <svg width="15" height="15" viewBox="0 0 15 15">
            <circle cx="7.5" cy="7.5" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M7.5 1.8v1.6M7.5 11.6v1.6M1.8 7.5h1.6M11.6 7.5h1.6M3.5 3.5l1.1 1.1M10.4 10.4l1.1 1.1M11.5 3.5l-1.1 1.1M4.6 10.4l-1.1 1.1"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
