import { app, BrowserWindow, dialog, safeStorage, systemPreferences } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { CredentialInfo } from '../shared/types'

interface Cred {
  id: string
  origin: string
  username: string
  password: string
  created: number
}

let creds: Cred[] = []
let never: string[] = []
let unlocked = false
let nextId = 1

const vaultPath = (): string => path.join(app.getPath('userData'), 'vault.bin')
const neverPath = (): string => path.join(app.getPath('userData'), 'pwd-never.json')

export function initPasswords(): void {
  try {
    const blob = fs.readFileSync(vaultPath())
    creds = JSON.parse(safeStorage.decryptString(blob))
    nextId = creds.reduce((m, c) => Math.max(m, Number(c.id) + 1), 1)
  } catch {
    creds = []
  }
  try {
    never = JSON.parse(fs.readFileSync(neverPath(), 'utf8'))
  } catch {
    never = []
  }
}

function persist(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    console.error('[pwd] safeStorage unavailable; refusing to write vault')
    return
  }
  fs.writeFileSync(vaultPath(), safeStorage.encryptString(JSON.stringify(creds)))
}

// Touch ID once per launch before anything sensitive. Macs without Touch ID
// fall through — the vault is still Keychain-bound via safeStorage.
export async function gate(reason: string): Promise<boolean> {
  if (unlocked) return true
  try {
    if (systemPreferences.canPromptTouchID()) {
      await systemPreferences.promptTouchID(reason)
    }
    unlocked = true
    return true
  } catch {
    return false
  }
}

export function listCredentials(): CredentialInfo[] {
  return creds
    .map(({ id, origin, username }) => ({ id, origin, username }))
    .sort((a, b) => a.origin.localeCompare(b.origin))
}

export function credentialForOrigin(origin: string): Cred | undefined {
  return creds.find((c) => c.origin === origin)
}

export async function revealPassword(id: string): Promise<string | null> {
  if (!(await gate('reveal a saved password'))) return null
  return creds.find((c) => c.id === id)?.password ?? null
}

export function deleteCredential(id: string): void {
  creds = creds.filter((c) => c.id !== id)
  persist()
}

// Called from the page preload when a login form is submitted.
export function handleCapture(
  win: BrowserWindow | null,
  origin: string,
  username: string,
  password: string
): void {
  if (!origin.startsWith('https://') && !origin.startsWith('http://localhost')) return
  if (never.includes(origin)) return
  const existing = creds.find((c) => c.origin === origin && c.username === username)
  if (existing && existing.password === password) return

  const opts = {
    type: 'question' as const,
    buttons: [existing ? 'Update Password' : 'Save Password', 'Not Now', 'Never for This Site'],
    defaultId: 0,
    cancelId: 1,
    message: `${existing ? 'Update' : 'Save'} password for ${new URL(origin).hostname}?`,
    detail: username ? `Account: ${username}` : undefined
  }
  const p = win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)
  void p.then(({ response }) => {
    if (response === 0) {
      if (existing) existing.password = password
      else {
        creds.push({ id: String(nextId++), origin, username, password, created: Date.now() })
      }
      persist()
    } else if (response === 2) {
      never.push(origin)
      fs.writeFileSync(neverPath(), JSON.stringify(never))
    }
  })
}

export function fillScript(username: string, password: string): string {
  return `(function(u, p) {
    const pw = [...document.querySelectorAll('input[type=password]')].find((i) => i.offsetParent)
    if (!pw) return false
    const scope = pw.closest('form') || document
    const user = [...scope.querySelectorAll('input')].find(
      (i) => ['text', 'email'].includes(i.type) && i.offsetParent
    )
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    if (user && u) set(user, u)
    set(pw, p)
    return true
  })(${JSON.stringify(username)}, ${JSON.stringify(password)})`
}

// One-time import of the Swift Nyx vault (Keychain service com.nyx.browser.vault).
// macOS will show an ACL prompt — the user clicks Allow there.
export function importSwiftVault(): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(
      'security',
      ['find-generic-password', '-s', 'com.nyx.browser.vault', '-w'],
      (err, stdout) => {
        if (err) {
          reject(new Error('Could not read the Swift Nyx vault (denied or not found).'))
          return
        }
        let raw = stdout.trim()
        if (/^[0-9a-fA-F]+$/.test(raw) && !raw.startsWith('[') && !raw.startsWith('{')) {
          raw = Buffer.from(raw, 'hex').toString('utf8')
        }
        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch {
          reject(new Error('Swift vault contents were not valid JSON.'))
          return
        }
        const arr = Array.isArray(parsed)
          ? parsed
          : Array.isArray((parsed as { items?: unknown[] }).items)
            ? (parsed as { items: unknown[] }).items
            : Array.isArray((parsed as { credentials?: unknown[] }).credentials)
              ? (parsed as { credentials: unknown[] }).credentials
              : []
        let imported = 0
        for (const it of arr as Record<string, string>[]) {
          const origin = it['origin'] ?? it['site'] ?? it['url'] ?? it['host'] ?? ''
          const username = it['username'] ?? it['user'] ?? it['account'] ?? ''
          const password = it['password'] ?? it['pass'] ?? it['pw'] ?? ''
          if (!origin || !password) continue
          const normalized = origin.startsWith('http') ? new URL(origin).origin : `https://${origin}`
          if (creds.some((c) => c.origin === normalized && c.username === username)) continue
          creds.push({ id: String(nextId++), origin: normalized, username, password, created: Date.now() })
          imported++
        }
        if (imported > 0) persist()
        resolve(imported)
      }
    )
  })
}
