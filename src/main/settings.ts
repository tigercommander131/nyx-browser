import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_SETTINGS, Settings } from '../shared/types'

let settings: Settings = { ...DEFAULT_SETTINGS }
let file = ''

export function initSettings(): void {
  file = path.join(app.getPath('userData'), 'settings.json')
  try {
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(file, 'utf8')) }
  } catch {
    // first run
  }
}

export function getSettings(): Settings {
  return settings
}

export function updateSettings(patch: Partial<Settings>): void {
  settings = { ...settings, ...patch }
  fs.writeFileSync(file, JSON.stringify(settings, null, 2))
}
