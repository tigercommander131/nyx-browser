import type { Suggestion } from '../../../shared/types'

interface Props {
  suggestions: Suggestion[]
  selIndex: number
  onHover: (i: number) => void
  onPick: (s: Suggestion) => void
}

const ICONS: Record<Suggestion['kind'], string> = {
  url: '🌐',
  search: '🔍',
  history: '🕘',
  bookmark: '★'
}

export function SuggestionsPanel(p: Props): React.JSX.Element {
  return (
    <div className="suggestions-backdrop">
      <div className="suggestions">
        {p.suggestions.map((s, i) => (
          <div
            key={i}
            className={'suggestion' + (i === p.selIndex ? ' selected' : '')}
            onMouseEnter={() => p.onHover(i)}
            onMouseDown={(e) => {
              e.preventDefault()
              p.onPick(s)
            }}
          >
            <span className="s-icon">{ICONS[s.kind]}</span>
            <span className="s-title">{s.title}</span>
            {s.detail && s.detail !== s.title && <span className="s-detail">{s.detail}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
