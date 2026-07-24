import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { TabGroup } from '../shared/types'

// Superset of Swift Nyx's session.json shape (its files restore unchanged;
// the extra fields are all optional).
export interface SessionTab {
  url: string
  title: string
  pinned: boolean
  groupId?: string
}

export interface SessionWindow {
  x: number
  y: number
  w: number
  h: number
  activeIndex: number
  groups: TabGroup[]
  tabs: SessionTab[]
  vertical?: boolean
  splitIndex?: number
  splitFraction?: number
  profile?: string
}

export interface SessionData {
  windows: SessionWindow[]
}

function sessionPath(): string {
  return path.join(app.getPath('userData'), 'session.json')
}

export function loadSession(): SessionData | null {
  try {
    const data = JSON.parse(fs.readFileSync(sessionPath(), 'utf8')) as SessionData
    if (!Array.isArray(data.windows)) return null
    // Swift group entries may not match our TabGroup shape; drop unusable ones.
    for (const w of data.windows) {
      if (!Array.isArray(w.groups)) w.groups = []
      w.groups = w.groups.filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string')
    }
    return data
  } catch {
    return null
  }
}

export function saveSession(data: SessionData): void {
  try {
    fs.writeFileSync(sessionPath(), JSON.stringify(data))
  } catch (err) {
    console.error('[session] save failed', err)
  }
}
