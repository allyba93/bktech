/**
 * Run this script ONCE to create the first owner account.
 * 
 * Usage:
 *   node --loader ts-node/esm scripts/createOwner.ts
 * 
 * Or paste directly in browser console after replacing the config.
 */

import { initializeApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, setDoc } from 'firebase/firestore'

// ← paste your firebase config here
const firebaseConfig = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT.firebaseapp.com',
  projectId:         'YOUR_PROJECT_ID',
  storageBucket:     'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID',
}

const OWNER_EMAIL    = 'owner@electropro.com'
const OWNER_PASSWORD = 'changeme123'
const OWNER_NAME     = 'Propriétaire'

async function createOwner() {
  const app  = initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db   = getFirestore(app)

  const { user } = await createUserWithEmailAndPassword(auth, OWNER_EMAIL, OWNER_PASSWORD)
  await setDoc(doc(db, 'users', user.uid), {
    uid:       user.uid,
    name:      OWNER_NAME,
    email:     OWNER_EMAIL,
    role:      'owner',
    active:    true,
    createdAt: new Date().toISOString(),
  })

  console.log('✓ Owner created:', user.uid)
  console.log('  Email:   ', OWNER_EMAIL)
  console.log('  Password:', OWNER_PASSWORD)
  console.log('  → Change the password after first login!')
}

createOwner().catch(console.error)
