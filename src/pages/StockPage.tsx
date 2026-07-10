import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Search, Plus, ClipboardCheck, X, ChevronDown, ChevronUp, Edit2, Settings2, Check, Trash2, Tag, RefreshCw, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { useModalShake } from '@/lib/useModalShake'
import type { Category } from '@/store/appStore'

const fmt    = (n: number) => n.toLocaleString('fr-FR')
const fmtMRU = (n: number) => n.toLocaleString('fr-FR') + ' MRU'

// ── Column config ───────────────────────────────────────────────────────────
type ColId = 'category' | 'initial' | 'added' | 'sorti' | 'dispo' | 'prix' | 'amount' | 'status'

const ALL_COLS: { id: ColId; label: string; defaultOn: boolean }[] = [
  { id: 'category', label: 'Catégorie',  defaultOn: true  },
  { id: 'initial',  label: 'Initial',    defaultOn: true  },
  { id: 'added',    label: 'Ajouté',     defaultOn: true  },
  { id: 'sorti',    label: 'Sorti',      defaultOn: true  },
  { id: 'dispo',    label: 'Disponible', defaultOn: true  },
  { id: 'prix',     label: 'Prix',       defaultOn: true  },
  { id: 'amount',   label: 'Vendu',      defaultOn: false },
  { id: 'status',   label: 'Statut',     defaultOn: true  },
]

// ── Types ───────────────────────────────────────────────────────────────────
interface Ref {
  id: string; name: string; stock: number
  initial: number; added: number; sorti: number; amount: number
  prixVente: number; prixAchat?: number
}
interface Product {
  id: string; name: string; cat: string; refs: Ref[]
  lastCount?: { qty: number; date: string; time: string }
}
interface FormRef  { id: string; name: string; prixVente: string; prixAchat: string; initial: string; sorti?: string }

// ── Constants ───────────────────────────────────────────────────────────────
const CAT_PALETTE = ['#378ADD','#1D9E75','#BA7517','#D85A30','#7F77DD','#c0392b','#0891b2','#65a30d']
function catColor(name: string, categories: Category[]): string {
  const idx = categories.findIndex(c => c.name === name)
  return CAT_PALETTE[idx >= 0 ? idx % CAT_PALETTE.length : Math.abs(name.split('').reduce((s,c)=>s+c.charCodeAt(0),0)) % CAT_PALETTE.length]
}
const newId = () => 'x' + Date.now() + Math.random().toString(36).slice(2)

function mapStoreProduct(sp: {
  id: string; name: string; category: string
  refs: { id: string; name: string; stock: number; initial?: number; added?: number; sorti?: number; amount?: number; prixVente?: number; prixAchat?: number }[]
}): Product {
  return {
    id: sp.id, name: sp.name, cat: sp.category,
    refs: sp.refs.map(r => ({
      id: r.id, name: r.name, stock: r.stock,
      initial: r.initial ?? 0, added: r.added ?? 0,
      sorti: r.sorti ?? 0, amount: r.amount ?? 0,
      prixVente: r.prixVente ?? 0, prixAchat: r.prixAchat ?? 0,
    })),
    lastCount: (sp as { lastCount?: { qty: number; date: string; time: string } }).lastCount,
  }
}

// ── Status helpers ──────────────────────────────────────────────────────────
function refTrackStatus(r: Ref): 'ok' | 'diff' {
  return r.stock === r.initial + r.added - r.sorti ? 'ok' : 'diff'
}
function productTrackStatus(p: Product): 'ok' | 'diff' {
  if (p.refs.length === 0) return 'diff'
  const totalInitial = p.refs.reduce((s, r) => s + r.initial, 0)
  const totalAdded   = p.refs.reduce((s, r) => s + r.added,   0)
  const totalSorti   = p.refs.reduce((s, r) => s + r.sorti,   0)
  const totalDispo   = p.refs.reduce((s, r) => s + r.stock,   0)
  return totalDispo === totalInitial + totalAdded - totalSorti ? 'ok' : 'diff'
}

type ColStats = { cat?: string; initial: number; added: number; sorti: number; dispo: number; prixMin: number; prixMax: number; amount: number; status: 'ok'|'diff' }

function productColStats(p: Product): ColStats {
  const prices = p.refs.map(r => r.prixVente).filter(v => v > 0)
  return {
    cat:     p.cat,
    initial: p.refs.reduce((s, r) => s + r.initial, 0),
    added:   p.refs.reduce((s, r) => s + r.added,   0),
    sorti:   p.refs.reduce((s, r) => s + r.sorti,   0),
    dispo:   p.refs.reduce((s, r) => s + r.stock,   0),
    prixMin: prices.length > 0 ? Math.min(...prices) : 0,
    prixMax: prices.length > 0 ? Math.max(...prices) : 0,
    amount:  p.refs.reduce((s, r) => s + r.amount,  0),
    status:  productTrackStatus(p),
  }
}

// ── Badges ──────────────────────────────────────────────────────────────────
function CatBadge({ cat, categories }: { cat: string; categories: Category[] }) {
  const color = catColor(cat, categories)
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white" style={{ background: color }}>
      {cat || '—'}
    </span>
  )
}

function StatusBadge({ status }: { status: 'ok'|'diff' }) {
  if (status === 'ok') return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#e8f5ee]">
      <Check size={13} strokeWidth={2.5} className="text-[#1a7a4a]" />
    </span>
  )
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#fdecea]">
      <X size={13} strokeWidth={2.5} className="text-[#c0392b]" />
    </span>
  )
}

// ── Column picker panel ─────────────────────────────────────────────────────
function ColPanel({ visible, onChange, onClose, anchorRect }: {
  visible: Set<ColId>
  onChange: (id: ColId, on: boolean) => void
  onClose: () => void
  anchorRect: DOMRect
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  const top  = anchorRect.bottom + 6
  const right = window.innerWidth - anchorRect.right

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top, right, zIndex: 9999 }}
      className="w-[220px] overflow-hidden rounded-xl border border-black/[0.1] bg-white shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-black/[0.07] bg-[#f8f7f3] px-3.5 py-2.5">
        <span className="text-[11px] font-semibold text-[#111110]">Colonnes affichées</span>
        <button onClick={onClose} className="text-[#a8a7a2] hover:text-[#111110] border-none bg-transparent cursor-pointer p-0">
          <X size={13} />
        </button>
      </div>
      {/* Column list */}
      <div className="py-1">
        {ALL_COLS.map(col => {
          const on = visible.has(col.id)
          return (
            <label
              key={col.id}
              className="flex cursor-pointer items-center justify-between px-3.5 py-2 hover:bg-[#f5f4f0] select-none"
            >
              <span className={cn('text-[12.5px]', on ? 'text-[#111110]' : 'text-[#a8a7a2]')}>{col.label}</span>
              <div
                onClick={() => onChange(col.id, !on)}
                className={cn(
                  'relative flex h-[18px] w-[32px] flex-shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150',
                  on ? 'bg-[#1a1a18]' : 'bg-[#d3d1c7]'
                )}
              >
                <span className={cn(
                  'absolute h-[12px] w-[12px] rounded-full bg-white shadow-sm transition-transform duration-150',
                  on ? 'translate-x-[17px]' : 'translate-x-[3px]'
                )} />
              </div>
            </label>
          )
        })}
      </div>
    </div>,
    document.body
  )
}

