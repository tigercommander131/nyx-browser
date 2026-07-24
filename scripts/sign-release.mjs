// Zips the packaged Nyx.app and signs it with the release key.
// Usage: node scripts/sign-release.mjs
// First run generates keys/update-key.pem (KEEP PRIVATE — gitignored).
// The matching public key is embedded in src/main/selfUpdate.ts.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const keyPath = path.join(root, 'keys', 'update-key.pem')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const appPath = path.join(root, 'dist', 'mac-arm64', 'Nyx.app')
const zipPath = path.join(root, 'dist', `Nyx-${pkg.version}-arm64.zip`)
const sigPath = zipPath + '.sig'

if (!fs.existsSync(appPath)) {
  console.error('dist/mac-arm64/Nyx.app not found — run `npm run dist` first')
  process.exit(1)
}

if (!fs.existsSync(keyPath)) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  fs.mkdirSync(path.dirname(keyPath), { recursive: true })
  fs.writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
  console.log('Generated new release key at keys/update-key.pem')
  console.log('PUBLIC KEY (embed in src/main/selfUpdate.ts):')
  console.log(publicKey.export({ type: 'spki', format: 'pem' }))
}

const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath))
const embeddedPublic = crypto
  .createPublicKey(privateKey)
  .export({ type: 'spki', format: 'pem' })
  .toString()
const selfUpdateSrc = fs.readFileSync(path.join(root, 'src', 'main', 'selfUpdate.ts'), 'utf8')
if (!selfUpdateSrc.includes(embeddedPublic.trim().split('\n')[1])) {
  console.error('WARNING: selfUpdate.ts does not embed this key’s public half!')
  console.error(embeddedPublic)
}

if (fs.existsSync(zipPath)) fs.rmSync(zipPath)
execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', appPath, zipPath])
const sig = crypto.sign(null, fs.readFileSync(zipPath), privateKey)
fs.writeFileSync(sigPath, sig.toString('base64') + '\n')
console.log('zip:', zipPath, `(${(fs.statSync(zipPath).size / 1e6).toFixed(1)} MB)`)
console.log('sig:', sigPath)

// Remove the unpacked .app so Spotlight/Launchpad only ever sees the one in
// /Applications — the dmg and zip carry everything a release needs.
fs.rmSync(path.join(root, 'dist', 'mac-arm64'), { recursive: true, force: true })
console.log('cleaned dist/mac-arm64 (unpacked app)')
