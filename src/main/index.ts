import { app, session } from 'electron'
import { initSettings } from './settings'
import { initHistory } from './history'
import { initBookmarks } from './bookmarks'
import { runImportIfNeeded } from './importer'
import { initAdblock } from './adblock'
import { initUpdates } from './updates'
import { clearOnQuit } from './privacy'
import { initIpc } from './ipc'
import { buildMenu } from './menu'
import { loadSession, saveSession, SessionData } from './sessionStore'
import { NyxWindow, nyxWindows, markQuitting } from './browser'

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
  initIpc()
  buildMenu()
  void initAdblock()
  initUpdates()

  const restored = loadSession()
  if (restored && restored.windows.length > 0) {
    for (const sw of restored.windows) new NyxWindow({ restore: sw })
  } else {
    new NyxWindow({})
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
  newIncognito: (): NyxWindow => new NyxWindow({ incognito: true })
}
