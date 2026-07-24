import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import type { HistoryEntry, Suggestion } from '../shared/types'

// Same schema as Swift Nyx's history.db so the file imports as-is.
let db: Database.Database

export function initHistory(): void {
  db = new Database(path.join(app.getPath('userData'), 'history.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY,
    url TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    visit_count INTEGER NOT NULL DEFAULT 0,
    last_visit REAL NOT NULL DEFAULT 0,
    profile TEXT NOT NULL DEFAULT '');
  CREATE INDEX IF NOT EXISTS idx_history_rank ON history(visit_count DESC, last_visit DESC);`)
}

export function recordVisit(url: string, title: string): void {
  if (!/^https?:/.test(url)) return
  db.prepare(
    `INSERT INTO history (url, title, visit_count, last_visit) VALUES (?, ?, 1, ?)
     ON CONFLICT(url) DO UPDATE SET
       visit_count = visit_count + 1,
       last_visit = excluded.last_visit,
       title = CASE WHEN excluded.title != '' THEN excluded.title ELSE history.title END`
  ).run(url, title, Date.now() / 1000)
}

export function updateTitle(url: string, title: string): void {
  if (!title) return
  db.prepare('UPDATE history SET title = ? WHERE url = ?').run(title, url)
}

interface Row {
  id: number
  url: string
  title: string
  visit_count: number
  last_visit: number
}

export function searchHistory(query: string, limit = 200): HistoryEntry[] {
  const rows = (
    query
      ? db
          .prepare(
            `SELECT * FROM history WHERE url LIKE ? OR title LIKE ?
             ORDER BY last_visit DESC LIMIT ?`
          )
          .all(`%${query}%`, `%${query}%`, limit)
      : db.prepare('SELECT * FROM history ORDER BY last_visit DESC LIMIT ?').all(limit)
  ) as Row[]
  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    title: r.title,
    visitCount: r.visit_count,
    lastVisit: r.last_visit
  }))
}

export function suggest(query: string, limit = 6): Suggestion[] {
  if (!query) return []
  const rows = db
    .prepare(
      `SELECT * FROM history WHERE url LIKE ? OR title LIKE ?
       ORDER BY visit_count DESC, last_visit DESC LIMIT ?`
    )
    .all(`%${query}%`, `%${query}%`, limit) as Row[]
  return rows.map((r) => ({
    kind: 'history' as const,
    title: r.title || r.url,
    url: r.url,
    detail: r.url
  }))
}

export function topSites(limit = 8): { url: string; title: string; host: string }[] {
  const rows = db
    .prepare(
      `SELECT * FROM history WHERE url LIKE 'http%' AND visit_count > 0
       ORDER BY visit_count DESC, last_visit DESC LIMIT 40`
    )
    .all() as Row[]
  // Collapse to one entry per host so the grid isn't all one site.
  const seen = new Set<string>()
  const out: { url: string; title: string; host: string }[] = []
  for (const r of rows) {
    let host: string
    try {
      host = new URL(r.url).hostname.replace(/^www\./, '')
    } catch {
      continue
    }
    if (seen.has(host)) continue
    seen.add(host)
    out.push({ url: r.url, title: r.title || host, host })
    if (out.length >= limit) break
  }
  return out
}

export function deleteEntry(id: number): void {
  db.prepare('DELETE FROM history WHERE id = ?').run(id)
}

export function clearHistory(): void {
  db.prepare('DELETE FROM history').run()
}
