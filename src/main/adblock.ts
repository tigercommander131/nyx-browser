import { ElectronBlocker } from '@ghostery/adblocker-electron'
import { app, ipcMain, Session } from 'electron'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import type { AdblockLevel } from '../shared/types'
import { getSettings, updateSettings } from './settings'

let blocker: ElectronBlocker | null = null
let activeLevel: AdblockLevel | null = null
const enabledSessions = new Set<Session>()

function cachePath(level: AdblockLevel): string {
  return path.join(app.getPath('userData'), `adblock-${level}.bin`)
}

// The blocker registers global ipcMain handlers per session; enabling a second
// session (e.g. incognito) throws unless the previous registration is cleared.
// The handlers are identical across sessions, so re-registering is safe.
function enableOn(ses: Session): void {
  if (!blocker) return
  ipcMain.removeHandler('@ghostery/adblocker/inject-cosmetic-filters')
  ipcMain.removeHandler('@ghostery/adblocker/is-mutation-observer-enabled')
  blocker.enableBlockingInSession(ses)
}

async function loadEngine(level: AdblockLevel): Promise<ElectronBlocker> {
  const caching = {
    path: cachePath(level),
    read: fs.readFile,
    write: fs.writeFile
  }
  return level === 'full'
    ? ElectronBlocker.fromPrebuiltFull(fetch, caching)
    : ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, caching)
}

export async function initAdblock(): Promise<void> {
  const level = getSettings().adblockLevel
  try {
    blocker = await loadEngine(level)
    activeLevel = level
    if (getSettings().adblockEnabled) {
      for (const ses of enabledSessions) enableOn(ses)
    }
    console.log(`[adblock] engine ready (${level})`)
  } catch (err) {
    console.error('[adblock] init failed', err)
  }
}

// Register a session; blocking applies now (if engine is ready) or when it is.
export function adblockSession(ses: Session): void {
  if (enabledSessions.has(ses)) return
  enabledSessions.add(ses)
  if (blocker && getSettings().adblockEnabled) enableOn(ses)
}

export function setAdblockEnabled(enabled: boolean): void {
  updateSettings({ adblockEnabled: enabled })
  if (!blocker) return
  for (const ses of enabledSessions) {
    if (enabled) enableOn(ses)
    else blocker.disableBlockingInSession(ses)
  }
}

export async function setAdblockLevel(level: AdblockLevel): Promise<void> {
  updateSettings({ adblockLevel: level })
  if (level === activeLevel) return
  if (blocker && getSettings().adblockEnabled) {
    for (const ses of enabledSessions) blocker.disableBlockingInSession(ses)
  }
  blocker = null
  await initAdblock()
}

export function filtersUpdatedAt(): number {
  const level = activeLevel ?? getSettings().adblockLevel
  try {
    return fsSync.statSync(cachePath(level)).mtimeMs
  } catch {
    return 0
  }
}

// Force a fresh download of the filter lists.
export async function refreshFilters(): Promise<void> {
  const level = getSettings().adblockLevel
  try {
    await fs.unlink(cachePath(level))
  } catch {
    // no cache yet
  }
  if (blocker && getSettings().adblockEnabled) {
    for (const ses of enabledSessions) blocker.disableBlockingInSession(ses)
  }
  blocker = null
  activeLevel = null
  await initAdblock()
}
