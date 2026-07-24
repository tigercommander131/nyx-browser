import { useEffect, useRef, useState } from 'react'
import type { FindResult } from '../../../shared/types'

interface Props {
  focusTick: number
  result: FindResult | null
  onClose: () => void
}

export function FindBar(p: Props): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [p.focusTick])

  const find = (t: string, first: boolean, forward = true): void => {
    void window.nyx.cmd('findStart', { text: t, first, forward })
  }

  return (
    <div className="findbar">
      <input
        ref={inputRef}
        value={text}
        placeholder="Find in page"
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value)
          find(e.target.value, true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') find(text, false, !e.shiftKey)
          else if (e.key === 'Escape') p.onClose()
        }}
      />
      <span className="find-count">
        {p.result && p.result.matches > 0
          ? `${p.result.activeMatch}/${p.result.matches}`
          : text
            ? '0/0'
            : ''}
      </span>
      <button className="tb-btn" onClick={() => find(text, false, false)} title="Previous (⇧↩)">
        ‹
      </button>
      <button className="tb-btn" onClick={() => find(text, false, true)} title="Next (↩)">
        ›
      </button>
      <button className="tb-btn" onClick={p.onClose} title="Done (esc)">
        ×
      </button>
    </div>
  )
}
