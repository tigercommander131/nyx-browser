import { useEffect, useState } from 'react'
import type {
  DownloadInfo,
  FindResult,
  LibrarySection,
  Suggestion,
  WindowSnapshot
} from '../../shared/types'
import { TabStrip } from './components/TabStrip'
import { Toolbar } from './components/Toolbar'
import { FindBar } from './components/FindBar'
import { StartPage } from './components/StartPage'
import { SuggestionsPanel } from './components/Suggestions'
import { Library } from './components/Library'
import { Shelf } from './components/Shelf'

export function App(): React.JSX.Element {
  const [snap, setSnap] = useState<WindowSnapshot | null>(null)
  const [downloads, setDownloads] = useState<DownloadInfo[]>([])
  const [shelfHidden, setShelfHidden] = useState(true)
  const [findOpen, setFindOpen] = useState(false)
  const [findTick, setFindTick] = useState(0)
  const [findResult, setFindResult] = useState<FindResult | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const [library, setLibrary] = useState<LibrarySection | null>(null)

  const [editing, setEditing] = useState(false)
  const [obText, setObText] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selIndex, setSelIndex] = useState(0)

  const activeTab = snap?.tabs.find((t) => t.id === snap.activeTabId) ?? null
  const suggestionsOpen = editing && suggestions.length > 0 && library === null
  const shelfVisible = !shelfHidden && downloads.length > 0

  useEffect(() => {
    const off = window.nyx.onEvent((ev) => {
      switch (ev.type) {
        case 'state':
          setSnap(ev.snapshot)
          break
        case 'focusOmnibox':
          setFocusTick((t) => t + 1)
          break
        case 'openFindBar':
          setFindOpen(true)
          setFindTick((t) => t + 1)
          break
        case 'findResult':
          setFindResult(ev.result)
          break
        case 'openLibrary':
          setLibrary((cur) => (cur === ev.section ? null : ev.section))
          break
        case 'downloads':
          setDownloads(ev.downloads)
          if (ev.downloads.some((d) => d.state === 'progressing')) setShelfHidden(false)
          break
      }
    })
    window.nyx.cmd('getDownloads').then(setDownloads)
    return off
  }, [])

  // Theme / accent / density / vibrancy all flow from settings into CSS.
  useEffect(() => {
    const s = snap?.settings
    if (!s) return
    const root = document.documentElement
    root.dataset.theme = s.theme
    root.style.setProperty('--accent', s.accent)
    root.classList.toggle('vibrant', s.vibrancy)
    root.classList.toggle('compact', s.density === 'compact')
  }, [snap?.settings])

  useEffect(() => {
    window.nyx.cmd('setCanvas', { suggestions: suggestionsOpen })
  }, [suggestionsOpen])

  useEffect(() => {
    window.nyx.cmd('setCanvas', { library: library !== null })
  }, [library])

  useEffect(() => {
    window.nyx.cmd('setShelf', { open: shelfVisible })
  }, [shelfVisible])

  // Switching tabs cancels omnibox editing.
  useEffect(() => {
    setEditing(false)
    setSuggestions([])
    setSelIndex(0)
  }, [snap?.activeTabId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && library !== null) setLibrary(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [library])

  const closeOmnibox = (): void => {
    setEditing(false)
    setSuggestions([])
    setSelIndex(0)
  }

  const navigate = (input: string): void => {
    if (input.trim()) window.nyx.cmd('navigate', { input })
    closeOmnibox()
  }

  const queryChanged = (text: string): void => {
    setObText(text)
    setSelIndex(0)
    if (text.trim()) {
      window.nyx.cmd('omniboxSuggest', { query: text }).then((s: Suggestion[]) => {
        setSuggestions(s)
      })
    } else {
      setSuggestions([])
    }
  }

  if (!snap) return <div className="chrome" />

  const toolbar = (
    <Toolbar
        snap={snap}
        activeTab={activeTab}
        focusTick={focusTick}
        editing={editing}
        text={obText}
        suggestions={suggestions}
        selIndex={selIndex}
        onStartEditing={() => {
          setEditing(true)
          setObText(activeTab?.url ?? '')
        }}
        onTextChange={queryChanged}
        onSelIndexChange={setSelIndex}
        onNavigate={navigate}
        onCancel={closeOmnibox}
        onOpenDownloads={() => setLibrary((cur) => (cur === 'downloads' ? null : 'downloads'))}
        onOpenSettings={() => setLibrary((cur) => (cur === 'settings' ? null : 'settings'))}
      />
  )

  const findbar = findOpen && (
    <FindBar
      focusTick={findTick}
      result={findResult}
      onClose={() => {
        setFindOpen(false)
        setFindResult(null)
        window.nyx.cmd('findStop')
      }}
    />
  )

  const canvas = (
    <div className="canvas">
      {library !== null ? (
        <Library
          section={library}
          downloads={downloads}
          settings={snap.settings}
          onSectionChange={setLibrary}
          onClose={() => setLibrary(null)}
          onNavigate={(url) => {
            setLibrary(null)
            window.nyx.cmd('navigate', { input: url })
          }}
        />
      ) : suggestionsOpen ? (
        <SuggestionsPanel
          suggestions={suggestions}
          selIndex={selIndex}
          onHover={setSelIndex}
          onPick={(s) => navigate(s.url)}
        />
      ) : activeTab && !activeTab.url ? (
        <StartPage settings={snap.settings} />
      ) : null}
      {snap.splitTabId &&
        snap.splitTabId !== snap.activeTabId &&
        library === null &&
        !suggestionsOpen &&
        activeTab?.url && <SplitDivider fraction={snap.splitFraction} />}
    </div>
  )

  const shelf = shelfVisible && (
    <Shelf
      downloads={downloads}
      onDismiss={() => setShelfHidden(true)}
      onShowAll={() => setLibrary('downloads')}
    />
  )

  if (snap.vertical) {
    return (
      <div className={'chrome vertical' + (snap.incognito ? ' incognito' : '')}>
        <aside className="sidebar">
          <TabStrip snap={snap} vertical />
        </aside>
        <div className="main-col">
          {toolbar}
          {findbar}
          {canvas}
          {shelf}
        </div>
      </div>
    )
  }

  return (
    <div className={'chrome' + (snap.incognito ? ' incognito' : '')}>
      <TabStrip snap={snap} />
      {toolbar}
      {findbar}
      {canvas}
      {shelf}
    </div>
  )
}

// Sits in the 6px gap between the two split WebContentsViews (the only strip
// of the content area where the chrome can receive mouse events).
function SplitDivider({ fraction }: { fraction: number }): React.JSX.Element {
  const onMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault()
    const canvas = (e.currentTarget as HTMLElement).parentElement!
    const rect = canvas.getBoundingClientRect()
    let raf = 0
    const move = (ev: MouseEvent): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const f = (ev.clientX - rect.left) / Math.max(1, rect.width - 6)
        window.nyx.cmd('setSplitFraction', { fraction: Math.min(0.85, Math.max(0.15, f)) })
      })
    }
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  return (
    <div
      className="split-divider"
      style={{ left: `calc((100% - 6px) * ${fraction})` }}
      onMouseDown={onMouseDown}
    />
  )
}
