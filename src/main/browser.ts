import {
  BrowserWindow,
  WebContentsView,
  WebContents,
  Menu,
  MenuItemConstructorOptions,
  Session,
  session,
  clipboard,
  app
} from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import {
  CHROME_HEIGHTS,
  FINDBAR_HEIGHT,
  SHELF_HEIGHT,
  SEARCH_ENGINES,
  TabInfo,
  WindowSnapshot,
  ChromeEvent
} from '../shared/types'
import type { SessionWindow } from './sessionStore'
import { recordVisit, updateTitle } from './history'
import { adblockSession } from './adblock'
import { watchDownloads, addManualDownload } from './downloads'
import { getSettings } from './settings'
import { privacyTransform, initPrivacyForSession } from './privacy'
import { isBookmarked } from './bookmarks'

const THEME_BG: Record<string, string> = {
  nyx: '#17141F',
  midnight: '#0A0A0F',
  dusk: '#1C1418',
  light: '#F2EFF9'
}

const SLEEP_AFTER_MS = 30 * 60 * 1000

let nextTabId = 1
let nextIncognito = 1
export let isQuitting = false
export function markQuitting(): void {
  isQuitting = true
}

export const nyxWindows: NyxWindow[] = []
const closedTabs: { url: string; title: string; pinned: boolean }[] = []
const watchedSessions = new Set<Session>()

export function focusedNyxWindow(): NyxWindow | null {
  const bw = BrowserWindow.getFocusedWindow()
  return nyxWindows.find((w) => w.win === bw) ?? nyxWindows[0] ?? null
}

export function nyxWindowFromChrome(wc: WebContents): NyxWindow | null {
  return nyxWindows.find((w) => w.win.webContents === wc) ?? null
}

export function searchUrlFor(query: string): string {
  const engine = SEARCH_ENGINES[getSettings().searchEngine] ?? SEARCH_ENGINES.duckduckgo
  return engine.url.replace('%s', encodeURIComponent(query))
}

export function parseOmniboxInput(input: string): string {
  const t = input.trim()
  if (!t) return ''
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return privacyTransform(t)
  if (t === 'localhost' || /^localhost[:/]/.test(t)) return 'http://' + t
  if (!/\s/.test(t) && t.includes('.')) return privacyTransform('https://' + t)
  return searchUrlFor(t)
}

class Tab {
  id = String(nextTabId++)
  view: WebContentsView | null = null
  url = ''
  title = ''
  favicon = ''
  pinned = false
  loading = false
  discarded = false
  audible = false
  lastActive = Date.now()

  constructor(private owner: NyxWindow) {}

  info(): TabInfo {
    const wc = this.view?.webContents
    return {
      id: this.id,
      url: this.url,
      title: this.title,
      favicon: this.favicon,
      pinned: this.pinned,
      loading: this.loading,
      canGoBack: wc?.navigationHistory.canGoBack() ?? false,
      canGoForward: wc?.navigationHistory.canGoForward() ?? false,
      discarded: this.discarded,
      audible: this.audible,
      muted: wc?.isAudioMuted() ?? false,
      bookmarked: this.owner.incognito ? false : isBookmarked(this.url)
    }
  }

  ensureView(): WebContentsView {
    if (this.view) return this.view
    const view = new WebContentsView({
      webPreferences: {
        session: this.owner.session,
        sandbox: true,
        contextIsolation: true
      }
    })
    view.setBackgroundColor('#FFFFFF')
    this.view = view
    this.owner.wireTab(this, view.webContents)
    if (this.discarded && this.url) {
      this.discarded = false
      view.webContents.loadURL(this.url).catch(() => {})
    }
    return view
  }

  // Unload the page but keep the tab (sleeping tabs / session restore).
  discard(): void {
    if (!this.view) return
    this.owner.win.contentView.removeChildView(this.view)
    this.view.webContents.close()
    this.view = null
    this.discarded = true
    this.audible = false
    this.loading = false
  }

