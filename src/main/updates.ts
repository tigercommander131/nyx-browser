import { app } from 'electron'
import type { UpdateStatus } from '../shared/types'
import { filtersUpdatedAt, refreshFilters } from './adblock'

const FILTER_MAX_AGE_DAYS = 7
const RECHECK_INTERVAL = 6 * 60 * 60 * 1000

function ageDays(ts: number): number {
  if (!ts) return Infinity
  return (Date.now() - ts) / 86_400_000
}

export async function checkForUpdates(force = false): Promise<UpdateStatus> {
  let refreshed = false
  if (force || ageDays(filtersUpdatedAt()) > FILTER_MAX_AGE_DAYS) {
    await refreshFilters()
    refreshed = true
  }
  const ts = filtersUpdatedAt()
  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    filtersUpdatedAt: ts,
    filtersAgeDays: Math.max(0, Math.floor(ageDays(ts))),
    refreshed
  }
}

// On-launch + periodic freshness check; refreshes filter lists when stale.
export function initUpdates(): void {
  const tick = (): void => {
    void checkForUpdates(false).then((s) => {
      if (s.refreshed) console.log('[updates] filter lists refreshed')
    })
  }
  setTimeout(tick, 8000)
  setInterval(tick, RECHECK_INTERVAL)
}