// ── Product Detail Modal ────────────────────────────────────────────────────
function ProductDetailModal({ product, categories, visible, onClose, onUpdateStock, onEdit, onVenduRef, onVendu, onDelete, onSetProductCount }: {
  product: Product
  categories: Category[]
  visible: Set<ColId>
  onClose: () => void
  onUpdateStock: (pid: string, rid: string, newStock: number) => void
  onEdit: () => void
  onVenduRef: (refId: string) => void
  onVendu: () => void
  onDelete?: () => void
  onSetProductCount: (qty: number) => void
}) {
  const [deltas, setDeltas] = useState<Record<string, number>>({})
  const [showDecompte, setShowDecompte] = useState(false)
  const [decompteInput, setDecompteInput] = useState('')

  const getDelta = (rid: string) => deltas[rid] ?? 0
  const setDelta  = (rid: string, val: number) => setDeltas(d => ({ ...d, [rid]: val }))

  const hasChanges = Object.values(deltas).some(d => d !== 0)

  function apply() {
    for (const r of product.refs) {
      const d = getDelta(r.id)
      if (d !== 0) onUpdateStock(product.id, r.id, r.stock + d)
    }
    onClose()
  }

  const refCols = ALL_COLS.filter(c => visible.has(c.id) && c.id !== 'category')
  const stats = productColStats(product)

  const { ref: shakeRef, shake } = useModalShake()

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={shake}>
      <div
        ref={shakeRef}
        className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white shadow-2xl w-full sm:w-[600px] max-h-[88vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-black/[0.08] px-6 py-5 flex-shrink-0">
          <div>
            <div className="mb-1.5">
              <CatBadge cat={product.cat} categories={categories} />
            </div>
            <div className="text-[18px] font-semibold text-[#111110]">{product.name}</div>
            <div className="mt-1 text-[12px] text-[#a8a7a2]">
              {product.refs.length} référence{product.refs.length !== 1 ? 's' : ''}
              {' · '}{fmt(stats.dispo)} disponible
              {stats.sorti > 0 && <> · <span className="text-[#c0392b]">{fmt(stats.sorti)} sorti</span></>}
              {stats.amount > 0 && <> · <span className="text-[#1a5fa8]">{fmtMRU(stats.amount)}</span></>}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={e => { e.stopPropagation(); onEdit() }}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f0efe9] border-none cursor-pointer hover:bg-[#e5e4de]" title="Modifier">
              <Edit2 size={13} className="text-[#6b6a66]" />
            </button>
            <button onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f0efe9] border-none cursor-pointer hover:bg-[#e5e4de]">
              <X size={13} className="text-[#6b6a66]" />
            </button>
          </div>
        </div>


        {/* Refs table */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {product.refs.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-[#a8a7a2]">Aucune référence</div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-black/[0.07] bg-[#f8f7f3]">
                  <th className="px-5 py-2.5 text-left font-medium text-[#6b6a66]">Référence</th>
                  {refCols.map(c => (
                    <th key={c.id} className={cn('px-4 py-2.5 font-medium text-[#6b6a66]', c.id === 'status' ? 'text-left' : 'text-right')}>
                      {c.label}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-center font-medium text-[#6b6a66]">Ajuster</th>
                </tr>
              </thead>
              <tbody>
                {product.refs.map((r, i) => {
                  const d = getDelta(r.id)
                  const newDispo = Math.max(0, r.stock + d)
                  const refStats: ColStats = {
                    initial: r.initial, added: r.added, sorti: r.sorti,
                    dispo: newDispo, amount: r.amount,
                    prixMin: r.prixVente, prixMax: r.prixVente,
                    status: refTrackStatus({ ...r, stock: newDispo }),
                  }
                  return (
                    <tr key={r.id} className={cn('border-b border-black/[0.05] last:border-0', i % 2 === 0 ? 'bg-white' : 'bg-[#fafaf8]')}>
                      <td className="px-5 py-3 font-medium text-[#111110]">{r.name}</td>
                      {refCols.map(c => (
                        <td key={c.id} className={cn('px-4 py-3', c.id === 'status' ? 'text-left' : 'text-right')}>
                          {c.id === 'category' ? <CatBadge cat={refStats.cat ?? ''} categories={categories} />
                            : c.id === 'status' ? <StatusBadge status={refStats.status} />
                            : c.id === 'amount' ? <button onClick={e => { e.stopPropagation(); onVenduRef(r.id) }} className="font-mono text-[#1a5fa8] underline decoration-dotted cursor-pointer border-none bg-transparent p-0 hover:text-[#0f4080]">{fmtMRU(refStats.amount)}</button>
                            : c.id === 'initial' ? <span className="font-mono text-[#6b6a66]">{fmt(refStats.initial)}</span>
                            : c.id === 'added' ? <span className={cn('font-mono', refStats.added < 0 ? 'text-[#c0392b]' : 'text-[#1a7a4a]')}>{refStats.added >= 0 ? '+' : ''}{fmt(refStats.added)}</span>
                            : c.id === 'sorti' ? <span className="font-mono text-[#c0392b]">{fmt(refStats.sorti)}</span>
                            : c.id === 'prix' ? (
                              refStats.prixMin > 0
                                ? <span className="font-mono text-[13px] font-medium text-[#111110]">{fmtMRU(refStats.prixMin)}</span>
                                : <span className="text-[#c0392b] text-[11px] font-medium">—</span>
                            )
                            : c.id === 'dispo' ? <span className="font-mono font-semibold text-[#111110]">{fmt(refStats.dispo)}</span>
                            : null}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setDelta(r.id, d - 1)}
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-black/[0.08] bg-[#f0efe9] cursor-pointer hover:opacity-75">
                            <ChevronDown size={11} />
                          </button>
                          <input type="number" value={d === 0 ? '' : d} placeholder="0"
                            onChange={e => setDelta(r.id, Number(e.target.value) || 0)}
                            className="w-12 rounded-md border border-black/[0.08] bg-[#f8f7f3] py-1 text-center font-mono text-[11px] outline-none" />
                          <button onClick={() => setDelta(r.id, d + 1)}
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-black/[0.08] bg-[#f0efe9] cursor-pointer hover:opacity-75">
                            <ChevronUp size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>

        {/* Saisir décompte panel */}
        {showDecompte && (
          <div className="flex-shrink-0 border-t border-black/[0.08] bg-[#f8f7f3] px-5 py-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[.6px] text-[#1a5fa8]">
              Saisir le décompte — total toutes références
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-[#6b6a66]">
                Stock système : <span className="font-mono font-semibold text-[#111110]">{product.refs.reduce((s,r)=>s+r.stock,0)} pcs</span>
              </span>
              {product.lastCount && (
                <span className="text-[11px] text-[#a8a7a2]">
                  Dernier : {product.lastCount.qty} pcs · {product.lastCount.date} {product.lastCount.time.slice(0,5)}
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input
                autoFocus
                type="number" min={0}
                placeholder="Nombre total compté…"
                value={decompteInput}
                onChange={e => setDecompteInput(e.target.value.replace(/\D/g,''))}
                onKeyDown={e => {
                  if (e.key === 'Enter' && decompteInput) {
                    onSetProductCount(parseInt(decompteInput, 10))
                    setShowDecompte(false); setDecompteInput('')
                  }
                }}
                className="w-48 rounded-[8px] border border-black/[0.08] bg-white px-3 py-2 text-center font-mono text-[14px] font-semibold outline-none focus:border-[#1a5fa8]"
              />
              <span className="text-[12px] text-[#a8a7a2]">pcs au total</span>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => { setShowDecompte(false); setDecompteInput('') }}
                  className="rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-3 py-1.5 text-[12px] cursor-pointer">
                  Annuler
                </button>
                <button
                  disabled={!decompteInput}
                  onClick={() => {
                    onSetProductCount(parseInt(decompteInput, 10))
                    setShowDecompte(false); setDecompteInput('')
                  }}
                  className="flex items-center gap-1.5 rounded-[8px] bg-[#1a5fa8] px-3 py-1.5 text-[12px] font-medium text-white cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed border-none">
                  <Check size={12}/> Valider
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-black/[0.08] px-6 py-3.5 flex-shrink-0">
          <div className="flex items-center gap-2">
            {onDelete && (
              <button onClick={onDelete}
                className="flex items-center gap-1.5 rounded-lg border border-[#c0392b] bg-[#fdecea] px-3 py-1.5 text-[13px] font-medium text-[#c0392b] cursor-pointer hover:opacity-80">
                <Trash2 size={13} />
                Supprimer
              </button>
            )}
            <button onClick={onVendu}
              className="flex items-center gap-1.5 rounded-lg border border-[#1a5fa8]/40 bg-[#e8f0fb] px-3 py-1.5 text-[13px] font-medium text-[#1a5fa8] cursor-pointer hover:opacity-80">
              <BarChart2 size={13} />
              Historique ventes
            </button>
            <button onClick={() => { setShowDecompte(v => !v); setDecompteInput('') }}
              className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium cursor-pointer hover:opacity-80 border',
                showDecompte
                  ? 'border-[#1a5fa8] bg-[#1a5fa8] text-white'
                  : 'border-[#1a5fa8]/40 bg-[#e8f0fb] text-[#1a5fa8]')}>
              <ClipboardCheck size={13}/>
              Saisir décompte
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="rounded-lg border border-black/[0.1] bg-[#f0efe9] px-4 py-1.5 text-[13px] font-medium text-[#6b6a66] cursor-pointer hover:opacity-80">
              Fermer
            </button>
            {hasChanges && (
              <button onClick={apply}
                className="rounded-lg bg-[#1a1a18] px-4 py-1.5 text-[13px] font-medium text-white cursor-pointer hover:opacity-80">
                Appliquer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Vendu History Modal ─────────────────────────────────────────────────────
function VenduModal({ product, refId, onClose }: {
  product: Product; refId?: string; onClose: () => void
}) {
  const clients         = useAppStore(s => s.clients)
  const ventesComptoir  = useAppStore(s => s.ventesComptoir)
  const { ref: shakeRef, shake } = useModalShake()

  const history = useMemo(() => {
    const refIds   = new Set(product.refs.map(r => r.id))
    const refNames = new Set(product.refs.map(r => r.name.toLowerCase()))
    // Targeted ref filter (when opened from a specific ref row)
    const targetRef = refId ? product.refs.find(r => r.id === refId) : undefined

    function lineMatchesProduct(line: { productId?: string; refId?: string; desc?: string; productName?: string }): boolean {
      if (line.productId) return line.productId === product.id
      // If refId is present, trust it exclusively — don't fall through to desc
      if (line.refId) return refIds.has(line.refId)
      // Old data fallback: productName is more reliable than ref name (product names are unique)
      if (line.productName) return line.productName.toLowerCase() === product.name.toLowerCase()
      // Last resort: match by ref name desc (very old data with no productId/refId/productName)
      if (line.desc && refNames.has(line.desc.toLowerCase())) return true
      return false
    }

    function lineMatchesRef(line: { refId?: string; desc?: string }): boolean {
      if (!targetRef) return true
      if (line.refId) return line.refId === targetRef.id
      // Fallback: desc matches ref name
      return !!line.desc && line.desc.toLowerCase() === targetRef.name.toLowerCase()
    }

    function resolveRefName(line: { refId?: string; desc?: string }): string {
      return (line.refId && product.refs.find(r => r.id === line.refId)?.name)
        ?? line.desc ?? '—'
    }

    const entries: {
      date: string; txId: string; clientName: string
      refName: string; qty: number; pu: number; total: number
      txPaid: number; txTotal: number
    }[] = []

    // Client transactions
    for (const client of clients) {
      for (const tx of client.transactions) {
        for (const line of tx.lines) {
          if (!lineMatchesProduct(line)) continue
          if (!lineMatchesRef(line)) continue
          entries.push({
            date: tx.date, txId: tx.id,
            clientName: [client.prenom, client.nom].filter(Boolean).join(' ') || '—',
            refName: resolveRefName(line),
            qty: line.qty, pu: line.pu, total: line.total,
            txPaid: tx.paid, txTotal: tx.total,
          })
        }
      }
    }

    // Anonymous (comptoir) transactions
    for (const tx of ventesComptoir) {
      for (const line of tx.lines) {
        if (!lineMatchesProduct(line)) continue
        if (!lineMatchesRef(line)) continue
        entries.push({
          date: tx.date, txId: tx.id,
          clientName: 'Vente comptoir',
          refName: resolveRefName(line),
          qty: line.qty, pu: line.pu, total: line.total,
          txPaid: tx.paid, txTotal: tx.total,
        })
      }
    }

    return entries.sort((a, b) => {
      const toIso = (d: string) => { const [dd, mm, yy] = d.split('/'); return `${yy}-${mm}-${dd}` }
      return toIso(b.date).localeCompare(toIso(a.date))
    })
  }, [clients, ventesComptoir, product, refId])

  const totalQty = history.reduce((s, e) => s + e.qty, 0)
  const totalAmt = history.reduce((s, e) => s + e.total, 0)
  const targetRefName = refId ? product.refs.find(r => r.id === refId)?.name : undefined
  const storedAmt = refId
    ? (product.refs.find(r => r.id === refId)?.amount ?? 0)
    : product.refs.reduce((s, r) => s + r.amount, 0)
  const hasGap = storedAmt > 0 && Math.abs(storedAmt - totalAmt) > 1

  // Aggregate by client (qty + amount)
  const byClient = useMemo(() => {
    const map = new Map<string, { qty: number; total: number; txCount: number }>()
    history.forEach(e => {
      const prev = map.get(e.clientName) ?? { qty: 0, total: 0, txCount: 0 }
      map.set(e.clientName, { qty: prev.qty + e.qty, total: prev.total + e.total, txCount: prev.txCount + 1 })
    })
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.qty - a.qty)
  }, [history])


  // Aggregate by date → client (same columns as global byClient but split by day)
  const byDateClient = useMemo(() => {
    const toIso = (d: string) => { const [dd, mm, yy] = d.split('/'); return `${yy}-${mm}-${dd}` }
    const dateMap = new Map<string, Map<string, { totalQty: number; paidQty: number; totalAmt: number; paidAmt: number; txCount: number }>>()
    for (const e of history) {
      if (!dateMap.has(e.date)) dateMap.set(e.date, new Map())
      const cMap = dateMap.get(e.date)!
      const ratio = e.txTotal > 0 ? Math.min(1, e.txPaid / e.txTotal) : 0
      const prev = cMap.get(e.clientName) ?? { totalQty: 0, paidQty: 0, totalAmt: 0, paidAmt: 0, txCount: 0 }
      cMap.set(e.clientName, {
        totalQty: prev.totalQty + e.qty,
        paidQty:  prev.paidQty  + e.qty   * ratio,
        totalAmt: prev.totalAmt + e.total,
        paidAmt:  prev.paidAmt  + e.total * ratio,
        txCount:  prev.txCount  + 1,
      })
    }
    return Array.from(dateMap.entries())
      .map(([date, cMap]) => ({
        date,
        clients: Array.from(cMap.entries()).map(([name, v]) => ({
          name,
          totalQty:  v.totalQty,
          paidQty:   Math.round(v.paidQty),
          unpaidQty: v.totalQty - Math.round(v.paidQty),
          totalAmt:  v.totalAmt,
          paidAmt:   Math.round(v.paidAmt),
          unpaidAmt: Math.round(v.totalAmt - v.paidAmt),
          txCount:   v.txCount,
        })).sort((a, b) => b.totalQty - a.totalQty),
      }))
      .sort((a, b) => toIso(b.date).localeCompare(toIso(a.date)))
  }, [history])

  // Aggregate by reference
  const byRef = useMemo(() => {
    const map = new Map<string, { qty: number; total: number; txCount: number }>()
    history.forEach(e => {
      const prev = map.get(e.refName) ?? { qty: 0, total: 0, txCount: 0 }
      map.set(e.refName, { qty: prev.qty + e.qty, total: prev.total + e.total, txCount: prev.txCount + 1 })
    })
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.qty - a.qty)
  }, [history])

  const [tab, setTab] = useState<'list' | 'clients' | 'payment' | 'refs' | 'decompte'>('list')

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50" onClick={shake}>
      <div ref={shakeRef} className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white shadow-2xl w-full sm:w-[640px] max-h-[90vh] sm:max-h-[88vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/[0.08] bg-[#f8f7f3] px-4 py-3 flex-shrink-0">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-[#111110] truncate">{product.name}{targetRefName ? ` · ${targetRefName}` : ''}</div>
            <div className="text-[11px] text-[#a8a7a2] mt-0.5">{history.length} vente{history.length !== 1 ? 's' : ''} · {fmt(totalQty)} pcs · {fmtMRU(totalAmt)}</div>
          </div>
          <button onClick={onClose} className="ml-2 flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0efe9] border-none cursor-pointer hover:opacity-80">
            <X size={13} className="text-[#6b6a66]" />
          </button>
        </div>

        {history.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-[#a8a7a2]">Aucune vente enregistrée</div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex flex-shrink-0 border-b border-black/[0.08] bg-white px-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {([['list', 'Transactions'], ['clients', 'Par client'], ['payment', 'Payé / Dû'], ['refs', 'Par référence'], ['decompte', 'Décompte']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)}
                  className={cn('flex-shrink-0 border-none bg-transparent px-3 py-2.5 text-[12px] font-medium cursor-pointer transition-colors whitespace-nowrap',
                    tab === key ? 'text-[#111110]' : 'text-[#a8a7a2]')}
                  style={{ borderBottom: tab === key ? '2px solid #1a1a18' : '2px solid transparent' }}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── Tab: Transactions ── */}
            {tab === 'list' && (
              <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {/* Mobile: compact cards */}
                <div className="sm:hidden flex flex-col divide-y divide-black/[0.05]">
                  {history.map((e, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 bg-white">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="rounded-md bg-[#f0efe9] px-1.5 py-0.5 font-mono text-[10px] text-[#6b6a66]">#{e.txId.slice(-6).toUpperCase()}</span>
                          <span className="text-[11px] text-[#a8a7a2]">{e.date}</span>
                        </div>
                        <div className="text-[12px] font-medium text-[#111110] truncate">{e.clientName}</div>
                        {!refId && <div className="text-[11px] text-[#a8a7a2] truncate">{e.refName}</div>}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="font-mono text-[13px] font-semibold text-[#1a5fa8]">{fmtMRU(e.total)}</div>
                        <div className="text-[11px] text-[#6b6a66]">{fmt(e.qty)} pcs · {fmtMRU(e.pu)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop: table */}
                <table className="hidden sm:table w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-black/[0.08] bg-[#f8f7f3]">
                      <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[.5px] text-[#6b6a66]">Date</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[.5px] text-[#6b6a66]">Facture</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[.5px] text-[#6b6a66]">Client</th>
                      {!refId && <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[.5px] text-[#6b6a66]">Référence</th>}
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[.5px] text-[#6b6a66]">Qté</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[.5px] text-[#6b6a66]">Prix/u</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[.5px] text-[#6b6a66]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((e, i) => (
                      <tr key={i} className={cn('border-b border-black/[0.05] last:border-0', i % 2 === 0 ? 'bg-white' : 'bg-[#fafaf8]')}>
                        <td className="px-5 py-2.5 text-[#6b6a66]">{e.date}</td>
                        <td className="px-4 py-2.5"><span className="rounded-md bg-[#f0efe9] px-1.5 py-0.5 font-mono text-[10px] text-[#6b6a66]">#{e.txId.slice(-6).toUpperCase()}</span></td>
                        <td className="px-4 py-2.5 text-[#111110]">{e.clientName}</td>
                        {!refId && <td className="px-4 py-2.5 text-[#6b6a66]">{e.refName}</td>}
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#111110]">{fmt(e.qty)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[#6b6a66]">{fmtMRU(e.pu)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-medium text-[#1a5fa8]">{fmtMRU(e.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Tab: Par client ── */}
            {tab === 'clients' && (
              <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {byClient.map((c, i) => {
                  const pct = totalQty > 0 ? Math.round(c.qty / totalQty * 100) : 0
                  return (
                    <div key={c.name} className={cn('flex items-center gap-3 border-b border-black/[0.05] px-4 py-2.5', i % 2 === 0 ? 'bg-white' : 'bg-[#fafaf8]')}>
                      <span className="w-5 flex-shrink-0 text-center text-[11px] font-semibold text-[#a8a7a2]">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="truncate text-[12px] font-medium text-[#111110]">{c.name}</span>
                          <span className="flex-shrink-0 font-mono text-[12px] font-semibold text-[#111110]">{fmt(c.qty)} pcs</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f0efe9]">
                          <div className="h-full rounded-full bg-[#1a5fa8] transition-all" style={{ width: `${pct}%` }}/>
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-[10px] text-[#a8a7a2]">{c.txCount} commande{c.txCount > 1 ? 's' : ''} · {pct}%</span>
                          <span className="font-mono text-[11px] text-[#6b6a66]">{fmtMRU(c.total)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Tab: Payé / Dû — liste par client groupée par date ── */}
            {tab === 'payment' && (
              <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {byDateClient.map(({ date, clients }) => {
                  const dayTotalQty  = clients.reduce((s, c) => s + c.totalQty,  0)
                  const dayPaidQty   = clients.reduce((s, c) => s + c.paidQty,   0)
                  const dayUnpaidQty = clients.reduce((s, c) => s + c.unpaidQty, 0)
                  const dayPaidAmt   = clients.reduce((s, c) => s + c.paidAmt,   0)
                  const dayUnpaidAmt = clients.reduce((s, c) => s + c.unpaidAmt, 0)
                  return (
                    <div key={date}>
                      {/* Date header */}
                      <div className="sticky top-0 z-10 bg-[#1a1a18] px-5 py-2">
                        <span className="text-[11px] font-bold uppercase tracking-[.6px] text-white/70">{date}</span>
                      </div>

                      {/* Client rows — mobile */}
                      <div className="sm:hidden flex flex-col divide-y divide-black/[0.05]">
                        {clients.map(c => {
                          const paidPct = c.totalQty > 0 ? Math.round(c.paidQty / c.totalQty * 100) : 100
                          return (
                            <div key={c.name} className="px-4 py-3 bg-white">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[13px] font-medium text-[#111110] truncate">{c.name}</span>
                                <span className="text-[10px] font-medium text-[#a8a7a2] flex-shrink-0 ml-2">{paidPct}%</span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#fdecea] mb-2">
                                <div className="h-full rounded-full bg-[#1a7a4a]" style={{ width: `${paidPct}%` }}/>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="rounded-[8px] bg-[#f0efe9] px-2 py-1.5">
                                  <div className="text-[9px] text-[#a8a7a2] uppercase tracking-[.5px]">Total</div>
                                  <div className="font-mono text-[12px] font-semibold text-[#111110]">{fmt(c.totalQty)}</div>
                                  <div className="font-mono text-[10px] text-[#6b6a66]">{fmtMRU(c.totalAmt)}</div>
                                </div>
                                <div className="rounded-[8px] bg-[#e8f5ee] px-2 py-1.5">
                                  <div className="text-[9px] text-[#1a7a4a] uppercase tracking-[.5px]">Payé</div>
                                  <div className="font-mono text-[12px] font-semibold text-[#1a7a4a]">{fmt(c.paidQty)}</div>
                                  <div className="font-mono text-[10px] text-[#1a7a4a]">{fmtMRU(c.paidAmt)}</div>
                                </div>
                                <div className={cn('rounded-[8px] px-2 py-1.5', c.unpaidQty > 0 ? 'bg-[#fdecea]' : 'bg-[#f0efe9]')}>
                                  <div className={cn('text-[9px] uppercase tracking-[.5px]', c.unpaidQty > 0 ? 'text-[#c0392b]' : 'text-[#a8a7a2]')}>Reste</div>
                                  <div className={cn('font-mono text-[12px] font-semibold', c.unpaidQty > 0 ? 'text-[#c0392b]' : 'text-[#a8a7a2]')}>{c.unpaidQty > 0 ? fmt(c.unpaidQty) : '—'}</div>
                                  <div className={cn('font-mono text-[10px]', c.unpaidQty > 0 ? 'text-[#c0392b]' : 'text-[#a8a7a2]')}>{c.unpaidAmt > 0 ? fmtMRU(c.unpaidAmt) : '—'}</div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Client rows — desktop */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-[12px]" style={{ minWidth: 480 }}>
                          <thead>
                            <tr className="border-b border-black/[0.08] bg-[#f8f7f3]">
                              <th className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-[.5px] text-[#6b6a66]">Client</th>
                              <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-[.5px] text-[#6b6a66]">Total pcs</th>
                              <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-[.5px] text-[#1a7a4a]">Payé pcs</th>
                              <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-[.5px] text-[#c0392b]">Reste pcs</th>
                              <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-[.5px] text-[#1a7a4a]">Payé MRU</th>
                              <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-[.5px] text-[#c0392b]">Reste MRU</th>
                            </tr>
                          </thead>
                          <tbody>
                            {clients.map((c, i) => {
                              const paidPct = c.totalQty > 0 ? Math.round(c.paidQty / c.totalQty * 100) : 100
                              return (
                                <tr key={c.name} className={cn('border-b border-black/[0.05] last:border-0', i % 2 === 0 ? 'bg-white' : 'bg-[#fafaf8]')}>
                                  <td className="px-5 py-2.5">
                                    <div className="text-[12px] font-medium text-[#111110]">{c.name}</div>
                                    <div className="mt-1 flex items-center gap-1.5">
                                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#fdecea]">
                                        <div className="h-full rounded-full bg-[#1a7a4a]" style={{ width: `${paidPct}%` }}/>
                                      </div>
                                      <span className="text-[9px] font-medium text-[#a8a7a2]">{paidPct}%</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#111110]">{fmt(c.totalQty)}</td>
                                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#1a7a4a]">{fmt(c.paidQty)}</td>
                                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#c0392b]">{c.unpaidQty > 0 ? fmt(c.unpaidQty) : '—'}</td>
                                  <td className="px-4 py-2.5 text-right font-mono text-[#1a7a4a]">{fmtMRU(c.paidAmt)}</td>
                                  <td className="px-4 py-2.5 text-right font-mono text-[#c0392b]">{c.unpaidAmt > 0 ? fmtMRU(c.unpaidAmt) : '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                          {/* Total row for this date */}
                          <tfoot>
                            <tr className="border-t-2 border-black/[0.12] bg-[#f0f0ec] font-semibold">
                              <td className="px-5 py-2 text-[11px] uppercase tracking-[.5px] text-[#6b6a66]">Total · {date}</td>
                              <td className="px-4 py-2 text-right font-mono text-[#111110]">{fmt(dayTotalQty)}</td>
                              <td className="px-4 py-2 text-right font-mono text-[#1a7a4a]">{fmt(dayPaidQty)}</td>
                              <td className="px-4 py-2 text-right font-mono text-[#c0392b]">{dayUnpaidQty > 0 ? fmt(dayUnpaidQty) : '—'}</td>
                              <td className="px-4 py-2 text-right font-mono text-[#1a7a4a]">{fmtMRU(dayPaidAmt)}</td>
                              <td className="px-4 py-2 text-right font-mono text-[#c0392b]">{dayUnpaidAmt > 0 ? fmtMRU(dayUnpaidAmt) : '—'}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )
                })}

                {/* Grand total */}
                <div className="hidden sm:flex items-center border-t-2 border-black/[0.15] bg-[#f8f7f3]">
                  <div className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-[.5px] text-[#6b6a66] w-[200px]">Total général</div>
                  <div className="flex-1 grid grid-cols-5 text-right">
                    <div className="px-4 py-2.5 font-mono font-bold text-[#111110]">{fmt(byDateClient.flatMap(d=>d.clients).reduce((s,c)=>s+c.totalQty,0))}</div>
                    <div className="px-4 py-2.5 font-mono font-bold text-[#1a7a4a]">{fmt(byDateClient.flatMap(d=>d.clients).reduce((s,c)=>s+c.paidQty,0))}</div>
                    <div className="px-4 py-2.5 font-mono font-bold text-[#c0392b]">{fmt(byDateClient.flatMap(d=>d.clients).reduce((s,c)=>s+c.unpaidQty,0))}</div>
                    <div className="px-4 py-2.5 font-mono font-bold text-[#1a7a4a]">{fmtMRU(byDateClient.flatMap(d=>d.clients).reduce((s,c)=>s+c.paidAmt,0))}</div>
                    <div className="px-4 py-2.5 font-mono font-bold text-[#c0392b]">{fmtMRU(byDateClient.flatMap(d=>d.clients).reduce((s,c)=>s+c.unpaidAmt,0))}</div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab: Par référence ── */}
            {tab === 'refs' && (
              <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {byRef.map((r, i) => {
                  const pctQty = totalQty > 0 ? (r.qty / totalQty * 100) : 0
                  return (
                    <div key={r.name} className={cn('flex items-center gap-3 border-b border-black/[0.05] px-4 py-2.5', i % 2 === 0 ? 'bg-white' : 'bg-[#fafaf8]')}>
                      <span className="w-5 flex-shrink-0 text-center text-[11px] font-semibold text-[#a8a7a2]">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="truncate text-[12px] font-medium text-[#111110]">{r.name}</span>
                          <div className="flex-shrink-0 flex items-center gap-2">
                            <span className="font-mono text-[12px] font-semibold text-[#111110]">{fmt(r.qty)} pcs</span>
                            <span className="rounded-full bg-[#e8f0fb] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#1a5fa8]">{pctQty.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f0efe9]">
                          <div className="h-full rounded-full bg-[#1a5fa8] transition-all" style={{ width: `${pctQty}%` }}/>
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-[10px] text-[#a8a7a2]">{r.txCount} commande{r.txCount > 1 ? 's' : ''} · {pctQty.toFixed(1)}% des pcs vendues</span>
                          <span className="font-mono text-[11px] text-[#6b6a66]">{fmtMRU(r.total)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Tab: Décompte ── */}
            {tab === 'decompte' && (
              <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {!product.lastCount ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-16 text-[#a8a7a2]">
                    <ClipboardCheck size={32} className="opacity-30"/>
                    <p className="text-[13px]">Aucun décompte saisi pour ce produit</p>
                    <p className="text-[11px]">Utilisez "Saisir décompte" sur la fiche produit</p>
                  </div>
                ) : (() => {
                  const lc = product.lastCount
                  const systemTotal = product.refs.reduce((s, r) => s + r.stock, 0)
                  const gap = lc.qty - systemTotal
                  const gapColor = gap === 0 ? '#1a7a4a' : gap > 0 ? '#1a5fa8' : '#c0392b'
                  const gapBg   = gap === 0 ? '#e8f5ee' : gap > 0 ? '#e8f0fb' : '#fdecea'
                  return (
                    <div className="flex flex-col gap-4 p-5">
                      {/* Main count card */}
                      <div className="rounded-[12px] border border-black/[0.08] bg-white p-5">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[.6px] text-[#a8a7a2]">Dernier décompte</div>
                        <div className="text-[12px] text-[#6b6a66]">{lc.date} · {lc.time.slice(0,5)}</div>
                        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                          <div className="rounded-[10px] bg-[#f8f7f3] px-3 py-3">
                            <div className="font-mono text-[22px] font-bold text-[#111110]">{lc.qty}</div>
                            <div className="mt-0.5 text-[10px] text-[#6b6a66]">Compté</div>
                          </div>
                          <div className="rounded-[10px] bg-[#f8f7f3] px-3 py-3">
                            <div className="font-mono text-[22px] font-bold text-[#6b6a66]">{systemTotal}</div>
                            <div className="mt-0.5 text-[10px] text-[#6b6a66]">Système</div>
                          </div>
                          <div className="rounded-[10px] px-3 py-3" style={{ background: gapBg }}>
                            <div className="font-mono text-[22px] font-bold" style={{ color: gapColor }}>{gap > 0 ? '+' : ''}{gap}</div>
                            <div className="mt-0.5 text-[10px]" style={{ color: gapColor }}>Écart</div>
                          </div>
                        </div>
                        {gap !== 0 && (
                          <div className="mt-3 rounded-[8px] px-3 py-2 text-[11px]" style={{ background: gapBg, color: gapColor }}>
                            {gap > 0
                              ? `Le décompte est supérieur au stock système de ${gap} pcs`
                              : `Le décompte est inférieur au stock système de ${Math.abs(gap)} pcs`}
                          </div>
                        )}
                      </div>
                      {/* Per-ref breakdown */}
                      <div className="rounded-[12px] border border-black/[0.08] bg-white overflow-hidden">
                        <div className="border-b border-black/[0.06] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[.6px] text-[#a8a7a2]">
                          Stock par référence (système)
                        </div>
                        {product.refs.map((r, i) => (
                          <div key={r.id} className={cn('flex items-center justify-between px-4 py-2.5 border-b border-black/[0.04] last:border-0', i % 2 === 0 ? 'bg-white' : 'bg-[#fafaf8]')}>
                            <span className="text-[12px] font-medium text-[#111110]">{r.name}</span>
                            <span className="font-mono text-[12px] text-[#6b6a66]">{r.stock} pcs</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Footer summary */}
            <div className="flex flex-shrink-0 items-center justify-between border-t border-black/[0.08] bg-[#f8f7f3] px-4 py-2.5">
              <span className="text-[11px] text-[#a8a7a2]">{history.length} tx · {fmt(totalQty)} pcs · {byClient.length} client{byClient.length > 1 ? 's' : ''}</span>
              <div className="flex items-center gap-3">
                {hasGap && <span className="text-[11px] text-[#996600]">Réel : {fmtMRU(storedAmt)}</span>}
                <span className="font-mono text-[13px] font-semibold text-[#111110]">{fmtMRU(totalAmt)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── CategoryManager modal ────────────────────────────────────────────────────
function CategoryManagerModal({ onClose }: { onClose: () => void }) {
  const { categories, addCategory, updateCategory, deleteCategory } = useAppStore()
  const [editId,    setEditId]    = useState<string | null>(null)
  const [editName,  setEditName]  = useState('')
  const [editSame,  setEditSame]  = useState(false)
  const [newName,   setNewName]   = useState('')
  const [newSame,   setNewSame]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const { ref: shakeRef, shake } = useModalShake()

  const startEdit = (c: Category) => { setEditId(c.id); setEditName(c.name); setEditSame(c.samePrice) }
  const cancelEdit = () => { setEditId(null); setEditName(''); setEditSame(false) }

  const saveEdit = async () => {
    if (!editName.trim() || !editId) return
    setSaving(true)
    await updateCategory({ id: editId, name: editName.trim(), samePrice: editSame })
    setSaving(false); cancelEdit()
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer cette catégorie ?')) return
    await deleteCategory(id)
  }

  const handleAdd = async () => {
    if (!newName.trim()) return
    setSaving(true)
    await addCategory({ name: newName.trim(), samePrice: newSame })
    setSaving(false); setNewName(''); setNewSame(false)
  }

  const toggleBtn = (on: boolean, onToggle: () => void, label: string) => (
    <button type="button" onClick={onToggle}
      className={cn('flex items-center gap-2 rounded-[8px] border px-3 py-2 text-[12px] cursor-pointer transition-all',
        on ? 'border-[#1a7a4a] bg-[#e8f5ee] text-[#1a7a4a]' : 'border-black/[0.08] bg-[#f0efe9] text-[#6b6a66] hover:border-[#a8a7a2]')}>
      <div className={cn('relative h-4 w-7 flex-shrink-0 rounded-full transition-colors', on ? 'bg-[#1a7a4a]' : 'bg-[#d3d1c7]')}>
        <div className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all', on ? 'left-[14px]' : 'left-0.5')}/>
      </div>
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50" onClick={shake}>
      <div ref={shakeRef} className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white shadow-2xl w-full sm:w-[500px] max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/[0.08] bg-[#f8f7f3] px-5 py-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Tag size={15} className="text-[#6b6a66]" />
            <span className="text-[15px] font-medium">Gérer les catégories</span>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer hover:opacity-80">
            <X size={13} className="text-[#6b6a66]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {/* Existing categories */}
          {categories.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-[#a8a7a2]">Aucune catégorie</div>
          ) : categories.map(c => (
            <div key={c.id} className="border-b border-black/[0.06] px-5 py-3">
              {editId === c.id ? (
                <div className="flex flex-col gap-2">
                  <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                    className="rounded-[8px] border border-black/[0.08] bg-[#f8f7f3] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] w-full" />
                  {toggleBtn(editSame, () => setEditSame(p => !p),
                    editSame ? 'Prix unique pour toutes les références' : 'Prix par référence')}
                  <div className="flex gap-2">
                    <button onClick={saveEdit} disabled={saving || !editName.trim()}
                      className="flex items-center gap-1 rounded-[8px] border-none bg-[#1a1a18] px-3 py-1.5 text-[12px] font-medium text-white cursor-pointer hover:opacity-90 disabled:opacity-40">
                      <Check size={12}/> Enregistrer
                    </button>
                    <button onClick={cancelEdit}
                      className="rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-3 py-1.5 text-[12px] font-medium cursor-pointer hover:opacity-80">
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: catColor(c.name, categories) }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium">{c.name}</div>
                    <div className="text-[11px] text-[#a8a7a2]">{c.samePrice ? '💰 Prix unique' : '🏷 Prix par référence'}</div>
                  </div>
                  <button onClick={() => startEdit(c)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer hover:opacity-80">
                    <Edit2 size={12} className="text-[#6b6a66]" />
                  </button>
                  <button onClick={() => handleDelete(c.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#fdecea] cursor-pointer hover:opacity-80">
                    <Trash2 size={12} className="text-[#c0392b]" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Add new */}
          <div className="border-t-2 border-dashed border-black/[0.08] px-5 py-4">
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[.6px] text-[#6b6a66]">Nouvelle catégorie</div>
            <div className="flex flex-col gap-2.5">
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Nom de la catégorie"
                className="rounded-[8px] border border-black/[0.08] bg-[#f8f7f3] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] w-full" />
              {toggleBtn(newSame, () => setNewSame(p => !p),
                newSame ? 'Prix unique pour toutes les références' : 'Prix par référence')}
              <button onClick={handleAdd} disabled={!newName.trim() || saving}
                className="flex items-center justify-center gap-1.5 rounded-[8px] border-none bg-[#1a1a18] px-3 py-2 text-[12px] font-medium text-white cursor-pointer hover:opacity-90 disabled:opacity-40">
                <Plus size={12}/> Créer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── ProductModal (create / edit) ────────────────────────────────────────────
function ProductModal({ initial, onClose, onSave }: {
  initial?: Product; onClose: () => void; onSave: (p: Product) => void
}) {
  const { categories, addCategory } = useAppStore()
  const cat = categories.find(c => c.name === (initial?.cat ?? '')) ?? null

  const [name,   setName]   = useState(initial?.name ?? '')
  const [catId,  setCatId]  = useState(cat?.id ?? '')
  const isNew = !initial
  const [refs,   setRefs]   = useState<FormRef[]>(
    initial?.refs.map(r => ({ id: r.id, name: r.name, prixVente: r.prixVente > 0 ? String(r.prixVente) : '', prixAchat: r.prixAchat && r.prixAchat > 0 ? String(r.prixAchat) : '', initial: String(r.initial), sorti: String(r.sorti ?? 0) })) ?? []
  )

  // Inline new category
  const [newCatName, setNewCatName] = useState('')
  const [newCatSame, setNewCatSame] = useState(false)
  const [savingCat,  setSavingCat]  = useState(false)

  const selectedCat = categories.find(c => c.id === catId) ?? null
  const isSamePrice = selectedCat?.samePrice ?? false

  // Shared prices for samePrice mode
  const firstRefPv = initial?.refs[0]?.prixVente ?? 0
  const firstRefPa = initial?.refs[0]?.prixAchat ?? 0
  const [sharedPrix,  setSharedPrix]  = useState(firstRefPv > 0 ? String(firstRefPv) : '')
  const [sharedAchat, setSharedAchat] = useState(firstRefPa > 0 ? String(firstRefPa) : '')

  const addRef    = () => setRefs(rs => [...rs, { id: newId(), name: '', prixVente: '', prixAchat: '', initial: '' }])
  const updateRef = (id: string, field: keyof FormRef, v: string) =>
    setRefs(rs => rs.map(r => r.id === id ? { ...r, [field]: v } : r))
  const removeRef = (id: string) => setRefs(rs => rs.filter(r => r.id !== id))

  const handleCreateCat = async () => {
    if (!newCatName.trim()) return
    setSavingCat(true)
    const id = await addCategory({ name: newCatName.trim(), samePrice: newCatSame })
    setCatId(id); setNewCatName(''); setNewCatSame(false)
    setSavingCat(false)
  }

  const namedRefs = refs.filter(r => r.name.trim())
  const canSave = name.trim() !== '' && selectedCat !== null &&
    namedRefs.length > 0 &&
    (!isNew || namedRefs.every(r => r.initial.trim() !== '')) &&
    (isSamePrice
      ? sharedPrix.trim() !== '' && parseFloat(sharedPrix) > 0 && sharedAchat.trim() !== '' && parseFloat(sharedAchat) > 0
      : namedRefs.every(r => r.prixVente.trim() !== '' && parseFloat(r.prixVente) > 0 && r.prixAchat.trim() !== '' && parseFloat(r.prixAchat) > 0))

  function handleSave() {
    if (!canSave) return
    const pv = isSamePrice ? (parseFloat(sharedPrix) || 0) : 0
    const pa = isSamePrice ? (parseFloat(sharedAchat) || 0) : 0
    onSave({
      id: initial?.id ?? newId(), name: name.trim(), cat: selectedCat!.name,
      refs: refs.filter(r => r.name.trim()).map(r => {
        const ex  = initial?.refs.find(ir => ir.id === r.id)
        const rpv = isSamePrice ? pv : (parseFloat(r.prixVente) || ex?.prixVente || 0)
        const rpa = isSamePrice ? pa : (parseFloat(r.prixAchat) || ex?.prixAchat || 0)
        const initQty = isNew ? (parseInt(r.initial) || 0) : (ex?.initial ?? 0)
        const newSorti = isNew ? 0 : (r.sorti !== undefined ? (parseInt(r.sorti) || 0) : (ex?.sorti ?? 0))
        const newStock = isNew ? initQty : Math.max(0, (ex?.initial ?? 0) + (ex?.added ?? 0) - newSorti)
        return {
          id: r.id, name: r.name.trim(),
          stock: newStock,
          initial: initQty,
          added: ex?.added ?? 0, sorti: newSorti,
          amount: ex?.amount ?? 0, prixVente: rpv, prixAchat: rpa,
        }
      }),
    })
    onClose()
  }

  const inCls = "rounded-[8px] border border-black/[0.08] bg-[#f8f7f3] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white"
  const { ref: shakeRef, shake } = useModalShake()

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40" onClick={shake}>
      <div ref={shakeRef} className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white shadow-2xl w-full sm:w-[560px] max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/[0.08] px-6 py-4 flex-shrink-0">
          <div className="text-[16px] font-semibold">{initial ? 'Modifier le produit' : 'Nouveau produit'}</div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0efe9] border-none cursor-pointer hover:opacity-80"><X size={13} className="text-[#6b6a66]" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4" style={{ scrollbarWidth: 'thin' }}>

          {/* Nom + catégorie */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-[#6b6a66]">Nom du produit</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="ex: Coques iPhone 15" className={cn(inCls, 'w-full')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-[#6b6a66]">Catégorie</label>
              <select value={catId} onChange={e => setCatId(e.target.value)} className={cn(inCls, 'w-full cursor-pointer')}>
                <option value="">Choisir...</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name} — {c.samePrice ? 'prix unique' : 'prix par réf.'}</option>
                ))}
                <option value="__new__">+ Créer une catégorie...</option>
              </select>
              {selectedCat && (
                <div className={cn('rounded-[7px] px-2.5 py-1.5 text-[11px] font-medium',
                  isSamePrice ? 'bg-[#e8f5ee] text-[#1a7a4a]' : 'bg-[#e8f0fb] text-[#1a5fa8]')}>
                  {isSamePrice ? '💰 Prix unique — un seul prix pour toutes les références' : '🏷 Prix individuel par référence'}
                </div>
              )}
              {catId === '__new__' && (
                <div className="rounded-[9px] border border-black/[0.08] bg-[#f8f7f3] p-3 flex flex-col gap-2">
                  <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                    placeholder="Nom de la catégorie" autoFocus
                    className="rounded-[7px] border border-black/[0.08] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] w-full" />
                  <button type="button" onClick={() => setNewCatSame(p => !p)}
                    className={cn('flex items-center gap-2 rounded-[7px] border px-3 py-2 text-[11px] cursor-pointer transition-all',
                      newCatSame ? 'border-[#1a7a4a] bg-[#e8f5ee] text-[#1a7a4a]' : 'border-black/[0.08] bg-white text-[#6b6a66]')}>
                    <div className={cn('relative h-4 w-7 flex-shrink-0 rounded-full transition-colors', newCatSame ? 'bg-[#1a7a4a]' : 'bg-[#d3d1c7]')}>
                      <div className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all', newCatSame ? 'left-[14px]' : 'left-0.5')}/>
                    </div>
                    {newCatSame ? 'Prix unique' : 'Prix par référence'}
                  </button>
                  <button onClick={handleCreateCat} disabled={!newCatName.trim() || savingCat}
                    className="flex items-center justify-center gap-1 rounded-[7px] border-none bg-[#1a1a18] px-3 py-1.5 text-[12px] font-medium text-white cursor-pointer hover:opacity-90 disabled:opacity-40">
                    <Check size={11}/> {savingCat ? 'Création...' : 'Créer'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Prix uniques (samePrice) */}
          {isSamePrice && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 rounded-[10px] border border-[#1a7a4a]/30 bg-[#e8f5ee]/50 px-4 py-3">
                <span className="flex-1 text-[13px] font-medium text-[#1a7a4a]">Prix de vente unique</span>
                <div className="flex items-center gap-1.5">
                  <input type="number" min={0} placeholder="0" value={sharedPrix}
                    onChange={e => setSharedPrix(e.target.value)}
                    className="w-28 rounded-[8px] border border-[#1a7a4a]/40 bg-white px-2.5 py-1.5 text-right font-mono text-[14px] outline-none focus:border-[#1a7a4a]" />
                  <span className="text-[12px] font-medium text-[#1a7a4a]">MRU / u</span>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-[10px] border border-[#ea580c]/30 bg-[#fff7ed] px-4 py-3">
                <span className="flex-1 text-[13px] font-medium text-[#ea580c]">Prix d'achat unique *</span>
                <div className="flex items-center gap-1.5">
                  <input type="number" min={0} placeholder="0" value={sharedAchat}
                    onChange={e => setSharedAchat(e.target.value)}
                    className={cn('w-28 rounded-[8px] border bg-white px-2.5 py-1.5 text-right font-mono text-[14px] outline-none',
                      sharedAchat === '' || parseFloat(sharedAchat) <= 0
                        ? 'border-[#f0a500] focus:border-[#ea580c]'
                        : 'border-[#ea580c]/40 focus:border-[#ea580c]')} />
                  <span className="text-[12px] font-medium text-[#ea580c]">MRU / u</span>
                </div>
              </div>
            </div>
          )}

          {/* Références */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-medium uppercase tracking-wide text-[#6b6a66]">Références</div>
              <button onClick={addRef} className="flex items-center gap-1 rounded-lg bg-[#1a1a18] px-3 py-1 text-[11px] font-medium text-white cursor-pointer hover:opacity-80">
                <Plus size={11} /> Ajouter
              </button>
            </div>
            {refs.length === 0 && (
              <div className="rounded-xl border border-dashed border-black/[0.12] py-6 text-center text-[12px] text-[#a8a7a2]">Aucune référence</div>
            )}
            <div className="overflow-x-auto">
            {refs.length > 0 && (
              <div className="mb-1 grid gap-2 px-3 text-[10px] font-medium uppercase tracking-wide text-[#a8a7a2]"
                style={{ gridTemplateColumns: '1fr' + (isNew ? ' 76px' : ' 76px') + (!isSamePrice ? ' 100px 100px' : '') + ' 28px' }}>
                <span>Référence</span>
                <span className="text-right">{isNew ? 'Qté init.' : 'Sorti'}</span>
                {!isSamePrice && <><span className="text-right">P. vente</span><span className="text-right">P. achat</span></>}
                <span />
              </div>
            )}
            <div className="flex flex-col gap-2">
              {refs.map((r, i) => (
                <div key={r.id} className="grid items-center gap-2 rounded-xl border border-black/[0.08] bg-[#f8f7f3] px-3 py-2.5"
                  style={{ gridTemplateColumns: '1fr 76px' + (!isSamePrice ? ' 100px 100px' : '') + ' 28px' }}>
                  <input value={r.name} onChange={e => updateRef(r.id, 'name', e.target.value)} placeholder={`Référence ${i + 1}`}
                    className="rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-[#1a1a18]" />
                  {isNew ? (
                    <input type="number" min={0} placeholder="Qté*" value={r.initial}
                      onChange={e => updateRef(r.id, 'initial', e.target.value)}
                      className={cn('w-full rounded-lg border bg-white px-2 py-1.5 text-right font-mono text-[12px] outline-none',
                        r.initial.trim() === '' ? 'border-[#f0a500] focus:border-[#f0a500]' : 'border-black/[0.08] focus:border-[#1a1a18]')} />
                  ) : (
                    <input type="number" min={0} value={r.sorti ?? '0'}
                      onChange={e => updateRef(r.id, 'sorti', e.target.value)}
                      title="Sorti cumulé — modifie aussi le stock disponible"
                      className="w-full rounded-lg border border-[#c0392b]/30 bg-[#fdecea] px-2 py-1.5 text-right font-mono text-[12px] text-[#c0392b] outline-none focus:border-[#c0392b]" />
                  )}
                  {!isSamePrice && (
                    <>
                      <div className="flex items-center gap-0.5">
                        <input type="number" min={0} placeholder="Vente*" value={r.prixVente}
                          onChange={e => updateRef(r.id, 'prixVente', e.target.value)}
                          className={cn('w-full rounded-lg border bg-white px-2 py-1.5 text-right font-mono text-[12px] outline-none',
                            r.prixVente.trim() === '' || parseFloat(r.prixVente) <= 0
                              ? 'border-[#f0a500] focus:border-[#f0a500]'
                              : 'border-black/[0.08] focus:border-[#1a5fa8]')} />
                      </div>
                      <div className="flex items-center gap-0.5">
                        <input type="number" min={0} placeholder="Achat*" value={r.prixAchat}
                          onChange={e => updateRef(r.id, 'prixAchat', e.target.value)}
                          className={cn('w-full rounded-lg border bg-white px-2 py-1.5 text-right font-mono text-[12px] outline-none',
                            r.prixAchat.trim() === '' || parseFloat(r.prixAchat) <= 0
                              ? 'border-[#f0a500] focus:border-[#f0a500]'
                              : 'border-black/[0.08] focus:border-[#ea580c]')} />
                      </div>
                    </>
                  )}
                  <button onClick={() => removeRef(r.id)} className="flex h-6 w-6 items-center justify-center rounded-md bg-[#fdecea] cursor-pointer hover:opacity-80 border-none">
                    <X size={11} className="text-[#c0392b]" />
                  </button>
                </div>
              ))}
            </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-black/[0.08] px-6 py-3.5 flex-shrink-0">
          <button onClick={onClose} className="rounded-lg border border-black/[0.08] bg-[#f0efe9] px-4 py-1.5 text-[13px] font-medium text-[#6b6a66] cursor-pointer hover:opacity-80">Annuler</button>
          <button onClick={handleSave} disabled={!canSave}
            className="rounded-lg bg-[#1a1a18] px-4 py-1.5 text-[13px] font-medium text-white cursor-pointer hover:opacity-80 disabled:opacity-40">
            {initial ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── InventoryModal ──────────────────────────────────────────────────────────
function InventoryModal({ products, categories, onClose, onUpdateStock }: {
  products: Product[]; categories: Category[]; onClose: () => void
  onUpdateStock: (pid: string, rid: string, newStock: number) => void
}) {
  const [values, setValues] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const p of products) for (const r of p.refs) m[`${p.id}__${r.id}`] = r.stock
    return m
  })

  function handleApply() {
    for (const p of products) for (const r of p.refs) {
      const key = `${p.id}__${r.id}`
      const newStock = values[key] ?? r.stock
      if (newStock !== r.stock) onUpdateStock(p.id, r.id, newStock)
    }
    onClose()
  }

  const { ref: shakeRef, shake } = useModalShake()

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={shake}>
      <div ref={shakeRef} className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white shadow-2xl w-full sm:w-[580px] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/[0.08] px-6 py-4 flex-shrink-0">
          <div>
            <div className="text-[16px] font-semibold text-[#111110]">Inventaire</div>
            <div className="text-[12px] text-[#a8a7a2] mt-0.5">Saisir le stock physique actuel</div>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0efe9] border-none cursor-pointer hover:opacity-80"><X size={13} className="text-[#6b6a66]" /></button>
        </div>
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {products.map(p => (
            <div key={p.id}>
              <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-black/[0.06] bg-[#f8f7f3] px-5 py-2">
                <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ background: catColor(p.cat, categories) }}>{p.cat}</span>
                <span className="text-[12px] font-medium text-[#6b6a66]">{p.name}</span>
              </div>
              {p.refs.map(r => {
                const key = `${p.id}__${r.id}`
                const val = values[key] ?? r.stock
                return (
                  <div key={r.id} className="flex items-center justify-between border-b border-black/[0.05] px-6 py-3">
                    <div>
                      <div className="text-[13px] font-medium text-[#111110]">{r.name}</div>
                      <div className="text-[11px] text-[#a8a7a2]">Actuel : {fmt(r.stock)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setValues(v => ({ ...v, [key]: Math.max(0, (v[key] ?? r.stock) - 1) }))}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/[0.08] bg-[#f0efe9] cursor-pointer hover:opacity-80"><ChevronDown size={13} /></button>
                      <input type="number" value={val} onChange={e => setValues(v => ({ ...v, [key]: Math.max(0, Number(e.target.value)) }))}
                        className="w-16 rounded-lg border border-black/[0.08] bg-[#f8f7f3] px-2 py-1 text-center font-mono text-[13px] outline-none" />
                      <button onClick={() => setValues(v => ({ ...v, [key]: (v[key] ?? r.stock) + 1 }))}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/[0.08] bg-[#f0efe9] cursor-pointer hover:opacity-80"><ChevronUp size={13} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-black/[0.08] px-6 py-3.5 flex-shrink-0">
          <button onClick={onClose} className="rounded-lg border border-black/[0.08] bg-[#f0efe9] px-4 py-1.5 text-[13px] font-medium text-[#6b6a66] cursor-pointer hover:opacity-80">Annuler</button>
          <button onClick={handleApply} className="rounded-lg bg-[#1a1a18] px-4 py-1.5 text-[13px] font-medium text-white cursor-pointer hover:opacity-80">Appliquer</button>
        </div>
      </div>
    </div>
  )
}

// ── Main StockPage ──────────────────────────────────────────────────────────
export function StockPage() {
  const storeProducts  = useAppStore(s => s.products)
  const loaded         = useAppStore(s => s.loaded)
  const categories     = useAppStore(s => s.categories)
  const addProduct     = useAppStore(s => s.addProduct)
  const updateProduct  = useAppStore(s => s.updateProduct)
  const deleteProduct  = useAppStore(s => s.deleteProduct)
  const updateStockRef            = useAppStore(s => s.updateStockRef)
  const setProductCount           = useAppStore(s => s.setProductCount)
  const recalculateStockFromSortie = useAppStore(s => s.recalculateStockFromSortie)
  const cashMvts       = useAppStore(s => s.cashMvts)
  const ventesComptoir = useAppStore(s => s.ventesComptoir)
  const clients        = useAppStore(s => s.clients)
  const appUser        = useAuthStore(s => s.appUser)
  const isOwner        = appUser?.role === 'owner'

  const [syncing, setSyncing] = useState(false)
  const [syncConfirm, setSyncConfirm] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const products: Product[] = useMemo(() => (storeProducts ?? []).map(mapStoreProduct), [storeProducts])

  const [search,        setSearch]       = useState('')
  const [catFilter,     setCatFilter]    = useState('all')
  const [statusFilter,  setStatusFilter] = useState<'all'|'ok'|'diff'>('all')
  const [kpiOpen,       setKpiOpen]      = useState(false)
  const [detailModal,   setDetailModal]  = useState<Product | null>(null)

  // Keep detailModal in sync with the store so lastCount/stock updates appear immediately
  useEffect(() => {
    if (!detailModal) return
    const updated = products.find(p => p.id === detailModal.id)
    if (updated) setDetailModal(updated)
  }, [products]) // eslint-disable-line react-hooks/exhaustive-deps
  const [productModal,  setProductModal] = useState<{ product?: Product } | null>(null)
  const [showInventory, setShowInventory] = useState(false)
  const [showColPanel,  setShowColPanel] = useState(false)
  const colBtnRef = useRef<HTMLButtonElement>(null)
  const [showCatManager, setShowCatManager] = useState(false)
  const [venduModal, setVenduModal] = useState<{ product: Product; refId?: string } | null>(null)

  const [visibleCols, setVisibleCols] = useState<Set<ColId>>(
    () => new Set(ALL_COLS.filter(c => c.defaultOn).map(c => c.id))
  )
  const toggleCol = (id: ColId, on: boolean) =>
    setVisibleCols(prev => { const n = new Set(prev); on ? n.add(id) : n.delete(id); return n })

  const allCats = useMemo(() => categories.map(c => c.name), [categories])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return products.filter(p => {
      if (catFilter !== 'all' && p.cat !== catFilter) return false
      if (statusFilter !== 'all') {
        const s = productTrackStatus(p)
        if (statusFilter === 'ok'   && s !== 'ok')   return false
        if (statusFilter === 'diff' && s !== 'diff')  return false
      }
      if (q && !p.name.toLowerCase().includes(q) && !p.cat.toLowerCase().includes(q)) return false
      return true
    }).sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
  }, [products, search, catFilter, statusFilter])

  const totalDispo  = useMemo(() => products.reduce((s, p) => s + p.refs.reduce((sr, r) => sr + r.stock, 0), 0), [products])
  const totalSorti  = useMemo(() => products.reduce((s, p) => s + p.refs.reduce((sr, r) => sr + r.sorti, 0), 0), [products])
  const nok         = useMemo(() => products.filter(p => productTrackStatus(p) === 'diff').length, [products])
  const valeurStock = useMemo(() => products.reduce((s, p) => s + p.refs.reduce((sr, r) => sr + r.stock * (r.prixAchat ?? 0), 0), 0), [products])

  const beneficeSession = useMemo(() => {
    // Parse DD/MM/YYYY HH:MM → timestamp
    const parseTs = (date: string, time: string) => {
      const [d, m, y] = date.split('/')
      return new Date(`${y}-${m}-${d}T${time || '00:00'}:00`).getTime()
    }
    // Find last ouverture
    const lastOuv = [...cashMvts]
      .sort((a, b) => parseTs(b.date, b.time) - parseTs(a.date, a.time))
      .find(m => m.type === 'ouverture')
    if (!lastOuv) return null
    const sessionStart = parseTs(lastOuv.date, lastOuv.time)

    // All vente cashMvts in current session
    const sessionVentes = cashMvts.filter(m =>
      m.type === 'vente' && parseTs(m.date, m.time) >= sessionStart
    )

    // Build lookup maps
    const allTxs = [...ventesComptoir, ...clients.flatMap(c => c.transactions)]
    const txMap = new Map(allTxs.map(tx => [tx.id, tx]))
    const refCostMap = new Map<string, number>()
    for (const p of products) for (const r of p.refs) refCostMap.set(r.id, r.prixAchat ?? 0)

    return sessionVentes.reduce((total, mvt) => {
      const match = mvt.desc.match(/Vente\s+(F-\S+)/)
      if (!match) return total + mvt.montant
      const tx = txMap.get(match[1])
      if (!tx) return total + mvt.montant
      return total + tx.lines.reduce((s, l) => {
        const cost = l.refId ? (refCostMap.get(l.refId) ?? 0) : 0
        return s + (l.pu - cost) * l.qty
      }, 0)
    }, 0)
  }, [cashMvts, ventesComptoir, clients, products])

  function updateStock(pid: string, rid: string, newStock: number) {
    const p = products.find(x => x.id === pid); if (!p) return
    const r = p.refs.find(x => x.id === rid);   if (!r) return
    updateStockRef(pid, rid, newStock - r.stock)
  }

  function handleSaveProduct(p: Product) {
    const isExisting = products.some(x => x.id === p.id)
    const storeP = { id: p.id, name: p.name, category: p.cat, refs: p.refs }
    if (isExisting) updateProduct(storeP); else addProduct(storeP)
    if (detailModal?.id === p.id) setDetailModal(p)
    // Reset filters so the new/updated product is always visible
    if (!isExisting) {
      setCatFilter('all')
      setStatusFilter('all')
    }
  }

  function handleDeleteProduct(p: Product) {
    if (!window.confirm(`Supprimer "${p.name}" définitivement ?`)) return
    setDetailModal(null)
    deleteProduct(p.id)
  }

  const visColList = ALL_COLS.filter(c => visibleCols.has(c.id))

  if (!loaded) return <div className="flex h-full items-center justify-center text-[#a8a7a2] text-[13px]">Chargement…</div>

  return (
    <div className="flex h-full flex-col bg-[#f5f4f0]">

      {/* ── Top bar ── */}
      <div className="flex flex-col border-b border-black/[0.08] bg-white px-4 md:px-8 py-3 md:py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[18px] md:text-[22px] font-semibold text-[#111110]">Stock</div>
            <div className="text-[12px] text-[#a8a7a2] mt-0.5">{products.length} produit{products.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="flex items-center gap-2">
            {isOwner && (
              <button
                disabled={syncing}
                onClick={() => setSyncConfirm(true)}
                className="flex items-center gap-1.5 rounded-lg border border-[#1a5fa8]/30 bg-[#e8f0fb] px-3 py-1.5 text-[12px] font-medium text-[#1a5fa8] cursor-pointer hover:opacity-80 disabled:opacity-50">
                <RefreshCw size={13} className={syncing ? 'animate-spin' : ''}/> Sync sorties
              </button>
            )}
            <button onClick={() => setShowCatManager(true)}
              className="hidden sm:flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b6a66] cursor-pointer hover:border-black/[0.2]">
              <Tag size={13} /> Catégories
            </button>
            <button onClick={() => setShowInventory(true)}
              className="hidden sm:flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b6a66] cursor-pointer hover:border-black/[0.2]">
              <ClipboardCheck size={13} /> Inventaire
            </button>
            <button onClick={() => setProductModal({})}
              className="flex items-center gap-1.5 rounded-lg bg-[#1a1a18] px-3 py-1.5 text-[12px] font-medium text-white cursor-pointer hover:opacity-85">
              <Plus size={13} /> <span className="hidden sm:inline">Nouveau produit</span><span className="sm:hidden">Nouveau</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── KPIs — desktop grid ── */}
      <div className="hidden sm:grid sm:grid-cols-5 gap-3 px-4 md:px-8 py-4 flex-shrink-0">
        {[
          { label: 'Disponible',  value: fmt(totalDispo),                                       sub: 'unités en stock',     cls: 'kpi-blue',  color: '#1a5fa8' },
          { label: 'Total vendu', value: fmt(totalSorti),                                       sub: 'unités vendues',      cls: 'kpi-amber', color: '#996600' },
          { label: 'Valeur',      value: fmt(valeurStock),                                      sub: 'montant achat stock', cls: 'kpi-green', color: '#1a7a4a' },
          { label: 'Bénéfice',    value: beneficeSession !== null ? fmt(beneficeSession) : '—', sub: 'session en cours',    cls: beneficeSession !== null && beneficeSession >= 0 ? 'kpi-green' : 'kpi-red', color: beneficeSession !== null && beneficeSession >= 0 ? '#1a7a4a' : '#c0392b' },
          { label: 'NOK',         value: String(nok),                                           sub: 'écarts détectés',     cls: nok > 0 ? 'kpi-red' : 'kpi-blue', color: nok > 0 ? '#c0392b' : '#1a5fa8' },
        ].map(s => (
          <div key={s.label} className={`${s.cls} px-4 py-3`}>
            <div className="text-[10px] font-bold uppercase tracking-[.6px]" style={{ color: s.color }}>{s.label}</div>
            <div className="mt-1 font-mono text-[20px] md:text-[24px] font-bold leading-none" style={{ color: s.color }}>{s.value}</div>
            <div className="mt-1 text-[11px] text-[#a8a7a2]">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── KPIs — mobile collapsible ── */}
      <div className="sm:hidden flex-shrink-0 border-b border-black/[0.08]">
        <button
          onClick={() => setKpiOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2 border-none cursor-pointer"
          style={{ background: 'linear-gradient(135deg,#f0f4ff 0%,#e8f0fb 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="text-left">
              <div className="text-[9px] font-bold uppercase tracking-[.6px] text-[#1a5fa8]">Disponible</div>
              <div className="font-mono text-[15px] font-bold leading-none text-[#1a5fa8]">{fmt(totalDispo)} <span className="text-[10px] font-normal text-[#a8a7a2]">u.</span></div>
            </div>
            <div className="h-6 w-px bg-black/[0.1]"/>
            <div className="text-left">
              <div className="text-[9px] font-bold uppercase tracking-[.6px] text-[#996600]">Valeur</div>
              <div className="font-mono text-[15px] font-bold leading-none text-[#996600]">{fmt(valeurStock)} <span className="text-[10px] font-normal text-[#a8a7a2]">MRU</span></div>
            </div>
            {nok > 0 && <>
              <div className="h-6 w-px bg-black/[0.1]"/>
              <div className="text-left">
                <div className="text-[9px] font-bold uppercase tracking-[.6px] text-[#c0392b]">NOK</div>
                <div className="font-mono text-[15px] font-bold leading-none text-[#c0392b]">{nok}</div>
              </div>
            </>}
          </div>
          <svg className={`h-3.5 w-3.5 text-[#a8a7a2] flex-shrink-0 transition-transform ${kpiOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6,9 12,15 18,9"/></svg>
        </button>
        {kpiOpen && (
          <div className="px-3 pb-3 pt-1 flex flex-col gap-2" style={{ background: 'linear-gradient(135deg,#f0f4ff 0%,#e8f0fb 100%)' }}>
            {[
              { label: 'Disponible',  value: fmt(totalDispo),                                       sub: 'unités en stock',     color: '#1a5fa8' },
              { label: 'Total vendu', value: fmt(totalSorti),                                       sub: 'unités vendues',      color: '#996600' },
              { label: 'Valeur',      value: fmt(valeurStock),                                      sub: 'montant achat stock', color: '#1a7a4a' },
              { label: 'Bénéfice',    value: beneficeSession !== null ? fmt(beneficeSession) : '—', sub: 'session en cours',    color: beneficeSession !== null && beneficeSession >= 0 ? '#1a7a4a' : '#c0392b' },
              { label: 'NOK',         value: String(nok),                                           sub: 'écarts détectés',     color: nok > 0 ? '#c0392b' : '#1a5fa8' },
            ].map(k => (
              <div key={k.label} className="flex items-center justify-between rounded-[10px] bg-white/70 px-3 py-2.5" style={{ border: '1px solid rgba(200,175,100,0.18)' }}>
                <div className="text-[12px] font-medium text-[#6b6a66]">{k.label}</div>
                <div className="text-right">
                  <div className="font-mono text-[14px] font-bold leading-none" style={{ color: k.color }}>{k.value}</div>
                  <div className="text-[9px] text-[#a8a7a2] mt-0.5">{k.sub}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-shrink-0 flex-col border-b border-black/[0.08] bg-white">
        {/* Row 1 — mobile selects + search (always visible) */}
        <div className="flex items-center gap-2 px-3 py-2">
          {/* Category — select on mobile only */}
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="sm:hidden rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2 py-1.5 text-[12px] font-medium outline-none text-[#1a1a18]">
            <option value="all">Toutes catégories</option>
            {allCats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {/* Status — select on mobile only */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all'|'ok'|'diff')}
            className="sm:hidden rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2 py-1.5 text-[12px] font-medium outline-none text-[#1a1a18]">
            <option value="all">Tous statuts</option>
            <option value="ok">✓ OK</option>
            <option value="diff">✕ NOK</option>
          </select>
          {/* Desktop status pills */}
          <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
            {([['all','Tous statuts'],['ok','✓ OK'],['diff','✕ NOK']] as [string,string][]).map(([v, l]) => (
              <button key={v} onClick={() => setStatusFilter(v as 'all'|'ok'|'diff')}
                className={cn('flex-shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium cursor-pointer border transition-colors',
                  statusFilter === v ? 'bg-[#1a1a18] text-white border-[#1a1a18]' : 'bg-white text-[#6b6a66] border-black/[0.08] hover:bg-[#f0efe9]')}>
                {l}
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="flex flex-1 items-center gap-1.5 rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 ml-auto max-w-[180px]">
            <Search size={12} className="flex-shrink-0 text-[#a8a7a2]"/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Chercher…"
              className="w-full bg-transparent text-[12px] outline-none placeholder:text-[#a8a7a2]"/>
          </div>
        </div>
        {/* Row 2 — desktop category pills (scrollable) */}
        {allCats.length > 0 && (
          <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto px-3 pb-2" style={{ scrollbarWidth: 'none' }}>
            <button onClick={() => setCatFilter('all')}
              className={cn('flex-shrink-0 rounded-full px-3 py-1 text-[12px] font-medium cursor-pointer border transition-colors',
                catFilter === 'all' ? 'bg-[#1a1a18] text-white border-[#1a1a18]' : 'bg-white text-[#6b6a66] border-black/[0.08] hover:bg-[#f0efe9]')}>
              Tous
            </button>
            {allCats.map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                className={cn('flex-shrink-0 rounded-full px-3 py-1 text-[12px] font-medium cursor-pointer border transition-colors',
                  catFilter === c ? 'text-white border-transparent' : 'bg-white text-[#6b6a66] border-black/[0.08] hover:bg-[#f0efe9]')}
                style={catFilter === c ? { backgroundColor: catColor(c, categories) } : {}}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-auto pb-8" style={{ background: 'linear-gradient(180deg,#eef5ff 0%,#f5f9ff 100%)', scrollbarWidth: 'thin' }}>
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-black/[0.1] bg-white mx-4 mt-4 py-24 text-center">
            <div className="mb-3 text-[40px] opacity-15">📦</div>
            <div className="text-[15px] font-medium text-[#6b6a66]">Aucun produit</div>
            <div className="mt-1.5 text-[12px] text-[#a8a7a2]">Les produits apparaissent automatiquement à la réception des commandes</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-[#a8a7a2]">Aucun produit ne correspond aux filtres</div>
        ) : (<>

          {/* ── MOBILE cards ── */}
          <div className="sm:hidden flex flex-col gap-2 px-3 py-3">
            {filtered.map(p => {
              const stats  = productColStats(p)
              const color  = catColor(p.cat, categories)
              const isLow  = stats.dispo <= 5 && stats.dispo > 0
              const isOut  = stats.dispo === 0
              return (
                <div key={p.id}
                  className="relative flex items-center gap-3 rounded-[12px] border border-black/[0.07] bg-white px-3.5 py-3 cursor-pointer active:scale-[0.99] transition-transform"
                  onClick={() => setDetailModal(p)}>
                  {/* Color dot */}
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] text-[12px] font-bold text-white"
                    style={{ background: color }}>
                    {p.name.slice(0, 1).toUpperCase()}
                  </div>
                  {/* Name + category */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-[#111110] truncate">{p.name}</div>
                    <span className="mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                      style={{ background: color }}>
                      {p.cat}
                    </span>
                  </div>
                  {/* Stock info */}
                  <div className="flex-shrink-0 text-right">
                    <div className={cn('font-mono text-[15px] font-bold leading-none',
                      isOut ? 'text-[#c0392b]' : isLow ? 'text-[#996600]' : 'text-[#111110]')}>
                      {fmt(stats.dispo)}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#a8a7a2]">/{fmt(stats.initial)} init.</div>
                    {isOut && <div className="mt-0.5 text-[9px] font-medium text-[#c0392b]">Rupture</div>}
                    {isLow && !isOut && <div className="mt-0.5 text-[9px] font-medium text-[#996600]">Stock bas</div>}
                  </div>
                  {/* Price */}
                  <div className="flex-shrink-0 text-right border-l border-black/[0.07] pl-3">
                    <div className="text-[12px] font-semibold text-[#111110]">
                      {stats.prixMin === stats.prixMax
                        ? fmtMRU(stats.prixMin)
                        : `${fmt(stats.prixMin)}–${fmtMRU(stats.prixMax)}`}
                    </div>
                    <div className="text-[10px] text-[#a8a7a2]">prix</div>
                  </div>
                  {/* Vendu shortcut */}
                  <button
                    onClick={e => { e.stopPropagation(); setVenduModal({ product: p }) }}
                    className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-[9px] border border-[#1a5fa8]/30 bg-[#e8f0fb] border-none cursor-pointer">
                    <BarChart2 size={14} className="text-[#1a5fa8]" />
                  </button>
                </div>
              )
            })}
          </div>

          {/* ── DESKTOP table ── */}
          <div className="hidden sm:block px-4 md:px-8">
          <div className="overflow-hidden rounded-xl border border-black/[0.09] bg-white shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-black/[0.08] bg-[#f8f7f3]">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[.6px] text-[#6b6a66]">Produit</th>
                  {visColList.map(c => (
                    <th key={c.id}
                      className={cn(
                        'px-5 py-3 text-[11px] font-semibold uppercase tracking-[.6px] text-[#6b6a66] whitespace-nowrap',
                        c.id === 'category' || c.id === 'status' ? 'text-left' : 'text-right'
                      )}>
                      {c.label}
                    </th>
                  ))}
                  {/* Gear icon — column picker */}
                  <th className="w-10 px-3 py-3 text-right">
                    <button
                      ref={colBtnRef}
                      onClick={() => setShowColPanel(v => !v)}
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-md border cursor-pointer transition-colors',
                        showColPanel
                          ? 'border-[#1a1a18] bg-[#1a1a18] text-white'
                          : 'border-black/[0.12] bg-white text-[#a8a7a2] hover:text-[#6b6a66] hover:border-black/[0.25]'
                      )}
                      title="Choisir les colonnes"
                    >
                      <Settings2 size={12} />
                    </button>
                    {showColPanel && colBtnRef.current && (
                      <ColPanel
                        visible={visibleCols}
                        onChange={toggleCol}
                        onClose={() => setShowColPanel(false)}
                        anchorRect={colBtnRef.current.getBoundingClientRect()}
                      />
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const stats = productColStats(p)
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setDetailModal(p)}
                      className={cn(
                        'cursor-pointer transition-colors hover:bg-[#f5f4f0]',
                        i < filtered.length - 1 && 'border-b border-black/[0.05]',
                        i % 2 === 1 && 'bg-[#fafaf8]'
                      )}
                    >
                      {/* Product name */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-7 w-7 flex-shrink-0 rounded-lg flex items-center justify-center text-[10px] font-bold text-white"
                            style={{ background: catColor(p.cat, categories) }}
                          >
                            {p.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-[13px] font-medium text-[#111110]">{p.name}</div>
                            <div className="text-[11px] text-[#a8a7a2]">{p.refs.length} réf.</div>
                          </div>
                        </div>
                      </td>

                      {visColList.map(c => (
                        <td key={c.id} className={cn('px-5 py-3.5', c.id === 'category' || c.id === 'status' ? 'text-left' : 'text-right')}>
                          {c.id === 'category' ? <CatBadge cat={stats.cat ?? '—'} categories={categories} />
                            : c.id === 'status'   ? <StatusBadge status={stats.status} />
                            : c.id === 'amount'   ? <button onClick={e => { e.stopPropagation(); setVenduModal({ product: p }) }} className="font-mono text-[12px] font-medium text-[#1a5fa8] underline decoration-dotted cursor-pointer border-none bg-transparent p-0 hover:text-[#0f4080]">{fmtMRU(stats.amount)}</button>
                            : c.id === 'initial'  ? <span className="font-mono text-[13px] text-[#6b6a66]">{fmt(stats.initial)}</span>
                            : c.id === 'added'    ? <span className={cn('font-mono text-[13px] font-medium', stats.added < 0 ? 'text-[#c0392b]' : 'text-[#1a7a4a]')}>{stats.added >= 0 ? '+' : ''}{fmt(stats.added)}</span>
                            : c.id === 'sorti'    ? <span className="font-mono text-[13px] font-medium text-[#c0392b]">{fmt(stats.sorti)}</span>
                            : c.id === 'dispo'    ? <span className="font-mono text-[14px] font-semibold text-[#111110]">{fmt(stats.dispo)}</span>
                            : c.id === 'prix'     ? (
                              stats.prixMin === 0
                                ? <span className="rounded-md bg-[#fdecea] px-1.5 py-0.5 text-[11px] font-medium text-[#c0392b]">—</span>
                                : stats.prixMin === stats.prixMax
                                  ? <span className="font-mono text-[13px] font-medium text-[#111110]">{fmtMRU(stats.prixMin)}</span>
                                  : <span className="font-mono text-[12px] text-[#6b6a66]">{fmt(stats.prixMin)}–{fmtMRU(stats.prixMax)}</span>
                            )
                            : null}
                        </td>
                      ))}
                      <td /> {/* gear column spacer */}
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Table footer summary */}
            <div className="flex items-center justify-between border-t border-black/[0.07] bg-[#f8f7f3] px-5 py-2.5">
              <span className="text-[11px] text-[#a8a7a2]">{filtered.length} produit{filtered.length !== 1 ? 's' : ''}</span>
              <span className="text-[11px] text-[#a8a7a2]">
                {fmt(filtered.reduce((s, p) => s + p.refs.reduce((sr, r) => sr + r.stock, 0), 0))} unités disponibles
              </span>
            </div>
          </div>
          </div>
        </>)}
      </div>

      {/* ── Modals ── */}
      {detailModal && (
        <ProductDetailModal
          product={detailModal}
          categories={categories}
          visible={visibleCols}
          onClose={() => setDetailModal(null)}
          onUpdateStock={updateStock}
          onEdit={() => { setProductModal({ product: detailModal }); setDetailModal(null) }}
          onVenduRef={rid => setVenduModal({ product: detailModal, refId: rid })}
          onVendu={() => { setVenduModal({ product: detailModal }); setDetailModal(null) }}
          onDelete={isOwner ? () => handleDeleteProduct(detailModal) : undefined}
          onSetProductCount={qty => setProductCount(detailModal.id, qty)}
        />
      )}
      {productModal !== null && (
        <ProductModal
          initial={productModal.product}
          onClose={() => setProductModal(null)}
          onSave={handleSaveProduct}
        />
      )}
      {showInventory && (
        <InventoryModal
          products={products}
          categories={categories}
          onClose={() => setShowInventory(false)}
          onUpdateStock={updateStock}
        />
      )}
      {showCatManager && (
        <CategoryManagerModal onClose={() => setShowCatManager(false)} />
      )}
      {venduModal && (
        <VenduModal
          product={venduModal.product}
          refId={venduModal.refId}
          onClose={() => setVenduModal(null)}
        />
      )}

      {/* Sync confirm modal */}
      {syncConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)' }}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="mb-1 text-[16px] font-semibold text-[#111110]">Sync sorties</div>
              <p className="text-[13px] text-[#6b6a66] leading-relaxed">
                Recalculer le stock sorti à partir de toutes les factures livrées ?<br/>
                <span className="text-[#c0392b]">Cette opération remplace les valeurs actuelles de "sorti" et recalcule le stock disponible.</span>
              </p>
            </div>
            <div className="flex gap-2 border-t border-black/[0.07] px-6 py-4">
              <button
                onClick={() => setSyncConfirm(false)}
                className="flex-1 rounded-lg border border-black/[0.1] bg-[#f0efe9] py-2 text-[13px] font-medium text-[#6b6a66] cursor-pointer hover:opacity-80">
                Annuler
              </button>
              <button
                onClick={async () => {
                  setSyncConfirm(false)
                  setSyncing(true)
                  try {
                    const { updated } = await recalculateStockFromSortie()
                    setSyncResult(`Recalcul terminé — ${updated} référence${updated !== 1 ? 's' : ''} mise${updated !== 1 ? 's' : ''} à jour.`)
                  } finally {
                    setSyncing(false)
                  }
                }}
                className="flex-1 rounded-lg border border-[#1a5fa8]/30 bg-[#1a5fa8] py-2 text-[13px] font-medium text-white cursor-pointer hover:opacity-90">
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync result modal */}
      {syncResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)' }}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="mb-1 text-[16px] font-semibold text-[#111110]">Terminé</div>
              <p className="text-[13px] text-[#6b6a66]">{syncResult}</p>
            </div>
            <div className="border-t border-black/[0.07] px-6 py-4">
              <button
                onClick={() => setSyncResult(null)}
                className="w-full rounded-lg bg-[#1a5fa8] py-2 text-[13px] font-medium text-white cursor-pointer hover:opacity-90">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
