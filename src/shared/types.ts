// Shared between main process and chrome renderer.

export const SEARCH_ENGINES = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=%s' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  startpage: { name: 'Startpage', url: 'https://www.startpage.com/sp/search?query=%s' },
  ecosia: { name: 'Ecosia', url: 'https://www.ecosia.org/search?q=%s' }
} as const
export type SearchEngineId = keyof typeof SEARCH_ENGINES

export type ThemeId = 'nyx' | 'midnight' | 'dusk' | 'light'
export type Density = 'comfortable' | 'compact'
export type AdblockLevel = 'standard' | 'full'

export interface Settings {
  adblockEnabled: boolean
  adblockLevel: AdblockLevel
  searchEngine: SearchEngineId
  httpsOnly: boolean
  privacyHeaders: boolean
  stripTracking: boolean
  clearCacheOnQuit: boolean
  clearCookiesOnQuit: boolean
  theme: ThemeId
  accent: string
  density: Density
  vibrancy: boolean
  newTabClock: boolean
  newTabTopSites: boolean
  sleepingTabs: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  adblockEnabled: true,
  adblockLevel: 'full',
  searchEngine: 'duckduckgo',
  httpsOnly: true,
  privacyHeaders: true,
  stripTracking: true,
  clearCacheOnQuit: false,
  clearCookiesOnQuit: false,
  theme: 'nyx',
  accent: '#8B7CF6',
  density: 'comfortable',
  vibrancy: false,
  newTabClock: true,
  newTabTopSites: true,
  sleepingTabs: true
}

export const ACCENT_PRESETS = ['#8B7CF6', '#6EA8FE', '#4DD4AC', '#FFA94D', '#FF6B9D', '#A9E34B']

export interface TabInfo {
  id: string
  url: string
  title: string
  favicon: string
  pinned: boolean
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  discarded: boolean
  audible: boolean
  muted: boolean
  bookmarked: boolean
  groupId: string | null
  readerable: boolean
}

export interface TabGroup {
  id: string
  name: string
  color: string
  collapsed: boolean
}

export const GROUP_COLORS = ['#8B7CF6', '#6EA8FE', '#4DD4AC', '#FFA94D', '#FF6B9D', '#A9E34B']

export interface ProfileInfo {
  id: string
  name: string
  color: string
}

// Passwords are never included; reveal/copy go through the Touch ID gate.
export interface CredentialInfo {
  id: string
  origin: string
  username: string
}

export interface WindowSnapshot {
  windowId: number
  incognito: boolean
  tabs: TabInfo[]
  activeTabId: string | null
  groups: TabGroup[]
  vertical: boolean
  splitTabId: string | null
  splitFraction: number
  profile: ProfileInfo | null
  settings: Settings
}

export interface Suggestion {
  kind: 'url' | 'search' | 'history' | 'bookmark'
  title: string
  url: string
  detail?: string
}

export interface FindResult {
  activeMatch: number
  matches: number
}

export interface DownloadInfo {
  id: string
  filename: string
  path: string
  url: string
  receivedBytes: number
  totalBytes: number
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted'
  startedAt: number
}

export interface HistoryEntry {
  id: number
  url: string
  title: string
  visitCount: number
  lastVisit: number
}

export interface BookmarkEntry {
  id: number
  url: string
  title: string
  isReading: boolean
  isRead: boolean
  created: number
}

export interface TopSite {
  url: string
  title: string
  host: string
}

export interface UpdateStatus {
  appVersion: string
  electronVersion: string
  filtersUpdatedAt: number
  filtersAgeDays: number
  refreshed: boolean
  appUpdate: { version: string; url: string } | null
}

export type LibrarySection =
  | 'history'
  | 'downloads'
  | 'bookmarks'
  | 'reading'
  | 'passwords'
  | 'settings'

export type ChromeEvent =
  | { type: 'state'; snapshot: WindowSnapshot }
  | { type: 'focusOmnibox' }
  | { type: 'openFindBar' }
  | { type: 'findResult'; result: FindResult }
  | { type: 'openLibrary'; section: LibrarySection }
  | { type: 'downloads'; downloads: DownloadInfo[] }

export const CHROME_HEIGHTS: Record<Density, number> = { comfortable: 84, compact: 70 }
// Vertical tabs: only the toolbar sits above the page.
export const TOOLBAR_HEIGHTS: Record<Density, number> = { comfortable: 46, compact: 38 }
export const SIDEBAR_WIDTH = 240
export const SPLIT_GAP = 6
export const FINDBAR_HEIGHT = 40
export const SHELF_HEIGHT = 56

// Query params that exist to track you across the web; stripped when
// stripTracking is on. `si` is YouTube's share-tracking param (host-gated).
export const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'gclsrc',
  'dclid',
  'wbraid',
  'gbraid',
  'fbclid',
  'igshid',
  'msclkid',
  'twclid',
  'yclid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'vero_id',
  'oly_anon_id',
  'oly_enc_id',
  'mkt_tok'
]
