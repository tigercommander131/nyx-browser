import { app, dialog, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { UpdateProgress, UpdateStatus } from '../shared/types'
import { filtersUpdatedAt, refreshFilters } from './adblock'
import { canSelfUpdate, runSelfUpdate } from './selfUpdate'
import { nyxWindows } from './browser'

const FILTER_MAX_AGE_DAYS = 7
const RECHECK_INTERVAL = 6 * 60 * 60 * 1000

export interface AppUpdate {
  version: string
  url: string
  zipUrl?: string
  sigUrl?: string
}

function ageDays(ts: number): number {
  if (!ts) return Infinity
  return (Date.now() - ts) / 86_400_000
}

// "owner/repo" for GitHub Releases; the same package.json ships inside the
// asar, so packaged builds know where their updates live.
function updateRepo(): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'))
    const r = pkg.nyxUpdateRepo
    return typeof r === 'string' && r.includes('/') ? r : null
  } catch {
    return null
  }
}

function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  }
  return false
}

export async function checkAppUpdate(): Promise<AppUpdate | null> {
  const repo = updateRepo()
  if (!repo) return null
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'nyx-browser' }
  })
  if (!res.ok) return null
  const rel = (await res.json()) as {
    tag_name?: string
    html_url?: string
    assets?: { name?: string; browser_download_url?: string }[]
  }
  const version = String(rel.tag_name ?? '').replace(/^v/, '')
  if (!version || !isNewer(version, app.getVersion())) return null
  const assets = rel.assets ?? []
  const find = (suffix: string): string | undefined =>
    assets.find((a) => a.name?.endsWith(suffix))?.browser_download_url
  return {
    version,
    url: find('.dmg') ?? rel.html_url ?? '',
    zipUrl: find('.zip'),
    sigUrl: find('.sig')
  }
}

function broadcastProgress(progress: UpdateProgress): void {
  for (const w of nyxWindows) w.sendEvent({ type: 'updateProgress', progress })
}

// One-click path when possible; dmg download as the fallback.
export async function startInstall(u: AppUpdate): Promise<boolean> {
  if (u.zipUrl && u.sigUrl && canSelfUpdate().ok) {
    runSelfUpdate(u.zipUrl, u.sigUrl, broadcastProgress).catch((err) => {
      void dialog.showMessageBox({
        type: 'warning',
        message: 'Update failed',
        detail:
          (err instanceof Error ? err.message : String(err)) +
          '\nYou can still download the new version manually.'
      })
    })
    return true
  }
  if (u.url) void shell.openExternal(u.url)
  return false
}

export async function promptAndInstall(u: AppUpdate): Promise<void> {
  const selfOk = !!(u.zipUrl && u.sigUrl && canSelfUpdate().ok)
  const { response } = await dialog.showMessageBox({
    type: 'info',
    buttons: [selfOk ? 'Update & Relaunch' : 'Download', 'Later'],
    defaultId: 0,
    cancelId: 1,
    message: `Nyx ${u.version} is available`,
    detail: selfOk
      ? `You're on ${app.getVersion()}. Nyx updates itself and relaunches — takes under a minute.`
      : `You're on ${app.getVersion()}. The download opens in your browser — drag the new Nyx into Applications to update.`
  })
  if (response === 0) await startInstall(u)
}

export async function openUpdateDownload(): Promise<boolean> {
  const u = await checkAppUpdate().catch(() => null)
  if (!u) return false
  return await startInstall(u)
}

let notifiedVersion: string | null = null

async function notifyIfUpdate(): Promise<void> {
  try {
    const u = await checkAppUpdate()
    if (!u || u.version === notifiedVersion) return
    notifiedVersion = u.version
    await promptAndInstall(u)
  } catch {
    // offline or rate-limited; try again next tick
  }
}

export async function checkForUpdates(force = false): Promise<UpdateStatus> {
  let refreshed = false
  if (force || ageDays(filtersUpdatedAt()) > FILTER_MAX_AGE_DAYS) {
    await refreshFilters()
    refreshed = true
  }
  const ts = filtersUpdatedAt()
  const appUpdate = await checkAppUpdate().catch(() => null)
  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    filtersUpdatedAt: ts,
    filtersAgeDays: Math.max(0, Math.floor(ageDays(ts))),
    refreshed,
    appUpdate: appUpdate ? { version: appUpdate.version, url: appUpdate.url } : null
  }
}

// On-launch + periodic: refresh stale filter lists, notify about app updates.
export function initUpdates(): void {
  const tick = (): void => {
    void checkForUpdates(false).then((s) => {
      if (s.refreshed) console.log('[updates] filter lists refreshed')
    })
    void notifyIfUpdate()
  }
  setTimeout(tick, 8000)
  setInterval(tick, RECHECK_INTERVAL)
}
