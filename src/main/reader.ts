// Reader mode: heuristic extraction injected into the page, rendered as a
// self-contained overlay (same approach as Swift Nyx's Reader.swift).

export const READER_DETECT = `(() => {
  const candidate =
    document.querySelector('article') ??
    document.querySelector('main') ??
    document.body
  if (!candidate) return false
  const text = [...candidate.querySelectorAll('p')].map((p) => p.innerText).join(' ')
  return text.split(/\\s+/).length > 250
})()`

export const READER_TOGGLE = `(() => {
  const existing = document.getElementById('__nyxReader')
  if (existing) {
    existing.remove()
    document.documentElement.style.overflow = ''
    return 'closed'
  }
  const pick = () => {
    const article = document.querySelector('article')
    if (article) return article
    const main = document.querySelector('main')
    if (main) return main
    let best = null
    let bestScore = 0
    for (const el of document.querySelectorAll('div, section')) {
      const ps = el.querySelectorAll(':scope > p, :scope > * > p')
      let score = 0
      ps.forEach((p) => (score += p.innerText.length))
      if (score > bestScore) {
        bestScore = score
        best = el
      }
    }
    return best ?? document.body
  }
  const src = pick()
  const clone = src.cloneNode(true)
  for (const sel of ['script', 'style', 'iframe', 'nav', 'aside', 'form', 'button', 'svg', '[class*="share"]', '[class*="related"]', '[class*="comment"]', '[class*="newsletter"]', '[aria-hidden="true"]']) {
    clone.querySelectorAll(sel).forEach((n) => n.remove())
  }
  const overlay = document.createElement('div')
  overlay.id = '__nyxReader'
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#14111c;color:#e8e4f5;overflow-y:auto;font:19px/1.7 Georgia, "Times New Roman", serif;'
  const reset = document.createElement('style')
  reset.textContent = '#__nyxReader * { float: none !important; width: auto !important; max-width: 100% !important; margin-left: 0 !important; margin-right: 0 !important; background: transparent !important; color: inherit !important; } #__nyxReader table { display: none !important; }'
  overlay.appendChild(reset)
  const inner = document.createElement('div')
  inner.style.cssText = 'max-width:68ch;margin:0 auto;padding:56px 24px 96px;'
  const h1 = document.createElement('h1')
  h1.textContent = document.title
  h1.style.cssText = 'font:700 30px/1.25 -apple-system, sans-serif;margin:0 0 8px;color:#fff;'
  const meta = document.createElement('div')
  meta.textContent = location.hostname
  meta.style.cssText = 'font:13px -apple-system, sans-serif;color:#9a92b8;margin-bottom:32px;'
  const close = document.createElement('button')
  close.textContent = '×'
  close.style.cssText = 'position:fixed;top:18px;right:22px;width:36px;height:36px;border-radius:10px;border:1px solid #322a4a;background:#241e36;color:#e8e4f5;font-size:20px;cursor:pointer;'
  close.onclick = () => {
    overlay.remove()
    document.documentElement.style.overflow = ''
  }
  inner.append(h1, meta, clone)
  overlay.append(inner, close)
  overlay.querySelectorAll('img, video').forEach((m) => {
    m.style.maxWidth = '100%'
    m.style.height = 'auto'
    m.style.borderRadius = '10px'
  })
  overlay.querySelectorAll('a').forEach((a) => (a.style.color = '#8b7cf6'))
  overlay.querySelectorAll('p, li').forEach((n) => {
    n.style.fontSize = '19px'
    n.style.lineHeight = '1.7'
    n.style.color = '#e8e4f5'
  })
  document.body.appendChild(overlay)
  document.documentElement.style.overflow = 'hidden'
  return 'open'
})()`
