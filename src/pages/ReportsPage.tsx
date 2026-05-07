import { useState, useMemo, useRef, useEffect } from 'react'
import { X, ShoppingCart, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import type { Client, CashMvt, Product, Tx } from '@/store/appStore'

// ─── Types ────────────────────────────────────────────────────────────────────
type Period = 'week' | 'month' | '3month' | 'year' | 'custom'

// ─── Date helpers (store stores DD/MM/YYYY) ───────────────────────────────────
function dmyToISO(s: string): string {
  if (!s) return ''
  const p = s.split('/')
  if (p.length !== 3) return s
  return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`
}

function isoToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function getPeriodRange(period: Period, customFrom: string, customTo: string): { from: string; to: string } {
  const now  = new Date()
  const y    = now.getFullYear()
  const m    = now.getMonth() + 1
  const pad  = (n: number) => String(n).padStart(2,'0')
  const to   = isoToday()
  if (period === 'week') {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1 // Monday=0
    const monday = new Date(now); monday.setDate(now.getDate() - day)
    return { from: `${monday.getFullYear()}-${pad(monday.getMonth()+1)}-${pad(monday.getDate())}`, to }
  }
  if (period === 'month')  return { from: `${y}-${pad(m)}-01`, to }
  if (period === '3month') {
    const start = new Date(y, m - 3, 1)
    return { from: `${start.getFullYear()}-${pad(start.getMonth()+1)}-01`, to }
  }
  if (period === 'year')   return { from: `${y}-01-01`, to }
  if (period === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo }
  return { from: `${y}-${pad(m)}-01`, to }
}

function getPeriodLabel(period: Period, customFrom: string, customTo: string): string {
  const now = new Date()
  if (period === 'week') {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1
    const monday = new Date(now); monday.setDate(now.getDate() - day)
    return `${monday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} — ${now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
  }
  if (period === 'month')  return now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  if (period === '3month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    return `${start.toLocaleDateString('fr-FR', { month: 'short' })} — ${now.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}`
  }
  if (period === 'year')  return `Année ${now.getFullYear()}`
  if (period === 'custom' && customFrom && customTo) return `${customFrom} → ${customTo}`
  return 'Période'
}

// Last N months as { isoFrom, isoTo, label }
function getLastNMonths(n: number) {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d    = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)
    const y    = d.getFullYear()
    const mo   = d.getMonth() + 1
    const last = new Date(y, mo, 0).getDate()
    const pad  = (x: number) => String(x).padStart(2,'0')
    return {
      label:   d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.',''),
      isoFrom: `${y}-${pad(mo)}-01`,
      isoTo:   `${y}-${pad(mo)}-${pad(last)}`,
    }
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt   = (n: number) => n.toLocaleString('fr-FR')
const fmtM  = (n: number) => n.toLocaleString('fr-FR') + ' MRU'
const ini   = (name: string) => name.split(' ').map(w => w[0] ?? '').join('').slice(0,2).toUpperCase()

const CHANNELS = [
  { name:'Cash',    label:'CSH', color:'#1a7a4a', bg:'#e8f5ee' },
  { name:'Bankily', label:'BNK', color:'#e65c00', bg:'#fff0e6' },
  { name:'Masravi', label:'MSR', color:'#0066cc', bg:'#e6f0ff' },
  { name:'Seddad',  label:'SDD', color:'#7b2d8b', bg:'#f5e6ff' },
  { name:'Bimban',  label:'BMB', color:'#c0392b', bg:'#fdecea' },
]
const CAT_COLORS = ['#c0392b','#e65c00','#996600','#7b2d8b','#0066cc','#1a7a4a','#6b6a66']
const chanInfo = (name: string) => CHANNELS.find(c => c.name === name) ?? { label: name.slice(0,3).toUpperCase(), color: '#6b6a66', bg: '#f0efe9', name }

// ─── Data derivation helpers ──────────────────────────────────────────────────
function filteredCash(cashMvts: CashMvt[], from: string, to: string) {
  return cashMvts.filter(m => { const d = dmyToISO(m.date); return d >= from && d <= to })
}

function filteredClientTx(clients: Client[], from: string, to: string) {
  return clients.flatMap(c =>
    c.transactions
      .filter(tx => { const d = dmyToISO(tx.date); return d >= from && d <= to })
      .map(tx => ({ ...tx, clientId: c.id, clientName: (c.prenom+' '+c.nom).trim() }))
  )
}

function aggregateModes(mvts: CashMvt[]) {
  const map: Record<string, number> = {}
  mvts.forEach(m => m.modes?.forEach(pm => { map[pm.mode] = (map[pm.mode] ?? 0) + pm.amount }))
  return Object.entries(map).map(([mode, amount]) => ({ mode, amount })).sort((a,b) => b.amount - a.amount)
}

function aggregateCats(mvts: CashMvt[]) {
  const map: Record<string, number> = {}
  mvts.forEach(m => { map[m.cat || 'Autre'] = (map[m.cat || 'Autre'] ?? 0) + m.montant })
  return Object.entries(map).map(([cat, montant]) => ({ cat, montant })).sort((a,b) => b.montant - a.montant)
}

function productPerf(products: Product[]) {
  return products
    .map(p => ({
      name:     p.name,
      category: p.category,
      sorti:    p.refs.reduce((s, r) => s + (r.sorti  ?? 0), 0),
      amount:   p.refs.reduce((s, r) => s + (r.amount ?? 0), 0),
      stock:    p.refs.reduce((s, r) => s + r.stock, 0),
    }))
    .filter(p => p.sorti > 0 || p.stock > 0)
    .sort((a, b) => b.amount - a.amount)
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Delta({ curr, prev }: { curr: number; prev: number }) {
  if (!prev) return <span className="inline-flex rounded-full bg-[#f0efe9] px-2 py-0.5 text-[10px] font-medium text-[#6b6a66]">—</span>
  const pct = Math.round((curr - prev) / prev * 100)
  const up  = pct > 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium',
      up ? 'bg-[#e8f5ee] text-[#1a7a4a]' : pct < 0 ? 'bg-[#fdecea] text-[#c0392b]' : 'bg-[#f0efe9] text-[#6b6a66]')}>
      {up ? '↑' : '↓'} {Math.abs(pct)}% vs période préc.
    </span>
  )
}

