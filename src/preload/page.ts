// Minimal preload for web-content views: password capture only.
// Runs sandboxed with contextIsolation; exposes nothing to the page.
import { ipcRenderer } from 'electron'

window.addEventListener(
  'submit',
  (e) => {
    try {
      const form = e.target as HTMLFormElement
      if (!(form instanceof HTMLFormElement)) return
      const pw = form.querySelector<HTMLInputElement>('input[type=password]')
      if (!pw?.value) return
      const user = [...form.querySelectorAll<HTMLInputElement>('input')].find(
        (i) => (i.type === 'text' || i.type === 'email') && i.value
      )
      ipcRenderer.send('nyx:pwd-capture', {
        origin: location.origin,
        username: user?.value ?? '',
        password: pw.value
      })
    } catch {
      // never break page submission
    }
  },
  true
)
