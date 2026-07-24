import { clipboard, ipcMain } from 'electron'
import {
  NyxWindow,
  nyxWindows,
  nyxWindowFromChrome,
  broadcastState,
  applyAppearanceAll,
  parseOmniboxInput,
  searchUrlFor
} from './browser'
import {
  listCredentials,
  revealPassword,
  deleteCredential,
  importSwiftVault,
  gate
} from './passwords'
import { listProfiles, addProfile, removeProfile } from './profiles'
import { rebuildMenu } from './menu'
import { suggest, searchHistory, deleteEntry, clearHistory, topSites } from './history'
import {
  getDownloads,
  showDownload,
  openDownload,
  cancelDownload,
  clearDownloadList,
  setDownloadsListener
} from './downloads'
import { setAdblockEnabled, setAdblockLevel } from './adblock'
import { getSettings, updateSettings } from './settings'
import { toggleBookmark, listBookmarks, deleteBookmark, markRead } from './bookmarks'
import { checkForUpdates } from './updates'
import { SEARCH_ENGINES, Settings, Suggestion } from '../shared/types'

export function initIpc(): void {
  setDownloadsListener(() => {
    const downloads = getDownloads()
    for (const w of nyxWindows) w.sendEvent({ type: 'downloads', downloads })
  })

  ipcMain.handle('nyx:cmd', async (event, channel: string, payload: unknown = {}) => {
    const w = nyxWindowFromChrome(event.sender)
    if (!w) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = payload as any

    switch (channel) {
      case 'newTab':
        w.newTab((p['url'] as string) ?? '', (p['activate'] as boolean) ?? true)
        return null
      case 'closeTab':
        w.closeTab(p['tabId'])
        return null
      case 'activateTab':
        w.activateTab(p['tabId'])
        return null
      case 'reorderTabs':
        w.reorderTabs(p['tabIds'])
        return null
      case 'setPinned':
        w.setPinned(p['tabId'], p['pinned'])
        return null
      case 'muteTab':
        w.muteTab(p['tabId'])
        return null
      case 'duplicateTab':
        w.duplicateTab(p['tabId'])
        return null
      case 'navigate':
        w.navigate(p['input'], p['tabId'])
        return null
      case 'back':
        w.activeTab?.view?.webContents.navigationHistory.goBack()
        return null
      case 'forward':
        w.activeTab?.view?.webContents.navigationHistory.goForward()
        return null
      case 'reload': {
        const wc = w.activeTab?.view?.webContents
        if (p['hard']) wc?.reloadIgnoringCache()
        else wc?.reload()
        return null
      }
      case 'stop':
        w.activeTab?.view?.webContents.stop()
        return null
      case 'omniboxSuggest': {
        const query = (p['query'] as string).trim()
        const out: Suggestion[] = []
        if (query) {
          const parsed = parseOmniboxInput(query)
          const searchUrl = searchUrlFor(query)
          const engine = SEARCH_ENGINES[getSettings().searchEngine] ?? SEARCH_ENGINES.duckduckgo
          if (parsed !== searchUrl) {
            out.push({ kind: 'url', title: query, url: parsed, detail: parsed })
          }
          out.push({ kind: 'search', title: `Search ${engine.name} for “${query}”`, url: searchUrl })
          out.push(...suggest(query, 6))
        }
        return out
      }
      case 'setCanvas':
        w.setCanvas(p)
        return null
      case 'findStart':
        w.findInPage(p['text'], (p['forward'] as boolean) ?? true, (p['first'] as boolean) ?? true)
        return null
      case 'findStop':
        w.setFindBarOpen(false)
        return null
      case 'setFindBarOpen':
        w.setFindBarOpen(p['open'])
        return null
      case 'getHistory':
        return searchHistory((p['query'] as string) ?? '', (p['limit'] as number) ?? 200)
      case 'deleteHistoryEntry':
        deleteEntry(p['id'])
        return null
      case 'clearHistory':
        clearHistory()
        return null
      case 'getTopSites':
        return topSites(8)
      case 'getDownloads':
        return getDownloads()
      case 'showDownload':
        showDownload(p['id'])
        return null
      case 'openDownload':
        openDownload(p['id'])
        return null
      case 'cancelDownload':
        cancelDownload(p['id'])
        return null
      case 'clearDownloads':
        clearDownloadList()
        return null
      case 'toggleBookmark': {
        const tab = w.activeTab
        if (!tab?.url) return false
        const added = toggleBookmark(tab.url, tab.title, (p['reading'] as boolean) ?? false)
        broadcastState()
        return added
      }
      case 'getBookmarks':
        return listBookmarks((p['reading'] as boolean) ?? false)
      case 'deleteBookmark':
        deleteBookmark(p['id'])
        broadcastState()
        return null
      case 'markRead':
        markRead(p['id'], p['read'])
        return null
      case 'copyUrl': {
        const url = w.activeTab?.url
        if (url) clipboard.writeText(url)
        return null
      }
      case 'updateSetting': {
        const patch = p as Partial<Settings>
        // Settings with main-process side effects get dedicated paths.
        if ('adblockEnabled' in patch) {
          setAdblockEnabled(!!patch.adblockEnabled)
        } else if ('adblockLevel' in patch && patch.adblockLevel) {
          await setAdblockLevel(patch.adblockLevel)
        } else {
          updateSettings(patch)
        }
        if ('theme' in patch || 'vibrancy' in patch || 'density' in patch) {
          applyAppearanceAll()
        }
        broadcastState()
        return null
      }
      case 'checkUpdates':
        return await checkForUpdates((p['force'] as boolean) ?? false)
      case 'reopenClosedTab':
        w.reopenClosedTab()
        return null
      case 'setShelf':
        w.setShelfOpen(p['open'])
        return null
      case 'toggleSplit':
        w.toggleSplit()
        return null
      case 'setSplitFraction':
        w.setSplitFraction(p['fraction'])
        return null
      case 'toggleVertical':
        w.toggleVertical()
        return null
      case 'toggleReader':
        w.toggleReader()
        return null
      case 'createGroupWithTab':
        w.createGroupWithTab(p['tabId'])
        return null
      case 'setTabGroup':
        w.setTabGroup(p['tabId'], p['groupId'] ?? null)
        return null
      case 'renameGroup':
        w.renameGroup(p['id'], p['name'])
        return null
      case 'recolorGroup':
        w.recolorGroup(p['id'], p['color'])
        return null
      case 'toggleGroupCollapse':
        w.toggleGroupCollapse(p['id'])
        return null
      case 'closeGroup':
        w.closeGroup(p['id'])
        return null
      case 'getPasswords':
        return listCredentials()
      case 'revealPassword':
        return await revealPassword(p['id'])
      case 'copyPassword': {
        const pwd = await revealPassword(p['id'])
        if (pwd !== null) clipboard.writeText(pwd)
        return pwd !== null
      }
      case 'deletePassword': {
        if (!(await gate('delete a saved password'))) return false
        deleteCredential(p['id'])
        return true
      }
      case 'fillPassword':
        return await w.fillPassword()
      case 'importSwiftVault':
        try {
          return { imported: await importSwiftVault() }
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) }
        }
      case 'getProfiles':
        return listProfiles()
      case 'addProfile': {
        const profile = addProfile((p['name'] as string) || 'Profile')
        rebuildMenu()
        broadcastState()
        return profile
      }
      case 'removeProfile':
        removeProfile(p['id'])
        rebuildMenu()
        broadcastState()
        return null
      case 'newWindowWithProfile':
        new NyxWindow({ profileId: p['id'] })
        return null
      default:
        console.warn('[ipc] unknown command', channel)
        return null
    }
  })
}