  destroy(): void {
    if (this.view) {
      this.owner.win.contentView.removeChildView(this.view)
      this.view.webContents.close()
      this.view = null
    }
  }
}

export class NyxWindow {
  win: BrowserWindow
  session: Session
  incognito: boolean
  tabs: Tab[] = []
  activeTabId: string | null = null
  private findOpen = false
  private shelfOpen = false
  private htmlFullscreen = false
  private canvasSuggestions = false
  private canvasLibrary = false

  constructor(opts: { bounds?: { x: number; y: number; w: number; h: number }; incognito?: boolean; restore?: SessionWindow }) {
    this.incognito = opts.incognito ?? false
    this.session = this.incognito
      ? session.fromPartition(`incognito-${nextIncognito++}`)
      : session.defaultSession
    adblockSession(this.session)
    initPrivacyForSession(this.session)
    if (!watchedSessions.has(this.session)) {
      watchedSessions.add(this.session)
      watchDownloads(this.session)
    }

    const settings = getSettings()
    const b = opts.bounds ?? opts.restore
    this.win = new BrowserWindow({
      x: b?.x,
      y: b?.y,
      width: b?.w ?? 1280,
      height: b?.h ?? 840,
      minWidth: 600,
      minHeight: 400,
      title: 'Nyx',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: settings.density === 'compact' ? 10 : 13 },
      backgroundColor: settings.vibrancy ? '#00000000' : (THEME_BG[settings.theme] ?? '#17141F'),
      vibrancy: settings.vibrancy ? 'under-window' : undefined,
      visualEffectState: settings.vibrancy ? 'followWindow' : undefined,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    if (process.env['ELECTRON_RENDERER_URL']) {
      this.win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      this.win.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

    this.win.once('ready-to-show', () => this.win.show())
    this.win.webContents.once('did-finish-load', () => this.pushState())
    this.win.on('resize', () => this.layout())
    this.win.on('closed', () => {
      for (const t of this.tabs) t.view?.webContents.close()
      const i = nyxWindows.indexOf(this)
      if (i >= 0) nyxWindows.splice(i, 1)
    })

    nyxWindows.push(this)

    if (opts.restore) {
      const r = opts.restore
      r.tabs.forEach((st, i) => {
        const tab = new Tab(this)
        tab.url = st.url
        tab.title = st.title || st.url
        tab.pinned = st.pinned
        tab.discarded = true
        this.tabs.push(tab)
        if (i === Math.min(r.activeIndex, r.tabs.length - 1)) this.activeTabId = tab.id
      })
      if (this.activeTabId) this.activateTab(this.activeTabId)
    }
    if (this.tabs.length === 0) this.newTab('', true)
  }

  get activeTab(): Tab | null {
    return this.tabs.find((t) => t.id === this.activeTabId) ?? null
  }

  chromeTop(): number {
    return CHROME_HEIGHTS[getSettings().density] + (this.findOpen ? FINDBAR_HEIGHT : 0)
  }

  wireTab(tab: Tab, wc: WebContents): void {
    wc.setMaxListeners(50)
    wc.setWindowOpenHandler(({ url, disposition }) => {
      this.newTab(url, disposition !== 'background-tab')
      return { action: 'deny' }
    })
    wc.on('will-navigate', (e, url) => {
      const cleaned = privacyTransform(url)
      if (cleaned !== url) {
        e.preventDefault()
        wc.loadURL(cleaned).catch(() => {})
      }
    })
    wc.on('page-title-updated', (_e, title) => {
      tab.title = title
      if (!this.incognito) updateTitle(tab.url, title)
      this.pushState()
    })
    wc.on('page-favicon-updated', (_e, favicons) => {
      tab.favicon = favicons[0] ?? ''
      this.pushState()
    })
    wc.on('did-start-loading', () => {
      tab.loading = true
      this.pushState()
    })
    wc.on('did-stop-loading', () => {
      tab.loading = false
      this.pushState()
    })
    wc.on('did-navigate', (_e, url) => {
      tab.url = url
      if (!this.incognito) recordVisit(url, tab.title)
      this.pushState()
    })
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (!isMainFrame) return
      tab.url = url
      this.pushState()
    })
    wc.on('media-started-playing', () => {
      tab.audible = true
      this.pushState()
    })
    wc.on('media-paused', () => {
      tab.audible = wc.isCurrentlyAudible()
      this.pushState()
    })
    wc.on('found-in-page', (_e, result) => {
      this.sendEvent({
        type: 'findResult',
        result: { activeMatch: result.activeMatchOrdinal, matches: result.matches }
      })
    })
    wc.on('enter-html-full-screen', () => {
      this.htmlFullscreen = true
      this.layout()
    })
    wc.on('leave-html-full-screen', () => {
      this.htmlFullscreen = false
      this.layout()
    })
    wc.on('context-menu', (_e, params) => this.showContextMenu(wc, params))
  }

