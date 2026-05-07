import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, where, orderBy, onSnapshot,
  serverTimestamp, Timestamp, QueryConstraint,
} from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from '@/types'

// ── Generic helpers ────────────────────────────────────

export function col(name: string) {
  return collection(db, name)
}

export function docRef(colName: string, id: string) {
  return doc(db, colName, id)
}

/** Convert Firestore Timestamp to ISO string */
export function tsToString(ts: Timestamp | string | undefined): string {
  if (!ts) return new Date().toISOString()
  if (typeof ts === 'string') return ts
  return ts.toDate().toISOString()
}

/** Add a document and return its id */
export async function addDocument<T extends object>(
  colName: string,
  data: T
): Promise<string> {
  const ref = await addDoc(col(colName), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

/** Set a document with a specific id */
export async function setDocument<T extends object>(
  colName: string,
  id: string,
  data: T
): Promise<void> {
  await setDoc(docRef(colName, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

/** Update specific fields */
export async function updateDocument(
  colName: string,
  id: string,
  data: Partial<Record<string, unknown>>
): Promise<void> {
  await updateDoc(docRef(colName, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

/** Delete a document */
export async function deleteDocument(colName: string, id: string): Promise<void> {
  await deleteDoc(docRef(colName, id))
}

/** Fetch all documents from a collection */
export async function fetchCollection<T>(
  colName: string,
  ...constraints: QueryConstraint[]
): Promise<T[]> {
  const q = query(col(colName), ...constraints)
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as T))
}

/** Fetch a single document */
export async function fetchDocument<T>(colName: string, id: string): Promise<T | null> {
  const snap = await getDoc(docRef(colName, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as T
}

// ── Collection-specific helpers ────────────────────────

// Products
export const productsCol  = () => col(COLLECTIONS.products)
export const productDoc   = (id: string) => docRef(COLLECTIONS.products, id)

// Sales
export const salesCol     = () => col(COLLECTIONS.sales)
export const saleDoc      = (id: string) => docRef(COLLECTIONS.sales, id)

// Clients
export const clientsCol   = () => col(COLLECTIONS.clients)
export const clientDoc    = (id: string) => docRef(COLLECTIONS.clients, id)

// Suppliers
export const suppliersCol = () => col(COLLECTIONS.suppliers)
export const supplierDoc  = (id: string) => docRef(COLLECTIONS.suppliers, id)

// Cash movements
export const movementsCol = () => col(COLLECTIONS.cashMovements)

// Stock movements
export const stockMovCol  = () => col(COLLECTIONS.stockMovements)

// Day closings
export const closingsCol  = () => col(COLLECTIONS.dayClosings)

// Users
export const usersCol     = () => col(COLLECTIONS.users)
export const userDoc      = (id: string) => docRef(COLLECTIONS.users, id)

// ── Real-time listeners ────────────────────────────────

export function listenToCollection<T>(
  colName: string,
  callback: (data: T[]) => void,
  ...constraints: QueryConstraint[]
) {
  const q = query(col(colName), ...constraints)
  return onSnapshot(q, (snap) => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as T))
    callback(data)
  })
}

export { where, orderBy, query }
