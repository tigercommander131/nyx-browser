import { clipboard, dialog, Menu, MenuItemConstructorOptions } from 'electron'
import { broadcastState, focusedNyxWindow, NyxWindow } from './browser'
import { toggleBookmark } from './bookmarks'
import { checkForUpdates } from './updates'

function withWin(fn: (w: NyxWindow) => void): () => void {
  return () => {
    const w = focusedNyxWindow()
    if (w) fn(w)
  }
}

export function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Nyx',
      submenu: [
        { role: 'about', label: 'About Nyx' },
        {
          label: 'Check for Updates…',
          click: async () => {
            const s = await checkForUpdates(true)
            void dialog.showMessageBox({
              type: 'info',
              message: `Nyx ${s.appVersion}`,
              detail: `Electron ${s.electronVersion}\nFilter lists refreshed just now.`
            })
          }
        },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'Cmd+,',
          click: withWin((w) => w.sendEvent({ type: 'openLibrary', section: 'settings' }))
        },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Nyx' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Nyx' }
      ]
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'Cmd+T', click: withWin((w) => w.newTab('', true)) },
        {
          label: 'New Window',
          accelerator: 'Cmd+N',
          click: () => void new NyxWindow({})
        },
        {
          label: 'New Incognito Window',
          accelerator: 'Shift+Cmd+N',
          click: () => void new NyxWindow({ incognito: true })
        },
        { type: 'separator' },
        {
          label: 'Reopen Closed Tab',
          accelerator: 'Shift+Cmd+T',
          click: withWin((w) => w.reopenClosedTab())
        },
        { label: 'Duplicate Tab', click: withWin((w) => w.duplicateTab()) },
        { type: 'separator' },
        {
          label: 'Open Location…',
          accelerator: 'Cmd+L',
          click: withWin((w) => w.sendEvent({ type: 'focusOmnibox' }))
        },
        {
          label: 'Copy Current URL',
          accelerator: 'Shift+Cmd+C',
          click: withWin((w) => {
            const url = w.activeTab?.url
            if (url) clipboard.writeText(url)
          })
        },
        { type: 'separator' },
        {
          label: 'Export Page as PDF…',
          accelerator: 'Shift+Cmd+E',
          click: withWin((w) => void w.exportPdf())
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'Cmd+W',
          click: withWin((w) => {
            if (w.activeTabId) w.closeTab(w.activeTabId)
          })
        },
        { label: 'Close Window', accelerator: 'Shift+Cmd+W', role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find…',
          accelerator: 'Cmd+F',
          click: withWin((w) => {
            w.setFindBarOpen(true)
            w.sendEvent({ type: 'openFindBar' })
          })
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload Page', accelerator: 'Cmd+R', click: withWin((w) => w.activeTab?.view?.webContents.reload()) },
        {
          label: 'Reload Ignoring Cache',
          accelerator: 'Shift+Cmd+R',
          click: withWin((w) => w.activeTab?.view?.webContents.reloadIgnoringCache())
        },
        { label: 'Stop', accelerator: 'Cmd+.', click: withWin((w) => w.activeTab?.view?.webContents.stop()) },
        { type: 'separator' },
        {
          label: 'Actual Size',
          accelerator: 'Cmd+0',
          click: withWin((w) => w.activeTab?.view?.webContents.setZoomLevel(0))
        },
        {
          label: 'Zoom In',
          accelerator: 'Cmd+Plus',
          click: withWin((w) => {
            const wc = w.activeTab?.view?.webContents
            if (wc) wc.setZoomLevel(wc.getZoomLevel() + 0.5)
          })
        },
        {
          label: 'Zoom Out',
          accelerator: 'Cmd+-',
          click: withWin((w) => {
            const wc = w.activeTab?.view?.webContents
            if (wc) wc.setZoomLevel(wc.getZoomLevel() - 0.5)
          })
        },
        { type: 'separator' },
        {
          label: 'Picture in Picture',
          accelerator: 'Alt+Cmd+P',
          click: withWin((w) => w.togglePictureInPicture())
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Developer Tools',
          accelerator: 'Alt+Cmd+I',
          click: withWin((w) => w.activeTab?.view?.webContents.openDevTools({ mode: 'detach' }))
        },
        {
          label: 'Chrome UI Developer Tools',
          click: withWin((w) => w.win.webContents.openDevTools({ mode: 'detach' }))
        }
      ]
    },
    {
      label: 'Bookmarks',
      submenu: [
        {
          label: 'Bookmark This Page',
          accelerator: 'Cmd+D',
          click: withWin((w) => {
            const tab = w.activeTab
            if (tab?.url && !w.incognito) {
              toggleBookmark(tab.url, tab.title, false)
              broadcastState()
            }
          })
        },
        {
          label: 'Add to Reading List',
          accelerator: 'Shift+Cmd+D',
          click: withWin((w) => {
            const tab = w.activeTab
            if (tab?.url && !w.incognito) {
              toggleBookmark(tab.url, tab.title, true)
              broadcastState()
            }
          })
        },
        { type: 'separator' },
        {
          label: 'Show Bookmarks',
          accelerator: 'Alt+Cmd+B',
          click: withWin((w) => w.sendEvent({ type: 'openLibrary', section: 'bookmarks' }))
        },
        {
          label: 'Show Reading List',
          click: withWin((w) => w.sendEvent({ type: 'openLibrary', section: 'reading' }))
        }
      ]
    },
    {
      label: 'History',
      submenu: [
        {
          label: 'Back',
          accelerator: 'Cmd+[',
          click: withWin((w) => w.activeTab?.view?.webContents.navigationHistory.goBack())
        },
        {
          label: 'Forward',
          accelerator: 'Cmd+]',
          click: withWin((w) => w.activeTab?.view?.webContents.navigationHistory.goForward())
        },
        { type: 'separator' },
        {
          label: 'Show History',
          accelerator: 'Cmd+Y',
          click: withWin((w) => w.sendEvent({ type: 'openLibrary', section: 'history' }))
        },
        {
          label: 'Show Downloads',
          accelerator: 'Shift+Cmd+J',
          click: withWin((w) => w.sendEvent({ type: 'openLibrary', section: 'downloads' }))
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        {
          label: 'Show Next Tab',
          accelerator: 'Ctrl+Tab',
          click: withWin((w) => w.selectRelativeTab(1))
        },
        {
          label: 'Show Previous Tab',
          accelerator: 'Ctrl+Shift+Tab',
          click: withWin((w) => w.selectRelativeTab(-1))
        },
        ...Array.from({ length: 9 }, (_, i): MenuItemConstructorOptions => ({
          label: `Tab ${i + 1}`,
          accelerator: `Cmd+${i + 1}`,
          visible: false,
          acceleratorWorksWhenHidden: true,
          click: withWin((w) => w.selectTabAt(i))
        })),
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