  private showContextMenu(wc: WebContents, params: Electron.ContextMenuParams): void {
    const items: MenuItemConstructorOptions[] = []
    if (params.linkURL) {
      items.push(
        { label: 'Open Link in New Tab', click: () => this.newTab(params.linkURL, true) },
        { label: 'Copy Link', click: () => clipboard.writeText(params.linkURL) },
        { type: 'separator' }
      )
    }
    if (params.hasImageContents && params.srcURL) {
      items.push(
        { label: 'Open Image in New Tab', click: () => this.newTab(params.srcURL, true) },
        { label: 'Save Image', click: () => wc.downloadURL(params.srcURL) },
        { label: 'Copy Image Address', click: () => clipboard.writeText(params.srcURL) },
        { type: 'separator' }
      )
    }
    if (params.selectionText) {
      const engine = SEARCH_ENGINES[getSettings().searchEngine] ?? SEARCH_ENGINES.duckduckgo
      items.push(
        { role: 'copy' },
        {
          label: `Search ${engine.name} for “${params.selectionText.slice(0, 30)}${params.selectionText.length > 30 ? '…' : ''}”`,
          click: () => this.newTab(searchUrlFor(params.selectionText), true)
        },
        { type: 'separator' }
      )
    }
    if (params.isEditable) {
      items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' })
    }
    items.push(
      { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
      { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
      { label: 'Reload', click: () => wc.reload() },
      { type: 'separator' },
      { label: 'Copy Page URL', click: () => clipboard.writeText(wc.getURL()) },
      { label: 'Inspect Element', click: () => wc.inspectElement(params.x, params.y) }
    )
    Menu.buildFromTemplate(items).popup({ window: this.win })
  }

  layout(): void {
    const tab = this.activeTab
    if (!tab?.view) return
    const [w, h] = this.win.getContentSize()
    if (this.htmlFullscreen) {
      tab.view.setBounds({ x: 0, y: 0, width: w, height: h })
      return
    }
    const top = this.chromeTop()
    const bottom = this.shelfOpen ? SHELF_HEIGHT : 0
    tab.view.setBounds({ x: 0, y: top, width: w, height: Math.max(0, h - top - bottom) })
  }

  setShelfOpen(open: boolean): void {
    this.shelfOpen = open
    this.layout()
  }

  private updateCanvas(): void {
    const tab = this.activeTab
    if (!tab?.view) return
    const hidden = this.canvasSuggestions || this.canvasLibrary
    tab.view.setVisible(!hidden)
  }

  setCanvas(opts: { suggestions?: boolean; library?: boolean }): void {
    if (opts.suggestions !== undefined) this.canvasSuggestions = opts.suggestions
    if (opts.library !== undefined) this.canvasLibrary = opts.library
    this.updateCanvas()
  }

  newTab(url = '', activate = true): Tab {
    const tab = new Tab(this)
    this.tabs.push(tab)
    if (url) {
      tab.url = privacyTransform(url)
      tab.ensureView().webContents.loadURL(tab.url).catch(() => {})
    }
    if (activate) this.activateTab(tab.id)
    else this.pushState()
    return tab
  }

  activateTab(id: string): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab) return
    const prev = this.activeTab
    if (prev && prev !== tab) {
      prev.lastActive = Date.now()
      prev.view?.setVisible(false)
    }
    this.activeTabId = id
    tab.lastActive = Date.now()
    if (tab.url) {
      const view = tab.ensureView()
      if (!this.win.contentView.children.includes(view)) {
        this.win.contentView.addChildView(view)
      }
      view.setVisible(true)
      this.layout()
      this.updateCanvas()
      view.webContents.focus()
    } else {
      // Empty tab: chrome renders the start page; focus the omnibox.
      this.sendEvent({ type: 'focusOmnibox' })
    }
    this.win.setTitle(tab.title || 'Nyx')
    this.pushState()
  }

