import { clsx, type ClassValue } from 'clsx'

/** Merge tailwind classes */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

/** Format number as currency (French locale) */
export function formatCurrency(amount: number): string {
  return amount.toLocaleString('fr-FR') + ' F'
}

/** Format date string */
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', options ?? {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Format datetime */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Get initials from a name */
export function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

/** Calculate proportional share of remaining balance */
export function calcProportionalShare(
  lineAmount: number,
  totalAmount: number,
  remaining: number
): number {
  if (totalAmount === 0 || remaining === 0) return 0
  return Math.round((lineAmount / totalAmount) * remaining)
}

/** Apply FIFO payments to invoices (oldest first) */
export function applyFIFO<T extends { remaining: number; paid: number; status: string }>(
  invoices: T[],
  payment: number
): { updated: T[]; surplus: number } {
  const sorted = [...invoices]
    .filter((inv) => inv.remaining > 0)
    .sort((a, b) => (a as unknown as { date: string }).date.localeCompare(
      (b as unknown as { date: string }).date
    ))

  let remaining = payment
  const updatedMap = new Map<number, T>()

  sorted.forEach((inv, idx) => {
    if (remaining <= 0) return
    const applied = Math.min(inv.remaining, remaining)
    remaining -= applied
    updatedMap.set(idx, {
      ...inv,
      paid: inv.paid + applied,
      remaining: inv.remaining - applied,
      status: inv.remaining - applied === 0 ? 'paid' : 'partial',
    })
  })

  const updated = invoices.map((inv, idx) => updatedMap.get(idx) ?? inv)
  return { updated, surplus: Math.max(0, remaining) }
}

/** Generate a unique ID */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

/** Get today's date as ISO string YYYY-MM-DD */
export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Days since a date string DD/MM/YYYY or ISO */
export function daysSince(dateStr: string): number {
  const parts = dateStr.includes('/')
    ? dateStr.split('/').map(Number)
    : null
  const d = parts
    ? new Date(parts[2], parts[1] - 1, parts[0])
    : new Date(dateStr)
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

/** Payment mode emoji */
export const PAYMENT_ICONS: Record<string, string> = {
  Cash:    '💵',
  Bankily: '🔶',
  Masravi: '🔷',
  Seddad:  '🟣',
  Bimban:  '🔴',
  Crédit:  '📋',
}

export const PAYMENT_MODES = ['Cash', 'Bankily', 'Masravi', 'Seddad', 'Bimban'] as const

export const MAX_CASHIER_DISCOUNT_PCT = 15
