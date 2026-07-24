import { useEffect, useState } from 'react'
import {
  ACCENT_PRESETS,
  ProfileInfo,
  SEARCH_ENGINES,
  Settings,
  ThemeId,
  UpdateProgress,
  UpdateStatus
} from '../../../shared/types'

const set = (patch: Partial<Settings>): void => void window.nyx.cmd('updateSetting', patch)

function Toggle(p: { on: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
  return (
    <button
      className={'toggle' + (p.on ? ' on' : '')}
      role="switch"
      aria-checked={p.on}
      onClick={() => p.onChange(!p.on)}
    >
      <span className="knob" />
    </button>
  )
}

function Row(p: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="set-row">
      <div className="set-text">
        <div className="set-label">{p.label}</div>
        {p.hint && <div className="set-hint">{p.hint}</div>}
      </div>
      <div className="set-control">{p.children}</div>
    </div>
  )
}

const THEMES: { id: ThemeId; name: string; bg: string; fg: string }[] = [
  { id: 'nyx', name: 'Nyx', bg: '#17141F', fg: '#8B7CF6' },
  { id: 'midnight', name: 'Midnight', bg: '#0A0A0F', fg: '#8B7CF6' },
  { id: 'dusk', name: 'Dusk', bg: '#1C1418', fg: '#FF9E7A' },
  { id: 'light', name: 'Light', bg: '#F2EFF9', fg: '#6A5CD0' }
]

function updateButtonLabel(p: UpdateProgress | null): string {
  if (!p) return 'Update & Relaunch'
  switch (p.phase) {
    case 'downloading':
      return p.pct !== null ? `Downloading ${p.pct}%…` : 'Downloading…'
    case 'verifying':
      return 'Verifying…'
    case 'installing':
      return 'Relaunching…'
    case 'error':
      return 'Retry Update'
  }
}

