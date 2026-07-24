import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

// Same shape as Swift Nyx's session.json (its files restore unchanged).
export interface SessionTab {
  url: string
  title: string
  pinned: boolean
}

export interface SessionWindow {
  x: number
  y: number
  w: number
  h: number
  activeIndex: number
  groups: unknown[]
  tabs: SessionTab[]
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
