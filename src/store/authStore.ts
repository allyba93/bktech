import { create } from 'zustand'
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth'
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { auth, db } from '@/firebase/config'
import { fetchDocument } from '@/firebase/collections'
import { AppUser, COLLECTIONS } from '@/types'
import { initAppListeners } from '@/store/appStore'

interface AuthState {
  user:        User | null
  appUser:     AppUser | null
  loading:     boolean
  error:       string | null

  signIn:      (email: string, password: string) => Promise<void>
  signOut:     () => Promise<void>
  setLoading:  (v: boolean) => void
  setAppUser:  (u: AppUser | null) => void
  clearError:  () => void
}

function fallbackUser(user: User): AppUser {
  return {
    uid:       user.uid,
    name:      user.displayName ?? user.email ?? 'Utilisateur',
    email:     user.email ?? '',
    role:      'cashier',
    active:    true,
    createdAt: new Date().toISOString(),
  }
}

/**
 * Find user in Firestore:
 * 1. By document ID = uid (correct / fast path)
 * 2. By email field query (migration path)
 *    → if found this way, also write users/{uid} so rules work going forward
 */
async function findAppUser(user: User): Promise<AppUser | null> {
  // 1. Standard: document ID = uid
  const byUid = await fetchDocument<AppUser>(COLLECTIONS.users, user.uid)
  if (byUid) return byUid

  // 2. Fallback: query by email
  if (user.email) {
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.users), where('email', '==', user.email))
    )
    if (!snap.empty) {
      const data = snap.docs[0].data() as Omit<AppUser, 'uid'>
      const appUser: AppUser = { uid: user.uid, ...data }

      // Migrate: write at users/{uid} so Firestore rules work on next login
      try {
        await setDoc(doc(db, COLLECTIONS.users, user.uid), {
          ...data,
          uid: user.uid,
        })
      } catch {
        // Ignore write errors (rules may not yet allow it)
      }

      return appUser
    }
  }

  return null
}

export const useAuthStore = create<AuthState>((set) => ({
  user:    null,
  appUser: null,
  loading: true,
  error:   null,

  signIn: async (email, password) => {
    set({ error: null, loading: true })
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur de connexion'
      set({ error: msg, loading: false })
    }
  },

  signOut: async () => {
    await firebaseSignOut(auth)
    set({ user: null, appUser: null })
  },

  setLoading: (v) => set({ loading: v }),
  setAppUser: (u) => set({ appUser: u }),
  clearError: () => set({ error: null }),
}))

export function initAuthListener() {
  let unsubApp: (() => void) | null = null

  const unsubAuth = onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Start Firestore listeners now that auth is confirmed so security rules pass.
      // Always restart to recover from any previous permission error.
      unsubApp?.()
      unsubApp = initAppListeners()
      try {
        const found = await findAppUser(user)
        useAuthStore.setState({ user, appUser: found ?? fallbackUser(user), loading: false })
      } catch {
        useAuthStore.setState({ user, appUser: fallbackUser(user), loading: false })
      }
    } else {
      unsubApp?.()
      unsubApp = null
      useAuthStore.setState({ user: null, appUser: null, loading: false })
    }
  })

  return () => {
    unsubAuth()
    unsubApp?.()
  }
}
