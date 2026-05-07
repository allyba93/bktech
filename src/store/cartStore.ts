import { create } from 'zustand'
import { CartLine } from '@/types'

interface CartState {
  lines:        CartLine[]
  clientId:     string | null
  clientName:   string | null
  adjPrice:     number | null    // override total price
  paymentType:  'total' | 'partial' | 'credit'
  channels:     Record<string, number>  // mode -> amount

  addLines:        (newLines: CartLine[]) => void
  updateQty:       (key: string, qty: number) => void
  removeLines:     (key: string) => void
  setClient:       (id: string | null, name: string | null) => void
  setAdjPrice:     (price: number | null) => void
  setPaymentType:  (type: 'total' | 'partial' | 'credit') => void
  setChannel:      (mode: string, amount: number) => void
  clearCart:       () => void

  // Computed
  subtotal:        () => number
  finalTotal:      () => number
  totalPaid:       () => number
}

const STORAGE_KEY = 'pos-cart-v1'

interface PersistedCart {
  lines:       CartLine[]
  clientId:    string | null
  clientName:  string | null
  adjPrice:    number | null
  paymentType: 'total' | 'partial' | 'credit'
  channels:    Record<string, number>
}

function loadCart(): PersistedCart {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as PersistedCart
  } catch { /* ignore */ }
  return { lines: [], clientId: null, clientName: null, adjPrice: null, paymentType: 'total', channels: {} }
}

function saveCart(s: PersistedCart) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch { /* ignore */ }
}

function deleteCart() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

const saved = loadCart()

export const useCartStore = create<CartState>((set, get) => ({
  lines:       saved.lines,
  clientId:    saved.clientId,
  clientName:  saved.clientName,
  adjPrice:    saved.adjPrice,
  paymentType: saved.paymentType,
  channels:    saved.channels,

  addLines: (newLines) =>
    set((state) => {
      const updated = [...state.lines]
      newLines.forEach((nl) => {
        const idx = updated.findIndex((l) => l.key === nl.key)
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], qty: Math.min(updated[idx].qty + nl.qty, nl.stock) }
        } else {
          updated.push(nl)
        }
      })
      const next = { ...state, lines: updated, adjPrice: null }
      saveCart(next)
      return { lines: updated, adjPrice: null }
    }),

  updateQty: (key, qty) =>
    set((state) => {
      const lines = state.lines.map((l) =>
        l.key === key ? { ...l, qty: Math.max(1, Math.min(qty, l.stock)) } : l
      )
      saveCart({ ...state, lines, adjPrice: null })
      return { lines, adjPrice: null }
    }),

  removeLines: (key) =>
    set((state) => {
      const lines = state.lines.filter((l) => l.key !== key)
      saveCart({ ...state, lines, adjPrice: null })
      return { lines, adjPrice: null }
    }),

  setClient: (id, name) =>
    set((state) => {
      saveCart({ ...state, clientId: id, clientName: name })
      return { clientId: id, clientName: name }
    }),

  setAdjPrice: (price) =>
    set((state) => {
      saveCart({ ...state, adjPrice: price })
      return { adjPrice: price }
    }),

  setPaymentType: (type) =>
    set((state) => {
      saveCart({ ...state, paymentType: type, channels: {} })
      return { paymentType: type, channels: {} }
    }),

  setChannel: (mode, amount) =>
    set((state) => {
      const channels = amount > 0
        ? { ...state.channels, [mode]: amount }
        : Object.fromEntries(Object.entries(state.channels).filter(([k]) => k !== mode))
      saveCart({ ...state, channels })
      return { channels }
    }),

  clearCart: () => {
    deleteCart()
    set({
      lines:       [],
      clientId:    null,
      clientName:  null,
      adjPrice:    null,
      paymentType: 'total',
      channels:    {},
    })
  },

  subtotal: () => {
    const { lines } = get()
    return lines.reduce((s, l) => s + (l.adjPrice ?? l.unitPrice) * l.qty, 0)
  },

  finalTotal: () => {
    const { adjPrice } = get()
    const sub = get().subtotal()
    return adjPrice !== null && adjPrice < sub ? adjPrice : sub
  },

  totalPaid: () => Object.values(get().channels).reduce((s, v) => s + v, 0),
}))
