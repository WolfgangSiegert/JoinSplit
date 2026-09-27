import { access, readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const outputDirectory = resolve('.output/public')
const requiredFiles = ['index.html', '200.html']
const forbiddenPatterns = [
  /^sw\.js$/u,
  /^registerSW\.js$/u,
  /^workbox-[^.]+\.js$/u,
  /\.webmanifest$/u,
]

async function filesBelow(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...await filesBelow(resolve(directory, entry.name), relativePath))
    else files.push(relativePath)
  }
  return files
}

for (const file of requiredFiles) await access(resolve(outputDirectory, file))

const files = await filesBelow(outputDirectory)
const forbiddenFiles = files.filter(file => forbiddenPatterns.some(pattern => pattern.test(file)))
if (forbiddenFiles.length > 0) {
  throw new Error(`Native output contains PWA-owned files: ${forbiddenFiles.join(', ')}`)
}

const index = await readFile(resolve(outputDirectory, 'index.html'), 'utf8')
if (index.includes('rel="manifest"')) throw new Error('Native output must not register a web app manifest.')
if (!index.includes('Content-Security-Policy')) throw new Error('Native output is missing its bundled-content CSP.')
if (!index.includes('id="__nuxt"')) throw new Error('Native output does not contain the Nuxt application root.')
if (!index.includes('nativeApp:true')) throw new Error('Native output is missing the native runtime marker.')
if (!index.includes('apiBase:"https://joinsplit.tiny-bits.org"')) {
  throw new Error('Native output does not target the canonical production API.')
}

const remoteAssetReference = /(?:src|href)="https?:\/\//u.exec(index)
if (remoteAssetReference) throw new Error('Native output references a remote boot asset.')

console.log(`Native artifact verified: ${files.length} bundled files, no Service Worker or remote boot asset.`)
