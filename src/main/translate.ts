import { app, WebContents } from 'electron'

// Collect up to 800 visible-ish text nodes into window.__nyxTx and return the strings.
const COLLECT = `(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement
      if (!p) return NodeFilter.FILTER_REJECT
      const tag = p.tagName
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA'].includes(tag)) {
        return NodeFilter.FILTER_REJECT
      }
      const t = node.nodeValue.trim()
      if (t.length < 2 || /^[\\d\\s\\W]+$/.test(t)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })
  const nodes = []
  while (walker.nextNode() && nodes.length < 800) nodes.push(walker.currentNode)
  window.__nyxTx = nodes
  return nodes.map((n) => n.nodeValue)
})()`

async function translateBatch(texts: string[], target: string): Promise<string[]> {
  const body = new URLSearchParams()
  for (const t of texts) body.append('q', t)
  const res = await fetch(
    `https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&tl=${target}&format=text`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    }
  )
  if (!res.ok) throw new Error(`translate endpoint ${res.status}`)
  const data = (await res.json()) as unknown[]
  // Single q returns a string; multiple return array entries that are either
  // strings or [translation, detectedLang] pairs.
  const list = texts.length === 1 && !Array.isArray(data) ? [data] : data
  return (list as unknown[]).map((item) =>
    Array.isArray(item) ? String(item[0]) : String(item)
  )
}

// Explicit user action only (⌥⌘T) — this is the one feature that talks to an
// external service, and only for the visible page's text.
export async function translatePage(wc: WebContents): Promise<number> {
  const texts = (await wc.executeJavaScript(COLLECT, true)) as string[]
  if (!texts.length) return 0
  const target = (app.getLocale() || 'en').split('-')[0]
  const out: string[] = []
  for (let i = 0; i < texts.length; i += 128) {
    out.push(...(await translateBatch(texts.slice(i, i + 128), target)))
  }
  await wc.executeJavaScript(
    `((tx) => {
      const nodes = window.__nyxTx || []
      nodes.forEach((n, i) => {
        if (typeof tx[i] === 'string' && tx[i]) n.nodeValue = tx[i]
      })
      return true
    })(${JSON.stringify(out)})`,
    true
  )
  return out.length
}
