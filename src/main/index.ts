import { app, ipcMain, session, BrowserWindow } from 'electron'
import path from 'node:path'
import { initSettings } from './settings'
import { initHistory } from './history'
import { initBookmarks } from './bookmarks'
import { runImportIfNeeded } from './importer'
import { initAdblock } from './adblock'
import { initUpdates } from './updates'
import { clearOnQuit } from './privacy'
import { initIpc } from './ipc'
import { buildMenu } from './menu'
import { initProfiles } from './profiles'
import { initPasswords, handleCapture } from './passwords'
import { installFromArchive } from './selfUpdate'
import { loadSession, saveSession, SessionData } from './sessionStore'
import { NyxWindow, nyxWindows, nyxWindowFromPage, markQuitting } from './browser'

// The app is named "Nyx" but must NOT share Swift Nyx's data directory
// (~/Library/Application Support/Nyx) — pin ours explicitly.
app.setPath('userData', path.join(app.getPath('appData'), 'Nyx Electron'))

// Double-launching the .app must focus the running instance, not spawn a
// second one against the same databases.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}
app.on('second-instance', () => {
  const w = nyxWindows[0]
  if (w) {
    if (w.win.isMinimized()) w.win.restore()
    w.win.focus()
  } else {
    new NyxWindow({})
  }
})

// Links opened from other apps (and default-browser duty).
let pendingUrl: string | null = null
app.on('open-url', (event, url) => {
  event.preventDefault()
  if (app.isReady() && nyxWindows.length > 0) {
    const w = nyxWindows[0]
    w.newTab(url, true)
    w.win.focus()
  } else {
    pendingUrl = url
  }
})

// QA runs drive the app over CDP while the window sits behind the terminal;
// keep occluded windows painting so screenshots capture live pixels.
if (process.argv.some((a) => a.startsWith('--remote-debugging-port'))) {
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
}

// The adblocker's cosmetic injection rejects on strict-CSP pages; keep it to one line.
process.on('unhandledRejection', (reason) => {
  console.warn('[unhandled]', reason instanceof Error ? reason.message : String(reason))
})

function collectSession(): SessionData | null {
  const windows = nyxWindows
    .map((w) => w.toSessionWindow())
    .filter((w): w is NonNullable<typeof w> => w !== null && w.tabs.length > 0)
  if (windows.length === 0) return null
  return { windows }
}

function saveSessionNow(): void {
  const data = collectSession()
  if (data) saveSession(data)
}

app.whenReady().then(() => {
  runImportIfNeeded()
  initSettings()
  initHistory()
  initBookmarks()
  initProfiles()
  initPasswords()
  initIpc()
  buildMenu()
  void initAdblock()
  initUpdates()

  // Password capture from page preloads; ignored for incognito windows.
  ipcMain.on('nyx:pwd-capture', (event, payload: { origin: string; username: string; password: string }) => {
    const w = nyxWindowFromPage(event.sender)
    if (!w || w.incognito) return
    if (typeof payload?.origin !== 'string' || typeof payload?.password !== 'string') return
    handleCapture(
      BrowserWindow.fromWebContents(event.sender) ?? w.win,
      payload.origin,
      String(payload.username ?? ''),
      payload.password
    )
  })

  const restored = loadSession()
  if (restored && restored.windows.length > 0) {
    for (const sw of restored.windows) new NyxWindow({ restore: sw })
  } else {
    new NyxWindow({})
  }
  if (pendingUrl) {
    nyxWindows[0]?.newTab(pendingUrl, true)
    pendingUrl = null
  }

  setInterval(saveSessionNow, 15000)

  app.on('activate', () => {
    if (nyxWindows.length === 0) new NyxWindow({})
  })
})

let cleanupDone = false
app.on('before-quit', (event) => {
  markQuitting()
  saveSessionNow()
  if (!cleanupDone) {
    cleanupDone = true
    event.preventDefault()
    void clearOnQuit(session.defaultSession).finally(() => app.quit())
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Handles for driving the app over the inspector protocol during QA.
;(globalThis as Record<string, unknown>).nyxDebug = {
  windows: nyxWindows,
  newIncognito: (): NyxWindow => new NyxWindow({ incognito: true }),
  installFromArchive
}
