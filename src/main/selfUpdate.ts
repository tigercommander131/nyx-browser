import { app } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import type { UpdateProgress } from '../shared/types'

// Updates must be signed by Joel's release key (scripts/sign-release.mjs;
// private key never leaves his Mac). Transport security alone isn't enough —
// this makes a hijacked GitHub account unable to ship code to anyone.
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAZAu8PITBp/H67Pzq35HxhjLCFlwQDHHuF8G9fkMvMvA=
-----END PUBLIC KEY-----`

function bundlePath(): string | null {
  const m = app.getAppPath().match(/^(.*?\.app)\//)
  return m ? m[1] : null
}

export function canSelfUpdate(): { ok: boolean; reason?: string } {
  if (!app.isPackaged) return { ok: false, reason: 'running a dev build' }
  const b = bundlePath()
  if (!b) return { ok: false, reason: 'app bundle not found' }
  if (b.includes('/AppTranslocation/')) {
    return { ok: false, reason: 'Nyx is running quarantined — move it into Applications first' }
  }
  try {
    fs.accessSync(path.dirname(b), fs.constants.W_OK)
  } catch {
    return { ok: false, reason: `${path.dirname(b)} is not writable` }
  }
  return { ok: true }
}

async function fetchToFile(
  url: string,
  dest: string,
  onPct: (pct: number | null) => void
): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`)
  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const out = fs.createWriteStream(dest)
  let received = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      onPct(total ? Math.round((received / total) * 100) : null)
      if (!out.write(value)) await new Promise((r) => out.once('drain', r))
    }
  } finally {
    await new Promise((r) => out.end(r))
  }
}

// Verify + unpack the archive, then hand off to a detached shell that waits
// for this process to die, swaps /Applications/Nyx.app, and relaunches.
export function installFromArchive(zipPath: string, sigPath: string): void {
  const data = fs.readFileSync(zipPath)
  const sig = Buffer.from(fs.readFileSync(sigPath, 'utf8').trim(), 'base64')
  if (!crypto.verify(null, data, PUBLIC_KEY_PEM, sig)) {
    throw new Error('update signature verification failed — refusing to install')
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nyx-update-'))
  execFileSync('/usr/bin/ditto', ['-x', '-k', zipPath, tmp])
  const newApp = path.join(tmp, 'Nyx.app')
  if (!fs.existsSync(path.join(newApp, 'Contents', 'MacOS', 'Nyx'))) {
    throw new Error('archive does not contain Nyx.app')
  }
  const dest = bundlePath()
  if (!dest) throw new Error('cannot locate the installed app bundle')

  const script = [
    // wait (max 15s) for the current instance to exit so the single-instance
    // lock is released and no files are busy
    `n=0; while [ $n -lt 30 ] && kill -0 ${process.pid} 2>/dev/null; do sleep 0.5; n=$((n+1)); done`,
    `rm -rf ${JSON.stringify(dest)}`,
    `/usr/bin/ditto ${JSON.stringify(newApp)} ${JSON.stringify(dest)}`,
    `rm -rf ${JSON.stringify(tmp)} ${JSON.stringify(zipPath)} ${JSON.stringify(sigPath)}`,
    `/usr/bin/open ${JSON.stringify(dest)}`
  ].join(' && ')
  spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' }).unref()
  app.quit()
}

let running = false

export async function runSelfUpdate(
  zipUrl: string,
  sigUrl: string,
  report: (p: UpdateProgress) => void
): Promise<void> {
  if (running) return
  running = true
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyx-dl-'))
  const zipPath = path.join(dir, 'update.zip')
  const sigPath = path.join(dir, 'update.sig')
  try {
    report({ phase: 'downloading', pct: 0 })
    await fetchToFile(zipUrl, zipPath, (pct) => report({ phase: 'downloading', pct }))
    await fetchToFile(sigUrl, sigPath, () => {})
    report({ phase: 'verifying', pct: null })
    installFromArchive(zipPath, sigPath)
    report({ phase: 'installing', pct: null })
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true })
    running = false
    report({
      phase: 'error',
      pct: null,
      message: err instanceof Error ? err.message : String(err)
    })
    throw err
  }
}
