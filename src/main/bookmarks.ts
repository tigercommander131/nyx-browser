import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import type { BookmarkEntry } from '../shared/types'

// Same schema as Swift Nyx's bookmarks.db so the imported file works as-is.
let db: Database.Database

export function initBookmarks(): void {
  db = new Database(path.join(app.getPath('userData'), 'bookmarks.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY,
    url TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    is_reading INTEGER NOT NULL DEFAULT 0,
    is_read INTEGER NOT NULL DEFAULT 0,
    created REAL NOT NULL DEFAULT 0)`)
}

interface Row {
  id: number
  url: string
  title: string
  is_reading: number
  is_read: number
  created: number
}

function toEntry(r: Row): BookmarkEntry {
  return {
    id: r.id,
    url: r.url,
    title: r.title,
    isReading: r.is_reading === 1,
    isRead: r.is_read === 1,
    created: r.created
  }
}

export function isBookmarked(url: string): boolean {
  if (!url) return false
  return !!db.prepare('SELECT 1 FROM bookmarks WHERE url = ? AND is_reading = 0').get(url)
}

// Returns the new bookmarked state.
export function toggleBookmark(url: string, title: string, reading = false): boolean {
  if (!url) return false
  const flag = reading ? 1 : 0
  const existing = db
    .prepare('SELECT id FROM bookmarks WHERE url = ? AND is_reading = ?')
    .get(url, flag) as { id: number } | undefined
  if (existing) {
    db.prepare('DELETE FROM bookmarks WHERE id = ?').run(existing.id)
    return false
  }
  db.prepare(
    `INSERT INTO bookmarks (url, title, is_reading, is_read, created) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(url) DO UPDATE SET is_reading = excluded.is_reading, is_read = 0, title = excluded.title`
  ).run(url, title, flag, Date.now() / 1000)
  return true
}

export function listBookmarks(reading: boolean): BookmarkEntry[] {
  const rows = db
    .prepare('SELECT * FROM bookmarks WHERE is_reading = ? ORDER BY created DESC')
    .all(reading ? 1 : 0) as Row[]
  return rows.map(toEntry)
}

export function deleteBookmark(id: number): void {
  db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id)
}

export function markRead(id: number, read: boolean): void {
  db.prepare('UPDATE bookmarks SET is_read = ? WHERE id = ?').run(read ? 1 : 0, id)
}
