import { BrowserWindow, dialog, Session } from 'electron'
import { TRACKING_PARAMS } from '../shared/types'
import { getSettings } from './settings'

// Applies privacy transforms to a URL about to be loaded: strip tracking
// params and upgrade http→https. Returns the URL unchanged when nothing
// applies (callers use identity to decide whether to intercept).
export function privacyTransform(rawUrl: string): string {
  const s = getSettings()
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return rawUrl
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return rawUrl

  if (s.stripTracking) {
    for (const p of TRACKING_PARAMS) url.searchParams.delete(p)
    if (/(^|\.)(youtube\.com|youtu\.be)$/.test(url.hostname)) url.searchParams.delete('si')
  }
  if (
    s.httpsOnly &&
    url.protocol === 'http:' &&
    url.hostname !== 'localhost' &&
    !url.hostname.startsWith('127.') &&
    !url.hostname.endsWith('.local')
  ) {
    url.protocol = 'https:'
  }
  return url.toString()
}

const wired = new Set<Session>()

// DNT + Global Privacy Control on every request. Uses onBeforeSendHeaders,
// which the adblocker doesn't touch (Electron allows one listener per
// webRequest event per session — onBeforeRequest belongs to the blocker).
export function initPrivacyForSession(ses: Session): void {
  if (wired.has(ses)) return
  wired.add(ses)

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    if (getSettings().privacyHeaders) {
      details.requestHeaders['DNT'] = '1'
      details.requestHeaders['Sec-GPC'] = '1'
    }
    callback({ requestHeaders: details.requestHeaders })
  })

  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    // Quiet web: notifications never prompt. Sensitive devices ask natively.
    if (permission === 'notifications') return callback(false)
    if (permission === 'media' || permission === 'geolocation' || permission === 'display-capture') {
      const host = (() => {
        try {
          return new URL(details.requestingUrl).hostname
        } catch {
          return 'This site'
        }
      })()
      const what =
        permission === 'geolocation'
          ? 'know your location'
          : permission === 'display-capture'
            ? 'record your screen'
            : `use your ${(details as { mediaTypes?: string[] }).mediaTypes?.join(' and ') ?? 'camera/microphone'}`
      const win = BrowserWindow.fromWebContents(wc) ?? BrowserWindow.getFocusedWindow()
      const opts = {
        type: 'question' as const,
        buttons: ['Allow', 'Block'],
        defaultId: 1,
        cancelId: 1,
        message: `${host} wants to ${what}`,
        detail: 'Nyx blocks this unless you allow it.'
      }
      const p = win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)
      p.then(({ response }) => callback(response === 0))
      return
    }
    // Low-risk, commonly needed capabilities.
    if (permission === 'clipboard-sanitized-write' || permission === 'fullscreen') {
      return callback(true)
    }
    callback(false)
  })
}

export async function clearOnQuit(ses: Session): Promise<void> {
  const s = getSettings()
  const jobs: Promise<unknown>[] = []
  if (s.clearCacheOnQuit) {
    jobs.push(ses.clearCache())
    jobs.push(ses.clearCodeCaches({}))
  }
  if (s.clearCookiesOnQuit) {
    jobs.push(ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb'] }))
  }
  if (jobs.length) await Promise.allSettled(jobs)
}
