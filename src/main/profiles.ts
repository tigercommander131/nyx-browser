import { app, Session, session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { GROUP_COLORS, ProfileInfo } from '../shared/types'

const DEFAULT_PROFILE: ProfileInfo = { id: 'default', name: 'Personal', color: '#8B7CF6' }

let profiles: ProfileInfo[] = [DEFAULT_PROFILE]

const file = (): string => path.join(app.getPath('userData'), 'profiles.json')

export function initProfiles(): void {
  try {
    const loaded = JSON.parse(fs.readFileSync(file(), 'utf8')) as ProfileInfo[]
    if (Array.isArray(loaded) && loaded.length) profiles = loaded
  } catch {
    // first run
  }
  if (!profiles.some((p) => p.id === 'default')) profiles.unshift(DEFAULT_PROFILE)
}

function persist(): void {
  fs.writeFileSync(file(), JSON.stringify(profiles, null, 2))
}

export function listProfiles(): ProfileInfo[] {
  return profiles
}

export function getProfile(id: string): ProfileInfo {
  return profiles.find((p) => p.id === id) ?? DEFAULT_PROFILE
}

export function addProfile(name: string): ProfileInfo {
  const id = 'p' + Date.now().toString(36)
  const profile = { id, name, color: GROUP_COLORS[profiles.length % GROUP_COLORS.length] }
  profiles.push(profile)
  persist()
  return profile
}

export function removeProfile(id: string): void {
  if (id === 'default') return
  profiles = profiles.filter((p) => p.id !== id)
  persist()
}

// Default profile keeps the default session so existing logins survive.
export function sessionForProfile(id: string): Session {
  if (id === 'default') return session.defaultSession
  return session.fromPartition(`persist:profile-${id}`)
}