export function SettingsPanel({
  settings: s,
  updateProg
}: {
  settings: Settings
  updateProg: UpdateProgress | null
}): React.JSX.Element {
  const [updates, setUpdates] = useState<UpdateStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [customAccent, setCustomAccent] = useState(s.accent)
  const [profiles, setProfiles] = useState<ProfileInfo[]>([])
  const [newProfile, setNewProfile] = useState('')
  const [vaultMsg, setVaultMsg] = useState('')

  useEffect(() => {
    window.nyx.cmd('checkUpdates', { force: false }).then(setUpdates)
    window.nyx.cmd('getProfiles').then(setProfiles)
  }, [])

  const check = (force: boolean): void => {
    setChecking(true)
    window.nyx.cmd('checkUpdates', { force }).then((u: UpdateStatus) => {
      setUpdates(u)
      setChecking(false)
    })
  }

  return (
    <div className="settings">
      <h2>Appearance</h2>
      <Row label="Theme">
        <div className="theme-cards">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={'theme-card' + (s.theme === t.id ? ' active' : '')}
              style={{ background: t.bg }}
              onClick={() => set({ theme: t.id })}
            >
              <span className="theme-swatch" style={{ background: t.fg }} />
              <span className={'theme-name' + (t.id === 'light' ? ' dark-text' : '')}>{t.name}</span>
            </button>
          ))}
        </div>
      </Row>
      <Row label="Accent colour">
        <div className="accents">
          {ACCENT_PRESETS.map((c) => (
            <button
              key={c}
              className={'accent-dot' + (s.accent.toUpperCase() === c.toUpperCase() ? ' active' : '')}
              style={{ background: c }}
              onClick={() => set({ accent: c })}
            />
          ))}
          <input
            className="accent-custom"
            type="color"
            value={customAccent}
            onChange={(e) => {
              setCustomAccent(e.target.value)
              set({ accent: e.target.value })
            }}
            title="Custom accent"
          />
        </div>
      </Row>
      <Row label="Compact chrome" hint="Slimmer tab strip and toolbar">
        <Toggle
          on={s.density === 'compact'}
          onChange={(v) => set({ density: v ? 'compact' : 'comfortable' })}
        />
      </Row>
      <Row label="Vibrancy" hint="Translucent chrome over your desktop (new windows)">
        <Toggle on={s.vibrancy} onChange={(v) => set({ vibrancy: v })} />
      </Row>
      <Row label="New tab clock">
        <Toggle on={s.newTabClock} onChange={(v) => set({ newTabClock: v })} />
      </Row>
      <Row label="New tab top sites" hint="Your most-visited sites, one per domain">
        <Toggle on={s.newTabTopSites} onChange={(v) => set({ newTabTopSites: v })} />
      </Row>

      <h2>Privacy</h2>
      <Row label="Block ads & trackers">
        <Toggle on={s.adblockEnabled} onChange={(v) => set({ adblockEnabled: v })} />
      </Row>
      <Row label="Blocking level" hint="Full also removes cookie banners and other annoyances">
        <select
          value={s.adblockLevel}
          onChange={(e) => set({ adblockLevel: e.target.value as Settings['adblockLevel'] })}
        >
          <option value="standard">Ads & trackers</option>
          <option value="full">Full (+ annoyances)</option>
        </select>
      </Row>
      <Row label="HTTPS-only" hint="Upgrades plain http:// navigation to https://">
        <Toggle on={s.httpsOnly} onChange={(v) => set({ httpsOnly: v })} />
      </Row>
      <Row label="Privacy signals" hint="Sends Do Not Track and Global Privacy Control headers">
        <Toggle on={s.privacyHeaders} onChange={(v) => set({ privacyHeaders: v })} />
      </Row>
      <Row label="Clean URLs" hint="Strips utm_, fbclid, gclid and other tracking params">
        <Toggle on={s.stripTracking} onChange={(v) => set({ stripTracking: v })} />
      </Row>
      <Row label="Clear cache on quit">
        <Toggle on={s.clearCacheOnQuit} onChange={(v) => set({ clearCacheOnQuit: v })} />
      </Row>
      <Row label="Clear cookies on quit" hint="Signs you out of everything when Nyx closes">
        <Toggle on={s.clearCookiesOnQuit} onChange={(v) => set({ clearCookiesOnQuit: v })} />
      </Row>
      <div className="set-note">
        Notifications are always blocked. Camera, microphone, location and screen recording always
        ask first. Nyx sends no telemetry — nothing leaves this Mac.
      </div>

      <h2>Passwords</h2>
      <Row
        label="Import from Swift Nyx"
        hint="Reads the com.nyx.browser.vault Keychain item — macOS will ask you to Allow"
      >
        <button
          className="set-btn"
          onClick={() => {
            setVaultMsg('Importing…')
            window.nyx
              .cmd('importSwiftVault')
              .then((r: { imported?: number; error?: string }) => {
                setVaultMsg(
                  r.error ??
                    (r.imported === 0
                      ? 'Nothing new to import.'
                      : `Imported ${r.imported} credential${r.imported === 1 ? '' : 's'}.`)
                )
              })
          }}
        >
          Import Vault
        </button>
      </Row>
      {vaultMsg && <div className="set-note">{vaultMsg}</div>}

      <h2>Profiles</h2>
      {profiles.map((pr) => (
        <Row key={pr.id} label={pr.name} hint={pr.id === 'default' ? 'Your main profile' : undefined}>
          <div className="profile-controls">
            <span className="accent-dot small" style={{ background: pr.color }} />
            {pr.id !== 'default' && (
              <button
                className="set-btn"
                onClick={() => {
                  void window.nyx.cmd('removeProfile', { id: pr.id }).then(() => {
                    setProfiles((cur) => cur.filter((x) => x.id !== pr.id))
                  })
                }}
              >
                Remove
              </button>
            )}
          </div>
        </Row>
      ))}
      <Row label="New profile" hint="Separate cookies, logins and storage — open via File ▸ New Window with Profile">
        <div className="profile-controls">
          <input
            className="set-input"
            placeholder="Name"
            value={newProfile}
            onChange={(e) => setNewProfile(e.target.value)}
          />
          <button
            className="set-btn"
            disabled={!newProfile.trim()}
            onClick={() => {
              void window.nyx.cmd('addProfile', { name: newProfile.trim() }).then((pr: ProfileInfo) => {
                setProfiles((cur) => [...cur, pr])
                setNewProfile('')
              })
            }}
          >
            Add
          </button>
        </div>
      </Row>

      <h2>General</h2>
      <Row label="Search engine">
        <select
          value={s.searchEngine}
          onChange={(e) => set({ searchEngine: e.target.value as Settings['searchEngine'] })}
        >
          {Object.entries(SEARCH_ENGINES).map(([id, e]) => (
            <option key={id} value={id}>
              {e.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Sleeping tabs" hint="Unloads background tabs after 30 minutes (pinned and audible tabs stay awake)">
        <Toggle on={s.sleepingTabs} onChange={(v) => set({ sleepingTabs: v })} />
      </Row>

      <h2>Updates</h2>
      <Row
        label={
          updates?.appUpdate
            ? `Nyx ${updates.appUpdate.version} is available`
            : updates
              ? `Nyx ${updates.appVersion} — up to date`
              : 'Nyx'
        }
        hint={
          updateProg?.phase === 'error'
            ? `Update failed: ${updateProg.message ?? 'unknown error'}`
            : updates?.appUpdate
              ? `You're on ${updates.appVersion}. Nyx installs the update and relaunches itself.`
              : 'New releases are checked on launch and every 6 hours'
        }
      >
        {updates?.appUpdate ? (
          <button
            className="set-btn"
            disabled={!!updateProg && updateProg.phase !== 'error'}
            onClick={() => void window.nyx.cmd('installUpdate')}
          >
            {updateButtonLabel(updateProg)}
          </button>
        ) : (
          <span className="set-hint">{updates ? `Electron ${updates.electronVersion}` : '…'}</span>
        )}
      </Row>
      <Row
        label="Content filters"
        hint={
          updates
            ? updates.filtersAgeDays === 0
              ? 'Filter lists updated today · refreshed weekly'
              : `Filter lists updated ${updates.filtersAgeDays} day${updates.filtersAgeDays === 1 ? '' : 's'} ago · refreshed weekly`
            : 'Checking…'
        }
      >
        <button className="set-btn" disabled={checking} onClick={() => check(true)}>
          {checking ? 'Refreshing…' : 'Refresh Filters'}
        </button>
      </Row>
    </div>
  )
}
