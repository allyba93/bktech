import { useState, useMemo } from 'react'
import { X, Search, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import type { Client, Tx } from '@/store/appStore'

const fmt = (n: number) => n.toLocaleString('fr-FR') + ' MRU'

// ── Date helpers (store stores DD/MM/YYYY) ────────────────────────────────────
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
function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function last7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => isoDaysAgo(6 - i))
}
function isoMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function isoFirstOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
}
type Period = 'today' | 'week' | 'month' | 'custom'
function dayLabel(iso: string): string {
  if (iso === isoToday()) return 'Auj'
  const d = new Date(iso + 'T12:00:00')
  return ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][d.getDay()]
}
function ini(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
}
function calcPct(cur: number, prev: number) {
  if (!prev) return null
  const p = Math.round((cur - prev) / prev * 100)
  return { val: (p >= 0 ? '+' : '') + p + '%', up: p >= 0 }
}

// ── Flattened transaction for display ─────────────────────────────────────────
interface FlatTx {
  id: string; date: string; dateISO: string
  clientName: string; items: string
  total: number; paid: number; status: 'paid' | 'partial' | 'credit'
}

function flattenTx(clients: Client[], ventesComptoir: Tx[]): FlatTx[] {
  const result: FlatTx[] = []
  clients.forEach(c => {
    const name = (c.prenom + ' ' + c.nom).trim() || 'Comptoir'
    c.transactions.forEach(tx => {
      const items = tx.lines.map(l => `${l.desc} ×${l.qty}`).join(' · ')
      const status = tx.paid >= tx.total ? 'paid' : tx.paid > 0 ? 'partial' : 'credit'
      result.push({ id: tx.id, date: tx.date, dateISO: dmyToISO(tx.date), clientName: name, items: items || '—', total: tx.total, paid: tx.paid, status })
    })
  })
  ventesComptoir.forEach(tx => {
    const items = tx.lines.map(l => `${l.desc} ×${l.qty}`).join(' · ')
    const status = tx.paid >= tx.total ? 'paid' : tx.paid > 0 ? 'partial' : 'credit'
    result.push({ id: tx.id, date: tx.date, dateISO: dmyToISO(tx.date), clientName: 'Comptoir', items: items || '—', total: tx.total, paid: tx.paid, status })
  })
  return result.sort((a, b) =>
    a.dateISO !== b.dateISO ? b.dateISO.localeCompare(a.dateISO) : b.id.localeCompare(a.id)
  )
}

// ── StatusBadge ────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: 'paid' | 'partial' | 'credit' }) {
  return (
    <span className={cn('flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
      status === 'paid'    ? 'bg-[#e8f5ee] text-[#1a7a4a]' :
      status === 'partial' ? 'bg-[#fdf3dc] text-[#996600]' :
                             'bg-[#fdecea] text-[#c0392b]')}>
      {status === 'paid' ? '✓ Payé' : status === 'partial' ? 'Partiel' : 'Crédit'}
    </span>
  )
}

