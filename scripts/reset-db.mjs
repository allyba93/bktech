/**
 * reset-db.mjs — Clear all ElectroPro Firestore data
 *
 * Usage (dry-run first to see what would be deleted):
 *   node scripts/reset-db.mjs
 *
 * Actually delete:
 *   node scripts/reset-db.mjs --confirm
 *
 * Credentials — set env vars or pass as arguments:
 *   TEST_EMAIL=you@x.com TEST_PASSWORD=secret node scripts/reset-db.mjs --confirm
 */

import { initializeApp }                                    from 'firebase/app'
import { getAuth, signInWithEmailAndPassword }              from 'firebase/auth'
import { getFirestore, collection, getDocs,
         deleteDoc, doc, setDoc }                           from 'firebase/firestore'
import { readFileSync, existsSync }                         from 'fs'
import { resolve, dirname }                                 from 'path'
import { fileURLToPath }                                    from 'url'
import { createInterface }                                  from 'readline'

const __dir = dirname(fileURLToPath(import.meta.url))

// ── Load .env ────────────────────────────────────────────────────────────────
const envPath = resolve(__dir, '../.env')
const envVars = {}
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const idx = line.indexOf('=')
    if (idx > 0) {
      const k = line.slice(0, idx).trim()
      const v = line.slice(idx + 1).trim()
      if (k.startsWith('VITE_')) envVars[k] = v
    }
  })
}

const CONFIRM = process.argv.includes('--confirm')

const firebaseConfig = {
  apiKey:            envVars.VITE_FIREBASE_API_KEY,
  authDomain:        envVars.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         envVars.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     envVars.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: envVars.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             envVars.VITE_FIREBASE_APP_ID,
}

if (!firebaseConfig.projectId) {
  console.error('❌  Missing Firebase config in .env')
  process.exit(1)
}

// Collections to wipe
const COLLECTIONS = [
  'products',
  'categories',
  'fournisseurs',
  'clients',
  'cashMvts',
  'ventesComptoir',
]

// ── Prompt helper ─────────────────────────────────────────────────────────────
function prompt(question, hidden = false) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    if (hidden) {
      process.stdout.write(question)
      process.stdin.setRawMode?.(true)
      let input = ''
      process.stdin.on('data', function handler(ch) {
        ch = ch.toString()
        if (ch === '\n' || ch === '\r' || ch === '\u0003') {
          process.stdin.setRawMode?.(false)
          process.stdin.removeListener('data', handler)
          process.stdout.write('\n')
          rl.close()
          resolve(input)
        } else if (ch === '\u0008' || ch === '\u007f') {
          input = input.slice(0, -1)
        } else {
          input += ch
        }
      })
      process.stdin.resume()
    } else {
      rl.question(question, ans => { rl.close(); resolve(ans.trim()) })
    }
  })
}

// ── Delete all docs in a collection ──────────────────────────────────────────
async function deleteCollection(db, name) {
  const snap = await getDocs(collection(db, name))
  if (snap.empty) {
    console.log(`  ⏭  ${name}: already empty`)
    return 0
  }
  if (!CONFIRM) {
    console.log(`  📋 ${name}: ${snap.size} doc(s) would be deleted`)
    return snap.size
  }
  for (const d of snap.docs) await deleteDoc(doc(db, name, d.id))
  console.log(`  ✅ ${name}: ${snap.size} doc(s) deleted`)
  return snap.size
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('')
  console.log('┌──────────────────────────────────────────┐')
  console.log('│   ElectroPro — Database Reset Script     │')
  console.log('└──────────────────────────────────────────┘')
  console.log(`  Project : ${firebaseConfig.projectId}\n`)

  if (!CONFIRM) {
    console.log('  🔍  DRY RUN — nothing will be deleted')
    console.log('  Add --confirm to actually delete\n')
  } else {
    console.log('  ⚠️   CONFIRM mode — data will be permanently deleted\n')
  }

  // Get credentials
  const email    = process.env.TEST_EMAIL    || await prompt('  Email    : ')
  const password = process.env.TEST_PASSWORD || await prompt('  Password : ', true)
  console.log('')

  // Sign in
  const app  = initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db   = getFirestore(app)

  try {
    await signInWithEmailAndPassword(auth, email, password)
    console.log(`  🔑  Signed in as ${email}\n`)
  } catch (err) {
    console.error(`  ❌  Auth failed: ${err.message}`)
    process.exit(1)
  }

  // Wipe collections
  let total = 0
  for (const col of COLLECTIONS) {
    total += await deleteCollection(db, col)
  }

  // Reset settings
  if (!CONFIRM) {
    console.log('  📋 settings/caisse: ouverture would be reset to 0')
  } else {
    await setDoc(doc(db, 'settings', 'caisse'), { ouverture: 0 })
    console.log('  ✅ settings/caisse: reset to 0')
  }

  console.log('')
  if (!CONFIRM) {
    console.log(`  Total: ${total} document(s) would be deleted`)
    console.log('\n  Run with --confirm to execute:')
    console.log('  node scripts/reset-db.mjs --confirm')
  } else {
    console.log(`  ✅  Done — ${total} document(s) deleted`)
    console.log('')
    console.log('  The app is now clean.')
    console.log('  Start fresh: npm run dev')
  }
  console.log('')
  process.exit(0)
}

main().catch(err => {
  console.error('❌  Error:', err.message)
  process.exit(1)
})