  closeTab(id: string): void {
    const i = this.tabs.findIndex((t) => t.id === id)
    if (i < 0) return
    const tab = this.tabs[i]
    if (tab.url && !this.incognito) {
      closedTabs.push({ url: tab.url, title: tab.title, pinned: tab.pinned })
    }
    tab.destroy()
    this.tabs.splice(i, 1)
    if (this.tabs.length === 0) {
      this.win.close()
      return
    }
    if (this.activeTabId === id) {
      const next = this.tabs[Math.min(i, this.tabs.length - 1)]
      this.activateTab(next.id)
    } else {
      this.pushState()
    }
  }

  reopenClosedTab(): void {
    const t = closedTabs.pop()
    if (t) {
      const tab = this.newTab(t.url, true)
      tab.pinned = t.pinned
      this.sortPinned()
      this.pushState()
    }
  }

  duplicateTab(id?: string): void {
    const tab = this.tabs.find((t) => t.id === (id ?? this.activeTabId))
    if (tab?.url) this.newTab(tab.url, true)
  }

  muteTab(id: string): void {
    const tab = this.tabs.find((t) => t.id === id)
    const wc = tab?.view?.webContents
    if (wc) {
      wc.setAudioMuted(!wc.isAudioMuted())
      this.pushState()
    }
  }

  reorderTabs(ids: string[]): void {
    const byId = new Map(this.tabs.map((t) => [t.id, t]))
    const next = ids.map((id) => byId.get(id)).filter((t): t is Tab => !!t)
    for (const t of this.tabs) if (!next.includes(t)) next.push(t)
    this.tabs = next
    this.sortPinned()
    this.pushState()
  }

