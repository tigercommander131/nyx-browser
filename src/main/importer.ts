import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

// First-run import from Swift Nyx. history.db and bookmarks.db use identical
// schemas, and session.json is field-compatible, so this is a straight copy.
export function runImportIfNeeded(): void {
  const dest = app.getPath('userData')
  const src = path.join(app.getPath('appData'), 'Nyx')
  if (fs.existsSync(path.join(dest, 'history.db'))) return
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const f of ['history.db', 'bookmarks.db', 'session.json']) {
    const from = path.join(src, f)
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, path.join(dest, f))
      console.log(`[import] copied ${f} from Swift Nyx`)
    }
  }
}
