import type { DownloadInfo } from '../../../shared/types'

interface Props {
  downloads: DownloadInfo[]
  onDismiss: () => void
  onShowAll: () => void
}

export function Shelf(p: Props): React.JSX.Element {
  const items = p.downloads.slice(0, 4)
  return (
    <div className="shelf">
      {items.map((d) => {
        const pct =
          d.totalBytes > 0 ? Math.round((d.receivedBytes / d.totalBytes) * 100) : null
        return (
          <div
            key={d.id}
            className={'shelf-item ' + d.state}
            onClick={() => d.state === 'completed' && window.nyx.cmd('openDownload', { id: d.id })}
            title={d.filename}
          >
            <span className="shelf-name">{d.filename}</span>
            {d.state === 'progressing' ? (
              <span className="shelf-status">{pct !== null ? pct + '%' : '…'}</span>
            ) : d.state === 'completed' ? (
              <span className="shelf-status done">✓</span>
            ) : (
              <span className="shelf-status">{d.state}</span>
            )}
            {d.state === 'progressing' && (
              <button
                className="shelf-cancel"
                onClick={(e) => {
                  e.stopPropagation()
                  window.nyx.cmd('cancelDownload', { id: d.id })
                }}
              >
                ×
              </button>
            )}
          </div>
        )
      })}
      <div className="shelf-spacer" />
      <button className="shelf-showall" onClick={p.onShowAll}>
        Show All
      </button>
      <button className="shelf-dismiss" onClick={p.onDismiss}>
        ×
      </button>
    </div>
  )
}