  setPinned(id: string, pinned: boolean): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab) return
    tab.pinned = pinned
    this.sortPinned()
    this.pushState()
  }

  private sortPinned(): void {
    this.tabs.sort((a, b) => Number(b.pinned) - Number(a.pinned))
  }

  navigate(input: string, tabId?: string): void {
    const url = parseOmniboxInput(input)
    if (!url) return
    const tab = tabId ? this.tabs.find((t) => t.id === tabId) : this.activeTab
    if (!tab) return
    tab.url = url
    tab.discarded = false
    const view = tab.ensureView()
    view.webContents.loadURL(url).catch(() => {})
    if (tab.id === this.activeTabId) this.activateTab(tab.id)
  }

  selectRelativeTab(delta: number): void {
    if (this.tabs.length < 2 || !this.activeTabId) return
    const i = this.tabs.findIndex((t) => t.id === this.activeTabId)
    const next = (i + delta + this.tabs.length) % this.tabs.length
    this.activateTab(this.tabs[next].id)
  }

  selectTabAt(index: number): void {
    // index 0-8 for ⌘1-9; ⌘9 = last tab
    const tab = index === 8 ? this.tabs[this.tabs.length - 1] : this.tabs[index]
    if (tab) this.activateTab(tab.id)
  }

  setFindBarOpen(open: boolean): void {
    this.findOpen = open
    if (!open) this.activeTab?.view?.webContents.stopFindInPage('clearSelection')
    this.layout()
  }

  // `first` starts a new find session (Electron's findNext:true); follow-ups advance it.
  findInPage(text: string, forward: boolean, first: boolean): void {
    const wc = this.activeTab?.view?.webContents
    if (!wc) return
    if (!text) {
      wc.stopFindInPage('clearSelection')
      this.sendEvent({ type: 'findResult', result: { activeMatch: 0, matches: 0 } })
      return
    }
    wc.findInPage(text, { forward, findNext: first })
  }

  togglePictureInPicture(): void {
    const wc = this.activeTab?.view?.webContents
    if (!wc) return
    void wc.executeJavaScript(
      `(async () => {
        if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return }
        const vids = [...document.querySelectorAll('video')]
        const v = vids.find((x) => !x.paused) ?? vids[0]
        if (v) await v.requestPictureInPicture()
      })()`,
      true
    ).catch(() => {})
  }

  async exportPdf(): Promise<string | null> {
    const tab = this.activeTab
    const wc = tab?.view?.webContents
    if (!tab || !wc) return null
    const data = await wc.printToPDF({})
    const base = (tab.title || 'page').replace(/[/\\:]+/g, '-').slice(0, 80) || 'page'
    const dir = app.getPath('downloads')
    let out = path.join(dir, `${base}.pdf`)
    let n = 2
    while (fs.existsSync(out)) out = path.join(dir, `${base} ${n++}.pdf`)
    fs.writeFileSync(out, data)
    addManualDownload(out, tab.url)
    return out
  }

  // Sleeping tabs: unload background tabs idle past the threshold.
  sleepIdleTabs(): void {
    if (!getSettings().sleepingTabs) return
    const now = Date.now()
    let changed = false
    for (const tab of this.tabs) {
      if (tab.id === this.activeTabId || !tab.view || tab.pinned || tab.audible) continue
      if (now - tab.lastActive > SLEEP_AFTER_MS) {
        tab.discard()
        changed = true
      }
    }
    if (changed) this.pushState()
  }

  snapshot(): WindowSnapshot {
    return {
      windowId: this.win.id,
      incognito: this.incognito,
      tabs: this.tabs.map((t) => t.info()),
      activeTabId: this.activeTabId,
      settings: getSettings()
    }
  }

  sendEvent(ev: ChromeEvent): void {
    if (!this.win.isDestroyed()) this.win.webContents.send('nyx:event', ev)
  }

  pushState(): void {
    this.sendEvent({ type: 'state', snapshot: this.snapshot() })
    const t = this.activeTab
    if (t && !this.win.isDestroyed()) this.win.setTitle(t.title || 'Nyx')
  }

  applyAppearance(): void {
    const s = getSettings()
    if (!this.win.isDestroyed()) {
      this.win.setVibrancy(s.vibrancy ? 'under-window' : null)
      this.win.setBackgroundColor(s.vibrancy ? '#00000000' : (THEME_BG[s.theme] ?? '#17141F'))
    }
    this.layout()
    this.pushState()
  }

  toSessionWindow(): SessionWindow | null {
    if (this.incognito) return null
    const b = this.win.getBounds()
    const tabs = this.tabs.filter((t) => t.url)
    const active = Math.max(0, tabs.findIndex((t) => t.id === this.activeTabId))
    return {
      x: b.x,
      y: b.y,
      w: b.width,
      h: b.height,
      activeIndex: active,
      groups: [],
      tabs: tabs.map((t) => ({ url: t.url, title: t.title, pinned: t.pinned }))
    }
  }
}

export function broadcastState(): void {
  for (const w of nyxWindows) w.pushState()
}

export function applyAppearanceAll(): void {
  for (const w of nyxWindows) w.applyAppearance()
}

// One global ticker for sleeping tabs.
setInterval(() => {
  for (const w of nyxWindows) w.sleepIdleTabs()
}, 60_000)
