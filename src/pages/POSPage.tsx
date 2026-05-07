import { useState, useCallback, useMemo } from 'react'
import { Search, X, Check, RotateCcw } from 'lucide-react'
import { useCartStore } from '@/store/cartStore'
import { useAuthStore } from '@/store/authStore'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import { useModalShake } from '@/lib/useModalShake'
import { InvoiceModal } from '@/components/InvoiceModal'
import type { InvoiceData } from '@/components/InvoiceModal'
import type { Product, CartLine } from '@/types'
import type { Category, Tx, Client, AvanceMvt } from '@/store/appStore'

// ── Currency ──────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('fr-FR') + ' MRU'
const fmtN = (n: number) => n.toLocaleString('fr-FR')

// ── Category colors ────────────────────────────────────────────────────────
const CAT_PALETTE = ['#378ADD','#1D9E75','#BA7517','#D85A30','#7F77DD','#c0392b','#0891b2','#65a30d']
function catColor(name: string, allCats: string[]): string {
  const idx = allCats.indexOf(name)
  return CAT_PALETTE[idx >= 0 ? idx % CAT_PALETTE.length : Math.abs(name.split('').reduce((s,c)=>s+c.charCodeAt(0),0)) % CAT_PALETTE.length]
}

// ── Helpers ────────────────────────────────────────────────────────────────
const soldeAvance = (c: Client) => ((c as Client & { avances?: AvanceMvt[] }).avances ?? [])
  .reduce((s, m) => m.dir === 'credit' ? s + m.montant : s - m.montant, 0)

// ── Config ─────────────────────────────────────────────────────────────────
const MAX_DISC_PCT = 15
const CHANNELS = [
  { id: 'cash', name: 'Cash',    label: 'FSS', color: '#1a7a4a', bg: '#e8f5ee' },
  { id: 'bnk',  name: 'Bankily', label: 'BNK', color: '#e65c00', bg: '#fff0e6' },
  { id: 'msr',  name: 'Masravi', label: 'MSR', color: '#0066cc', bg: '#e6f0ff' },
  { id: 'sdd',  name: 'Seddad',  label: 'SDD', color: '#7b2d8b', bg: '#f5e6ff' },
  { id: 'bmb',  name: 'Bimban',  label: 'BMB', color: '#c0392b', bg: '#fdecea' },
]

// ── OE Modal ───────────────────────────────────────────────────────────────
interface OEModalProps {
  product: Product
  category: Category | null
  cartLines: CartLine[]
  isOwner: boolean
  onClose: () => void
  onConfirm: (lines: CartLine[]) => void
}

