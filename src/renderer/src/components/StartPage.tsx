import { useEffect, useState } from 'react'
import type { Settings, TopSite } from '../../../shared/types'

export function StartPage({ settings }: { settings: Settings }): React.JSX.Element {
  const [now, setNow] = useState(() => new Date())
  const [sites, setSites] = useState<TopSite[]>([])

  useEffect(() => {
    if (!settings.newTabClock) return
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [settings.newTabClock])

  useEffect(() => {
    if (settings.newTabTopSites) {
      window.nyx.cmd('getTopSites').then((s: TopSite[]) => setSites(s ?? []))
    }
  }, [settings.newTabTopSites])

  return (
    <div className="startpage">
      <div className="eclipse" />
      <div className="wordmark">Nyx</div>
      {settings.newTabClock && (
        <div className="clock">
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      {settings.newTabTopSites && sites.length > 0 && (
        <div className="topsites">
          {sites.map((s) => (
            <button
              key={s.host}
              className="topsite"
              title={s.title}
              onClick={() => window.nyx.cmd('navigate', { input: s.url })}
            >
              <span className="topsite-glyph">{s.host[0]?.toUpperCase() ?? '?'}</span>
              <span className="topsite-host">{s.host}</span>
            </button>
          ))}
        </div>
      )}
      <div className="hint">Search or enter an address — ⌘L</div>
    </div>
  )
}
