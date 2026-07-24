import { app, shell, Session, DownloadItem } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import type { DownloadInfo } from '../shared/types'

const downloads: DownloadInfo[] = []
const items = new Map<string, DownloadItem>()
let nextId = 1
let onChange: (() => void) | null = null

export function setDownloadsListener(cb: () => void): void {
  onChange = cb
}

export function getDownloads(): DownloadInfo[] {
  return downloads
}

function uniquePath(dir: string, filename: string): string {
  const ext = path.extname(filename)
  const base = path.basename(filename, ext)
  let candidate = path.join(dir, filename)
  let n = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} ${n}${ext}`)
    n++
  }
  return candidate
}

export function watchDownloads(ses: Session): void {
  ses.on('will-download', (_event, item) => {
    const id = String(nextId++)
    const savePath = uniquePath(app.getPath('downloads'), item.getFilename())
    item.setSavePath(savePath)
    const info: DownloadInfo = {
      id,
      filename: path.basename(savePath),
      path: savePath,
      url: item.getURL(),
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      state: 'progressing',
      startedAt: Date.now()
    }
    downloads.unshift(info)
    items.set(id, item)
    item.on('updated', () => {
      info.receivedBytes = item.getReceivedBytes()
      info.totalBytes = item.getTotalBytes()
      onChange?.()
    })
    item.once('done', (_e, state) => {
      info.receivedBytes = item.getReceivedBytes()
      info.state = state === 'completed' ? 'completed' : state
      items.delete(id)
      onChange?.()
    })
    onChange?.()
  })
}

// Files Nyx produced itself (e.g. exported PDFs) rather than DownloadItems.
export function addManualDownload(filePath: string, sourceUrl: string): void {
  downloads.unshift({
    id: String(nextId++),
    filename: path.basename(filePath),
    path: filePath,
    url: sourceUrl,
    receivedBytes: fs.statSync(filePath).size,
    totalBytes: fs.statSync(filePath).size,
    state: 'completed',
    startedAt: Date.now()
  })
  onChange?.()
}

export function clearDownloadList(): void {
  for (let i = downloads.length - 1; i >= 0; i--) {
    if (downloads[i].state !== 'progressing') downloads.splice(i, 1)
  }
  onChange?.()
}

export function showDownload(id: string): void {
  const d = downloads.find((d) => d.id === id)
  if (d && fs.existsSync(d.path)) shell.showItemInFolder(d.path)
}

export function openDownload(id: string): void {
  const d = downloads.find((d) => d.id === id)
  if (d && d.state === 'completed') shell.openPath(d.path)
}

export function cancelDownload(id: string): void {
  items.get(id)?.cancel()
}