function OEModal({ product, category, cartLines, isOwner, onClose, onConfirm }: OEModalProps) {
  const samePrice = category?.samePrice ?? false
  const [refSearch, setRefSearch] = useState('')
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkInput, setBulkInput] = useState('')

  // Qtys keyed by refId
  const [qtys, setQtys] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    cartLines.forEach(l => { if (l.productId === product.id) init[l.refId] = l.qty })
    return init
  })

  const [step, setStep] = useState(10)

  // Distribute bulkInput evenly across in-stock refs, capped by stock
  const bulkQtys = useMemo<Record<string, number>>(() => {
    const total = parseInt(bulkInput) || 0
    if (total <= 0) return {}
    const active = product.refs.filter(r => r.stock > 0)
    if (!active.length) return {}
    const base = Math.floor(total / active.length)
    const extra = total % active.length
    const result: Record<string, number> = {}
    active.forEach((r, i) => {
      result[r.id] = Math.min(r.stock, base + (i < extra ? 1 : 0))
    })
    return result
  }, [bulkInput, product.refs])

  // Per-ref prices (used when samePrice is false)
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    // Pre-fill from stored prixVente on each ref
    product.refs.forEach(r => { if (r.prixVente && r.prixVente > 0) init[r.id] = String(r.prixVente) })
    // Override with existing cart lines if any
    cartLines.forEach(l => { if (l.productId === product.id) init[l.refId] = String(l.unitPrice || '') })
    return init
  })

  // Single shared price (used when samePrice is true)
  const existingSharedPrice = samePrice
    ? cartLines.find(l => l.productId === product.id)?.unitPrice
    : undefined
  const defaultSharedPrice = existingSharedPrice ?? product.refs[0]?.prixVente ?? undefined
  const [sharedPriceInput, setSharedPriceInput] = useState(defaultSharedPrice ? String(defaultSharedPrice) : '')

  const setQty = (rid: string, val: number) => {
    const ref = product.refs.find(r => r.id === rid)
    if (!ref || ref.stock === 0) return
    setQtys(prev => ({ ...prev, [rid]: Math.max(0, Math.min(ref.stock, val)) }))
  }
  const setPrice = (rid: string, val: string) =>
    setPriceInputs(prev => ({ ...prev, [rid]: val }))

  const getPrice = (rid: string) =>
    samePrice ? (parseFloat(sharedPriceInput) || 0) : (parseFloat(priceInputs[rid] ?? '') || 0)

  const activeQtys = bulkMode ? bulkQtys : qtys
  const totalQty = product.refs.reduce((s, r) => s + (activeQtys[r.id] ?? 0), 0)
  const totalAmt = product.refs.reduce((s, r) => s + (activeQtys[r.id] ?? 0) * getPrice(r.id), 0)

  const handleConfirm = () => {
    if (samePrice && !(parseFloat(sharedPriceInput) > 0)) {
      window.alert('Entrez le prix de vente')
      return
    }
    const lines: CartLine[] = []
    product.refs.forEach(r => {
      const qty = activeQtys[r.id] ?? 0
      if (!qty) return
      const price = getPrice(r.id)
      if (!price) return
      lines.push({
        key: `${product.id}_${r.id}`,
        productId: product.id, productName: product.name,
        refId: r.id, refName: r.name,
        unitPrice: price, adjPrice: null,
        qty, stock: r.stock,
      })
    })
    if (!lines.length) {
      window.alert(bulkMode
        ? 'Entrez une quantité totale valide'
        : samePrice
          ? 'Sélectionnez au moins une référence'
          : 'Entrez une quantité et un prix pour au moins une référence')
      return
    }
    onConfirm(lines)
    onClose()
  }

  const filteredRefs = refSearch
    ? product.refs.filter(r => r.name.toLowerCase().includes(refSearch.toLowerCase()))
    : product.refs

  const { ref: shakeRef, shake } = useModalShake()
  const sharedPrice = parseFloat(sharedPriceInput) || 0

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,.5)' }}
      onClick={shake}>
      <div ref={shakeRef} className="flex flex-col overflow-hidden sm:rounded-2xl rounded-t-2xl border border-black/[0.08] bg-white w-full sm:w-[620px] sm:h-[82vh] h-[92vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-black/[0.08] px-[18px] py-3.5 flex-shrink-0">
          <h2 className="flex-1 text-[15px] font-medium">{product.name}</h2>
          {category && (
            <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-medium',
              samePrice ? 'bg-[#e8f5ee] text-[#1a7a4a]' : 'bg-[#e8f0fb] text-[#1a5fa8]')}>
              {samePrice ? '💰 Prix unique' : '🏷 Prix par réf.'}
            </span>
          )}
          <span className="text-[12px] text-[#a8a7a2]">
            {product.refs.length} référence{product.refs.length > 1 ? 's' : ''}
          </span>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0efe9] border-none cursor-pointer hover:opacity-80">
            <X size={13} className="text-[#6b6a66]" />
          </button>
        </div>

        {/* Shared price banner (samePrice mode) */}
        {samePrice && (
          <div className="flex items-center gap-3 border-b border-black/[0.08] bg-[#e8f5ee]/40 px-[18px] py-3 flex-shrink-0">
            <span className="flex-1 text-[13px] font-medium text-[#1a7a4a]">Prix de vente unique</span>
            <div className="flex items-center gap-1.5">
              <input type="number" min={0} placeholder="Prix" value={sharedPriceInput}
                onChange={e => setSharedPriceInput(e.target.value)}
                className={cn('w-28 rounded-lg border px-2.5 py-1.5 text-right font-mono text-[14px] font-medium outline-none',
                  sharedPrice > 0 ? 'border-[#1a7a4a] bg-white' : 'border-black/[0.08] bg-white focus:border-[#1a1a18]')}
              />
              <span className="text-[12px] font-medium text-[#1a7a4a]">MRU / unité</span>
            </div>
          </div>
        )}

        {/* Body — refs list */}
        <div className="flex flex-col overflow-hidden flex-1">
          {/* Toolbar */}
          <div className="flex flex-col border-b border-black/[0.08] flex-shrink-0">
            {/* Row 1: mode + search/bulk */}
            <div className="flex items-center gap-2 px-3.5 py-2.5">
              {/* Mode toggle */}
              <div className="flex flex-shrink-0 overflow-hidden rounded-lg border border-black/[0.08] bg-[#f0efe9]">
                <button onClick={() => setBulkMode(false)}
                  className={cn('px-3 py-1.5 text-[11px] font-medium cursor-pointer border-none transition-colors',
                    !bulkMode ? 'bg-[#1a1a18] text-white' : 'bg-transparent text-[#6b6a66] hover:text-[#111110]')}>
                  Par réf.
                </button>
                <button onClick={() => setBulkMode(true)}
                  className={cn('px-3 py-1.5 text-[11px] font-medium cursor-pointer border-none transition-colors',
                    bulkMode ? 'bg-[#1a1a18] text-white' : 'bg-transparent text-[#6b6a66] hover:text-[#111110]')}>
                  Qté totale
                </button>
              </div>

              {bulkMode ? (
                <div className="flex flex-1 items-center gap-2">
                  <div className="flex flex-1 items-center gap-1.5 rounded-[9px] border border-[#1a1a18] bg-white px-3 py-1.5">
                    <input type="number" min={0} placeholder="Quantité totale à vendre..." value={bulkInput}
                      onChange={e => setBulkInput(e.target.value)} autoFocus
                      className="flex-1 bg-transparent font-mono text-[13px] font-medium outline-none placeholder:font-sans placeholder:text-[#a8a7a2] placeholder:font-normal" />
                    <span className="text-[11px] text-[#a8a7a2]">unités</span>
                  </div>
                  {bulkInput && parseInt(bulkInput) > 0 && (
                    <span className="whitespace-nowrap text-[11px] text-[#6b6a66]">
                      ÷ {product.refs.filter(r => r.stock > 0).length} réf. = <strong className="text-[#111110]">{Math.floor((parseInt(bulkInput) || 0) / Math.max(1, product.refs.filter(r => r.stock > 0).length))}</strong>/réf.
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex flex-1 items-center gap-1.5 rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5">
                    <Search size={12} className="flex-shrink-0 text-[#a8a7a2]" />
                    <input type="text" placeholder="Filtrer…" value={refSearch}
                      onChange={e => setRefSearch(e.target.value)}
                      className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#a8a7a2]" />
                  </div>
                  <button onClick={() => product.refs.forEach(r => setQty(r.id, 0))}
                    className="whitespace-nowrap rounded-lg border border-black/[0.08] bg-white px-2 py-1.5 text-[11px] text-[#a8a7a2] hover:border-[#c0392b] hover:text-[#c0392b] cursor-pointer transition-colors">
                    Effacer
                  </button>
                </>
              )}
            </div>

            {/* Row 2: step selector — non-bulk only */}
            {!bulkMode && (
              <div className="flex items-center gap-2 border-t border-black/[0.06] bg-[#fafaf8] px-3.5 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[.6px] text-[#a8a7a2]">Pas</span>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 5, 10].map(s => (
                    <button key={s} onClick={() => setStep(s)}
                      className={cn('flex h-[24px] min-w-[32px] items-center justify-center rounded-[6px] border px-1.5 text-[11px] font-semibold cursor-pointer transition-all',
                        step === s
                          ? 'border-[#1a1a18] bg-[#1a1a18] text-white'
                          : 'border-black/[0.1] bg-white text-[#6b6a66] hover:border-[#1a1a18]')}>
                      {s}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-[#a8a7a2]">unité{step > 1 ? 's' : ''} par clic</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredRefs.map(ref => {
              const qty = bulkMode ? (bulkQtys[ref.id] ?? 0) : (qtys[ref.id] ?? 0)
              const oos = ref.stock === 0
              const low = ref.stock > 0 && ref.stock <= 3
              const stkTxt = oos ? 'Rupture' : low ? `⚠ ${ref.stock} restants` : `${ref.stock} en stock`
              const priceInput = priceInputs[ref.id] ?? ''
              const price = getPrice(ref.id)
              return (
                <div key={ref.id}
                  className={cn('flex items-center gap-3 border-b border-black/[0.04] px-[18px] py-[10px] transition-colors',
                    oos ? 'pointer-events-none opacity-35' : qty > 0 ? 'bg-[#e8f5ee]/35' : 'hover:bg-[#f8f7f3]')}>
                  <span className="flex-1 text-[13px] font-medium">{ref.name}</span>
                  <span className={cn('text-right font-mono text-[11px] w-[80px]',
                    oos ? 'text-[#c0392b]' : low ? 'text-[#996600]' : 'text-[#a8a7a2]')}>
                    {stkTxt}
                  </span>
                  {/* Prix unitaire — only shown in per-ref mode */}
                  {!samePrice && (
                    <div className="flex items-center gap-1">
                      <input type="number" min={0} placeholder="Prix" value={priceInput}
                        onChange={e => setPrice(ref.id, e.target.value)}
                        className={cn('w-24 rounded-lg border px-2 py-1.5 text-right font-mono text-[13px] outline-none',
                          parseFloat(priceInput) > 0 ? 'border-[#1a5fa8] bg-[#e6f0ff]' : 'border-black/[0.08] bg-white focus:border-[#1a1a18]')}
                      />
                      <span className="text-[11px] text-[#a8a7a2]">MRU</span>
                    </div>
                  )}
                  {/* Quantité */}
                  {bulkMode ? (
                    /* Read-only computed qty in bulk mode */
                    <div className={cn('flex h-[28px] w-[78px] flex-shrink-0 items-center justify-center rounded-lg font-mono text-[13px] font-medium',
                      qty > 0 ? 'bg-[#e8f5ee]/80 text-[#1a7a4a]' : 'bg-[#f0efe9] text-[#a8a7a2]')}>
                      {qty > 0 ? qty : '—'}
                    </div>
                  ) : (
                    <div className="flex flex-shrink-0 items-center overflow-hidden rounded-lg border border-black/[0.08]">
                      <button onClick={() => setQty(ref.id, qty - step)} disabled={qty === 0}
                        className="flex h-[28px] items-center justify-center border-none bg-[#f0efe9] font-mono text-[11px] font-semibold cursor-pointer hover:bg-black/[0.08] disabled:opacity-20 disabled:cursor-default px-1.5">
                        −{step > 1 ? step : ''}
                      </button>
                      <input type="number" min={0} max={ref.stock} placeholder="0" value={qty || ''}
                        onChange={e => setQty(ref.id, parseInt(e.target.value) || 0)}
                        className={cn('h-[28px] w-[44px] border-none text-center font-mono text-[13px] font-medium outline-none',
                          qty > 0 ? 'bg-[#e8f5ee]/80 text-[#1a7a4a]' : 'bg-white')}
                        style={{ borderLeft: '1px solid rgba(0,0,0,0.08)', borderRight: '1px solid rgba(0,0,0,0.08)' }} />
                      <button onClick={() => setQty(ref.id, qty + step)} disabled={qty >= ref.stock}
                        className="flex h-[28px] items-center justify-center border-none bg-[#f0efe9] font-mono text-[11px] font-semibold cursor-pointer hover:bg-black/[0.08] disabled:opacity-20 disabled:cursor-default px-1.5">
                        +{step > 1 ? step : ''}
                      </button>
                    </div>
                  )}
                  {/* Sous-total */}
                  <span className="w-[80px] text-right font-mono text-[12px] font-medium text-[#1a7a4a]">
                    {qty > 0 && price > 0 ? (qty * price).toLocaleString('fr-FR') + ' MRU' : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-black/[0.08] px-[18px] py-3 flex-shrink-0">
          <div className="flex-1 text-[13px] text-[#6b6a66]">
            {totalQty > 0 ? (
              <>
                <strong className="text-[#111110]">{totalQty}</strong> article{totalQty > 1 ? 's' : ''} —{' '}
                <strong className="font-mono text-[#111110]">{fmt(totalAmt)}</strong>
              </>
            ) : (
              <span className="text-[#a8a7a2]">Aucun article sélectionné</span>
            )}
          </div>
          <button onClick={onClose}
            className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] font-medium text-[#6b6a66] cursor-pointer hover:opacity-80">
            Annuler
          </button>
          <button onClick={handleConfirm} disabled={totalQty === 0}
            className={cn(
              'flex items-center gap-1.5 rounded-[9px] border-none px-4 py-2 text-[13px] font-medium transition-all',
              totalQty > 0
                ? 'bg-[#1a1a18] text-[#f5f4f0] cursor-pointer hover:opacity-90'
                : 'bg-[#f0efe9] text-[#a8a7a2] cursor-not-allowed'
            )}>
            <Check size={14} /> Ajouter au panier
          </button>
        </div>
      </div>
    </div>
  )
}

const todayStr = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

function parseFrDate(s: string): Date {
  const [d, m, y] = s.split('/')
  const dt = new Date(+y, +m - 1, +d)
  dt.setHours(0, 0, 0, 0)
  return dt
}

// ── Mode badge colors ──────────────────────────────────────────────────────
const MODE_COLORS: Record<string, { color: string; bg: string }> = {
  Cash:    { color: '#1a7a4a', bg: '#e8f5ee' },
  Bankily: { color: '#e65c00', bg: '#fff0e6' },
  Masravi: { color: '#0066cc', bg: '#e6f0ff' },
  Seddad:  { color: '#7b2d8b', bg: '#f5e6ff' },
  Bimban:  { color: '#c0392b', bg: '#fdecea' },
  Crédit:  { color: '#996600', bg: '#fdf3dc' },
  Avance:  { color: '#7c3aed', bg: '#f0e8ff' },
}

// ── Recent sales modal ─────────────────────────────────────────────────────
interface SaleEntry { tx: Tx; clientId: string | null; clientName: string | null }

type SalePeriod = 'today' | '3d' | '7d'

const PERIOD_LABELS: Record<SalePeriod, string> = { today: "Aujourd'hui", '3d': '3 jours', '7d': '7 jours' }

function RecentSalesModal({ sales, products, onClose, onModifier, onReprint }: {
  sales: SaleEntry[]
  products: Product[]
  onClose: () => void
  onModifier: (entry: SaleEntry) => void
  onReprint: (entry: SaleEntry) => void
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [period, setPeriod] = useState<SalePeriod>('today')
  const [clientQ, setClientQ] = useState('')
  const { ref: shakeRef, shake } = useModalShake()

  const cutoff = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    if (period === '3d') d.setDate(d.getDate() - 2)
    else if (period === '7d') d.setDate(d.getDate() - 6)
    return d
  }, [period])

  const filtered = useMemo(() => {
    const byDate = sales.filter(e => parseFrDate(e.tx.date) >= cutoff)
    if (!clientQ.trim()) return byDate
    const q = clientQ.toLowerCase()
    return byDate.filter(e => (e.clientName ?? 'comptoir').toLowerCase().includes(q))
  }, [sales, cutoff, clientQ])

  const periodLabel = period === 'today' ? todayStr() : `${period === '3d' ? '3' : '7'} derniers jours`

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45" onClick={shake}>
      <div ref={shakeRef} className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[620px] max-h-[88vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex flex-shrink-0 items-start justify-between border-b border-black/[0.08] bg-[#f8f7f3] px-5 py-4">
          <div>
            <div className="text-[16px] font-semibold">Factures</div>
            <div className="mt-0.5 text-[12px] text-[#a8a7a2]">{filtered.length} vente{filtered.length !== 1 ? 's' : ''} · {periodLabel}</div>
            {/* Period filter pills */}
            <div className="mt-2.5 flex gap-1.5">
              {(Object.keys(PERIOD_LABELS) as SalePeriod[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-medium cursor-pointer transition-all ${
                    period === p
                      ? 'border-[#1a1a18] bg-[#1a1a18] text-[#f5f4f0]'
                      : 'border-black/[0.1] bg-white text-[#6b6a66] hover:bg-[#f0efe9]'
                  }`}>
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
            {/* Client search */}
            <div className="mt-2.5 flex items-center gap-2 rounded-[9px] border border-black/[0.08] bg-white px-3 py-2">
              <Search size={13} className="flex-shrink-0 text-[#a8a7a2]" />
              <input
                type="text"
                placeholder="Chercher par client…"
                value={clientQ}
                onChange={e => setClientQ(e.target.value)}
                className="flex-1 border-none bg-transparent text-[13px] outline-none placeholder:text-[#a8a7a2]"
              />
              {clientQ && (
                <button onClick={() => setClientQ('')} className="flex-shrink-0 border-none bg-transparent p-0 cursor-pointer">
                  <X size={12} className="text-[#a8a7a2]" />
                </button>
              )}
            </div>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer mt-0.5">
            <X size={13} className="text-[#6b6a66]" />
          </button>
        </div>

        {/* Sales list */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-[#a8a7a2]">
              <svg className="h-10 w-10 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>
              <p className="text-[13px]">Aucune vente sur cette période</p>
            </div>
          ) : (
            <div className="flex flex-col gap-0">
              {filtered.map(entry => {
                const { tx, clientId, clientName } = entry
                const isCredit = tx.payModes.some(m => m.mode === 'Crédit')
                const resteDu = tx.total - tx.paid
                const isConfirming = confirmId === tx.id
                return (
                  <div key={tx.id} className="border-b border-black/[0.06] px-4 py-3">
                    {/* Row 1: ID + client + total */}
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[12px] font-semibold text-[#ea580c]">{tx.id}</span>
                          <span className="text-[12px] font-medium text-[#111110]">
                            {clientName ? clientName : 'Comptoir'}
                          </span>
                          {isCredit && resteDu > 0 && (
                            <span className="rounded-full bg-[#fdf3dc] px-2 py-0.5 text-[9px] font-medium text-[#996600]">
                              Crédit −{resteDu.toLocaleString('fr-FR')} MRU
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[10px] text-[#a8a7a2]">
                          {tx.date}{tx.time ? ` · ${tx.time.slice(0, 5)}` : ''}
                        </div>
                        {/* Lines summary */}
                        <div className="mt-1 text-[11px] text-[#6b6a66] truncate">
                          {tx.lines.map(l => `${l.desc} ×${l.qty}`).join(' · ')}
                        </div>
                        {/* Payment modes */}
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {tx.payModes.map((m, i) => {
                            const c = MODE_COLORS[m.mode] ?? { color: '#6b6a66', bg: '#f0efe9' }
                            return (
                              <span key={i} className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5" style={{ background: c.bg }}>
                                <span className="text-[9px] font-bold" style={{ color: c.color }}>{m.mode}</span>
                                <span className="font-mono text-[10px]" style={{ color: c.color }}>{m.amount.toLocaleString('fr-FR')}</span>
                              </span>
                            )
                          })}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="font-mono text-[14px] font-semibold text-[#111110]">
                          {tx.total.toLocaleString('fr-FR')} MRU
                        </div>
                        <div className="text-[10px] text-[#a8a7a2]">
                          {tx.lines.reduce((s, l) => s + l.qty, 0)} article{tx.lines.reduce((s, l) => s + l.qty, 0) > 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>

                    {/* Confirmation or action buttons */}
                    {isConfirming ? (
                      <div className="mt-2.5 flex items-center gap-2 rounded-[9px] border border-[#c0392b]/30 bg-[#fdecea] px-3 py-2.5">
                        <div className="flex-1 text-[12px] font-medium text-[#c0392b]">
                          Annuler cette vente et recharger dans le panier ?
                        </div>
                        <button onClick={() => setConfirmId(null)}
                          className="rounded-[7px] border border-black/[0.08] bg-white px-3 py-1.5 text-[11px] font-medium cursor-pointer">
                          Non
                        </button>
                        <button onClick={() => { setConfirmId(null); onModifier(entry) }}
                          className="rounded-[7px] border-none bg-[#c0392b] px-3 py-1.5 text-[11px] font-medium text-white cursor-pointer hover:opacity-90">
                          Confirmer
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => onReprint(entry)}
                          className="flex items-center gap-1.5 rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-3 py-1.5 text-[11px] font-medium text-[#6b6a66] cursor-pointer hover:opacity-80">
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6,9 6,2 18,2 18,9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                          Réimprimer
                        </button>
                        <button onClick={() => setConfirmId(tx.id)}
                          className="flex items-center gap-1.5 rounded-[8px] border border-[#1a5fa8]/30 bg-[#e8f0fb] px-3 py-1.5 text-[11px] font-medium text-[#1a5fa8] cursor-pointer hover:opacity-80">
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Modifier
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── POS Page ───────────────────────────────────────────────────────────────
export function POSPage() {
  const { appUser } = useAuthStore()
  const isOwner = appUser?.role === 'owner'

  const { products: storeProducts, categories, clients, ventesComptoir, addVente, annulerVente, addClientAvance, boutiqueFermee } = useAppStore()
  const products = storeProducts as unknown as Product[]
  const ALL_CATS = Array.from(new Set(products.map(p => p.category)))

  const { lines, addLines, updateQty: updateCartQty, removeLines,
    adjPrice, setAdjPrice, clearCart } = useCartStore()

  const [search, setSearch] = useState('')
  const [activeCats, setActiveCats] = useState<Set<string>>(new Set())
  const [showCartOnly, setShowCartOnly] = useState(false)
  const [oeState, setOEState] = useState<{ product: Product } | null>(null)

  // Client selection
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientSearch, setClientSearch] = useState('')
  const [showClientPicker, setShowClientPicker] = useState(false)
  const selectedClient = clientId ? clients.find(c => c.id === clientId) : null

  // Cart-level discount
  const [discInput, setDiscInput] = useState('')
  const [discBadge, setDiscBadge] = useState({ text: '—', cls: 'none' })

  // Payment
  const [payType, setPayType] = useState<'total' | 'partiel' | 'credit'>('total')
  const [chEnabled, setChEnabled] = useState<Record<string, boolean>>({ cash: true })
  const [chAmounts, setChAmounts] = useState<Record<string, number>>({})
  const [showPayChannels, setShowPayChannels] = useState(false)
  const [useAvance, setUseAvance] = useState(false)
  const [avanceAmt, setAvanceAmt] = useState(0)
  const [confirming, setConfirming] = useState(false)

  // Totals
  const getSubtotal = () => lines.reduce((s, l) => s + (l.adjPrice ?? l.unitPrice) * l.qty, 0)
  const getFinalTotal = () => {
    const sub = getSubtotal()
    return (adjPrice !== null && adjPrice < sub) ? adjPrice : sub
  }
  const getTotalVerse = () => Object.values(chAmounts).reduce((s, v) => s + v, 0)

  const sub = getSubtotal()
  const total = getFinalTotal()
  const versé = getTotalVerse()
  const clientSolde = selectedClient ? soldeAvance(selectedClient) : 0
  const avanceUsed = useAvance && clientSolde > 0 ? avanceAmt : 0
  const totalPaid = versé + avanceUsed
  const disc = sub - total

  const toggleCat = (cat: string) => {
    setActiveCats(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  // Visible product cards
  const cartProductIds = new Set(lines.map(l => l.productId))
  const visibleProducts: Product[] = products.filter(p => {
    if (showCartOnly && !cartProductIds.has(p.id)) return false
    if (activeCats.size > 0 && !activeCats.has(p.category)) return false
    if (search) {
      const q = search.toLowerCase()
      return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) ||
        p.refs.some(r => r.name.toLowerCase().includes(q))
    }
    return true
  })

  const cartQtyForProduct = (pid: string) =>
    lines.filter(l => l.productId === pid).reduce((s, l) => s + l.qty, 0)

  const handleDiscountChange = (val: string) => {
    setDiscInput(val)
    const num = parseFloat(val)
    if (!val || isNaN(num) || num <= 0) {
      setAdjPrice(null); setDiscBadge({ text: '—', cls: 'none' }); return
    }
    if (num >= sub) {
      setAdjPrice(null); setDiscBadge({ text: 'Prix trop élevé', cls: 'over' }); return
    }
    const pct = Math.round((sub - num) / sub * 100)
    const maxPct = isOwner ? 100 : MAX_DISC_PCT
    if (pct > maxPct) {
      setAdjPrice(null); setDiscBadge({ text: `Max ${maxPct}%`, cls: 'over' }); return
    }
    setAdjPrice(num)
    setDiscBadge({ text: `−${(sub - num).toLocaleString('fr-FR')} MRU (${pct}%)`, cls: 'ok' })
  }

  const toggleChannel = (cid: string) => {
    setChEnabled(prev => {
      const next = { ...prev, [cid]: !prev[cid] }
      if (!next[cid]) setChAmounts(a => { const n = { ...a }; delete n[cid]; return n })
      return next
    })
  }

  const setChAmt = (cid: string, val: number) => {
    setChAmounts(prev => val > 0 ? { ...prev, [cid]: val } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== cid)))
  }

  const fmtInput = (n: number) => n > 0 ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''
  const parseInput = (s: string) => parseInt(s.replace(/\D/g, '')) || 0

  const handleReset = () => {
    clearCart(); setDiscInput(''); setAdjPrice(null); setDiscBadge({ text: '—', cls: 'none' })
    setPayType('total'); setChEnabled({ cash: true }); setChAmounts({})
    setUseAvance(false); setAvanceAmt(0)
    setClientId(null); setClientSearch(''); setShowCartOnly(false)
  }

  const handleConfirmSale = async () => {
    if (confirming) return
    setConfirming(true)
    const paid = payType === 'credit' ? 0 : totalPaid
    const payModes: { mode: string; amount: number }[] = []
    if (payType === 'credit') {
      payModes.push({ mode: 'Crédit', amount: total })
    } else {
      CHANNELS.filter(ch => (chAmounts[ch.id] ?? 0) > 0).forEach(ch => {
        payModes.push({ mode: ch.name, amount: chAmounts[ch.id] })
      })
      if (avanceUsed > 0) {
        payModes.push({ mode: 'Avance', amount: avanceUsed })
      }
      if (payType === 'partiel' && total - totalPaid > 0) {
        payModes.push({ mode: 'Crédit', amount: total - totalPaid })
      }
    }
    const txLines = lines.map(l => ({
      desc: l.refName,
      productName: l.productName,
      qty: l.qty,
      pu: l.adjPrice ?? l.unitPrice,
      total: (l.adjPrice ?? l.unitPrice) * l.qty,
      productId: l.productId,
      refId: l.refId,
    }))
    let txId: string
    try {
      txId = await addVente(
        clientId,
        { date: todayStr(), total, paid, lines: [], payModes: [] },
        txLines,
        payModes,
      )
    } catch (e) {
      console.error('addVente error:', e)
      alert('Erreur lors de la sauvegarde de la vente. Vérifiez votre connexion.')
      setConfirming(false)
      return
    }
    // Debit client avance if used
    if (clientId && avanceUsed > 0) {
      const now = new Date()
      const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
      await addClientAvance(clientId, {
        date: todayStr(), time,
        type: 'achat', dir: 'debit',
        montant: avanceUsed,
        desc: `Facture ${txId}`,
        modes: [{ mode: 'Avance', amount: avanceUsed }],
      })
    }
    // Build invoice data before resetting cart
    const invoiceLines = lines.map(l => ({
      desc:        l.refName,
      productName: l.productName,
      qty:         l.qty,
      pu:          l.adjPrice ?? l.unitPrice,
      total:       (l.adjPrice ?? l.unitPrice) * l.qty,
    }))
    setInvoice({
      txId,
      date:     todayStr(),
      client:   selectedClient ?? null,
      lines:    invoiceLines,
      subtotal: sub,
      discount: disc,
      total,
      payModes,
      paid,
    })
    handleReset()
    setConfirming(false)
  }

  const handleConfirmOE = useCallback((newLines: CartLine[]) => {
    const pid = newLines[0]?.productId
    if (pid) lines.filter(l => l.productId === pid).forEach(l => removeLines(l.key))
    newLines.forEach(l => addLines([l]))
  }, [lines, addLines, removeLines])

  // Mobile tab
  const [mobileTab, setMobileTab] = useState<'catalogue' | 'panier'>('catalogue')

  // Invoice modal
  const [invoice, setInvoice] = useState<InvoiceData | null>(null)

  // Recent sales history
  const [showHistory, setShowHistory] = useState(false)

  const today = todayStr()

  // All sales last 7 days — passed to modal which filters by selected period
  const cutoff7d = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d
  }, [])

  const allSales = useMemo<SaleEntry[]>(() => {
    const entries: SaleEntry[] = []
    ventesComptoir.forEach(tx => {
      if (parseFrDate(tx.date) >= cutoff7d)
        entries.push({ tx, clientId: null, clientName: null })
    })
    clients.forEach(c => {
      c.transactions.forEach(tx => {
        if (parseFrDate(tx.date) >= cutoff7d)
          entries.push({ tx, clientId: c.id, clientName: `${c.prenom} ${c.nom}`.trim() })
      })
    })
    entries.sort((a, b) => {
      const da = parseFrDate(a.tx.date).getTime(), db = parseFrDate(b.tx.date).getTime()
      if (db !== da) return db - da
      const ta = a.tx.time ?? '', tb = b.tx.time ?? ''
      if (tb !== ta) return tb.localeCompare(ta)
      return b.tx.id.localeCompare(a.tx.id)
    })
    return entries
  }, [ventesComptoir, clients, cutoff7d])

  const todaySales = useMemo(() => allSales.filter(e => e.tx.date === today), [allSales, today])

  const handleModifier = async (entry: SaleEntry) => {
    const tx = await annulerVente(entry.tx.id, entry.clientId)
    if (!tx) return
    // Clear current cart and reload with sale's items
    clearCart()
    setAdjPrice(null); setDiscInput(''); setDiscBadge({ text: '—', cls: 'none' })
    setPayType('total'); setChEnabled({ cash: true }); setChAmounts({})
    // Get fresh products from store (stock was just restored)
    const freshProducts = useAppStore.getState().products as unknown as Product[]
    tx.lines.forEach(l => {
      if (!l.productId || !l.refId) return
      const product = freshProducts.find(p => p.id === l.productId)
      const ref = product?.refs.find(r => r.id === l.refId)
      const line: CartLine = {
        key: `${l.productId}_${l.refId}`,
        productId: l.productId,
        productName: product?.name ?? l.desc,
        refId: l.refId,
        refName: l.desc,
        unitPrice: l.pu,
        adjPrice: null,
        qty: l.qty,
        stock: ref?.stock ?? l.qty,
      }
      addLines([line])
    })
    // Restore client
    if (entry.clientId) setClientId(entry.clientId)
    setShowHistory(false)
  }

  const handleReprint = (entry: SaleEntry) => {
    const { tx, clientId: cid, clientName } = entry
    const client: Client | null = cid ? (clients.find(c => c.id === cid) ?? null) : null
    setInvoice({
      txId: tx.id,
      date: tx.date,
      client,
      lines: tx.lines.map(l => ({ desc: l.desc, productName: l.desc, qty: l.qty, pu: l.pu, total: l.total })),
      subtotal: tx.total,
      discount: 0,
      total: tx.total,
      payModes: tx.payModes,
      paid: tx.paid,
    })
    setShowHistory(false)
  }

  // Confirm button state
  const getCfmState = () => {
    if (!lines.length) return 'off'
    if (payType === 'credit') return 'credit'
    if (payType === 'total' && totalPaid >= total) return 'ready'
    if (payType === 'partiel' && totalPaid > 0 && totalPaid < total) return 'partial'
    return 'off'
  }
  const cfmState = getCfmState()

  const renderPaySummary = () => {
    if (totalPaid === 0) return null
    const diff = totalPaid - total
    const parts = [
      ...CHANNELS.filter(ch => chAmounts[ch.id] > 0).map(ch => `${ch.name} ${chAmounts[ch.id].toLocaleString('fr-FR')} MRU`),
      ...(avanceUsed > 0 ? [`Avance ${avanceUsed.toLocaleString('fr-FR')} MRU`] : []),
    ].join(' + ')
    return (
      <div className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] p-2.5 text-[12px]">
        <div className="text-[10px] text-[#a8a7a2] mb-1">{parts}</div>
        {payType === 'total' ? (
          diff > 0 ? <div className="flex justify-between"><span className="text-[#6b6a66]">Rendu</span><span className="font-mono font-medium text-[#1a5fa8]">+{fmt(diff)}</span></div>
          : diff === 0 ? <div className="flex justify-between"><span className="text-[#6b6a66]">Total versé</span><span className="font-mono font-medium text-[#1a7a4a]">{fmt(totalPaid)} ✓</span></div>
          : <div className="flex justify-between"><span className="text-[#6b6a66]">Manque</span><span className="font-mono font-medium text-[#996600]">{fmt(Math.abs(diff))}</span></div>
        ) : (
          total - totalPaid > 0
            ? <div className="flex justify-between"><span className="text-[#6b6a66]">Reste dû</span><span className="font-mono font-medium text-[#996600]">{fmt(total - totalPaid)}</span></div>
            : <div className="flex justify-between"><span className="text-[#6b6a66]">Rendu</span><span className="font-mono font-medium text-[#1a5fa8]">+{fmt(Math.abs(total - totalPaid))}</span></div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── LEFT — catalogue ── */}
      <div className={cn('flex-col overflow-hidden border-r border-black/[0.08] flex-1',
        mobileTab === 'catalogue' ? 'flex' : 'hidden md:flex')}>

        {/* Topbar */}
        <div className="flex items-center justify-between border-b border-black/[0.08] bg-white px-5 py-3.5 flex-shrink-0">
          <div>
            <h1 className="text-[17px] font-medium">Point de Vente</h1>
            <p className="mt-0.5 text-[12px] text-[#a8a7a2]">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowHistory(true)}
              className="relative flex items-center gap-1.5 rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] font-medium text-[#6b6a66] cursor-pointer hover:opacity-80">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>
              <span className="hidden sm:inline">Factures</span>
              {todaySales.length > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0f2460] text-[9px] font-bold text-white">
                  {todaySales.length}
                </span>
              )}
            </button>
            <button onClick={handleReset}
              className="flex items-center gap-1.5 rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] font-medium text-[#6b6a66] cursor-pointer hover:opacity-80">
              <RotateCcw size={13} /> <span className="hidden sm:inline">Réinitialiser</span>
            </button>
          </div>
        </div>

        {/* Search + category pills */}
        {/* Mobile: single row with select + search + cart filter */}
        <div className="flex sm:hidden items-center gap-2 border-b border-black/[0.08] bg-white px-3 py-2 flex-shrink-0">
          {!showCartOnly && (
            <select value={activeCats.size === 0 ? '__all__' : [...activeCats][0]}
              onChange={e => { const v = e.target.value; if (v === '__all__') setActiveCats(new Set()); else setActiveCats(new Set([v])) }}
              className="rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2 py-1.5 text-[12px] font-medium outline-none text-[#1a1a18]">
              <option value="__all__">Toutes catégories</option>
              {ALL_CATS.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          )}
          {!showCartOnly && (
            <div className="flex flex-1 items-center gap-1.5 rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5">
              <Search size={12} className="flex-shrink-0 text-[#a8a7a2]" />
              <input type="text" placeholder="Chercher..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-transparent text-[12px] outline-none placeholder:text-[#a8a7a2]" />
            </div>
          )}
          {showCartOnly && (
            <span className="flex-1 text-[12px] font-medium text-[#0f2460]">
              {lines.length} ligne{lines.length > 1 ? 's' : ''} dans le panier
            </span>
          )}
          <button
            onClick={() => setShowCartOnly(v => !v)}
            disabled={lines.length === 0}
            className={cn(
              'relative flex flex-shrink-0 items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[12px] font-medium cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed',
              showCartOnly
                ? 'border-[#1a3a8f] bg-[#1a3a8f] text-white'
                : 'border-black/[0.08] bg-[#f0efe9] text-[#6b6a66]'
            )}>
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            Panier
            {lines.length > 0 && (
              <span className={cn('flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold',
                showCartOnly ? 'bg-white text-[#0f2460]' : 'bg-[#0f2460] text-white')}>
                {lines.length}
              </span>
            )}
          </button>
        </div>
        {/* Desktop: full search + pills */}
        <div className="hidden sm:flex flex-col gap-2 border-b border-black/[0.08] bg-white px-5 py-3 flex-shrink-0">
          <div className="flex items-center gap-2 rounded-[10px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2">
            <Search size={14} className="flex-shrink-0 text-[#a8a7a2]" />
            <input type="text" placeholder="Rechercher un produit..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#a8a7a2]" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
            <button onClick={() => setActiveCats(new Set())}
              className={cn('flex-shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12px] font-medium cursor-pointer transition-all',
                activeCats.size === 0 ? 'border-[#1a1a18] bg-[#1a1a18] text-[#f5f4f0]' : 'border-black/[0.08] bg-white text-[#6b6a66] hover:bg-[#f0efe9]')}>
              Tous
            </button>
            {ALL_CATS.map(cat => {
              const count = products.filter(p => p.category === cat).length
              const active = activeCats.has(cat)
              return (
                <button key={cat} onClick={() => toggleCat(cat)}
                  className={cn('flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12px] font-medium cursor-pointer transition-all',
                    active ? 'border-[#1a1a18] bg-[#1a1a18] text-[#f5f4f0]' : 'border-black/[0.08] bg-white text-[#6b6a66] hover:bg-[#f0efe9]')}>
                  {cat}
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]',
                    active ? 'bg-white/20 text-white' : 'bg-[#f0efe9] text-[#a8a7a2]')}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Product cards / list */}
        <div className="flex-1 overflow-y-auto pb-28 md:pb-4"
          style={{ background: 'linear-gradient(160deg,#f2efea 0%,#ede9e2 100%)' }}>
          {visibleProducts.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-[#a8a7a2]">
              <Search size={20} /><p className="text-[13px]">Aucun produit trouvé</p>
            </div>
          ) : (<>

            {/* ── MOBILE list ── */}
            <div className="md:hidden flex flex-col gap-2 px-3 py-3">
              {visibleProducts.map(p => {
                const totalStock = p.refs.reduce((s, r) => s + r.stock, 0)
                const cartQty = cartQtyForProduct(p.id)
                const isOut = totalStock === 0
                const isLow = totalStock > 0 && totalStock <= 5
                const color = catColor(p.category, ALL_CATS)
                const minPrice = Math.min(...p.refs.filter(r => r.prixVente > 0).map(r => r.prixVente))
                const maxPrice = Math.max(...p.refs.filter(r => r.prixVente > 0).map(r => r.prixVente))
                const hasPrice = p.refs.some(r => r.prixVente > 0)
                return (
                  <button key={p.id} onClick={() => setOEState({ product: p })}
                    className="flex items-center gap-3 rounded-[12px] cursor-pointer active:scale-[0.99] transition-transform text-left w-full overflow-hidden"
                    style={{
                      background: cartQty > 0 ? 'linear-gradient(90deg,#eef2ff 0%,#f8f9ff 100%)' : 'white',
                      border: cartQty > 0 ? '1.5px solid #a5b4fc' : '1px solid rgba(0,0,0,0.07)',
                    }}>
                    {/* Cart qty accent bar */}
                    {cartQty > 0 && (
                      <div className="flex-shrink-0 flex flex-col items-center justify-center self-stretch w-10 gap-0.5"
                        style={{ background: 'linear-gradient(180deg,#1a3a8f 0%,#0f2460 100%)' }}>
                        <span className="font-mono text-[17px] font-bold text-white leading-none">{cartQty}</span>
                        <span className="text-[8px] text-white/60 font-medium">u.</span>
                      </div>
                    )}
                    {/* Content */}
                    <div className={cn('flex flex-1 min-w-0 items-center gap-3', cartQty > 0 ? 'px-2.5 py-3' : 'px-3.5 py-3')}>
                      {/* Color dot */}
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] text-[12px] font-bold text-white"
                        style={{ background: color }}>
                        {p.name.slice(0,1).toUpperCase()}
                      </div>
                      {/* Name + category */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[#111110] truncate">{p.name}</div>
                        <span className="mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                          style={{ background: color }}>
                          {p.category}
                        </span>
                      </div>
                      {/* Stock */}
                      <div className="flex-shrink-0 text-right">
                        <div className={cn('font-mono text-[15px] font-bold leading-none',
                          isOut ? 'text-[#c0392b]' : isLow ? 'text-[#996600]' : 'text-[#111110]')}>
                          {fmtN(totalStock)}
                        </div>
                        <div className="mt-0.5 text-[10px] text-[#a8a7a2]">{p.refs.length} réf.</div>
                        {isOut && <div className="mt-0.5 text-[9px] font-medium text-[#c0392b]">Rupture</div>}
                        {isLow && <div className="mt-0.5 text-[9px] font-medium text-[#996600]">Stock bas</div>}
                      </div>
                      {/* Price */}
                      {hasPrice && (
                        <div className="flex-shrink-0 text-right border-l border-black/[0.07] pl-3">
                          <div className="text-[12px] font-semibold text-[#111110]">
                            {minPrice === maxPrice ? fmt(minPrice) : `${fmtN(minPrice)}–${fmt(maxPrice)}`}
                          </div>
                          <div className="text-[10px] text-[#a8a7a2]">prix</div>
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* ── DESKTOP grid ── */}
            <div className="hidden md:grid md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 p-4">
              {visibleProducts.map(p => {
                const totalStock = p.refs.reduce((s, r) => s + r.stock, 0)
                const cartQty = cartQtyForProduct(p.id)
                const stkCls = totalStock === 0 ? 'out' : totalStock <= 5 ? 'low' : 'ok'
                const stkTxt = totalStock === 0 ? 'Rupture' : totalStock <= 5 ? `⚠ ${totalStock}` : `${totalStock} en stock`
                const stkColor = { ok: 'bg-[#e8f5ee] text-[#1a7a4a]', low: 'bg-[#fdf3dc] text-[#996600]', out: 'bg-[#fdecea] text-[#c0392b]' }[stkCls]
                return (
                  <button key={p.id}
                    onClick={() => setOEState({ product: p })}
                    className={cn('relative cursor-pointer text-left active:scale-[0.97] transition-all rounded-[16px] overflow-hidden p-0',
                      cartQty > 0 ? 'ring-2 ring-[#1a3a8f]' : '')}
                    style={{
                      background: 'linear-gradient(160deg,#ffffff 0%,#f9f7f3 100%)',
                      border: cartQty > 0 ? '2px solid #1a3a8f' : '1px solid rgba(200,175,100,0.22)',
                      boxShadow: '0 1px 0 rgba(255,255,255,0.85) inset, 0 4px 8px rgba(0,0,0,0.05), 0 10px 24px rgba(0,0,0,0.07)',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    }}
                    onMouseEnter={e => Object.assign((e.currentTarget as HTMLElement).style, {
                      transform: 'translateY(-4px)',
                      boxShadow: '0 1px 0 rgba(255,255,255,0.85) inset, 0 12px 24px rgba(0,0,0,0.09), 0 28px 40px rgba(0,0,0,0.08)',
                    })}
                    onMouseLeave={e => Object.assign((e.currentTarget as HTMLElement).style, {
                      transform: 'translateY(0)',
                      boxShadow: '0 1px 0 rgba(255,255,255,0.85) inset, 0 4px 8px rgba(0,0,0,0.05), 0 10px 24px rgba(0,0,0,0.07)',
                    })}>
                    <div className="absolute inset-x-0 top-0 h-[1px]"
                      style={{ background: 'linear-gradient(90deg,transparent,rgba(212,175,55,0.5),rgba(255,220,80,0.65),rgba(212,175,55,0.5),transparent)' }} />
                    {cartQty > 0 && (
                      <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#0f2460] font-mono text-[10px] font-medium text-white shadow">
                        {cartQty}
                      </div>
                    )}
                    <div className="px-3.5 pt-4 pb-3">
                      <div className="mb-0.5 text-[9px] font-medium uppercase tracking-[0.6px] text-[#996600]">{p.category}</div>
                      <div className="mb-1.5 text-[12px] font-medium leading-tight text-[#111110] pr-4">{p.name}</div>
                      <div className="text-[10px] text-[#a8a7a2]">{p.refs.length} réf.</div>
                      <div className={cn('mt-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium', stkColor)}>
                        {stkTxt}
                      </div>
                    </div>
                    <div className="h-[3px] w-full"
                      style={{ background: stkCls === 'ok' ? 'linear-gradient(90deg,#1a7a4a,#27ae6099,transparent)' : stkCls === 'low' ? 'linear-gradient(90deg,#996600,#d4a00099,transparent)' : 'linear-gradient(90deg,#c0392b,#e74c3c99,transparent)' }} />
                  </button>
                )
              })}
            </div>
          </>)}
        </div>
      </div>

      {/* ── RIGHT — panier ── */}
      <div className={cn(
        'flex-col overflow-hidden bg-white',
        'md:w-[37%] md:flex-shrink-0',
        mobileTab === 'panier' ? 'flex flex-1' : 'hidden md:flex'
      )}>

        {/* Header */}
        <div className="border-b border-black/[0.08] px-5 py-4 flex-shrink-0">
          <div className="mb-2.5 text-[15px] font-medium">
            Panier{' '}
            {lines.length > 0 && <span className="font-normal text-[13px] text-[#a8a7a2]">({lines.length} ligne{lines.length > 1 ? 's' : ''})</span>}
          </div>
          {/* Client selector */}
          <div className="relative">
            <button onClick={() => setShowClientPicker(p => !p)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-[10px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 hover:border-[#a8a7a2] transition-colors text-left">
              <svg className="h-3.5 w-3.5 flex-shrink-0 text-[#a8a7a2]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span className={cn('flex-1 text-[13px]', selectedClient ? 'font-medium text-[#111110]' : 'text-[#6b6a66]')}>
                {selectedClient ? `${selectedClient.prenom} ${selectedClient.nom}` : 'Client comptoir (anonyme)'}
              </span>
              {clientId && (
                <button onClick={e => { e.stopPropagation(); setClientId(null); setClientSearch(''); setPayType('total'); setUseAvance(false); setAvanceAmt(0) }}
                  className="flex h-4 w-4 items-center justify-center rounded border-none bg-transparent text-[#a8a7a2] hover:text-[#c0392b] cursor-pointer">
                  <X size={10} />
                </button>
              )}
              <svg className="h-3 w-3 text-[#a8a7a2]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6,9 12,15 18,9"/></svg>
            </button>
            {showClientPicker && (
              <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-black/[0.08] bg-white shadow-lg">
                <div className="p-2">
                  <div className="flex items-center gap-1.5 rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5">
                    <Search size={12} className="text-[#a8a7a2]" />
                    <input autoFocus type="text" placeholder="Rechercher un client..."
                      value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                      className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#a8a7a2]" />
                  </div>
                </div>
                <div className="max-h-44 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                  {clients
                    .filter(c => !clientSearch || (c.prenom + ' ' + c.nom + ' ' + c.tel).toLowerCase().includes(clientSearch.toLowerCase()))
                    .map(c => (
                      <button key={c.id} onClick={() => { setClientId(c.id); setShowClientPicker(false); setClientSearch('') }}
                        className={cn('flex w-full items-center gap-2.5 border-none border-b border-black/[0.04] bg-transparent px-3.5 py-2 text-left cursor-pointer hover:bg-[#f0efe9] transition-colors',
                          clientId === c.id && 'bg-[#e8f5ee]')}>
                        <span className="flex-1 text-[13px] font-medium">{c.prenom} {c.nom}</span>
                        <span className="text-[11px] text-[#a8a7a2]">{c.tel}</span>
                      </button>
                    ))}
                  {clients.filter(c => !clientSearch || (c.prenom + ' ' + c.nom + ' ' + c.tel).toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                    <div className="px-4 py-3 text-[12px] text-[#a8a7a2]">Aucun client trouvé</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Lines */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-[#a8a7a2]">
              <svg className="h-9 w-9 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
              <p className="text-[13px]">Cliquez sur un produit pour l'ajouter</p>
            </div>
          ) : lines.map(line => {
            const eff = line.adjPrice ?? line.unitPrice
            const hasDisc = line.adjPrice !== null && line.adjPrice < line.unitPrice
            return (
              <div key={line.key} className="flex items-center gap-2 border-b border-black/[0.08] px-3.5 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[12px] font-medium text-[#111110]">{line.refName}</div>
                  <div className="mt-0.5 truncate text-[10px] text-[#6b6a66]">{line.productName}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-[#6b6a66]">
                    {hasDisc ? (
                      <><span className="line-through text-[#a8a7a2] mr-1">{line.unitPrice.toLocaleString('fr-FR')}</span>
                        <span className="text-[#996600]">{eff.toLocaleString('fr-FR')} MRU</span></>
                    ) : `${eff.toLocaleString('fr-FR')} MRU`}
                  </div>
                </div>
                {/* qty control */}
                <div className="flex flex-shrink-0 items-center overflow-hidden rounded-lg border border-black/[0.08]">
                  <button onClick={() => line.qty > 1 ? updateCartQty(line.key, line.qty - 1) : removeLines(line.key)}
                    className="flex h-[26px] w-6 items-center justify-center border-none bg-[#f0efe9] text-[15px] cursor-pointer hover:bg-black/[0.08]">−</button>
                  <input type="number" value={line.qty} min={1} max={line.stock}
                    onChange={e => updateCartQty(line.key, parseInt(e.target.value) || 1)}
                    className="h-[26px] w-9 border-none bg-white text-center font-mono text-[12px] font-medium outline-none"
                    style={{ borderLeft: '1px solid rgba(0,0,0,0.08)', borderRight: '1px solid rgba(0,0,0,0.08)' }} />
                  <button onClick={() => updateCartQty(line.key, line.qty + 1)} disabled={line.qty >= line.stock}
                    className="flex h-[26px] w-6 items-center justify-center border-none bg-[#f0efe9] text-[15px] cursor-pointer hover:bg-black/[0.08] disabled:opacity-20">+</button>
                </div>
                <div className="w-14 flex-shrink-0 text-right font-mono text-[12px] font-medium">{(eff * line.qty).toLocaleString('fr-FR')} MRU</div>
                <button onClick={() => removeLines(line.key)}
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-none bg-transparent cursor-pointer text-[#a8a7a2] hover:bg-[#fdecea] hover:text-[#c0392b] transition-colors">
                  <svg className="h-[11px] w-[11px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer — discount + totals + payment */}
        {lines.length > 0 && (
          <div className="flex flex-col border-t border-black/[0.08] flex-shrink-0">

            {/* Discount */}
            <div className="flex flex-col gap-1.5 border-b border-black/[0.08] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap text-[12px] text-[#6b6a66]">Prix ajusté total</span>
                <input type="number" placeholder={sub > 0 ? sub.toLocaleString('fr-FR') : '—'} value={discInput}
                  readOnly
                  className={cn('flex-1 min-w-0 rounded-lg border px-2.5 py-1.5 font-mono text-[13px] font-medium outline-none cursor-not-allowed',
                    discBadge.cls === 'ok' ? 'border-[#996600]' : 'border-black/[0.08]',
                    'bg-[#e8e7e2] text-[#a8a7a2]')} />
                <span className={cn('flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
                  discBadge.cls === 'ok' ? 'bg-[#fdf3dc] text-[#996600]' :
                  discBadge.cls === 'over' ? 'bg-[#fdecea] text-[#c0392b]' : 'bg-[#f0efe9] text-[#a8a7a2]')}>
                  {discBadge.text}
                </span>
              </div>
              {discBadge.cls === 'over' && <div className="text-[11px] text-[#c0392b]">Remise non autorisée</div>}
            </div>

            {/* Totals */}
            <div className="px-4 py-2.5">
              <div className="mb-1 flex justify-between text-[13px]">
                <span className="text-[#6b6a66]">Sous-total</span>
                <span className="font-mono">{fmt(sub)}</span>
              </div>
              {disc > 0 && (
                <div className="mb-1 flex justify-between text-[13px]">
                  <span className="text-[#996600]">Remise</span>
                  <span className="font-mono text-[#996600]">−{fmt(disc)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-black/[0.08] pt-2 mt-1 text-[15px] font-medium">
                <span>Total</span><span className="font-mono">{fmt(total)}</span>
              </div>
            </div>

            {/* Payment type + channels toggle */}
            <div className="flex items-center gap-1.5 px-4 pb-2">
              <div className={cn('grid flex-1 gap-1.5', selectedClient ? 'grid-cols-3' : 'grid-cols-1')}>
                {([['total', 'Complet'], ['partiel', 'Partiel'], ['credit', 'Crédit']] as const)
                  .filter(([v]) => selectedClient || v === 'total')
                  .map(([v, l]) => (
                  <button key={v} onClick={() => { setPayType(v); setChAmounts({}); setShowPayChannels(false); if (v === 'credit') { setUseAvance(false); setAvanceAmt(0) } }}
                    className={cn('rounded-[9px] border py-1.5 text-[11px] font-medium cursor-pointer transition-all',
                      payType === v
                        ? v === 'total' ? 'bg-[#1a1a18] text-[#f5f4f0] border-[#1a1a18]'
                        : v === 'partiel' ? 'bg-[#fdf3dc] text-[#996600] border-[#996600]'
                        : 'bg-[#fdecea] text-[#c0392b] border-[#c0392b]'
                        : 'border-black/[0.08] bg-[#f0efe9] text-[#6b6a66] hover:border-[#a8a7a2]')}>
                    {l}
                  </button>
                ))}
              </div>
              {payType !== 'credit' && (
                <button onClick={() => setShowPayChannels(p => !p)}
                  className={cn('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] border cursor-pointer transition-all',
                    showPayChannels ? 'border-[#1a1a18] bg-[#1a1a18] text-white' : 'border-black/[0.08] bg-[#f0efe9] text-[#6b6a66]')}>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="4" height="14"/><rect x="10" y="5" width="4" height="14"/><rect x="18" y="5" width="4" height="14"/></svg>
                </button>
              )}
            </div>

            {/* Avance client row — shown when client has positive balance */}
            {payType !== 'credit' && clientSolde > 0 && selectedClient && (
              <div className={cn('mx-4 mb-2 flex items-center gap-2 rounded-[9px] border px-2.5 py-2 transition-colors',
                useAvance ? 'border-[#7c3aed] bg-[#f0e8ff]' : 'border-black/[0.08] bg-[#f0efe9]')}>
                <button onClick={() => {
                  const next = !useAvance
                  setUseAvance(next)
                  if (next) setAvanceAmt(Math.min(clientSolde, Math.max(0, total - versé)))
                  else setAvanceAmt(0)
                }} className={cn('flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center rounded border cursor-pointer transition-all',
                  useAvance ? 'border-[#7c3aed] bg-[#7c3aed]' : 'border-black/[0.08] bg-white')}>
                  {useAvance && <svg className="h-[9px] w-[9px]" viewBox="0 0 24 24" fill="none" stroke="#f5f4f0" strokeWidth="2.5" strokeLinecap="round"><polyline points="20,6 9,17 4,12"/></svg>}
                </button>
                <div className="flex h-[18px] w-[26px] flex-shrink-0 items-center justify-center rounded text-[8px] font-bold tracking-[0.3px]"
                  style={{ background: '#f0e8ff', color: '#7c3aed' }}>AVR</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium">Avoir client</div>
                  <div className="text-[10px]" style={{ color: '#7c3aed' }}>{clientSolde.toLocaleString('fr-FR')} MRU dispo</div>
                </div>
                <input type="text" inputMode="numeric" placeholder="0" disabled={!useAvance}
                  value={useAvance ? fmtInput(avanceAmt) : ''}
                  onChange={e => {
                    const v = parseInput(e.target.value)
                    setAvanceAmt(Math.min(clientSolde, v))
                  }}
                  className="h-[26px] w-24 rounded-lg border border-black/[0.08] bg-white px-2 text-right font-mono text-[12px] font-medium outline-none focus:border-[#7c3aed] disabled:opacity-30 disabled:bg-transparent disabled:border-transparent" />
                <span className="text-[10px] text-[#a8a7a2]">MRU</span>
              </div>
            )}

            {/* Payment channels — collapsible */}
            {payType !== 'credit' && showPayChannels && (
              <div className="flex flex-col gap-1.5 px-4 pb-2">
                {CHANNELS.map(ch => {
                  const on = chEnabled[ch.id] ?? false
                  return (
                    <div key={ch.id}
                      className={cn('flex items-center gap-2 rounded-[9px] border px-2.5 py-2 transition-colors',
                        on && ch.id === 'cash' ? 'border-[#1a7a4a] bg-[#e8f5ee]' :
                        on ? 'border-[#1a5fa8] bg-[#e8f0fb]' : 'border-black/[0.08] bg-[#f0efe9]')}>
                      <button onClick={() => toggleChannel(ch.id)}
                        className={cn('flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center rounded border cursor-pointer transition-all',
                          on ? 'border-[#1a1a18] bg-[#1a1a18]' : 'border-black/[0.08] bg-white')}>
                        {on && <svg className="h-[9px] w-[9px]" viewBox="0 0 24 24" fill="none" stroke="#f5f4f0" strokeWidth="2.5" strokeLinecap="round"><polyline points="20,6 9,17 4,12"/></svg>}
                      </button>
                      <div className="flex h-[18px] w-[26px] flex-shrink-0 items-center justify-center rounded text-[8px] font-bold tracking-[0.3px]"
                        style={{ background: ch.bg, color: ch.color }}>{ch.label}</div>
                      <span className="flex-1 text-[12px] font-medium">{ch.name}</span>
                      <input type="text" inputMode="numeric" placeholder="0" disabled={!on}
                        value={fmtInput(chAmounts[ch.id] ?? 0)}
                        onChange={e => setChAmt(ch.id, parseInput(e.target.value))}
                        className="h-[26px] w-24 rounded-lg border border-black/[0.08] bg-white px-2 text-right font-mono text-[12px] font-medium outline-none focus:border-[#1a1a18] disabled:opacity-30 disabled:bg-transparent disabled:border-transparent" />
                      <span className="text-[10px] text-[#a8a7a2]">MRU</span>
                    </div>
                  )
                })}
                {renderPaySummary()}
              </div>
            )}

            {/* Confirm button */}
            <div className="px-4 pb-28 md:pb-3.5 flex flex-col gap-2">
              {boutiqueFermee && (
                <div className="flex items-center justify-center gap-1.5 rounded-[9px] bg-[#fdecea] px-3 py-2 text-[12px] font-medium text-[#c0392b]">
                  <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Boutique fermée — ouvrez la caisse pour vendre
                </div>
              )}
              <button
                onClick={!boutiqueFermee && cfmState !== 'off' && !confirming ? handleConfirmSale : undefined}
                disabled={boutiqueFermee || confirming}
                className={cn('flex w-full items-center justify-center gap-2 rounded-[11px] border-none py-3 text-[14px] font-medium transition-all',
                  boutiqueFermee || confirming ? 'pointer-events-none bg-[#f0efe9] text-[#a8a7a2]' :
                  cfmState === 'ready' ? 'bg-[#1a1a18] text-[#f5f4f0] cursor-pointer hover:opacity-90' :
                  cfmState === 'credit' ? 'bg-[#e8f0fb] text-[#1a5fa8] cursor-pointer hover:opacity-90' :
                  cfmState === 'partial' ? 'bg-[#fdf3dc] text-[#996600] cursor-pointer hover:opacity-90' :
                  'pointer-events-none bg-[#f0efe9] text-[#a8a7a2]')}>
                {confirming
                  ? <svg className="h-[15px] w-[15px] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  : <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20,6 9,17 4,12"/></svg>}
                {confirming ? 'Enregistrement…' :
                 cfmState === 'credit' ? `Valider crédit — ${fmt(total)}` :
                 cfmState === 'partial' ? `Valider partiel — ${fmt(totalPaid)} versés` :
                 cfmState === 'ready' ? `Confirmer — ${fmt(total)}` : 'Confirmer la vente'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── MOBILE TAB BAR ── */}
      <div className="bk-tabbar md:hidden fixed bottom-0 left-0 right-0 z-30 flex">
        <button onClick={() => setMobileTab('catalogue')}
          className={cn('flex flex-1 flex-col items-center gap-0.5 py-2 border-none cursor-pointer transition-all',
            mobileTab === 'catalogue' ? 'text-[#0f2460]' : 'text-[#1a5fa8]/45')}>
          <div className={cn('flex h-7 w-7 items-center justify-center rounded-xl transition-all',
            mobileTab === 'catalogue' ? 'bg-[#1a5fa8]/15' : '')}>
            <Search size={16} />
          </div>
          <span className="text-[10px] font-semibold">Catalogue</span>
        </button>
        <button onClick={() => setMobileTab('panier')}
          className={cn('relative flex flex-1 flex-col items-center gap-0.5 py-2 border-none cursor-pointer transition-all',
            mobileTab === 'panier' ? 'text-[#0f2460]' : 'text-[#1a5fa8]/45')}>
          {lines.length > 0 && (
            <span className="absolute top-1.5 right-[calc(50%-18px)] flex h-4 w-4 items-center justify-center rounded-full bg-[#c9a227] text-[9px] font-bold text-white shadow-md">
              {lines.length}
            </span>
          )}
          <div className={cn('flex h-7 w-7 items-center justify-center rounded-xl transition-all',
            mobileTab === 'panier' ? 'bg-[#1a5fa8]/15' : '')}>
            <svg className="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          </div>
          <span className="text-[10px] font-semibold">Panier{lines.length > 0 ? ` (${lines.length})` : ''}</span>
        </button>
      </div>

      {/* OE Modal */}
      {oeState && (
        <OEModal
          product={oeState.product}
          category={categories.find(c => c.name === oeState.product.category) ?? null}
          cartLines={lines}
          isOwner={isOwner}
          onClose={() => setOEState(null)}
          onConfirm={handleConfirmOE}
        />
      )}

      {/* Invoice Modal */}
      {invoice && (
        <InvoiceModal data={invoice} onClose={() => setInvoice(null)} />
      )}

      {/* Recent sales / history modal */}
      {showHistory && (
        <RecentSalesModal
          sales={allSales}
          products={products}
          onClose={() => setShowHistory(false)}
          onModifier={handleModifier}
          onReprint={handleReprint}
        />
      )}
    </div>
  )
}
