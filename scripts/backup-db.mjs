import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

process.env.GOOGLE_APPLICATION_CREDENTIALS =
  `${process.env.HOME}/.config/firebase/alyba525_gmail_com_application_default_credentials.json`

initializeApp({ credential: applicationDefault(), projectId: 'bkteck-7cbc0' })
const db = getFirestore()

const COLLECTIONS = [
  'products', 'categories', 'fournisseurs', 'clients',
  'cashMvts', 'ventesComptoir', 'epargneMvts', 'dettesDiverses', 'settings',
]

// Convert Firestore Timestamps to ISO strings so JSON.stringify works cleanly
function serialize(val) {
  if (val instanceof Timestamp) return val.toDate().toISOString()
  if (Array.isArray(val))       return val.map(serialize)
  if (val && typeof val === 'object') {
    return Object.fromEntries(Object.entries(val).map(([k, v]) => [k, serialize(v)]))
  }
  return val
}

const __dir  = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dir, '..', 'backups')
mkdirSync(outDir, { recursive: true })

const now = new Date()
const pad = n => String(n).padStart(2, '0')
const ts  = `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())}` +
            `T${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}`
const filename = `backup-${ts}.json`
const filepath = join(outDir, filename)

console.log(`[backup] ${new Date().toISOString()}`)
const backup = { _meta: { exportedAt: now.toISOString(), projectId: 'bkteck-7cbc0' } }

for (const col of COLLECTIONS) {
  const snap = await db.collection(col).get()
  backup[col] = snap.docs.map(d => ({ _id: d.id, ...serialize(d.data()) }))
  console.log(`  ${col.padEnd(16)} ${snap.size} docs`)
}

writeFileSync(filepath, JSON.stringify(backup, null, 2))
console.log(`✓ Saved: backups/${filename}`)