const KPI_STYLES = [
  { cls: 'kpi-amber', color: '#996600' },
  { cls: 'kpi-red',   color: '#c0392b' },
  { cls: 'kpi-blue',  color: '#1a5fa8' },
  { cls: 'kpi-green', color: '#1a7a4a' },
  { cls: 'kpi-blue',  color: '#1a5fa8' },
]
let kpiCardIndex = 0

function KpiCard({ label, value, sub, badge, children }: {
  label: string; value: string; sub?: string; badge?: React.ReactNode; children?: React.ReactNode
}) {
  const style = KPI_STYLES[kpiCardIndex % KPI_STYLES.length]
  kpiCardIndex++
  return (
    <div className={style.cls + ' p-4'}>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[.6px]" style={{ color: style.color }}>{label}</div>
      <div className="font-mono text-[22px] font-bold leading-none" style={{ color: style.color }}>{value}</div>
      {sub   && <div className="mt-1 text-[11px] text-[#a8a7a2]">{sub}</div>}
      {badge && <div className="mt-2">{badge}</div>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  )
}

function Card({ title, sub, children, noPad = false }: {
  title: string; sub?: React.ReactNode; children: React.ReactNode; noPad?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-black/[0.08] bg-white">
      <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
        <span className="text-[13px] font-medium">{title}</span>
        {sub && <span className="text-[11px] text-[#a8a7a2]">{sub}</span>}
      </div>
      <div className={noPad ? '' : 'p-4'}>{children}</div>
    </div>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[#f0efe9]">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100,pct)}%`, background: color }}/>
    </div>
  )
}

function MonthlyBarChart({ months, cashMvts }: { months: ReturnType<typeof getLastNMonths>; cashMvts: CashMvt[] }) {
  const data = months.map(mo => ({
    label: mo.label,
    ca:    cashMvts.filter(m => m.dir === 'entree' && dmyToISO(m.date) >= mo.isoFrom && dmyToISO(m.date) <= mo.isoTo).reduce((s,m)=>s+m.montant,0),
    dep:   cashMvts.filter(m => m.dir === 'sortie' && dmyToISO(m.date) >= mo.isoFrom && dmyToISO(m.date) <= mo.isoTo).reduce((s,m)=>s+m.montant,0),
  }))
  const maxVal = Math.max(...data.flatMap(d => [d.ca, d.dep]), 1)
  const H = 120
  return (
    <div className="flex items-end gap-1.5" style={{ height: H + 32 }}>
      {data.map((d, i) => {
        const hCa  = Math.max(3, Math.round(d.ca  / maxVal * H))
        const hDep = Math.max(3, Math.round(d.dep / maxVal * H))
        const isLast = i === data.length - 1
        return (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-0.5 justify-end">
            <span className="font-mono text-[9px] text-[#6b6a66]" style={{ opacity: isLast ? 1 : 0.6 }}>
              {Math.round(d.ca/1000)}K
            </span>
            <div className="flex w-full items-end gap-0.5 justify-center">
              <div className="flex-1 rounded-t" style={{ height: hCa,  background: '#1a7a4a', opacity: isLast ? 1 : 0.65 }} title={fmtM(d.ca)} />
              <div className="flex-1 rounded-t" style={{ height: hDep, background: '#c0392b', opacity: isLast ? 0.7 : 0.45 }} title={fmtM(d.dep)} />
            </div>
            <span className="text-[9px] text-[#a8a7a2]" style={{ fontWeight: isLast ? 600 : 400 }}>{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function TblHead({ cols }: { cols: { label: string; right?: boolean }[] }) {
  return (
    <thead>
      <tr>
        {cols.map(c => (
          <th key={c.label} className={cn(
            'border-b border-black/[0.06] bg-[#f8f7f3] px-4 py-2 text-[10px] font-medium uppercase tracking-[.6px] text-[#a8a7a2]',
            c.right ? 'text-right' : 'text-left')}>
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  )
}

// ─── Bénéfice Net Modal ───────────────────────────────────────────────────────
function BeneficeModal({
  caVentes, cogs, benefice, cashIn, cashOut, periodLabel, onClose,
}: {
  caVentes: number; cogs: number; benefice: number
  cashIn: CashMvt[]; cashOut: CashMvt[]
  periodLabel: string; onClose: () => void
}) {
  const [tab, setTab] = useState<'resume' | 'entrees' | 'sorties'>('resume')

  // Group entries by category
  const isPos = benefice >= 0

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ background: 'rgba(0,0,0,.45)' }}
      onClick={onClose}>
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white"
        style={{ maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-black/[0.08] px-5 py-4">
          <div className="flex-1">
            <div className="text-[15px] font-medium">Bénéfice net</div>
            <div className="mt-0.5 text-[11px] text-[#a8a7a2]">{periodLabel}</div>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0efe9] border-none cursor-pointer">
            <X size={13} className="text-[#6b6a66]" />
          </button>
        </div>

        {/* Formula banner */}
        <div className="flex-shrink-0 px-4 py-4 border-b border-black/[0.08]" style={{ background: isPos ? '#f0faf4' : '#fdf2f2' }}>
          <div className="flex items-center justify-between gap-1 text-[13px]">
            <div className="flex flex-col items-center gap-0.5 flex-1">
              <span className="text-[9px] font-semibold uppercase tracking-[.5px] text-[#6b6a66]">CA Ventes</span>
              <span className="font-mono text-[15px] font-light text-[#1a7a4a]">{caVentes.toLocaleString('fr-FR')}</span>
              <span className="text-[9px] text-[#a8a7a2]">MRU</span>
            </div>
            <span className="text-[16px] font-light text-[#a8a7a2]">−</span>
            <div className="flex flex-col items-center gap-0.5 flex-1">
              <span className="text-[9px] font-semibold uppercase tracking-[.5px] text-[#6b6a66]">Coût achat</span>
              <span className="font-mono text-[15px] font-light text-[#e65c00]">{cogs.toLocaleString('fr-FR')}</span>
              <span className="text-[9px] text-[#a8a7a2]">MRU</span>
            </div>
            <span className="text-[16px] font-light text-[#a8a7a2]">=</span>
            <div className="flex flex-col items-center gap-0.5 flex-1">
              <span className="text-[9px] font-semibold uppercase tracking-[.5px] text-[#6b6a66]">Bénéfice net</span>
              <span className={cn('font-mono text-[18px] font-semibold', isPos ? 'text-[#1a7a4a]' : 'text-[#c0392b]')}>
                {isPos ? '+' : ''}{benefice.toLocaleString('fr-FR')}
              </span>
              <span className="text-[9px] text-[#a8a7a2]">MRU</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-shrink-0 gap-0 border-b border-black/[0.08]">
          {([['resume','Résumé'],['entrees','Entrées'],['sorties','Sorties']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn('flex-1 border-none py-2.5 text-[12px] font-medium cursor-pointer transition-colors',
                tab === key ? 'bg-white text-[#111110] border-b-2 border-[#1a1a18]' : 'bg-[#f8f7f3] text-[#6b6a66] hover:text-[#111110]')}
              style={{ borderBottom: tab === key ? '2px solid #1a1a18' : undefined }}>
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>

          {tab === 'resume' && (
            <div className="flex flex-col gap-3 p-5">
              {/* CA Ventes */}
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.6px] text-[#1a7a4a]">CA Ventes</div>
                <div className="flex items-center justify-between py-1.5 border-b border-black/[0.04]">
                  <span className="text-[13px] text-[#6b6a66]">Total prix de vente des produits</span>
                  <span className="font-mono text-[13px] font-medium text-[#1a7a4a]">+{caVentes.toLocaleString('fr-FR')} MRU</span>
                </div>
              </div>
              {/* COGS */}
              <div className="mt-1">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.6px] text-[#e65c00]">Coût d'achat produits vendus</div>
                <div className="flex items-center justify-between py-1.5 border-b border-black/[0.04]">
                  <span className="text-[13px] text-[#6b6a66]">Prix achat × quantités vendues</span>
                  <span className="font-mono text-[13px] font-medium text-[#e65c00]">−{cogs.toLocaleString('fr-FR')} MRU</span>
                </div>
              </div>
              {/* Net */}
              <div className={cn('flex items-center justify-between rounded-[10px] px-4 py-3 mt-2',
                isPos ? 'bg-[#e8f5ee]' : 'bg-[#fdecea]')}>
                <div>
                  <div className="text-[13px] font-semibold">Bénéfice net</div>
                  <div className="text-[10px] text-[#6b6a66] mt-0.5">Prix vente − Prix achat</div>
                </div>
                <span className={cn('font-mono text-[18px] font-semibold', isPos ? 'text-[#1a7a4a]' : 'text-[#c0392b]')}>
                  {isPos ? '+' : ''}{benefice.toLocaleString('fr-FR')} MRU
                </span>
              </div>
            </div>
          )}

          {tab === 'entrees' && (
            <div className="divide-y divide-black/[0.04]">
              {cashIn.length === 0
                ? <div className="flex h-24 items-center justify-center text-[13px] text-[#a8a7a2]">Aucune entrée</div>
                : cashIn.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-[#f8f7f3]">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{m.desc || '—'}</div>
                      <div className="text-[11px] text-[#a8a7a2]">{m.date} · {m.cat || 'Autre'}</div>
                    </div>
                    <span className="font-mono text-[13px] font-medium text-[#1a7a4a] flex-shrink-0">
                      +{m.montant.toLocaleString('fr-FR')} MRU
                    </span>
                  </div>
                ))
              }
              {cashIn.length > 0 && (
                <div className="flex items-center justify-between bg-[#f8f7f3] px-5 py-3">
                  <span className="text-[12px] font-medium text-[#6b6a66]">Total — {cashIn.length} opération{cashIn.length > 1 ? 's' : ''}</span>
                  <span className="font-mono text-[13px] font-medium text-[#1a7a4a]">+{cashIn.reduce((s,m)=>s+m.montant,0).toLocaleString('fr-FR')} MRU</span>
                </div>
              )}
            </div>
          )}

          {tab === 'sorties' && (
            <div className="divide-y divide-black/[0.04]">
              {cashOut.length === 0
                ? <div className="flex h-24 items-center justify-center text-[13px] text-[#a8a7a2]">Aucune dépense</div>
                : cashOut.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-[#f8f7f3]">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{m.desc || '—'}</div>
                      <div className="text-[11px] text-[#a8a7a2]">{m.date} · {m.cat || 'Autre'}</div>
                    </div>
                    <span className="font-mono text-[13px] font-medium text-[#c0392b] flex-shrink-0">
                      −{m.montant.toLocaleString('fr-FR')} MRU
                    </span>
                  </div>
                ))
              }
              {cashOut.length > 0 && (
                <div className="flex items-center justify-between bg-[#f8f7f3] px-5 py-3">
                  <span className="text-[12px] font-medium text-[#6b6a66]">Total — {cashOut.length} opération{cashOut.length > 1 ? 's' : ''}</span>
                  <span className="font-mono text-[13px] font-medium text-[#c0392b]">−{cashOut.reduce((s,m)=>s+m.montant,0).toLocaleString('fr-FR')} MRU</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Order Generator Modal ────────────────────────────────────────────────────
interface OrderLine { entryId: string; productId: string; qty: string; overrides: Record<string, string> }

function getRefRows(product: Product, orderTotal: number, overrides: Record<string, string>) {
  const refs = product.refs.length > 0 ? product.refs : []
  const refsTot = refs.reduce((s, r) => s + (r.sorti ?? 0), 0)
  return refs.map(r => {
    const pct = refsTot > 0 ? (r.sorti ?? 0) / refsTot * 100 : 100 / refs.length
    const suggested = Math.round(orderTotal * pct / 100)
    const qty = overrides[r.id] !== undefined ? parseInt(overrides[r.id] || '0', 10) : suggested
    return { ref: r, pct, suggested, qty, noHistory: refsTot === 0 }
  }).sort((a, b) => b.pct - a.pct)
}

function buildOrderText(lines: OrderLine[], products: Product[]): string {
  const today = new Date().toLocaleDateString('fr-FR')
  const parts: string[] = [`🛒 Commande — ${today}`]
  let grandTotal = 0

  lines.forEach((line, idx) => {
    const product = products.find(p => p.id === line.productId)
    if (!product) return
    const orderTotal = parseInt(line.qty || '0', 10) || 0
    if (orderTotal === 0) return
    grandTotal += orderTotal
    const rows = getRefRows(product, orderTotal, line.overrides)
    parts.push(`\n*${idx + 1}. ${product.name} — ${orderTotal} pcs*`)
    rows.forEach(({ ref, qty }) => {
      const label = /^\d+$/.test(ref.name.trim()) ? `${ref.name} simple` : ref.name
      parts.push(`• ${label} : ${qty} pcs`)
    })
  })

  parts.push(`\n*TOTAL : ${grandTotal} pcs*`)
  return parts.join('\n')
}

function OrderGeneratorModal({ products, onClose }: { products: Product[]; onClose: () => void }) {
  const nextId = useRef(0)
  const newEntry = (): OrderLine => ({ entryId: String(nextId.current++), productId: products[0]?.id ?? '', qty: '', overrides: {} })

  const [lines, setLines] = useState<OrderLine[]>([newEntry()])
  const [copied, setCopied] = useState(false)

  const copyText = () => {
    const text = buildOrderText(lines, products)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const addLine = () => setLines(ls => [...ls, newEntry()])
  const removeLine = (entryId: string) => setLines(ls => ls.filter(l => l.entryId !== entryId))
  const updateLine = (entryId: string, patch: Partial<OrderLine>) =>
    setLines(ls => ls.map(l => l.entryId === entryId ? { ...l, ...patch, overrides: patch.productId !== undefined || patch.qty !== undefined ? {} : (patch.overrides ?? l.overrides) } : l))
  const setOverride = (entryId: string, refId: string, val: string) =>
    setLines(ls => ls.map(l => l.entryId === entryId ? { ...l, overrides: { ...l.overrides, [refId]: val.replace(/\D/g, '') } } : l))

  const grandTotal = lines.reduce((s, l) => s + (parseInt(l.qty || '0', 10) || 0), 0)

  // Available products not yet selected in other lines (allow duplicates if user wants)
  const usedIds = new Set(lines.map(l => l.productId))
  const availableToAdd = products.filter(p => !usedIds.has(p.id))

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white shadow-2xl w-full sm:w-[600px] max-h-[92vh] sm:max-h-[88vh]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/[0.08] bg-[#f8f7f3] px-5 py-3.5 flex-shrink-0">
          <div>
            <div className="text-[15px] font-semibold text-[#111110]">Générateur de commande</div>
            <div className="text-[12px] text-[#a8a7a2] mt-0.5">Répartition par référence selon les ventes historiques</div>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0efe9] border-none cursor-pointer hover:opacity-80">
            <X size={13} className="text-[#6b6a66]" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {lines.map((line, lineIdx) => {
            const product    = products.find(p => p.id === line.productId)
            const orderTotal = parseInt(line.qty || '0', 10) || 0
            const rows       = product ? getRefRows(product, orderTotal, line.overrides) : []
            const ordered    = rows.reduce((s, r) => s + r.qty, 0)
            const remainder  = orderTotal - ordered
            const noHistory  = rows.length > 0 && rows[0].noHistory

            return (
              <div key={line.entryId} className={cn('border-b border-black/[0.08]', lineIdx % 2 === 0 ? 'bg-white' : 'bg-[#fafaf9]')}>
                {/* Product selector row */}
                <div className="flex items-center gap-2 px-4 py-3">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#1a1a18] text-[10px] font-bold text-white">{lineIdx + 1}</div>
                  <select value={line.productId}
                    onChange={e => updateLine(line.entryId, { productId: e.target.value })}
                    className="flex-1 rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#1a1a18] cursor-pointer">
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input
                    type="text" inputMode="numeric"
                    value={line.qty}
                    onChange={e => updateLine(line.entryId, { qty: e.target.value.replace(/\D/g, '') })}
                    placeholder="Qté"
                    className="w-20 rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 text-center font-mono text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white"
                  />
                  {lines.length > 1 && (
                    <button onClick={() => removeLine(line.entryId)}
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[#fdecea] border-none cursor-pointer hover:opacity-80">
                      <X size={12} className="text-[#c0392b]" />
                    </button>
                  )}
                </div>

                {/* No history warning */}
                {noHistory && orderTotal > 0 && (
                  <div className="mx-4 mb-2 rounded-[8px] bg-[#fdf3dc] px-3 py-1.5 text-[11px] text-[#996600]">
                    Aucun historique — répartition égale entre les références.
                  </div>
                )}

                {/* Refs breakdown */}
                {orderTotal > 0 && rows.length > 0 && (
                  <div className="flex flex-col gap-0 pb-3 px-4">
                    {rows.map(({ ref, pct, suggested, qty }) => (
                      <div key={ref.id} className="flex items-center gap-3 py-2 border-t border-black/[0.04] first:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1.5 mb-1">
                            <span className="text-[12px] font-medium text-[#111110] truncate">{ref.name}</span>
                            <span className="flex-shrink-0 rounded-full bg-[#e8f0fb] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#1a5fa8]">{pct.toFixed(1)}%</span>
                          </div>
                          <div className="h-1 w-full overflow-hidden rounded-full bg-[#f0efe9]">
                            <div className="h-full rounded-full bg-[#1a5fa8]" style={{ width: `${pct}%` }}/>
                          </div>
                          <div className="mt-0.5 text-[10px] text-[#a8a7a2]">
                            {(ref.sorti ?? 0)} vendues · suggéré : {suggested}
                          </div>
                        </div>
                        <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
                          <input
                            type="text" inputMode="numeric"
                            value={line.overrides[ref.id] ?? String(suggested)}
                            onChange={e => setOverride(line.entryId, ref.id, e.target.value)}
                            className="w-16 rounded-[8px] border border-black/[0.08] bg-white px-2 py-1 text-center font-mono text-[13px] font-bold text-[#111110] outline-none focus:border-[#1a5fa8]"
                          />
                          <span className="text-[9px] text-[#a8a7a2]">pcs</span>
                        </div>
                      </div>
                    ))}
                    {/* Sub-total for this product */}
                    <div className={cn('mt-1 flex items-center justify-end gap-2 text-[11px] font-medium',
                      remainder === 0 ? 'text-[#1a7a4a]' : 'text-[#996600]')}>
                      <span>{ordered} / {orderTotal} pcs</span>
                      {remainder !== 0 && <span className="font-normal">({remainder > 0 ? `${remainder} non alloués` : `${Math.abs(remainder)} de trop`})</span>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Add product button */}
          <button onClick={addLine}
            className="flex w-full items-center justify-center gap-2 border-none bg-transparent px-5 py-3.5 text-[13px] font-medium text-[#1a5fa8] cursor-pointer hover:bg-[#f0f4ff] transition-colors">
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Ajouter un produit
          </button>
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 items-center justify-between border-t border-black/[0.08] bg-[#f8f7f3] px-5 py-3">
          <div>
            <span className="text-[11px] text-[#a8a7a2]">{lines.length} produit{lines.length !== 1 ? 's' : ''}</span>
            {grandTotal > 0 && (
              <div className="font-mono text-[13px] font-semibold text-[#111110]">{grandTotal} pcs au total</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={copyText} disabled={grandTotal === 0}
              className={cn(
                'flex items-center gap-1.5 rounded-[9px] px-4 py-2 text-[13px] font-medium border-none cursor-pointer transition-all',
                copied
                  ? 'bg-[#e8f5ee] text-[#1a7a4a]'
                  : grandTotal === 0
                  ? 'bg-[#f0efe9] text-[#a8a7a2] cursor-not-allowed'
                  : 'bg-[#e8f0fb] text-[#1a5fa8] hover:opacity-85'
              )}>
              {copied ? <Check size={13}/> : <Copy size={13}/>}
              {copied ? 'Copié !' : 'Copier'}
            </button>
            <button onClick={onClose}
              className="rounded-[9px] bg-[#1a1a18] px-4 py-2 text-[13px] font-medium text-white cursor-pointer hover:opacity-90 border-none">
              Fermer
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function ReportsPage() {
  const { products, clients, cashMvts, ventesComptoir, fournisseurs } = useAppStore()

  const [period,         setPeriod]         = useState<Period>('month')
  const [customFrom,     setCustomFrom]     = useState('')
  const [customTo,       setCustomTo]       = useState('')
  const [showBenefice,   setShowBenefice]   = useState(false)
  const [showOrder,      setShowOrder]      = useState(false)

  const { from, to } = useMemo(() => getPeriodRange(period, customFrom, customTo), [period, customFrom, customTo])

  // Compute previous period range (same duration, immediately before)
  const prevRange = useMemo(() => {
    const durMs = (new Date(to).getTime() - new Date(from).getTime()) + 86400000
    const prevTo   = new Date(new Date(from).getTime() - 86400000)
    const prevFrom = new Date(prevTo.getTime() - durMs + 86400000)
    const pad = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    return { from: pad(prevFrom), to: pad(prevTo) }
  }, [from, to])

  // Cash movements in period
  const cashIn  = useMemo(() => filteredCash(cashMvts, from, to).filter(m => m.dir === 'entree'), [cashMvts, from, to])
  const cashOut = useMemo(() => filteredCash(cashMvts, from, to).filter(m => m.dir === 'sortie'), [cashMvts, from, to])

  const prevCashIn  = useMemo(() => filteredCash(cashMvts, prevRange.from, prevRange.to).filter(m => m.dir === 'entree'), [cashMvts, prevRange])
  const prevCashOut = useMemo(() => filteredCash(cashMvts, prevRange.from, prevRange.to).filter(m => m.dir === 'sortie'), [cashMvts, prevRange])

  const totalCashIn  = cashIn.reduce((s,m)=>s+m.montant,0)
  const totalCashOut = cashOut.reduce((s,m)=>s+m.montant,0)
  const prevTotalIn  = prevCashIn.reduce((s,m)=>s+m.montant,0)
  const prevTotalOut = prevCashOut.reduce((s,m)=>s+m.montant,0)

  // Client transactions in period
  const periodTx = useMemo(() => filteredClientTx(clients, from, to), [clients, from, to])
  void periodTx // kept for potential future use

  // Créances (all-time outstanding — not period-filtered)
  const totalCreances = useMemo(() =>
    clients.reduce((s, c) => s + c.transactions.reduce((ss, tx) => ss + Math.max(0, tx.total - tx.paid), 0), 0)
  , [clients])

  // Build purchase cost lookup — keyed by BOTH refId AND "productId||refName"
  // so old transactions (where refId may not match current ref.id) still resolve correctly.
  // Source A: fournisseur commandes lignes.pu (includes transport since last fix)
  // Source B: prixAchat on RefStock (set at reception, takes priority)
  const refCostMap = useMemo(() => {
    // productName||refName → pu  (from commandes history)
    const byName: Record<string, number> = {}
    fournisseurs.forEach(f =>
      f.commandes.forEach(cmd => {
        cmd.lignes?.forEach(l => {
          if (l.pu > 0) byName[`${cmd.produit}||${l.ref}`] = l.pu
        })
      })
    )

    const map: Record<string, number> = {}
    products.forEach(p =>
      p.refs.forEach(r => {
        // Source A: commandes history
        const fromCmd = byName[`${p.name}||${r.name}`]
        if (fromCmd) {
          map[r.id] = fromCmd                    // lookup by refId
          map[`${p.id}||${r.name}`] = fromCmd   // lookup by productId+refName (fallback)
        }
        // Source B: prixAchat on ref (takes priority)
        if (r.prixAchat && r.prixAchat > 0) {
          map[r.id] = r.prixAchat
          map[`${p.id}||${r.name}`] = r.prixAchat
        }
      })
    )
    return map
  }, [products, fournisseurs])

  // Collect all sales transactions in period (client + comptoir)
  const periodSales = useMemo((): Tx[] => {
    const clientTxs = clients.flatMap(c =>
      c.transactions.filter(tx => { const d = dmyToISO(tx.date); return d >= from && d <= to })
    )
    const comptoir = (ventesComptoir as Tx[]).filter(tx => { const d = dmyToISO(tx.date); return d >= from && d <= to })
    return [...clientTxs, ...comptoir]
  }, [clients, ventesComptoir, from, to])

  // Revenue from sold product lines in period
  const caVentes = useMemo(() =>
    periodSales.reduce((sum, tx) =>
      sum + tx.lines.reduce((s, l) => s + l.total, 0)
    , 0)
  , [periodSales])

  // COGS = Σ (qty × prixAchat) — lookup by refId first, then productId+refName
  const cogs = useMemo(() =>
    periodSales.reduce((sum, tx) =>
      sum + tx.lines.reduce((s, l) => {
        const cost = (l.refId ? refCostMap[l.refId] : undefined)
          ?? (l.productId && l.desc ? refCostMap[`${l.productId}||${l.desc}`] : undefined)
          ?? 0
        return s + l.qty * cost
      }, 0)
    , 0)
  , [periodSales, refCostMap])

  // Bénéfice net = prix de vente − prix d'achat (marge sur produits vendus uniquement)
  const benefice     = caVentes - cogs
  const prevCaVentes = useMemo(() => {
    const prevSales = [
      ...clients.flatMap(c => c.transactions.filter(tx => { const d = dmyToISO(tx.date); return d >= prevRange.from && d <= prevRange.to })),
      ...(ventesComptoir as Tx[]).filter(tx => { const d = dmyToISO(tx.date); return d >= prevRange.from && d <= prevRange.to }),
    ]
    return prevSales.reduce((s, tx) => s + tx.lines.reduce((ss, l) => ss + l.total, 0), 0)
  }, [clients, ventesComptoir, prevRange])
  const prevCogs = useMemo(() => {
    const prevSales = [
      ...clients.flatMap(c => c.transactions.filter(tx => { const d = dmyToISO(tx.date); return d >= prevRange.from && d <= prevRange.to })),
      ...(ventesComptoir as Tx[]).filter(tx => { const d = dmyToISO(tx.date); return d >= prevRange.from && d <= prevRange.to }),
    ]
    return prevSales.reduce((sum, tx) =>
      sum + tx.lines.reduce((s, l) => {
        const cost = (l.refId ? refCostMap[l.refId] : undefined)
          ?? (l.productId && l.desc ? refCostMap[`${l.productId}||${l.desc}`] : undefined)
          ?? 0
        return s + l.qty * cost
      }, 0)
    , 0)
  }, [clients, ventesComptoir, prevRange, refCostMap])
  const prevBenefice = prevCaVentes - prevCogs

  // Payment modes in period
  const modesData = useMemo(() => aggregateModes(cashIn), [cashIn])
  const totModes  = modesData.reduce((s,m)=>s+m.amount,0)

  // Expenses by category in period
  const depCats   = useMemo(() => aggregateCats(cashOut), [cashOut])
  const totDep    = depCats.reduce((s,d)=>s+d.montant,0)

  // Product performance (all-time cumulative)
  const prodPerf  = useMemo(() => productPerf(products), [products])

  // Per-product profit for selected period
  const beneficeParProduit = useMemo(() => {
    const map: Record<string, { name: string; category: string; qty: number; ca: number; cost: number }> = {}
    for (const tx of periodSales) {
      for (const l of tx.lines) {
        const prod = products.find(p => p.id === l.productId)
          ?? products.find(p => p.refs.some(r => r.id === l.refId))
        const key  = prod?.id ?? l.productId ?? l.desc ?? 'autre'
        const name = prod?.name ?? l.desc ?? '—'
        const category = (prod as unknown as { category?: string })?.category ?? '—'
        const lineCost = (l.refId ? refCostMap[l.refId] : undefined)
          ?? (l.productId && l.desc ? refCostMap[`${l.productId}||${l.desc}`] : undefined)
          ?? 0
        if (!map[key]) map[key] = { name, category, qty: 0, ca: 0, cost: 0 }
        map[key].qty  += l.qty
        map[key].ca   += l.total
        map[key].cost += l.qty * lineCost
      }
    }
    return Object.values(map)
      .map(p => ({ ...p, benefice: p.ca - p.cost, marge: p.ca > 0 ? Math.round((p.ca - p.cost) / p.ca * 100) : 0 }))
      .filter(p => p.qty > 0)
      .sort((a, b) => b.benefice - a.benefice)
  }, [periodSales, products, refCostMap])

  const totalUnitesPeriod = beneficeParProduit.reduce((s, p) => s + p.qty, 0)

  // Monthly bar chart (last 6 months)
  const months    = useMemo(() => getLastNMonths(period === 'year' ? 12 : 6), [period])

  // Client receivables
  const clientsDebt = useMemo(() =>
    clients
      .map(c => {
        const totalCA   = c.transactions.reduce((s,tx)=>s+tx.total,0)
        const totalPaid = c.transactions.reduce((s,tx)=>s+tx.paid,0)
        const reste     = Math.max(0, totalCA - totalPaid)
        return { nom: (c.prenom+' '+c.nom).trim(), total: totalCA, paye: totalPaid, reste }
      })
      .filter(c => c.reste > 0)
      .sort((a,b) => b.reste - a.reste)
  , [clients])

  const PERIODS: { key: Period; label: string }[] = [
    { key:'week',   label:"Cette semaine" },
    { key:'month',  label:"Ce mois"       },
    { key:'3month', label:"3 mois"        },
    { key:'year',   label:"Année"         },
    { key:'custom', label:"Période"       },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* Topbar */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-black/[0.08] bg-white px-4 md:px-6 py-3.5">
        <div>
          <h1 className="text-[17px] font-medium">Rapports & Analyses</h1>
          <p className="mt-0.5 text-[12px] text-[#a8a7a2] hidden sm:block">
            {new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
          </p>
        </div>
        <button onClick={() => setShowOrder(true)}
          className="flex items-center gap-1.5 rounded-[9px] border border-[#1a5fa8]/30 bg-[#e8f0fb] px-3 py-2 text-[13px] font-medium text-[#1a5fa8] cursor-pointer hover:opacity-85">
          <ShoppingCart size={14}/> Commande
        </button>
      </div>

      {/* Period bar */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-black/[0.08] bg-white px-4 md:px-6 py-2.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className={cn('flex-shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium cursor-pointer transition-all whitespace-nowrap',
              period===p.key ? 'border-[#1a1a18] bg-[#1a1a18] text-[#f5f4f0]' : 'border-black/[0.08] bg-white text-[#6b6a66] hover:bg-[#f0efe9]')}>
            {p.label}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 text-[12px] outline-none focus:border-[#1a1a18] focus:bg-white"/>
            <span className="text-[12px] text-[#a8a7a2]">→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 text-[12px] outline-none focus:border-[#1a1a18] focus:bg-white"/>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4" style={{ scrollbarWidth:'thin' }}>
        <div className="flex flex-col gap-4">

          {/* ── KPI cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Chiffre d'affaires" value={fmt(totalCashIn)} sub="Total encaissements">
              <Delta curr={totalCashIn} prev={prevTotalIn}/>
            </KpiCard>
            <KpiCard label="Dépenses" value={fmt(totalCashOut)} sub="Total décaissements">
              <Delta curr={totalCashOut} prev={prevTotalOut}/>
            </KpiCard>
            <KpiCard label="Coût d'achat" value={fmt(cogs)} sub="Prix achat produits vendus">
              <span className="inline-flex rounded-full bg-[#fff0e6] px-2 py-0.5 text-[10px] font-medium text-[#e65c00]">
                {periodSales.reduce((s,tx)=>s+tx.lines.length,0)} lignes de vente
              </span>
            </KpiCard>
            <div onClick={() => setShowBenefice(true)} className="cursor-pointer transition-all hover:ring-2 hover:ring-[#1a1a18]/10 rounded-[12px]">
              <KpiCard label="Bénéfice net ↗" value={fmt(benefice)} sub="Prix vente − Prix achat">
                <Delta curr={benefice} prev={prevBenefice}/>
              </KpiCard>
            </div>
            <KpiCard label="Créances clients" value={fmtM(totalCreances)} sub="total impayé">
              <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium',
                totalCreances > 0 ? 'bg-[#fdecea] text-[#c0392b]' : 'bg-[#e8f5ee] text-[#1a7a4a]')}>
                {clientsDebt.length} client{clientsDebt.length !== 1 ? 's' : ''} concerné{clientsDebt.length !== 1 ? 's' : ''}
              </span>
            </KpiCard>
          </div>

          {/* ── Chart + Modes ── */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_280px]">

            {/* Monthly chart */}
            <Card title={`Flux de trésorerie — ${months.length} derniers mois`}
              sub={<div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{background:'#1a7a4a'}}/> Entrées</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{background:'#c0392b',opacity:.7}}/> Sorties</span>
              </div>}>
              <MonthlyBarChart months={months} cashMvts={cashMvts} />
            </Card>

            {/* Payment modes */}
            <Card title="Modes de règlement">
              {modesData.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-[13px] text-[#a8a7a2]">Aucune donnée</div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {modesData.map(m => {
                    const ch  = chanInfo(m.mode)
                    const pct = totModes > 0 ? Math.round(m.amount / totModes * 100) : 0
                    return (
                      <div key={m.mode}>
                        <div className="mb-1 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                              style={{ background: ch.bg, color: ch.color }}>{ch.label}</span>
                            <span className="text-[12px] font-medium">{m.mode}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-mono text-[11px] font-medium">{fmt(m.amount)}</span>
                            <span className="ml-1 text-[10px] text-[#a8a7a2]">{pct}%</span>
                          </div>
                        </div>
                        <ProgressBar pct={pct} color={ch.color} />
                      </div>
                    )
                  })}
                  <div className="mt-1 flex items-center justify-between border-t border-black/[0.06] pt-2">
                    <span className="text-[11px] text-[#a8a7a2]">Total encaissé</span>
                    <span className="font-mono text-[12px] font-medium text-[#1a7a4a]">{fmtM(totModes)}</span>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* ── Products + Expenses ── */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_300px]">

            {/* Product performance */}
            <Card title="Performance produits" sub="Données cumulées depuis réception" noPad>
              {prodPerf.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-[13px] text-[#a8a7a2]">Aucun produit en stock</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[12px]">
                    <TblHead cols={[
                      { label:'Produit' }, { label:'Catégorie' },
                      { label:'Vendu', right:true }, { label:'Chiffre d\'affaires', right:true },
                      { label:'En stock', right:true },
                    ]}/>
                    <tbody>
                      {prodPerf.map((p, i) => (
                        <tr key={p.name} className={cn('border-b border-black/[0.04] hover:bg-[#f8f7f3]', i%2===0 ? '' : 'bg-[#fafaf8]')}>
                          <td className="px-4 py-2.5 font-medium">{p.name}</td>
                          <td className="px-4 py-2.5 text-[#6b6a66]">{p.category || '—'}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{fmt(p.sorti)}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-medium text-[#1a7a4a]">{fmtM(p.amount)}</td>
                          <td className={cn('px-4 py-2.5 text-right font-mono font-medium',
                            p.stock === 0 ? 'text-[#c0392b]' : p.stock <= 3 ? 'text-[#996600]' : 'text-[#111110]')}>
                            {fmt(p.stock)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-black/[0.08] bg-[#f8f7f3] font-medium">
                        <td className="px-4 py-2 text-[11px]" colSpan={2}>Total</td>
                        <td className="px-4 py-2 text-right font-mono text-[11px]">{fmt(prodPerf.reduce((s,p)=>s+p.sorti,0))}</td>
                        <td className="px-4 py-2 text-right font-mono text-[11px] text-[#1a7a4a]">{fmtM(prodPerf.reduce((s,p)=>s+p.amount,0))}</td>
                        <td className="px-4 py-2 text-right font-mono text-[11px]">{fmt(prodPerf.reduce((s,p)=>s+p.stock,0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Card>

            {/* Expenses */}
            <Card title="Dépenses par catégorie">
              {depCats.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-[13px] text-[#a8a7a2]">Aucune dépense</div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {depCats.map((d, i) => {
                    const pct = totDep > 0 ? Math.round(d.montant / totDep * 100) : 0
                    const col = CAT_COLORS[i % CAT_COLORS.length]
                    return (
                      <div key={d.cat}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[12px] font-medium">{d.cat}</span>
                          <div className="text-right">
                            <span className="font-mono text-[11px] font-medium">{fmt(d.montant)}</span>
                            <span className="ml-1 text-[10px] text-[#a8a7a2]">{pct}%</span>
                          </div>
                        </div>
                        <ProgressBar pct={pct} color={col} />
                      </div>
                    )
                  })}
                  <div className="mt-1 flex items-center justify-between border-t border-black/[0.06] pt-2">
                    <span className="text-[11px] text-[#a8a7a2]">Total dépenses</span>
                    <span className="font-mono text-[12px] font-medium text-[#c0392b]">{fmtM(totDep)}</span>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* ── Bénéfice par produit (période) ── */}
          <Card
            title="Bénéfice par produit"
            sub={<span className="flex items-center gap-2">
              <span>{getPeriodLabel(period, customFrom, customTo)}</span>
              {totalUnitesPeriod > 0 && (
                <span className="rounded-full bg-[#e8f0fb] px-2 py-0.5 text-[10px] font-medium text-[#1a5fa8]">
                  {fmt(totalUnitesPeriod)} unité{totalUnitesPeriod > 1 ? 's' : ''} vendue{totalUnitesPeriod > 1 ? 's' : ''}
                </span>
              )}
            </span>}
            noPad
          >
            {beneficeParProduit.length === 0 ? (
              <div className="flex h-24 items-center justify-center text-[13px] text-[#a8a7a2]">Aucune vente sur cette période</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[12px]">
                  <TblHead cols={[
                    { label: 'Produit' },
                    { label: 'Catégorie' },
                    { label: 'Qté vendue', right: true },
                    { label: 'CA vente', right: true },
                    { label: 'Coût achat', right: true },
                    { label: 'Bénéfice', right: true },
                    { label: 'Marge', right: true },
                  ]}/>
                  <tbody>
                    {beneficeParProduit.map((p, i) => {
                      const isPos = p.benefice >= 0
                      const noCost = p.cost === 0
                      return (
                        <tr key={i} className={cn('border-b border-black/[0.04] hover:bg-[#f8f7f3]', i % 2 !== 0 && 'bg-[#fafaf8]')}>
                          <td className="px-4 py-2.5 font-medium text-[#111110]">{p.name}</td>
                          <td className="px-4 py-2.5 text-[#6b6a66]">{p.category}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-medium">{fmt(p.qty)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-[#1a7a4a]">{fmtM(p.ca)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-[#e65c00]">
                            {noCost ? <span className="text-[#a8a7a2]">—</span> : fmtM(p.cost)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={cn('font-mono font-semibold', isPos ? 'text-[#1a7a4a]' : 'text-[#c0392b]')}>
                              {noCost ? <span className="font-normal text-[#a8a7a2]">—</span> : <>{isPos ? '+' : ''}{fmtM(p.benefice)}</>}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {noCost ? <span className="text-[#a8a7a2]">—</span> : (
                              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                                isPos ? 'bg-[#e8f5ee] text-[#1a7a4a]' : 'bg-[#fdecea] text-[#c0392b]')}>
                                {p.marge}%
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-black/[0.08] bg-[#f8f7f3] font-medium">
                      <td className="px-4 py-2 text-[11px]" colSpan={2}>Total</td>
                      <td className="px-4 py-2 text-right font-mono text-[11px]">{fmt(totalUnitesPeriod)}</td>
                      <td className="px-4 py-2 text-right font-mono text-[11px] text-[#1a7a4a]">{fmtM(caVentes)}</td>
                      <td className="px-4 py-2 text-right font-mono text-[11px] text-[#e65c00]">{cogs > 0 ? fmtM(cogs) : '—'}</td>
                      <td className="px-4 py-2 text-right font-mono text-[11px]">
                        <span className={benefice >= 0 ? 'text-[#1a7a4a]' : 'text-[#c0392b]'}>
                          {cogs > 0 ? <>{benefice >= 0 ? '+' : ''}{fmtM(benefice)}</> : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-[11px]">
                        {cogs > 0 && caVentes > 0 ? (
                          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                            benefice >= 0 ? 'bg-[#e8f5ee] text-[#1a7a4a]' : 'bg-[#fdecea] text-[#c0392b]')}>
                            {Math.round(benefice / caVentes * 100)}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          {/* ── Client receivables ── */}
          {clientsDebt.length > 0 && (
            <Card title="Créances clients — détail" sub={`${clientsDebt.length} client${clientsDebt.length>1?'s':''} avec solde impayé`} noPad>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[12px]">
                  <TblHead cols={[
                    { label:'Client' },
                    { label:'CA total', right:true },
                    { label:'Payé', right:true },
                    { label:'Reste dû', right:true },
                    { label:'Taux recouvrement', right:true },
                  ]}/>
                  <tbody>
                    {clientsDebt.map((c, i) => {
                      const taux = c.total > 0 ? Math.round(c.paye / c.total * 100) : 0
                      return (
                        <tr key={c.nom} className={cn('border-b border-black/[0.04] hover:bg-[#f8f7f3]', i%2===0?'':'bg-[#fafaf8]')}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#f0efe9] text-[10px] font-medium text-[#6b6a66]">
                                {ini(c.nom)}
                              </div>
                              <span className="font-medium">{c.nom}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono">{fmtM(c.total)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-[#1a7a4a]">{fmtM(c.paye)}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-medium text-[#c0392b]">{fmtM(c.reste)}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16">
                                <ProgressBar pct={taux} color="#1a7a4a"/>
                              </div>
                              <span className="font-mono text-[11px] text-[#6b6a66]">{taux}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-black/[0.08] bg-[#f8f7f3] font-medium">
                      <td className="px-4 py-2 text-[11px]">Total</td>
                      <td className="px-4 py-2 text-right font-mono text-[11px]">{fmtM(clientsDebt.reduce((s,c)=>s+c.total,0))}</td>
                      <td className="px-4 py-2 text-right font-mono text-[11px] text-[#1a7a4a]">{fmtM(clientsDebt.reduce((s,c)=>s+c.paye,0))}</td>
                      <td className="px-4 py-2 text-right font-mono text-[11px] text-[#c0392b]">{fmtM(totalCreances)}</td>
                      <td/>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}

        </div>
      </div>

      {showBenefice && (
        <BeneficeModal
          caVentes={caVentes}
          cogs={cogs}
          benefice={benefice}
          cashIn={cashIn}
          cashOut={cashOut}
          periodLabel={getPeriodLabel(period, customFrom, customTo)}
          onClose={() => setShowBenefice(false)}
        />
      )}

      {showOrder && (
        <OrderGeneratorModal
          products={products}
          onClose={() => setShowOrder(false)}
        />
      )}
    </div>
  )
}