// ── Bar chart ──────────────────────────────────────────────────────────────────
interface ChartBar { day: string; in: number; out: number }
function BarChart({ data }: { data: ChartBar[] }) {
  const H = 150
  const maxVal = Math.max(...data.map(d => Math.max(d.in, d.out)), 1)
  return (
    <div className="flex items-end gap-2 px-1" style={{ height: 170, paddingBottom: 2 }}>
      {data.map((d, i) => {
        const hIn  = Math.max(4, Math.round(d.in  / maxVal * H))
        const hOut = Math.max(4, Math.round(d.out / maxVal * H))
        const isToday = i === data.length - 1
        return (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-1 justify-end">
            <div className="flex w-full items-end gap-0.5 justify-center">
              <div className={cn('flex-1 rounded-t-[4px]', isToday ? 'bg-[#1a1a18]' : 'bg-[#1a7a4a]')}
                style={{ height: hIn, minHeight: 4, opacity: isToday ? 1 : 0.75 }}
                title={d.in.toLocaleString('fr-FR') + ' MRU'} />
              <div className="flex-1 rounded-t-[4px] bg-[#c0392b]"
                style={{ height: hOut, minHeight: 4, opacity: 0.6 }}
                title={d.out.toLocaleString('fr-FR') + ' MRU'} />
            </div>
            <span className={cn('font-mono text-[9px]', isToday ? 'font-medium text-[#111110]' : 'text-[#a8a7a2]')}>
              {d.day}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Transactions modal ─────────────────────────────────────────────────────────
function TransactionsModal({ transactions, title, onClose }: {
  transactions: FlatTx[]; title: string; onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const filtered = search
    ? transactions.filter(t =>
        t.clientName.toLowerCase().includes(search.toLowerCase()) ||
        t.id.toLowerCase().includes(search.toLowerCase()) ||
        t.items.toLowerCase().includes(search.toLowerCase()))
    : transactions
  const ca  = filtered.reduce((s, t) => s + t.total, 0)
  const enc = filtered.reduce((s, t) => s + t.paid, 0)
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[700px] max-h-[88vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-black/[0.08] px-5 py-3.5 flex-shrink-0">
          <h2 className="flex-1 text-[15px] font-medium">{title}</h2>
          <div className="rounded-lg bg-[#f0efe9] px-3 py-1 text-[12px] text-[#6b6a66]">
            <b className="text-[#111110]">{filtered.length}</b> transaction{filtered.length !== 1 ? 's' : ''}
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0efe9] border-none cursor-pointer hover:opacity-80">
            <X size={13} className="text-[#6b6a66]" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 border-b border-black/[0.08] bg-[#f8f7f3] px-5 py-3 flex-shrink-0">
          {[
            { lbl: 'CA total',     val: fmt(ca),       cls: '' },
            { lbl: 'Encaissé',     val: fmt(enc),      cls: 'text-[#1a7a4a]' },
            { lbl: 'Non encaissé', val: fmt(ca - enc), cls: 'text-[#c0392b]' },
          ].map(k => (
            <div key={k.lbl} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2">
              <div className="text-[10px] uppercase tracking-[.6px] text-[#a8a7a2]">{k.lbl}</div>
              <div className={cn('mt-1 font-mono text-[14px] font-medium', k.cls || 'text-[#111110]')}>{k.val}</div>
            </div>
          ))}
        </div>
        <div className="border-b border-black/[0.08] px-5 py-2.5 flex-shrink-0">
          <div className="flex items-center gap-2 rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2">
            <Search size={13} className="flex-shrink-0 text-[#a8a7a2]" />
            <input type="text" placeholder="Rechercher client, facture, article..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#a8a7a2]" />
          </div>
        </div>
        <div className="overflow-x-auto flex-shrink-0">
          <div className="grid border-b border-black/[0.08] bg-[#f8f7f3] px-5 py-2 text-[10px] font-medium uppercase tracking-[.6px] text-[#a8a7a2]"
            style={{ gridTemplateColumns: '80px 65px 1fr 105px 105px 65px', minWidth: '500px' }}>
            <span>Date</span><span>Facture</span><span>Client / Articles</span>
            <span className="text-right">Total</span>
            <span className="text-right">Encaissé</span>
            <span className="text-right">Statut</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-[13px] text-[#a8a7a2]">Aucune transaction trouvée</div>
          ) : filtered.map(t => (
            <div key={t.id + t.date}
              className="grid items-center gap-2 border-b border-black/[0.04] px-5 py-2.5 hover:bg-[#f8f7f3] transition-colors"
              style={{ gridTemplateColumns: '80px 65px 1fr 105px 105px 65px', minWidth: '500px' }}>
              <span className="font-mono text-[11px] text-[#a8a7a2]">{t.date}</span>
              <span className="font-mono text-[11px] font-medium text-[#6b6a66]">{t.id}</span>
              <div className="min-w-0">
                <div className={cn('truncate text-[12px] font-medium',
                  t.clientName === 'Comptoir' ? 'text-[#a8a7a2]' : 'text-[#111110]')}>{t.clientName}</div>
                <div className="truncate text-[10px] text-[#a8a7a2]">{t.items}</div>
              </div>
              <div className="text-right font-mono text-[12px] font-medium">{t.total.toLocaleString('fr-FR')} MRU</div>
              <div className={cn('text-right font-mono text-[12px] font-medium',
                t.paid === t.total ? 'text-[#1a7a4a]' : t.paid > 0 ? 'text-[#996600]' : 'text-[#c0392b]')}>
                {t.paid.toLocaleString('fr-FR')} MRU
              </div>
              <div className="flex justify-end"><StatusBadge status={t.status} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { products, clients, ventesComptoir, cashMvts, ouverture, boutiqueFermee } = useAppStore()

  const TODAY     = isoToday()
  const YESTERDAY = isoDaysAgo(1)

  const [period,     setPeriod]     = useState<Period>('today')
  const [customFrom, setCustomFrom] = useState(TODAY)
  const [customTo,   setCustomTo]   = useState(TODAY)
  const [showModal,  setShowModal]  = useState(false)

  const rangeFrom = period === 'today' ? TODAY : period === 'week' ? isoMonday() : period === 'month' ? isoFirstOfMonth() : customFrom
  const rangeTo   = period === 'custom' ? customTo : TODAY
  const isToday   = period === 'today'

  const periodLabel =
    period === 'today' ? "Aujourd'hui" :
    period === 'week'  ? 'Cette semaine' :
    period === 'month' ? 'Ce mois' :
    `${customFrom.split('-').reverse().slice(0,2).join('/')} → ${customTo.split('-').reverse().slice(0,2).join('/')}`

  const allTx  = useMemo(() => flattenTx(clients, ventesComptoir), [clients, ventesComptoir])

  const tx     = useMemo(() => allTx.filter(t => t.dateISO >= rangeFrom && t.dateISO <= rangeTo), [allTx, rangeFrom, rangeTo])
  const prevTx = useMemo(() => allTx.filter(t => t.dateISO === YESTERDAY), [allTx, YESTERDAY])

  const dep     = useMemo(() => cashMvts.filter(m => m.dir === 'sortie' && dmyToISO(m.date) >= rangeFrom && dmyToISO(m.date) <= rangeTo), [cashMvts, rangeFrom, rangeTo])
  const prevDep = useMemo(() => cashMvts.filter(m => m.dir === 'sortie' && dmyToISO(m.date) === YESTERDAY), [cashMvts, YESTERDAY])

  const ca     = tx.reduce((s, t) => s + t.total, 0)
  const prevCa = prevTx.reduce((s, t) => s + t.total, 0)
  const d      = dep.reduce((s, m) => s + m.montant, 0)
  const prevD  = prevDep.reduce((s, m) => s + m.montant, 0)

  const creances = useMemo(() =>
    clients.reduce((s, c) => s + c.transactions.reduce((ss, tx) => ss + Math.max(0, tx.total - tx.paid), 0), 0)
  , [clients])

  const solde = useMemo(() => {
    const sorted = [...cashMvts].sort((a, b) => {
      const da = `${dmyToISO(a.date)} ${a.time ?? '00:00'}`
      const db_ = `${dmyToISO(b.date)} ${b.time ?? '00:00'}`
      return da < db_ ? -1 : da > db_ ? 1 : 0
    })
    let balance = 0
    for (const m of sorted) {
      if (m.type === 'ouverture') { balance = m.montant; continue }
      if (['cloture', 'benefice', 'credit'].includes(m.type)) continue
      balance += m.dir === 'entree' ? m.montant : -m.montant
    }
    return balance
  }, [cashMvts])

  const alerts = useMemo(() => {
    const list: { product: string; ref: string; stock: number }[] = []
    products.forEach(p => p.refs.forEach(r => {
      if (r.stock <= 3) list.push({ product: p.name, ref: r.name, stock: r.stock })
    }))
    return list.sort((a, b) => a.stock - b.stock)
  }, [products])

  const clientsDebt = useMemo(() =>
    clients
      .map(c => {
        const balance = c.transactions.reduce((s, tx) => s + Math.max(0, tx.total - tx.paid), 0)
        const unpaid  = c.transactions.filter(tx => tx.paid < tx.total)
        const oldest  = unpaid.map(tx => dmyToISO(tx.date)).sort()[0] ?? ''
        const daysOld = oldest ? Math.floor((Date.now() - new Date(oldest + 'T12:00:00').getTime()) / 86400000) : 0
        return { name: (c.prenom + ' ' + c.nom).trim(), solde: balance, date: unpaid[0]?.date ?? '', overdue: daysOld > 29 }
      })
      .filter(c => c.solde > 0)
      .sort((a, b) => b.solde - a.solde)
  , [clients])

  const chartData = useMemo((): ChartBar[] =>
    last7Days().map(iso => ({
      day: dayLabel(iso),
      in:  cashMvts.filter(m => m.dir === 'entree' && dmyToISO(m.date) === iso).reduce((s, m) => s + m.montant, 0),
      out: cashMvts.filter(m => m.dir === 'sortie' && dmyToISO(m.date) === iso).reduce((s, m) => s + m.montant, 0),
    }))
  , [cashMvts])

  const kpis = [
    { label: "Chiffre d'affaires", value: fmt(ca),           sub: isToday ? "aujourd'hui" : "sur la période",   trend: isToday ? calcPct(ca, prevCa)               : null, clickable: true  },
    { label: 'Transactions',       value: String(tx.length), sub: isToday ? 'ventes du jour' : "sur la période", trend: isToday ? calcPct(tx.length, prevTx.length) : null, clickable: true  },
    { label: 'Dépenses',           value: fmt(d),            sub: isToday ? "aujourd'hui" : "sur la période",   trend: isToday ? calcPct(d, prevD)                 : null, clickable: false },
    { label: 'Créances clients',   value: fmt(creances),     sub: 'total non encaissé',                         trend: null,                                               clickable: false },
    { label: 'Solde de caisse',    value: fmt(solde),        sub: `ouverture : ${fmt(ouverture)}`,               trend: null,                                               clickable: false },
  ]

  const modalTitle = `Transactions — ${isToday ? "Aujourd'hui" : `${rangeFrom} → ${rangeTo}`}`

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Topbar */}
      <div className="border-b border-black/[0.08] bg-white flex-shrink-0">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 gap-3">
          {/* Left: title + dropdown */}
          <div>
            <h1 className="text-[17px] font-medium">Tableau de bord</h1>
            <div className="mt-1.5 flex items-center gap-1.5">
              <select value={period} onChange={e => setPeriod(e.target.value as Period)}
                className="rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 text-[12px] font-medium outline-none text-[#1a1a18] cursor-pointer">
                <option value="today">Aujourd'hui</option>
                <option value="week">Cette semaine</option>
                <option value="month">Ce mois</option>
                <option value="custom">Période...</option>
              </select>
            </div>
          </div>
          {/* Right: boutique ouverte + période label */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <div className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium',
              boutiqueFermee ? 'bg-[#fdecea] text-[#c0392b]' : 'bg-[#e8f5ee] text-[#1a7a4a]')}>
              <div className={cn('h-1.5 w-1.5 rounded-full', boutiqueFermee ? 'bg-[#c0392b]' : 'bg-[#1a7a4a] animate-pulse')} />
              {boutiqueFermee ? 'Boutique fermée' : 'Boutique ouverte'}
            </div>
            <span className="text-[11px] text-[#a8a7a2]">{periodLabel}</span>
          </div>
        </div>
        {/* Custom date pickers */}
        {period === 'custom' && (
          <div className="flex items-center gap-2 px-4 md:px-6 pb-3">
            <input type="date" value={customFrom} max={customTo}
              onChange={e => setCustomFrom(e.target.value)}
              className="flex-1 rounded-lg border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 text-[12px] outline-none focus:border-[#1a1a18]" />
            <span className="text-[12px] text-[#a8a7a2]">→</span>
            <input type="date" value={customTo} min={customFrom}
              onChange={e => setCustomTo(e.target.value)}
              className="flex-1 rounded-lg border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 text-[12px] outline-none focus:border-[#1a1a18]" />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5 flex flex-col gap-4">

        {/* KPIs */}
        <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {kpis.map((k, i) => {
            const cls = ['kpi-amber','kpi-blue','kpi-red','kpi-green','kpi-blue'][i] ?? 'kpi-blue'
            const color = ['#996600','#1a5fa8','#c0392b','#1a7a4a','#1a5fa8'][i] ?? '#1a5fa8'
            return (
            <div key={k.label}
              onClick={() => k.clickable && setShowModal(true)}
              className={cn(cls, 'p-4 transition-all', k.clickable ? 'cursor-pointer active:scale-[0.98]' : '')}>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[.6px]" style={{ color }}>{k.label}</div>
              <div className="font-mono text-[19px] font-bold leading-tight tracking-tight" style={{ color }}>{k.value}</div>
              <div className="mt-1.5 flex items-center justify-between gap-1">
                <span className="min-w-0 flex-1 overflow-hidden truncate whitespace-nowrap text-[11px] text-[#a8a7a2]">{k.sub}</span>
                {k.trend && (
                  <span className={cn('flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap',
                    k.trend.up ? 'bg-[#e8f5ee] text-[#1a7a4a]' : 'bg-[#fdecea] text-[#c0392b]')}>
                    {k.trend.val} vs hier
                  </span>
                )}
              </div>
              {k.clickable && <div className="mt-1 text-[10px] text-[#1a5fa8]">Voir transactions →</div>}
            </div>
          )})}
        </div>

        {/* Main grid */}
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_1fr_310px]">

          {/* Left col */}
          <div className="lg:col-span-2 flex flex-col gap-4">

            {/* Chart */}
            <div className="rounded-xl border border-black/[0.08] bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[13px] font-medium">Flux de trésorerie — 7 derniers jours</span>
                <div className="flex items-center gap-3 text-[11px] text-[#a8a7a2]">
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-[#1a7a4a]/70" /> Entrées</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-[#c0392b]/50" /> Sorties</span>
                </div>
              </div>
              <BarChart data={chartData} />
              <div className="mt-3 flex gap-6 border-t border-black/[0.06] pt-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[.6px] text-[#a8a7a2]">Total entrées</div>
                  <div className="mt-1 font-mono text-[13px] font-medium text-[#1a7a4a]">{fmt(chartData.reduce((s,d)=>s+d.in,0))}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[.6px] text-[#a8a7a2]">Total sorties</div>
                  <div className="mt-1 font-mono text-[13px] font-medium text-[#c0392b]">{fmt(chartData.reduce((s,d)=>s+d.out,0))}</div>
                </div>
                <div className="ml-auto">
                  <div className="text-[10px] uppercase tracking-[.6px] text-[#a8a7a2]">Flux net</div>
                  <div className="mt-1 font-mono text-[13px] font-medium text-[#111110]">{fmt(chartData.reduce((s,d)=>s+d.in-d.out,0))}</div>
                </div>
              </div>
            </div>

            {/* Recent sales */}
            <div className="rounded-xl border border-black/[0.08] bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-black/[0.08] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">Dernières ventes</span>
                  <span className="rounded-full bg-[#f0efe9] px-2 py-0.5 text-[10px] font-semibold text-[#6b6a66]">
                    {tx.length}
                  </span>
                </div>
                <button onClick={() => setShowModal(true)}
                  className="cursor-pointer bg-transparent border-none text-[12px] text-[#1a5fa8] hover:opacity-70">
                  Voir tout ({allTx.length})
                </button>
              </div>
              {allTx.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-[13px] text-[#a8a7a2]">Aucune vente enregistrée</div>
              ) : (
                <div className="overflow-x-auto">
                  {allTx.slice(0, 5).map(t => (
                    <div key={t.id + t.date}
                      className="grid items-center gap-2 border-b border-black/[0.04] px-4 py-2.5 last:border-0 hover:bg-[#f8f7f3] transition-colors"
                      style={{ gridTemplateColumns: '80px 60px 1fr 100px 70px', minWidth: '400px' }}>
                      <span className="font-mono text-[11px] text-[#a8a7a2]">{t.date}</span>
                      <span className="font-mono text-[11px] font-medium text-[#6b6a66]">{t.id}</span>
                      <div className="min-w-0">
                        <div className={cn('truncate text-[12px] font-medium',
                          t.clientName === 'Comptoir' ? 'text-[#a8a7a2]' : 'text-[#111110]')}>{t.clientName}</div>
                        <div className="truncate text-[10px] text-[#a8a7a2]">{t.items}</div>
                      </div>
                      <span className="text-right font-mono text-[12px] font-medium">{t.total.toLocaleString('fr-FR')} MRU</span>
                      <div className="flex justify-end"><StatusBadge status={t.status} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right col */}
          <div className="flex flex-col gap-4">

            {/* Stock alerts */}
            <div className="rounded-xl border border-black/[0.08] bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-black/[0.08] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">Alertes stock</span>
                  {alerts.length > 0 && (
                    <span className="rounded-full bg-[#fdecea] px-2 py-0.5 text-[10px] font-medium text-[#c0392b]">
                      {alerts.length}
                    </span>
                  )}
                </div>
              </div>
              {alerts.length === 0 ? (
                <div className="flex h-20 items-center justify-center text-[13px] text-[#a8a7a2]">Tout en stock ✓</div>
              ) : alerts.slice(0, 8).map((a, i) => (
                <div key={i} className="flex items-center gap-2.5 border-b border-black/[0.04] px-4 py-2.5 last:border-0">
                  <div className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-full', a.stock === 0 ? 'bg-[#c0392b]' : 'bg-[#996600]')} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[12px] font-medium">{a.ref}</div>
                    <div className="text-[10px] text-[#a8a7a2]">{a.product}</div>
                  </div>
                  <span className={cn('flex-shrink-0 font-mono text-[11px] font-medium',
                    a.stock === 0 ? 'text-[#c0392b]' : 'text-[#996600]')}>
                    {a.stock === 0 ? 'Rupture' : `${a.stock} restants`}
                  </span>
                </div>
              ))}
            </div>

            {/* Clients debt */}
            <div className="rounded-xl border border-black/[0.08] bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-black/[0.08] px-4 py-3">
                <span className="text-[13px] font-medium">Clients — soldes dus</span>
              </div>
              {clientsDebt.length === 0 ? (
                <div className="flex h-20 items-center justify-center text-[13px] text-[#a8a7a2]">Aucune créance ✓</div>
              ) : clientsDebt.slice(0, 6).map((c, i) => (
                <div key={i} className="flex items-center gap-2.5 border-b border-black/[0.04] px-4 py-2.5 last:border-0">
                  <div className={cn('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-medium',
                    c.overdue ? 'bg-[#fdecea] text-[#c0392b]' : 'bg-[#f0efe9] text-[#6b6a66]')}>
                    {ini(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[12px] font-medium">{c.name}</div>
                    <div className="flex items-center gap-1.5">
                      {c.date && <span className="text-[10px] text-[#a8a7a2]">Depuis {c.date}</span>}
                      {c.overdue && <span className="text-[10px] font-medium text-[#c0392b]">⚠ retard</span>}
                    </div>
                  </div>
                  <span className={cn('flex-shrink-0 font-mono text-[12px] font-medium',
                    c.overdue ? 'text-[#c0392b]' : 'text-[#996600]')}>
                    {c.solde.toLocaleString('fr-FR')} MRU
                  </span>
                </div>
              ))}
              {clientsDebt.length > 0 && (
                <div className="flex items-center justify-between border-t border-black/[0.08] bg-[#f8f7f3] px-4 py-2.5">
                  <span className="text-[11px] text-[#a8a7a2]">Total créances</span>
                  <span className="font-mono text-[12px] font-medium text-[#c0392b]">
                    {creances.toLocaleString('fr-FR')} MRU
                  </span>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {showModal && (
        <TransactionsModal transactions={tx} title={modalTitle} onClose={() => setShowModal(false)} />
      )}
    </div>
  )
}
