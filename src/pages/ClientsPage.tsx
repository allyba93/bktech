import { useState, useMemo } from 'react'
import { Search, Plus, X, Check, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import type { Client as AppClient, AvanceMvt } from '@/store/appStore'
import { useModalShake } from '@/lib/useModalShake'
import { InvoiceModal } from '@/components/InvoiceModal'
import type { InvoiceData } from '@/components/InvoiceModal'

// ─── Types ────────────────────────────────────────────────────────────────────
type PayMode   = { mode: string; amount: number }
type TxLine    = { desc: string; qty: number; pu: number; total: number; productName?: string; refId?: string }
type Tx        = { id: string; date: string; total: number; paid: number; lines: TxLine[]; payModes: PayMode[] }
type Payment   = { date: string; desc: string; mode?: string; amount: number; modes: PayMode[] }
type Client    = { id: string; prenom: string; nom: string; tel: string; ville: string; email: string; type: string; credit: number; notes: string; transactions: Tx[]; payments: Payment[]; avances?: AvanceMvt[] }
type TabName   = 'transactions' | 'paiements' | 'avances' | 'infos'
type FilterKey = 'all' | 'impaye' | 'retard' | 'solde' | 'vieux'

// ─── Constants ────────────────────────────────────────────────────────────────
const CHANNELS = [
  { id: 'cash', name: 'Cash',    label: 'CSH', color: '#1a7a4a', bg: '#e8f5ee' },
  { id: 'bnk',  name: 'Bankily', label: 'BNK', color: '#e65c00', bg: '#fff0e6' },
  { id: 'msr',  name: 'Masravi', label: 'MSR', color: '#0066cc', bg: '#e6f0ff' },
  { id: 'sdd',  name: 'Seddad',  label: 'SDD', color: '#7b2d8b', bg: '#f5e6ff' },
  { id: 'bmb',  name: 'Bimban',  label: 'BMB', color: '#c0392b', bg: '#fdecea' },
] as const

const AV_COLORS = ['#3b82f6','#1a7a4a','#c0392b','#996600','#7c3aed','#0891b2','#d97706','#be185d']

// ─── Helpers ──────────────────────────────────────────────────────────────────
const f        = (n: number) => n.toLocaleString('fr-FR')
const avColor  = (id: string) => { const n = id.split('').reduce((s, c) => s + c.charCodeAt(0), 0); return AV_COLORS[n % AV_COLORS.length] }
const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
const todayStr = () => { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` }
const chanById  = (name: string) => CHANNELS.find(c => c.name === name) ?? { label: name.slice(0,3).toUpperCase(), color: '#6b6a66', bg: '#f0efe9', name }

const totalAchats  = (c: Client) => c.transactions.reduce((s, t) => s + t.total, 0)
const totalPaye    = (c: Client) => c.transactions.reduce((s, t) => s + t.paid, 0)
const resteDu      = (c: Client) => totalAchats(c) - totalPaye(c)
const lastDate     = (c: Client) => c.transactions.length ? c.transactions[0].date : '—'
const soldeAvance  = (c: Client) => (c.avances ?? []).reduce((s, m) => m.dir === 'credit' ? s + m.montant : s - m.montant, 0)
const nowTimeStr   = () => { const d = new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` }

// ─── Date helpers ─────────────────────────────────────────────────────────────
type Period = 'today' | 'week' | 'month' | 'custom'
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const isoMonday = () => { const d = new Date(); const diff = d.getDay() === 0 ? -6 : 1 - d.getDay(); d.setDate(d.getDate() + diff); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const isoFirstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }
const dmyToISO = (s: string) => { const p = s.split('/'); return p.length === 3 ? `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}` : s }
const isoNDaysAgo  = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const hasOldDebt   = (c: Client) => c.transactions.some(t => t.paid < t.total && dmyToISO(t.date) < isoNDaysAgo(30))
const oldestUnpaid = (c: Client) => c.transactions.filter(t => t.paid < t.total).map(t => dmyToISO(t.date)).sort()[0] ?? null
const cliStatus    = (c: Client): 'ok' | 'impaye' | 'retard' => {
  if (resteDu(c) === 0) return 'ok'
  return hasOldDebt(c) ? 'retard' : 'impaye'
}


// ─── Sub-components ───────────────────────────────────────────────────────────

function ChannelBadge({ mode, amount, showAmt = false }: { mode: string; amount?: number; showAmt?: boolean }) {
  const ch = chanById(mode)
  return (
    <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1" style={{ background: ch.bg }}>
      <span className="text-[9px] font-bold tracking-wide" style={{ color: ch.color }}>{ch.label}</span>
      {showAmt && amount !== undefined && (
        <span className="font-mono text-[11px] font-medium" style={{ color: ch.color }}>{f(amount)}</span>
      )}
    </span>
  )
}

function SBadge({ s }: { s: 'ok' | 'impaye' | 'retard' }) {
  return (
    <span className={cn(
      'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap',
      s === 'ok'     ? 'bg-[#e8f5ee] text-[#1a7a4a]' :
      s === 'retard' ? 'bg-[#fdecea] text-[#c0392b]' :
                       'bg-[#fdf3dc] text-[#996600]',
    )}>
      {s === 'ok' ? '✓ Soldé' : s === 'retard' ? '⚠ Retard' : 'En attente'}
    </span>
  )
}

// ─── Pay form ─────────────────────────────────────────────────────────────────
function PayFormPanel({ transactions, onSave, onClose }: {
  transactions: Tx[]
  onSave: (amounts: Record<string, number>, note: string, txId: string | null) => void
  onClose: () => void
}) {
  const unpaid = transactions.filter(t => t.total - t.paid > 0)
  const [selTxId, setSelTxId]       = useState<string | 'all'>(unpaid.length === 1 ? unpaid[0].id : 'all')
  const [enabledModes, setEnabled]  = useState<Set<string>>(new Set())
  const [amounts, setAmounts]       = useState<Record<string, number>>({})
  const [note, setNote]             = useState('')
  const [saving, setSaving]         = useState(false)

  const selTx        = unpaid.find(t => t.id === selTxId) ?? null
  const effectiveDue = selTx ? selTx.total - selTx.paid : unpaid.reduce((s, t) => s + t.total - t.paid, 0)
  const total        = CHANNELS.reduce((s, ch) => s + (amounts[ch.id] ?? 0), 0)

  const toggleMode = (id: string) => {
    setEnabled(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); setAmounts(a => ({ ...a, [id]: 0 })) }
      else next.add(id)
      return next
    })
  }
  const set = (id: string, val: number) => setAmounts(prev => ({ ...prev, [id]: val }))

  return (
    <div className="p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold">Enregistrer un paiement</span>
        <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded border-none bg-[#f0efe9] cursor-pointer text-[#6b6a66] hover:bg-[#fdecea] hover:text-[#c0392b] text-[13px]">✕</button>
      </div>

      {/* Invoice dropdown */}
      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-[11px] font-medium text-[#6b6a66]">Facture à créditer</label>
          <select value={selTxId} onChange={e => setSelTxId(e.target.value)}
            className="w-full rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-3 py-1.5 text-[12px] outline-none focus:border-[#1a1a18] cursor-pointer">
            {unpaid.length > 1 && <option value="all">Toutes — {f(unpaid.reduce((s,t)=>s+t.total-t.paid,0))} MRU</option>}
            {unpaid.map(t => (
              <option key={t.id} value={t.id}>{t.id} · {t.date} — {f(t.total - t.paid)} MRU dû</option>
            ))}
          </select>
        </div>
        <div className="flex-shrink-0 pt-4 text-right">
          <div className="font-mono text-[15px] font-bold text-[#c0392b]">{f(effectiveDue)}</div>
          <div className="text-[10px] text-[#c0392b]/50">MRU dû</div>
        </div>
      </div>

      {/* Note */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-[#6b6a66]">Note</label>
        <input value={note} onChange={e => setNote(e.target.value)}
          placeholder="ex: acompte janvier"
          className="w-full rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-3 py-1.5 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white" />
      </div>

      {/* Mode toggles */}
      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-medium text-[#6b6a66]">Mode(s) de paiement</label>
        <div className="flex flex-wrap gap-1.5">
          {CHANNELS.map(ch => {
            const on = enabledModes.has(ch.id)
            return (
              <button key={ch.id} onClick={() => toggleMode(ch.id)}
                className="rounded-full border px-3 py-1 text-[11px] font-bold transition-all cursor-pointer"
                style={on
                  ? { background: ch.bg, color: ch.color, borderColor: ch.color + '60' }
                  : { background: 'white', color: '#6b6a66', borderColor: 'rgba(0,0,0,0.10)' }}>
                {ch.name}
              </button>
            )
          })}
        </div>

        {/* Amount inputs for selected modes */}
        {enabledModes.size > 0 && (
          <div className="flex flex-col gap-1.5">
            {CHANNELS.filter(ch => enabledModes.has(ch.id)).map(ch => (
              <div key={ch.id} className="flex items-center gap-3 rounded-[9px] border border-black/[0.08] bg-white px-3 py-2">
                <div className="flex h-5 w-9 flex-shrink-0 items-center justify-center rounded"
                  style={{ background: ch.bg }}>
                  <span className="text-[9px] font-bold tracking-wide" style={{ color: ch.color }}>{ch.label}</span>
                </div>
                <span className="flex-1 text-[13px] font-medium">{ch.name}</span>
                <input
                  type="number" min={0} placeholder="0" autoFocus={enabledModes.size === 1}
                  value={(amounts[ch.id] ?? 0) > 0 ? (amounts[ch.id] ?? 0) : ''}
                  onChange={e => set(ch.id, parseFloat(e.target.value) || 0)}
                  className="w-28 rounded-[7px] border px-2 py-1 text-right font-mono text-[13px] outline-none"
                  style={{
                    borderColor: (amounts[ch.id] ?? 0) > 0 ? '#1a7a4a' : 'rgba(0,0,0,0.08)',
                    background:  (amounts[ch.id] ?? 0) > 0 ? '#e8f5ee' : '#f8f7f3',
                  }} />
                <span className="w-7 text-[11px] text-[#a8a7a2]">MRU</span>
              </div>
            ))}
          </div>
        )}
        {enabledModes.size === 0 && (
          <p className="text-[11px] text-[#a8a7a2]">Sélectionnez un ou plusieurs modes ci-dessus</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-black/[0.08] pt-2">
        <div className="text-[12px] text-[#6b6a66]">
          Total :{' '}
          <strong className="font-mono text-[#111110]">{f(total)} MRU</strong>
          {total > 0 && total < effectiveDue && <span className="ml-2 text-[10px] text-[#996600]">(partiel)</span>}
          {total > effectiveDue && effectiveDue > 0 && <span className="ml-2 text-[10px] text-[#c0392b]">⚠ dépasse le dû</span>}
        </div>
        <button
          disabled={saving}
          onClick={() => {
            if (saving) return
            if (total <= 0) { alert('Entrez au moins un montant'); return }
            setSaving(true)
            onSave(amounts, note || 'Paiement', selTxId === 'all' ? null : selTxId)
          }}
          className="flex items-center gap-1.5 rounded-[9px] border-none bg-[#1a7a4a] px-3.5 py-2 text-[12px] font-medium text-white cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
          <Check size={13} /> Valider
        </button>
      </div>
    </div>
  )
}

// ─── Facture detail panel ─────────────────────────────────────────────────────
function FacturePanel({ tx, onClose, onEncaisser, boutiqueFermee }: {
  tx: Tx; onClose: () => void; onEncaisser: () => void; boutiqueFermee: boolean
}) {
  const reste = tx.total - tx.paid
  return (
    <div className="mt-3 overflow-hidden rounded-[10px] border border-blue-200 bg-[#f0f4ff]">
      <div className="flex items-center justify-between border-b border-blue-100 bg-[#e8f0fb] px-3.5 py-2">
        <span className="text-[12px] font-medium text-[#1a5fa8]">Facture {tx.id} — {tx.date}</span>
        <button onClick={onClose} className="flex h-5 w-5 items-center justify-center rounded border-none bg-transparent cursor-pointer text-[#6b6a66] hover:bg-[#fdecea] text-[13px]">✕</button>
      </div>
      <div className="p-3.5">
        {/* Lines header */}
        <div className="mb-1 grid gap-2 border-b border-blue-100 pb-1.5 text-[10px] font-medium uppercase tracking-[.6px] text-[#6b8fc9]"
          style={{ gridTemplateColumns: '1fr 45px 90px 90px' }}>
          <span>Article</span><span className="text-center">Qté</span>
          <span className="text-right">Prix/u</span><span className="text-right">Total</span>
        </div>
        {/* Lines */}
        {tx.lines.map((l, i) => (
          <div key={i} className="grid items-center gap-2 border-b border-blue-50 py-1.5"
            style={{ gridTemplateColumns: '1fr 45px 90px 90px' }}>
            <span className="text-[13px] text-[#111110]">{l.desc}</span>
            <span className="text-center text-[12px] text-[#6b6a66]">×{l.qty}</span>
            <span className="text-right font-mono text-[11px] text-[#6b6a66]">{f(l.pu)} MRU</span>
            <span className={cn('text-right font-mono text-[12px] font-medium', l.total < 0 ? 'text-[#c0392b]' : 'text-[#111110]')}>
              {f(l.total)} MRU
            </span>
          </div>
        ))}

        {/* Payment modes */}
        <div className="mt-3 border-t border-blue-100 pt-2.5">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[.6px] text-[#6b8fc9]">Modes de paiement</p>
          {tx.payModes.length === 0
            ? <p className="text-[12px] text-[#a8a7a2]">Aucun paiement enregistré</p>
            : tx.payModes.map((pm, i) => {
                const ch = chanById(pm.mode)
                return (
                  <div key={i} className="mb-1.5 flex items-center gap-3 rounded-[8px] px-3 py-2" style={{ background: ch.bg }}>
                    <div className="flex h-5 w-9 flex-shrink-0 items-center justify-center rounded text-[9px] font-bold tracking-wide"
                      style={{ background: `${ch.color}20`, color: ch.color }}>{ch.label}</div>
                    <span className="flex-1 text-[13px] font-medium" style={{ color: ch.color }}>{ch.name}</span>
                    <span className="font-mono text-[14px] font-medium" style={{ color: ch.color }}>{f(pm.amount)} MRU</span>
                  </div>
                )
              })
          }
        </div>
      </div>
      {/* Footer */}
      <div className="flex items-center justify-between border-t border-blue-100 bg-[#e8f0fb] px-3.5 py-2">
        <div className="flex gap-4 text-[12px]">
          <span className="text-[#6b6a66]">Total : <strong className="font-mono text-[#111110]">{f(tx.total)} MRU</strong></span>
          <span className="text-[#1a7a4a]">Payé : <strong className="font-mono">{f(tx.paid)} MRU</strong></span>
          {reste > 0 && <span className="text-[#c0392b]">Reste : <strong className="font-mono">{f(reste)} MRU</strong></span>}
        </div>
        {reste > 0 && (
          <button onClick={() => !boutiqueFermee && onEncaisser()}
            disabled={boutiqueFermee}
            className={cn('rounded-[8px] border-none px-3 py-1.5 text-[11px] font-medium text-white',
              boutiqueFermee ? 'bg-[#a8a7a2] cursor-not-allowed' : 'bg-[#1a7a4a] cursor-pointer hover:opacity-90')}>
            {boutiqueFermee ? 'Boutique fermée' : 'Encaisser ce solde'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Avance action modal ──────────────────────────────────────────────────────
type AvanceAction = 'facture' | 'versement'

const AVANCE_COLORS = {
  facture:   { color: '#1a5fa8', bg: '#e8f0fb', label: 'Facture / marchandise reçue', btnCls: 'bg-[#1a5fa8]' },
  versement: { color: '#c0392b', bg: '#fdecea', label: 'Versement au client', btnCls: 'bg-[#c0392b]' },
}

type StockLine = { productId: string; refId: string; qty: number; pu: number }
type FRef = { id: string; name: string; prixVente: string; prixAchat: string; qty: string }
const frefId = () => 'r' + Date.now() + Math.random().toString(36).slice(2)

function AvanceModal({ action, solde, onClose, onSave }: {
  action: AvanceAction; solde: number
  onClose: () => void
  onSave: (mvt: Omit<AvanceMvt, 'id'>, stockLines: StockLine[]) => Promise<void> | void
}) {
  const { categories, addCategory, addProduct, products } = useAppStore()
  const cfg = AVANCE_COLORS[action]
  const [desc, setDesc] = useState('')
  const [mode, setMode] = useState('Cash')

  // versement
  const [montant, setMontant] = useState('')
  const amt = parseFloat(montant) || 0

  // facture — mode toggle
  const [existMode, setExistMode] = useState<'new' | 'exist'>('new')
  const [existProdId, setExistProdId] = useState('')
  const [existRefs, setExistRefs] = useState<Array<{ refId: string; name: string; qty: string; pu: string }>>([])
  const existProd = products.find(p => p.id === existProdId) ?? null
  const existMontant = existRefs.reduce((s, r) => s + (parseInt(r.qty) || 0) * (parseFloat(r.pu) || 0), 0)

  // facture — new product form
  const [prodName,    setProdName]    = useState('')
  const [catId,       setCatId]       = useState('')
  const [newCatName,  setNewCatName]  = useState('')
  const [newCatSame,  setNewCatSame]  = useState(false)
  const [savingCat,   setSavingCat]   = useState(false)
  const [sharedPrix,  setSharedPrix]  = useState('')
  const [sharedAchat, setSharedAchat] = useState('')
  const [frefs, setFrefs] = useState<FRef[]>([{ id: frefId(), name: '', prixVente: '', prixAchat: '', qty: '' }])

  const selectedCat = categories.find(c => c.id === catId) ?? null
  const isSamePrice = selectedCat?.samePrice ?? false

  const addFRef    = () => setFrefs(prev => [...prev, { id: frefId(), name: '', prixVente: '', prixAchat: '', qty: '' }])
  const updateFRef = (id: string, patch: Partial<FRef>) => setFrefs(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  const removeFRef = (id: string) => setFrefs(prev => prev.filter(r => r.id !== id))

  const handleCreateCat = async () => {
    if (!newCatName.trim()) return
    setSavingCat(true)
    const id = await addCategory({ name: newCatName.trim(), samePrice: newCatSame })
    setCatId(id); setNewCatName(''); setNewCatSame(false); setSavingCat(false)
  }

  const namedRefs = frefs.filter(r => r.name.trim())
  const factureMontant = namedRefs.reduce((s, r) => {
    const pa = isSamePrice ? (parseFloat(sharedAchat) || 0) : (parseFloat(r.prixAchat) || 0)
    return s + (parseInt(r.qty) || 0) * pa
  }, 0)

  const [saving, setSaving] = useState(false)
  const inCls = 'rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white w-full'
  const rInCls = 'rounded-[7px] border border-black/[0.08] bg-white px-2 py-1.5 text-[12px] outline-none focus:border-[#1a1a18] w-full'

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/45" onClick={onClose}>
      <div className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[560px] max-h-[92vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: cfg.color + '30', background: cfg.bg }}>
          <div>
            <h2 className="text-[15px] font-medium" style={{ color: cfg.color }}>{cfg.label}</h2>
            {action === 'versement' && solde > 0 && (
              <div className="mt-0.5 text-[11px]" style={{ color: cfg.color }}>Solde disponible : {f(solde)} MRU</div>
            )}
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-white/60 cursor-pointer"><X size={13}/></button>
        </div>

        <div className="flex flex-col gap-3.5 overflow-y-auto p-5" style={{ scrollbarWidth: 'thin' }}>

          {/* ── Versement ── */}
          {action === 'versement' && (<>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Montant (MRU)</label>
              <input type="number" autoFocus value={montant} onChange={e => setMontant(e.target.value)} placeholder="0" className={inCls}/>
              {amt > solde && solde > 0 && <span className="text-[11px] text-[#c0392b]">Dépasse le solde disponible ({f(solde)} MRU)</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Mode de paiement</label>
              <select value={mode} onChange={e => setMode(e.target.value)} className={inCls}>
                {CHANNELS.map(c => <option key={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Description</label>
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="ex: règlement partiel sur avoir" className={inCls}/>
            </div>
          </>)}

          {/* ── Facture / marchandise reçue ── */}
          {action === 'facture' && (<>
            {/* Mode toggle */}
            <div className="flex rounded-[9px] border border-black/[0.08] bg-[#f0efe9] p-0.5">
              <button type="button" onClick={() => setExistMode('new')}
                className={cn('flex-1 rounded-[7px] py-1.5 text-[12px] font-medium transition-all cursor-pointer border-none', existMode === 'new' ? 'bg-white shadow-sm text-[#1a1a18]' : 'bg-transparent text-[#6b6a66]')}>
                Nouveau produit
              </button>
              <button type="button" onClick={() => setExistMode('exist')}
                className={cn('flex-1 rounded-[7px] py-1.5 text-[12px] font-medium transition-all cursor-pointer border-none', existMode === 'exist' ? 'bg-white shadow-sm text-[#1a1a18]' : 'bg-transparent text-[#6b6a66]')}>
                Produit existant
              </button>
            </div>

            {/* ── Exist mode: select product + update refs ── */}
            {existMode === 'exist' && (<>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-[#6b6a66]">Produit</label>
                <select value={existProdId} onChange={e => {
                  const pid = e.target.value
                  setExistProdId(pid)
                  const prod = products.find(p => p.id === pid)
                  setExistRefs(prod ? prod.refs.map(r => ({ refId: r.id, name: r.name, qty: '', pu: String(r.prixAchat ?? 0) })) : [])
                }} className={inCls + ' cursor-pointer'}>
                  <option value="">Choisir un produit…</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {existProd && existRefs.length > 0 && (
                <div>
                  <div className="mb-1 grid gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-[#a8a7a2]"
                    style={{ gridTemplateColumns: '1fr 60px 80px' }}>
                    <span>Référence</span><span className="text-center">Qté</span><span className="text-right">P. achat</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {existRefs.map((r, i) => (
                      <div key={r.refId} className="grid items-center gap-2 rounded-xl border border-black/[0.08] bg-[#f8f7f3] px-3 py-2.5"
                        style={{ gridTemplateColumns: '1fr 60px 80px' }}>
                        <span className="truncate text-[12px] text-[#1a1a18]">{r.name}</span>
                        <input type="number" min={0} value={r.qty}
                          onChange={e => setExistRefs(prev => prev.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))}
                          placeholder="Qté" className={cn(rInCls, 'text-center font-mono')}/>
                        <input type="number" min={0} value={r.pu}
                          onChange={e => setExistRefs(prev => prev.map((x, j) => j === i ? { ...x, pu: e.target.value } : x))}
                          placeholder="Achat" className={cn(rInCls, 'text-right font-mono')}/>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>)}

            {/* ── New mode: create product ── */}
            {existMode === 'new' && (<>
            {/* Nom du produit */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-[#6b6a66]">Nom du produit</label>
              <input autoFocus value={prodName} onChange={e => setProdName(e.target.value)} placeholder="ex: Coques iPhone 15" className={inCls}/>
            </div>

            {/* Catégorie */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-[#6b6a66]">Catégorie</label>
              <select value={catId} onChange={e => setCatId(e.target.value)} className={inCls + ' cursor-pointer'}>
                <option value="">Choisir…</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name} — {c.samePrice ? 'prix unique' : 'prix par réf.'}</option>)}
                <option value="__new__">+ Créer une catégorie…</option>
              </select>
              {catId === '__new__' && (
                <div className="rounded-[9px] border border-black/[0.08] bg-[#f8f7f3] p-3 flex flex-col gap-2">
                  <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Nom de la catégorie" autoFocus
                    className="rounded-[7px] border border-black/[0.08] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] w-full"/>
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
                    <Check size={11}/> {savingCat ? 'Création…' : 'Créer'}
                  </button>
                </div>
              )}
            </div>

            {/* Prix uniques */}
            {isSamePrice && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 rounded-[10px] border border-[#1a7a4a]/30 bg-[#e8f5ee]/50 px-4 py-3">
                  <span className="flex-1 text-[13px] font-medium text-[#1a7a4a]">Prix de vente unique</span>
                  <input type="number" min={0} placeholder="0" value={sharedPrix} onChange={e => setSharedPrix(e.target.value)}
                    className="w-28 rounded-[8px] border border-[#1a7a4a]/40 bg-white px-2.5 py-1.5 text-right font-mono text-[14px] outline-none focus:border-[#1a7a4a]"/>
                  <span className="text-[12px] font-medium text-[#1a7a4a]">MRU</span>
                </div>
                <div className="flex items-center gap-3 rounded-[10px] border border-[#ea580c]/30 bg-[#fff7ed] px-4 py-3">
                  <span className="flex-1 text-[13px] font-medium text-[#ea580c]">Prix d'achat unique</span>
                  <input type="number" min={0} placeholder="0" value={sharedAchat} onChange={e => setSharedAchat(e.target.value)}
                    className="w-28 rounded-[8px] border border-[#ea580c]/40 bg-white px-2.5 py-1.5 text-right font-mono text-[14px] outline-none focus:border-[#ea580c]"/>
                  <span className="text-[12px] font-medium text-[#ea580c]">MRU</span>
                </div>
              </div>
            )}

            {/* Références */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[11px] font-medium uppercase tracking-wide text-[#6b6a66]">Références reçues</label>
                <button type="button" onClick={addFRef}
                  className="flex items-center gap-1 rounded-lg bg-[#1a1a18] px-3 py-1 text-[11px] font-medium text-white cursor-pointer hover:opacity-80">
                  <Plus size={11}/> Ajouter
                </button>
              </div>
              {!isSamePrice && frefs.length > 0 && (
                <div className="mb-1 grid gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-[#a8a7a2]"
                  style={{ gridTemplateColumns: '1fr 60px 80px 80px 24px' }}>
                  <span>Référence</span><span className="text-center">Qté</span>
                  <span className="text-right">P. vente</span><span className="text-right">P. achat</span><span/>
                </div>
              )}
              {isSamePrice && frefs.length > 0 && (
                <div className="mb-1 grid gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-[#a8a7a2]"
                  style={{ gridTemplateColumns: '1fr 60px 24px' }}>
                  <span>Référence</span><span className="text-center">Qté</span><span/>
                </div>
              )}
              <div className="flex flex-col gap-2">
                {frefs.map(r => (
                  <div key={r.id} className="grid items-center gap-2 rounded-xl border border-black/[0.08] bg-[#f8f7f3] px-3 py-2.5"
                    style={{ gridTemplateColumns: isSamePrice ? '1fr 60px 24px' : '1fr 60px 80px 80px 24px' }}>
                    <input value={r.name} onChange={e => updateFRef(r.id, { name: e.target.value })} placeholder="ex: Noir / 128Go"
                      className={rInCls}/>
                    <input type="number" min={1} value={r.qty} onChange={e => updateFRef(r.id, { qty: e.target.value })} placeholder="Qté*"
                      className={cn(rInCls, 'text-center font-mono', !r.qty ? 'border-[#f0a500]' : '')}/>
                    {!isSamePrice && (<>
                      <input type="number" min={0} value={r.prixVente} onChange={e => updateFRef(r.id, { prixVente: e.target.value })} placeholder="Vente*"
                        className={cn(rInCls, 'text-right font-mono', !r.prixVente || parseFloat(r.prixVente) <= 0 ? 'border-[#f0a500]' : '')}/>
                      <input type="number" min={0} value={r.prixAchat} onChange={e => updateFRef(r.id, { prixAchat: e.target.value })} placeholder="Achat*"
                        className={cn(rInCls, 'text-right font-mono', !r.prixAchat || parseFloat(r.prixAchat) <= 0 ? 'border-[#f0a500]' : '')}/>
                    </>)}
                    <button type="button" onClick={() => removeFRef(r.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-[#fdecea] cursor-pointer hover:opacity-80 border-none">
                      <X size={11} className="text-[#c0392b]"/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
            </>)}

            {/* Référence facture */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Référence facture (optionnel)</label>
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="ex: facture n°123" className={inCls}/>
            </div>

            {existMode === 'new' && factureMontant > 0 && (
              <div className="flex justify-end text-[13px] font-medium" style={{ color: cfg.color }}>
                Valeur totale reçue : {f(factureMontant)} MRU
              </div>
            )}
            {existMode === 'exist' && existMontant > 0 && (
              <div className="flex justify-end text-[13px] font-medium" style={{ color: cfg.color }}>
                Valeur totale reçue : {f(existMontant)} MRU
              </div>
            )}
          </>)}
        </div>

        <div className="flex justify-end gap-2 border-t border-black/[0.08] px-5 py-3">
          <button onClick={onClose} className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-4 py-2 text-[13px] font-medium cursor-pointer">Annuler</button>
          <button disabled={saving} onClick={async () => {
            if (saving) return
            setSaving(true)
            try {
              if (action === 'versement') {
                if (!amt || amt <= 0) { alert('Montant invalide'); return }
                if (solde > 0 && amt > solde) { alert(`Maximum versable : ${f(solde)} MRU`); return }
                await onSave({ date: todayStr(), time: nowTimeStr(), type: 'versement', dir: 'debit', montant: amt, desc: desc || cfg.label, modes: [{ mode, amount: amt }] }, [])
              } else if (existMode === 'exist') {
                if (!existProdId) { alert('Choisissez un produit'); return }
                const validRefs = existRefs.filter(r => parseInt(r.qty) > 0)
                if (!validRefs.length) { alert('Entrez au moins une quantité'); return }
                const total = validRefs.reduce((s, r) => s + (parseInt(r.qty) || 0) * (parseFloat(r.pu) || 0), 0)
                const mvtLines = validRefs.map(r => {
                  const qty = parseInt(r.qty) || 0; const pu = parseFloat(r.pu) || 0
                  return { desc: r.name, productName: existProd?.name ?? '', qty, pu, total: qty * pu }
                })
                await onSave({
                  date: todayStr(), time: nowTimeStr(), type: 'facture', dir: 'credit',
                  montant: total, desc: desc || `${existProd?.name ?? ''} — stock reçu`, modes: [], lines: mvtLines,
                }, validRefs.map(r => ({ productId: existProdId, refId: r.refId, qty: parseInt(r.qty) || 0, pu: parseFloat(r.pu) || 0 })))
              } else {
                if (!prodName.trim()) { alert('Entrez le nom du produit'); return }
                if (!selectedCat) { alert('Choisissez une catégorie'); return }
                const valid = frefs.filter(r => r.name.trim() && parseInt(r.qty) > 0)
                if (!valid.length) { alert('Ajoutez au moins une référence avec quantité'); return }
                if (!isSamePrice && valid.some(r => !r.prixVente || parseFloat(r.prixVente) <= 0 || !r.prixAchat || parseFloat(r.prixAchat) <= 0)) {
                  alert('Remplissez les prix vente et achat pour chaque référence'); return
                }
                if (isSamePrice && (!sharedPrix || parseFloat(sharedPrix) <= 0 || !sharedAchat || parseFloat(sharedAchat) <= 0)) {
                  alert('Remplissez le prix de vente et le prix d\'achat uniques'); return
                }
                const pv = isSamePrice ? (parseFloat(sharedPrix) || 0) : 0
                const pa = isSamePrice ? (parseFloat(sharedAchat) || 0) : 0
                await addProduct({
                  name: prodName.trim(), category: selectedCat.name,
                  refs: valid.map(r => ({
                    id: frefId(), name: r.name.trim(),
                    stock: parseInt(r.qty) || 0,
                    initial: parseInt(r.qty) || 0,
                    added: 0, sorti: 0, amount: 0,
                    prixVente: isSamePrice ? pv : (parseFloat(r.prixVente) || 0),
                    prixAchat: isSamePrice ? pa : (parseFloat(r.prixAchat) || 0),
                  })),
                })
                const total = valid.reduce((s, r) => {
                  const rpa = isSamePrice ? pa : (parseFloat(r.prixAchat) || 0)
                  return s + (parseInt(r.qty) || 0) * rpa
                }, 0)
                const mvtLines = valid.map(r => {
                  const rpa = isSamePrice ? pa : (parseFloat(r.prixAchat) || 0)
                  const qty = parseInt(r.qty) || 0
                  return { desc: r.name.trim(), productName: prodName.trim(), qty, pu: rpa, total: qty * rpa }
                })
                await onSave({ date: todayStr(), time: nowTimeStr(), type: 'facture', dir: 'credit', montant: total, desc: desc || `${prodName} — ${valid.length} réf.`, modes: [], lines: mvtLines }, [])
              }
            } finally {
              setSaving(false)
            }
          }} className={cn('flex items-center gap-1.5 rounded-[9px] border-none px-4 py-2 text-[13px] font-medium text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed', cfg.btnCls)}>
            {saving ? <svg className="h-[13px] w-[13px] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> : <Check size={13}/>}
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Avances tab ──────────────────────────────────────────────────────────────
function EditAvanceModal({ mvt, onClose, onSave, onDelete }: {
  mvt: AvanceMvt
  onClose: () => void
  onSave: (updated: AvanceMvt) => void
  onDelete: () => void
}) {
  const [montant, setMontant] = useState(String(mvt.montant))
  const [desc,    setDesc]    = useState(mvt.desc ?? '')
  const [mode,    setMode]    = useState(mvt.modes[0]?.mode ?? 'Cash')
  const [confirm, setConfirm] = useState(false)

  const typeLabel: Record<AvanceMvt['type'], string> = {
    depot: 'Dépôt', facture: 'Facture reçue', versement: 'Versement', achat: 'Achat sur avoir',
  }
  const typeColor: Record<AvanceMvt['type'], string> = {
    depot: '#1a7a4a', facture: '#1a5fa8', versement: '#c0392b', achat: '#996600',
  }
  const color = typeColor[mvt.type]
  const inCls = 'rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white w-full'

  const handleSave = () => {
    const amt = parseFloat(montant)
    if (!amt || amt <= 0) return
    onSave({
      ...mvt,
      montant: amt,
      desc: desc.trim() || mvt.desc,
      modes: mvt.type === 'facture' ? [] : [{ mode, amount: amt }],
    })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/45" onClick={onClose}>
      <div className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[400px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-medium">Modifier l'avoir</h2>
            <div className="mt-0.5 text-[11px]" style={{ color }}>
              {typeLabel[mvt.type]} · {mvt.date}
            </div>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer"><X size={13} className="text-[#6b6a66]"/></button>
        </div>
        <div className="flex flex-col gap-3.5 p-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Montant (MRU)</label>
            <input type="number" autoFocus value={montant} onChange={e => setMontant(e.target.value)} placeholder="0" className={inCls}/>
          </div>
          {mvt.type !== 'facture' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Mode de paiement</label>
              <select value={mode} onChange={e => setMode(e.target.value)} className={inCls + ' cursor-pointer'}>
                {CHANNELS.map(c => <option key={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Note…" className={inCls}/>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-black/[0.08] px-5 py-3">
          {confirm
            ? <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#c0392b]">Supprimer ?</span>
                <button onClick={onDelete} className="rounded-[9px] border-none bg-[#c0392b] px-3 py-1.5 text-[12px] font-medium text-white cursor-pointer">Oui</button>
                <button onClick={() => setConfirm(false)} className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-1.5 text-[12px] font-medium cursor-pointer">Non</button>
              </div>
            : <button onClick={() => setConfirm(true)} className="flex items-center gap-1.5 rounded-[9px] border border-[#c0392b]/30 bg-[#fdecea] px-3 py-1.5 text-[12px] font-medium text-[#c0392b] cursor-pointer">
                <Trash2 size={12}/> Supprimer
              </button>
          }
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-4 py-2 text-[13px] font-medium cursor-pointer">Annuler</button>
            <button onClick={handleSave} className="flex items-center gap-1.5 rounded-[9px] border-none bg-[#1a1a18] px-4 py-2 text-[13px] font-medium text-white cursor-pointer">
              <Check size={13}/> Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AvancesTab({ client, onAction, onOpenInvoice }: {
  client: Client
  onAction: (a: AvanceAction) => void
  onOpenInvoice: (m: AvanceMvt) => void
}) {
  const { updateClientAvance, deleteClientAvance } = useAppStore()
  const [editAvance, setEditAvance] = useState<AvanceMvt | null>(null)
  const avances = client.avances ?? []
  const solde = soldeAvance(client)
  const credits = avances.filter(m => m.dir === 'credit').reduce((s, m) => s + m.montant, 0)
  const debits  = avances.filter(m => m.dir === 'debit').reduce((s, m) => s + m.montant, 0)
  const sorted  = [...avances].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))

  const typeLabel: Record<AvanceMvt['type'], string> = {
    depot: 'Dépôt', facture: 'Facture reçue', versement: 'Versement', achat: 'Achat sur avoir',
  }
  const typeColor: Record<AvanceMvt['type'], { color: string; bg: string }> = {
    depot:     { color: '#1a7a4a', bg: '#e8f5ee' },
    facture:   { color: '#1a5fa8', bg: '#e8f0fb' },
    versement: { color: '#c0392b', bg: '#fdecea' },
    achat:     { color: '#996600', bg: '#fdf3dc' },
  }

  return (<>
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      {/* Balance card */}
      <div className="overflow-hidden rounded-[14px]" style={{
        background: solde > 0 ? 'linear-gradient(145deg,#1a3a8f 0%,#0f2460 100%)' : 'linear-gradient(145deg,#2a2a26 0%,#1a1a18 100%)',
      }}>
        <div className="px-5 pt-4 pb-3">
          <div className="text-[10px] font-bold uppercase tracking-[1px] text-white/40">Solde avoir</div>
          <div className={cn('mt-2 font-mono text-[32px] font-light leading-none', solde > 0 ? 'text-[#60a5fa]' : 'text-white/40')}>
            {f(solde)}
          </div>
          <div className="mt-1 text-[11px] text-white/40">MRU {solde > 0 ? 'avoir disponible' : solde < 0 ? 'dépassement' : '— soldé'}</div>
        </div>
        <div className="grid grid-cols-2 gap-0 border-t border-white/[0.08]">
          <div className="flex flex-col gap-0.5 px-5 py-3 border-r border-white/[0.08]">
            <span className="text-[9px] font-medium uppercase tracking-[.7px] text-white/30">Crédités</span>
            <span className="font-mono text-[14px] text-[#4ade80]">+{f(credits)}</span>
          </div>
          <div className="flex flex-col gap-0.5 px-5 py-3">
            <span className="text-[9px] font-medium uppercase tracking-[.7px] text-white/30">Débités</span>
            <span className="font-mono text-[14px] text-[#f87171]">−{f(debits)}</span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onAction('facture')}
          className="flex flex-col items-center gap-1.5 rounded-[12px] border border-[#1a5fa8]/30 bg-[#e8f0fb] px-2 py-3 cursor-pointer hover:opacity-80 transition-opacity">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1a5fa8]">
            <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
          </div>
          <span className="text-center text-[11px] font-medium text-[#1a5fa8] leading-tight">Facture reçue</span>
        </button>
        <button onClick={() => onAction('versement')}
          disabled={solde <= 0}
          className="flex flex-col items-center gap-1.5 rounded-[12px] border border-[#c0392b]/30 bg-[#fdecea] px-2 py-3 cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#c0392b]">
            <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v20M2 12h20"/><line x1="20" y1="12" x2="4" y2="12"/></svg>
          </div>
          <span className="text-center text-[11px] font-medium text-[#c0392b] leading-tight">Versement</span>
        </button>
      </div>

      {/* History */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-[#a8a7a2]">
          <svg className="h-8 w-8 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-9-9"/><polyline points="21 3 21 9 15 9"/></svg>
          <p className="text-[13px]">Aucun mouvement enregistré</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {sorted.map(m => {
            const tc = typeColor[m.type]
            const isClickable = m.type === 'facture' && m.lines && m.lines.length > 0
            return (
              <div key={m.id}
                className="flex items-start gap-3 rounded-[10px] border border-black/[0.06] bg-white px-3.5 py-2.5">
                <div
                  onClick={() => isClickable && onOpenInvoice(m)}
                  className={cn('mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[7px]', isClickable && 'cursor-pointer')}
                  style={{ background: tc.bg }}>
                  {isClickable
                    ? <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke={tc.color} strokeWidth="2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
                    : <span style={{ color: tc.color }} className="text-[9px] font-bold">{m.dir === 'credit' ? '+' : '−'}</span>}
                </div>
                <div className="flex-1 min-w-0" onClick={() => isClickable && onOpenInvoice(m)} style={{ cursor: isClickable ? 'pointer' : undefined }}>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full px-2 py-0.5 text-[9px] font-medium" style={{ background: tc.bg, color: tc.color }}>{typeLabel[m.type]}</span>
                    <span className="text-[11px] text-[#a8a7a2]">{m.date} {m.time}</span>
                    {isClickable && <span className="text-[10px]" style={{ color: tc.color }}>· voir détails</span>}
                  </div>
                  {m.desc && <div className="mt-0.5 text-[12px] text-[#111110] truncate">{m.desc}</div>}
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {m.modes.map((pm, i) => <ChannelBadge key={i} mode={pm.mode} amount={pm.amount} showAmt/>)}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="font-mono text-[13px] font-semibold" style={{ color: tc.color }}>
                    {m.dir === 'credit' ? '+' : '−'}{f(m.montant)} MRU
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setEditAvance(m) }}
                    className="flex h-6 w-6 items-center justify-center rounded-[6px] border border-black/[0.08] bg-[#f0efe9] cursor-pointer hover:bg-[#e8e6e0]">
                    <Pencil size={11} className="text-[#6b6a66]"/>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>

    {editAvance && (
      <EditAvanceModal
        mvt={editAvance}
        onClose={() => setEditAvance(null)}
        onSave={updated => { updateClientAvance(client.id, updated); setEditAvance(null) }}
        onDelete={() => { deleteClientAvance(client.id, editAvance.id); setEditAvance(null) }}
      />
    )}
  </>)
}

// ─── Transactions tab ─────────────────────────────────────────────────────────
type TxFilter = 'all' | 'solde' | 'partiel' | 'impaye'

function TxTab({ transactions, onOpen }: { transactions: Tx[]; onOpen: (t: Tx) => void }) {
  const [txFilter, setTxFilter] = useState<TxFilter>('all')
  const [txSearch, setTxSearch] = useState('')

  const visible = useMemo(() => {
    const q = txSearch.trim().toLowerCase()
    return transactions.filter(t => {
      const r = t.total - t.paid
      if (txFilter === 'solde'   && r !== 0)       return false
      if (txFilter === 'partiel' && (r === 0 || r === t.total)) return false
      if (txFilter === 'impaye'  && r !== t.total) return false
      if (q && !t.id.toLowerCase().includes(q) && !t.date.includes(q)) return false
      return true
    })
  }, [transactions, txFilter, txSearch])

  const COLS = '100px 90px 1fr 110px 110px 90px'

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-black/[0.06] bg-[#fafaf8] px-5 py-2">
        <select value={txFilter} onChange={e => setTxFilter(e.target.value as TxFilter)}
          className="rounded-[7px] border border-black/[0.08] bg-white px-2.5 py-1.5 text-[12px] outline-none cursor-pointer">
          <option value="all">Toutes ({transactions.length})</option>
          <option value="impaye">Non payées</option>
          <option value="partiel">Partielles</option>
          <option value="solde">Soldées</option>
        </select>
        <div className="flex flex-1 items-center gap-1.5 rounded-[7px] border border-black/[0.08] bg-white px-2.5 py-1.5">
          <Search size={12} className="flex-shrink-0 text-[#a8a7a2]" />
          <input type="text" placeholder="Facture ou date…" value={txSearch}
            onChange={e => setTxSearch(e.target.value)}
            className="w-full bg-transparent text-[12px] outline-none placeholder:text-[#a8a7a2]" />
          {txSearch && (
            <button onClick={() => setTxSearch('')} className="flex-shrink-0 border-none bg-transparent cursor-pointer text-[#a8a7a2] hover:text-[#111110] text-[13px]">✕</button>
          )}
        </div>
        <span className="flex-shrink-0 text-[11px] text-[#a8a7a2]">{visible.length} / {transactions.length}</span>
      </div>

      {/* Desktop: fixed header */}
      <div className="hidden sm:block flex-shrink-0 overflow-x-auto">
        <div style={{ minWidth: 540 }}>
          <div className="grid gap-2 border-b border-black/[0.06] bg-[#f8f7f3] px-5 py-2 text-[10px] font-semibold uppercase tracking-[.6px] text-[#a8a7a2]"
            style={{ gridTemplateColumns: COLS }}>
            <span>Date</span><span>Facture</span><span>Statut</span>
            <span className="text-right">Total</span>
            <span className="text-right">Payé</span>
            <span className="text-right">Reste</span>
          </div>
        </div>
      </div>

      {/* Scrollable rows */}
      <div className="flex-1 overflow-y-auto overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
        {visible.length === 0
          ? <div className="py-10 text-center text-[13px] text-[#a8a7a2]">Aucune transaction trouvée</div>
          : <>
            {/* ── Desktop rows ── */}
            <div className="hidden sm:block" style={{ minWidth: 540 }}>
              {visible.map(t => {
                const r = t.total - t.paid
                return (
                  <div key={t.id} onClick={() => onOpen(t)}
                    className="grid cursor-pointer items-center gap-2 border-b border-black/[0.04] px-5 py-2.5 transition-colors hover:bg-[#f8f7f3]"
                    style={{ gridTemplateColumns: COLS }}>
                    <span className="text-[11px] text-[#a8a7a2]">{t.date}</span>
                    <span className="font-mono text-[12px] font-medium text-[#1a5fa8] underline underline-offset-2">{t.id}</span>
                    <span>
                      {r === 0
                        ? <span className="rounded-full bg-[#e8f5ee] px-2 py-0.5 text-[10px] font-medium text-[#1a7a4a]">✓ Soldé</span>
                        : r === t.total
                        ? <span className="rounded-full bg-[#fdecea] px-2 py-0.5 text-[10px] font-medium text-[#c0392b]">Non payé</span>
                        : <span className="rounded-full bg-[#fdf3dc] px-2 py-0.5 text-[10px] font-medium text-[#996600]">Partiel</span>
                      }
                    </span>
                    <span className="text-right font-mono text-[12px] font-medium">{f(t.total)} MRU</span>
                    <span className={cn('text-right font-mono text-[12px]', t.paid > 0 ? 'text-[#1a7a4a]' : 'text-[#a8a7a2]')}>
                      {t.paid > 0 ? f(t.paid) + ' MRU' : '—'}
                    </span>
                    <span className={cn('text-right font-mono text-[12px] font-medium', r > 0 ? 'text-[#c0392b]' : 'text-[#1a7a4a]')}>
                      {r > 0 ? f(r) + ' MRU' : '—'}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* ── Mobile cards ── */}
            <div className="sm:hidden flex flex-col px-4 py-2 gap-2">
              {visible.map(t => {
                const r = t.total - t.paid
                return (
                  <div key={t.id} onClick={() => onOpen(t)}
                    className="flex items-center gap-3 rounded-[10px] border border-black/[0.07] bg-white px-3.5 py-3 cursor-pointer active:scale-[0.99] transition-transform">
                    {/* Left: id + date */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[13px] font-semibold text-[#1a5fa8]">{t.id}</span>
                        {r === 0
                          ? <span className="rounded-full bg-[#e8f5ee] px-2 py-0.5 text-[10px] font-medium text-[#1a7a4a]">✓ Soldé</span>
                          : r === t.total
                          ? <span className="rounded-full bg-[#fdecea] px-2 py-0.5 text-[10px] font-medium text-[#c0392b]">Non payé</span>
                          : <span className="rounded-full bg-[#fdf3dc] px-2 py-0.5 text-[10px] font-medium text-[#996600]">Partiel</span>
                        }
                      </div>
                      <span className="text-[11px] text-[#a8a7a2]">{t.date}</span>
                    </div>
                    {/* Right: amounts */}
                    <div className="flex-shrink-0 text-right">
                      <div className="font-mono text-[13px] font-semibold text-[#111110]">{f(t.total)} MRU</div>
                      {r > 0
                        ? <div className="text-[11px] font-medium text-[#c0392b]">Reste : {f(r)} MRU</div>
                        : <div className="text-[11px] text-[#1a7a4a]">Payé : {f(t.paid)} MRU</div>
                      }
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        }
      </div>
    </div>
  )
}

// ─── Client detail modal ──────────────────────────────────────────────────────
function ClientModal({ initial, onClose, onUpdate, onPayment, boutiqueFermee }: {
  initial: Client; onClose: () => void; onUpdate: (c: Client) => void
  onPayment: (clientId: string, amounts: Record<string, number>, note: string) => void
  boutiqueFermee: boolean
}) {
  const { addClientAvance, updateStockRef } = useAppStore()
  const [client, setClient]     = useState<Client>(initial)
  const [tab, setTab]           = useState<TabName>('transactions')
  const [invoiceTx, setInvoiceTx] = useState<Tx | null>(null)
  const [showPay, setShowPay]   = useState(false)
  const [editing, setEditing]   = useState(false)
  const [avanceAction, setAvanceAction]   = useState<AvanceAction | null>(null)
  const [avoirInvoice, setAvoirInvoice]   = useState<AvanceMvt | null>(null)
  const [form, setForm]       = useState({
    prenom: initial.prenom, nom: initial.nom, tel: initial.tel,
    ville: initial.ville,   email: initial.email, type: initial.type,
    credit: initial.credit, notes: initial.notes,
  })

  const color = avColor(client.id)
  const ta    = totalAchats(client)
  const tp    = totalPaye(client)
  const rd    = resteDu(client)
  const sa    = soldeAvance(client)
  const taux  = ta > 0 ? Math.round((tp / ta) * 100) : 0
  const barC  = taux === 100 ? '#1a7a4a' : taux >= 50 ? '#996600' : '#c0392b'

  const buildInvoiceData = (tx: Tx): InvoiceData => ({
    txId:     tx.id,
    date:     tx.date,
    client:   client as unknown as AppClient,
    lines:    tx.lines.map(l => ({ desc: l.desc, productName: l.productName ?? '', qty: l.qty, pu: l.pu, total: l.total })),
    subtotal: tx.total,
    discount: 0,
    total:    tx.total,
    payModes: tx.payModes,
    paid:     tx.paid,
  })

  const savePayment = (amounts: Record<string, number>, note: string, txId: string | null) => {
    const total = CHANNELS.reduce((s, ch) => s + (amounts[ch.id] ?? 0), 0)
    const modesUsed = CHANNELS
      .filter(ch => (amounts[ch.id] ?? 0) > 0)
      .map(ch => ({ mode: ch.name, amount: amounts[ch.id] ?? 0 }))

    const modeRem: Record<string, number> = {}
    modesUsed.forEach(m => { modeRem[m.mode] = m.amount })
    let totalRem = total

    const updTxs = client.transactions.map(t => {
      if (txId && t.id !== txId) return t
      const due = t.total - t.paid
      if (due <= 0 || totalRem <= 0) return t
      const payNow = Math.min(due, totalRem)
      totalRem -= payNow
      let leftNow = payNow
      // Deep copy to avoid mutating Zustand state objects
      const newModes = t.payModes.map(p => ({ ...p }))
      modesUsed.forEach(m => {
        const avail = modeRem[m.mode] ?? 0
        if (avail > 0 && leftNow > 0) {
          const share = Math.min(avail, leftNow)
          modeRem[m.mode] = avail - share
          leftNow -= share
          const ex = newModes.find(p => p.mode === m.mode)
          if (ex) ex.amount += share
          else newModes.push({ mode: m.mode, amount: share })
        }
      })
      // Reduce Crédit by the amount paid (mirrors payClient store logic)
      const creditEntry = newModes.find(p => p.mode === 'Crédit')
      if (creditEntry) creditEntry.amount = Math.max(0, creditEntry.amount - payNow)
      return { ...t, paid: t.paid + payNow, payModes: newModes.filter(p => p.amount > 0) }
    })

    // Update local modal state immediately for responsive UI
    const newPay: Payment = {
      date: todayStr(), desc: note,
      mode: modesUsed.length === 1 ? modesUsed[0].mode : 'Multi-modes',
      amount: total, modes: modesUsed,
    }
    const updated: Client = { ...client, transactions: updTxs, payments: [newPay, ...client.payments] }
    setClient(updated)
    // payClient handles store update + Firebase save + cash movement (do NOT call onUpdate to avoid double-apply)
    const amountsByName: Record<string, number> = {}
    modesUsed.forEach(m => { amountsByName[m.mode] = m.amount })
    onPayment(String(client.id), amountsByName, note || 'Paiement client')
    setShowPay(false)
  }

  const saveEdit = () => {
    const updated: Client = { ...client, ...form }
    setClient(updated)
    onUpdate(updated)
    setEditing(false)
  }

  const upd = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm(prev => ({ ...prev, [k]: k === 'credit' ? parseInt(e.target.value) || 0 : e.target.value }))

  const { ref: shakeRef, shake } = useModalShake()

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45" onClick={shake}>
      <div
        ref={shakeRef}
        className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[720px] max-h-[92vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-3.5 border-b border-black/[0.08] bg-[#f8f7f3] px-5 py-4">
          <div className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-full text-[16px] font-medium"
            style={{ background: `${color}18`, color }}>
            {initials(client.prenom + ' ' + client.nom)}
          </div>
          <div>
            <div className="text-[17px] font-medium">{client.prenom} {client.nom}</div>
            <div className="text-[12px] text-[#a8a7a2]">
              {client.type} · {client.ville}{client.tel ? ' · ' + client.tel : ''}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button onClick={() => { setEditing(true); setTab('infos') }}
              className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-1.5 text-[12px] font-medium cursor-pointer hover:opacity-80">
              Modifier
            </button>
            <button onClick={() => !boutiqueFermee && rd > 0 && setShowPay(p => !p)}
              disabled={boutiqueFermee || rd === 0}
              title={boutiqueFermee ? 'Boutique fermée' : rd === 0 ? 'Aucun montant dû' : undefined}
              className={cn('flex items-center gap-1.5 rounded-[9px] border-none px-3 py-1.5 text-[12px] font-medium text-white',
                (boutiqueFermee || rd === 0) ? 'bg-[#a8a7a2] cursor-not-allowed' : 'bg-[#1a7a4a] cursor-pointer hover:opacity-90')}>
              <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              {boutiqueFermee ? 'Fermée' : 'Encaisser'}
            </button>
            <button onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer">
              <X size={13} className="text-[#6b6a66]" />
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid flex-shrink-0 grid-cols-2 sm:grid-cols-5 gap-2 border-b border-black/[0.08] px-5 py-3">
          {([
            ['Total achats', f(ta), 'kpi-blue',  '#1a5fa8'],
            ['Total payé',   f(tp), 'kpi-green', '#1a7a4a'],
            ['Reste dû',     f(rd), 'kpi-red',   '#c0392b'],
            ['Nb factures',  String(client.transactions.length), 'kpi-amber', '#996600'],
            ['Avoir client', f(sa), 'kpi-purple', sa >= 0 ? '#7c3aed' : '#c0392b'],
          ] as [string, string, string, string][]).map(([lbl, val, kpiCls, color]) => (
            <div key={lbl} className={kpiCls + ' px-3 py-2'}>
              <div className="text-[10px] font-medium uppercase tracking-[.6px] text-[#6b6a66]">{lbl}</div>
              <div className="mt-1 font-mono text-[16px] font-semibold" style={{ color }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Recovery bar */}
        <div className="flex-shrink-0 border-b border-black/[0.08] px-5 py-2.5">
          <div className="mb-1.5 flex justify-between text-[11px] text-[#6b6a66]">
            <span>Taux de recouvrement</span>
            <span className="font-medium">{taux}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#f0efe9]">
            <div className="h-full rounded-full transition-all" style={{ width: `${taux}%`, background: barC }} />
          </div>
        </div>

        {/* Tabs — hidden while paying */}
        {!showPay && (
          <div className="flex flex-shrink-0 border-b border-black/[0.08] px-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {(['transactions', 'paiements', 'avances', 'infos'] as TabName[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn(
                  'flex-shrink-0 border-none bg-transparent cursor-pointer border-b-2 px-4 pb-2.5 pt-2 text-[13px] font-medium transition-all',
                  tab === t ? 'border-[#1a1a18] text-[#111110]' : 'border-transparent text-[#a8a7a2] hover:text-[#6b6a66]',
                )}>
                {t === 'transactions' ? 'Transactions' : t === 'paiements' ? 'Paiements' : t === 'avances' ? 'Avoir' : 'Informations'}
              </button>
            ))}
          </div>
        )}

        {/* Scrollable body — pay form OR tab content */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {showPay && (
            <PayFormPanel transactions={client.transactions} onSave={savePayment} onClose={() => setShowPay(false)} />
          )}
          {!showPay && <>

          {/* ── Transactions ── */}
          {tab === 'transactions' && <TxTab transactions={client.transactions} onOpen={setInvoiceTx} />}

          {/* ── Avances ── */}
          {tab === 'avances' && <AvancesTab client={client} onAction={setAvanceAction} onOpenInvoice={setAvoirInvoice} />}

          {/* ── Paiements ── */}
          {tab === 'paiements' && (
            <div className="p-5">
              {client.payments.length === 0
                ? <div className="py-8 text-center text-[13px] text-[#a8a7a2]">Aucun paiement enregistré</div>
                : client.payments.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 border-b border-black/[0.05] py-2.5">
                      <div className="h-2 w-2 flex-shrink-0 rounded-full bg-[#1a7a4a]" />
                      <span className="min-w-[85px] text-[11px] text-[#a8a7a2]">{p.date}</span>
                      <span className="flex-1 text-[12px] text-[#111110]">{p.desc}</span>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {p.modes.map((m, j) => (
                          <ChannelBadge key={j} mode={m.mode} amount={m.amount} showAmt />
                        ))}
                      </div>
                      <span className="min-w-[95px] text-right font-mono text-[13px] font-medium text-[#1a7a4a]">
                        +{f(p.amount)} MRU
                      </span>
                    </div>
                  ))
              }
            </div>
          )}

          {/* ── Informations ── */}
          {tab === 'infos' && (
            <div className="p-5">
              {editing ? (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    {([['Prénom', 'prenom'], ['Nom', 'nom'], ['Téléphone', 'tel'], ['Ville', 'ville']] as [string, keyof typeof form][]).map(([lbl, k]) => (
                      <div key={k} className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-[#6b6a66]">{lbl}</label>
                        <input value={String(form[k])} onChange={upd(k)}
                          className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white" />
                      </div>
                    ))}
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-[#6b6a66]">Email</label>
                      <input value={form.email} onChange={upd('email')}
                        className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-[#6b6a66]">Limite de crédit (MRU)</label>
                      <input type="number" value={form.credit || ''} onChange={upd('credit')}
                        className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] font-mono outline-none focus:border-[#1a1a18] focus:bg-white" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-[#6b6a66]">Type</label>
                      <select value={form.type} onChange={upd('type')}
                        className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white">
                        <option>Particulier</option><option>Entreprise</option><option>Revendeur</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-[#6b6a66]">Notes</label>
                    <textarea value={form.notes} onChange={upd('notes')} rows={2}
                      className="resize-none rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditing(false)}
                      className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-4 py-2 text-[13px] font-medium cursor-pointer">
                      Annuler
                    </button>
                    <button onClick={saveEdit}
                      className="flex items-center gap-1.5 rounded-[9px] border-none bg-[#1a1a18] px-4 py-2 text-[13px] font-medium text-white cursor-pointer">
                      <Check size={13} /> Enregistrer
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {([
                      ['Prénom', client.prenom], ['Nom', client.nom],
                      ['Téléphone', client.tel || '—'], ['Email', client.email || '—'],
                      ['Ville', client.ville || '—'], ['Type', client.type],
                      ['Limite crédit', f(client.credit) + ' MRU'], ['Reste dû', f(rd) + ' MRU'],
                    ] as [string, string][]).map(([lbl, val]) => (
                      <div key={lbl} className="rounded-[9px] bg-[#f0efe9] px-3.5 py-2.5">
                        <div className="text-[10px] font-medium uppercase tracking-[.6px] text-[#a8a7a2]">{lbl}</div>
                        <div className="mt-1 text-[13px] font-medium text-[#111110]">{val}</div>
                      </div>
                    ))}
                  </div>
                  {client.notes && (
                    <div className="mt-3 rounded-[9px] bg-[#fdf3dc] px-3.5 py-2.5">
                      <div className="text-[10px] font-medium uppercase tracking-[.6px] text-[#996600]">Notes</div>
                      <div className="mt-1 text-[13px] text-[#111110]">{client.notes}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          </>}
        </div>
      </div>
    </div>
    {invoiceTx && (
      <InvoiceModal data={buildInvoiceData(invoiceTx)} onClose={() => setInvoiceTx(null)} />
    )}
    {avoirInvoice && avoirInvoice.lines && (
      <InvoiceModal
        data={{
          txId:     `FAV-${avoirInvoice.id.slice(-4).toUpperCase()}`,
          date:     avoirInvoice.date,
          client:   client as unknown as AppClient,
          lines:    avoirInvoice.lines,
          subtotal: avoirInvoice.montant,
          discount: 0,
          total:    avoirInvoice.montant,
          payModes: [],
          paid:     0,
        }}
        onClose={() => setAvoirInvoice(null)}
      />
    )}
    {avanceAction && (
      <AvanceModal
        action={avanceAction}
        solde={sa}
        onClose={() => setAvanceAction(null)}
        onSave={async (mvt, stockLines) => {
          const newId = await addClientAvance(client.id, mvt)
          for (const sl of stockLines) updateStockRef(sl.productId, sl.refId, sl.qty)
          setClient(prev => ({ ...prev, avances: [{ ...mvt, id: newId }, ...(prev.avances ?? [])] }))
          setAvanceAction(null)
        }}
      />
    )}
    </>
  )
}

// ─── New/Edit client modal ────────────────────────────────────────────────────
function NewClientModal({ onClose, onSave }: {
  onClose: () => void
  onSave: (data: Omit<Client, 'id' | 'transactions' | 'payments'>) => void
}) {
  const [form, setForm] = useState({ prenom: '', nom: '', tel: '', ville: '', email: '', type: 'Particulier', credit: 0, notes: '' })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm(prev => ({ ...prev, [k]: k === 'credit' ? parseInt(e.target.value) || 0 : e.target.value }))

  const { ref: shakeRef, shake } = useModalShake()

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45" onClick={shake}>
      <div ref={shakeRef} className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[480px] max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-black/[0.08] px-5 py-4">
          <h2 className="text-[15px] font-medium">Nouveau client</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer">
            <X size={13} className="text-[#6b6a66]" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            {([['Prénom', 'prenom', 'Ibrahim'], ['Nom', 'nom', 'Koné']] as [string, keyof typeof form, string][]).map(([lbl, k, ph]) => (
              <div key={k} className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#6b6a66]">{lbl}</label>
                <input value={String(form[k])} onChange={set(k)} placeholder={ph}
                  className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([['Téléphone', 'tel', '+222 XX XX XX XX'], ['Ville', 'ville', 'Nouakchott']] as [string, keyof typeof form, string][]).map(([lbl, k, ph]) => (
              <div key={k} className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#6b6a66]">{lbl}</label>
                <input value={String(form[k])} onChange={set(k)} placeholder={ph}
                  className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Email (optionnel)</label>
            <input value={form.email} onChange={set('email')} placeholder="client@email.com"
              className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Limite de crédit (MRU)</label>
              <input type="number" value={form.credit || ''} onChange={set('credit')} placeholder="100000"
                className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] font-mono outline-none focus:border-[#1a1a18] focus:bg-white" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Type</label>
              <select value={form.type} onChange={set('type')}
                className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white">
                <option>Particulier</option><option>Entreprise</option><option>Revendeur</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Notes</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Notes sur le client..."
              className="resize-none rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white" />
          </div>
        </div>
        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-black/[0.08] px-5 py-3">
          <button onClick={onClose}
            className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-4 py-2 text-[13px] font-medium cursor-pointer">
            Annuler
          </button>
          <button
            onClick={() => {
              if (!form.prenom || !form.nom) { alert('Remplissez le prénom et le nom'); return }
              onSave(form)
              onClose()
            }}
            className="flex items-center gap-1.5 rounded-[9px] border-none bg-[#1a1a18] px-4 py-2 text-[13px] font-medium text-white cursor-pointer">
            <Check size={13} /> Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function ClientsPage() {
  const { clients, addClient, updateClient: storeUpdateClient, payClient, boutiqueFermee } = useAppStore()
  const [search,     setSearch]     = useState('')
  const [filter,     setFilter]     = useState<FilterKey>('all')
  const [period,     setPeriod]     = useState<Period>('today')
  const [customFrom, setCustomFrom] = useState(isoToday)
  const [customTo,   setCustomTo]   = useState(isoToday)
  const [selId,      setSelId]      = useState<string | null>(null)
  const [showNew,    setShowNew]    = useState(false)

  const TODAY = isoToday()
  const rangeFrom = period === 'today' ? TODAY : period === 'week' ? isoMonday() : period === 'month' ? isoFirstOfMonth() : customFrom
  const rangeTo   = period === 'custom' ? customTo : TODAY
  const periodLabel = period === 'today' ? "Aujourd'hui" : period === 'week' ? 'Cette semaine' : period === 'month' ? 'Ce mois' :
    `${customFrom.split('-').reverse().slice(0,2).join('/')} → ${customTo.split('-').reverse().slice(0,2).join('/')}`

  const selClient = clients.find(c => String(c.id) === selId) ?? null

  const updateClient = (updated: Client) => {
    storeUpdateClient(updated)
    setSelId(updated.id)
  }

  // ── Stats (period-filtered) ──────────────────────────────────────────────────
  const kImpaye = useMemo(() => clients.reduce((s, c) => {
    // Sum remaining on transactions that fall within the period
    const due = c.transactions
      .filter(t => { const iso = dmyToISO(t.date); return iso >= rangeFrom && iso <= rangeTo })
      .reduce((ss, t) => ss + (t.total - t.paid), 0)
    return s + Math.max(0, due)
  }, 0), [clients, rangeFrom, rangeTo])

  const kEncaisse = useMemo(() => clients.reduce((s, c) =>
    s + c.payments.filter(p => { const iso = dmyToISO(p.date); return iso >= rangeFrom && iso <= rangeTo }).reduce((ss, p) => ss + p.amount, 0), 0),
  [clients, rangeFrom, rangeTo])

  const kRetard = useMemo(() => clients.filter(c =>
    cliStatus(c) === 'retard' &&
    c.transactions.some(t => { const iso = dmyToISO(t.date); return iso >= rangeFrom && iso <= rangeTo })
  ).length, [clients, rangeFrom, rangeTo])

  // ── List (status + search only — NOT period-filtered) ────────────────────────
  const rows = useMemo(() => {
    const q = search.toLowerCase()
    return clients.filter(c => {
      if (filter === 'impaye' && resteDu(c) === 0) return false
      if (filter === 'retard' && cliStatus(c) !== 'retard') return false
      if (filter === 'solde'  && resteDu(c) > 0) return false
      if (filter === 'vieux'  && !hasOldDebt(c)) return false
      if (q && !(c.prenom + ' ' + c.nom + ' ' + c.tel + ' ' + c.ville).toLowerCase().includes(q)) return false
      return true
    })
  }, [clients, search, filter])

  const KPI_CARDS = [
    { label: 'Impayés',           val: kImpaye.toLocaleString('fr-FR'),   sub: 'MRU', kpiCls: 'kpi-red',   color: '#c0392b' },
    { label: 'Encaissé',          val: kEncaisse.toLocaleString('fr-FR'), sub: 'MRU', kpiCls: 'kpi-green', color: '#1a7a4a' },
    { label: 'En retard',         val: String(kRetard),                   sub: '',    kpiCls: 'kpi-amber', color: '#996600' },
    { label: 'Total clients',     val: String(clients.length),            sub: '',    kpiCls: 'kpi-blue',  color: '#1a5fa8' },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* Topbar */}
      <div className="border-b border-black/[0.08] bg-white flex-shrink-0">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 gap-3">
          {/* Left: title + period dropdown */}
          <div>
            <h1 className="text-[17px] font-medium">Clients</h1>
            <div className="mt-1.5">
              <select value={period} onChange={e => setPeriod(e.target.value as Period)}
                className="rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 text-[12px] font-medium outline-none text-[#1a1a18] cursor-pointer">
                <option value="today">Aujourd'hui</option>
                <option value="week">Cette semaine</option>
                <option value="month">Ce mois</option>
                <option value="custom">Période...</option>
              </select>
            </div>
          </div>
          {/* Right: period label + new client button */}
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 rounded-[9px] border-none bg-[#1a1a18] px-3 py-1.5 text-[12px] font-medium text-white cursor-pointer hover:opacity-90">
              <Plus size={13} /> <span className="hidden sm:inline">Nouveau client</span><span className="sm:hidden">Nouveau</span>
            </button>
            <span className="text-[11px] text-[#a8a7a2]">Stats · {periodLabel}</span>
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

      {/* KPI cards */}
      <div className="grid flex-shrink-0 grid-cols-2 sm:grid-cols-4 gap-3 px-4 md:px-6 py-3.5">
        {KPI_CARDS.map(k => (
          <div key={k.label} className={k.kpiCls + ' px-3 py-3'}>
            <div className="text-[11px] font-medium uppercase tracking-[.5px] text-[#6b6a66]">{k.label}</div>
            <div className="mt-1 font-mono text-[20px] font-semibold leading-none" style={{ color: k.color }}>
              {k.val} {k.sub && <span className="text-[11px] font-normal" style={{ color: k.color }}>{k.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar — list filters (status + search, NOT period) */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-black/[0.08] bg-white px-3 py-2">
        {/* Filter — select on mobile, pills on desktop */}
        <select value={filter} onChange={e => setFilter(e.target.value as FilterKey)}
          className="sm:hidden rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2 py-1.5 text-[12px] font-medium outline-none text-[#1a1a18]">
          <option value="all">Tous ({clients.length})</option>
          <option value="impaye">Impayés</option>
          <option value="retard">En retard</option>
          <option value="solde">Soldés</option>
          <option value="vieux">Impayés &gt; 1 mois</option>
        </select>
        <div className="hidden sm:flex items-center gap-1.5">
          {(['all', 'impaye', 'retard', 'solde', 'vieux'] as FilterKey[]).map(fk => (
            <button key={fk} onClick={() => setFilter(fk)}
              className={cn(
                'cursor-pointer whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all',
                filter === fk
                  ? fk === 'all'   ? 'border-[#1a1a18] bg-[#1a1a18] text-[#f5f4f0]'
                  : fk === 'solde' ? 'border-[#1a7a4a] bg-[#e8f5ee] text-[#1a7a4a]'
                  : fk === 'vieux' ? 'border-[#7b1fa2] bg-[#f5e6ff] text-[#7b1fa2]'
                  : 'border-[#c0392b] bg-[#fdecea] text-[#c0392b]'
                  : 'border-black/[0.08] bg-white text-[#6b6a66] hover:bg-[#f0efe9]',
              )}>
              {fk === 'all' ? 'Tous' : fk === 'impaye' ? 'Impayés' : fk === 'retard' ? 'En retard' : fk === 'solde' ? 'Soldés' : '⏰ > 1 mois'}
            </button>
          ))}
        </div>
        {/* Count + Search */}
        <span className="ml-auto text-[11px] text-[#a8a7a2] flex-shrink-0">{rows.length} client{rows.length !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-1.5 rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 max-w-[160px]">
          <Search size={12} className="flex-shrink-0 text-[#a8a7a2]" />
          <input type="text" placeholder="Chercher..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-transparent text-[12px] outline-none placeholder:text-[#a8a7a2]" />
        </div>
      </div>

      {/* Client list — cards on mobile, table on desktop */}
      <div className="flex-1 overflow-y-auto" style={{ background: 'linear-gradient(180deg,#eef5ff 0%,#f5f9ff 100%)', scrollbarWidth: 'thin' }}>
        {rows.length === 0
          ? <div className="flex h-full items-center justify-center text-[13px] text-[#a8a7a2]">Aucun client trouvé</div>
          : <>
            {/* ── MOBILE cards ── */}
            <div className="md:hidden px-3 py-2 flex flex-col">
              {rows.map(c => {
                const rd  = resteDu(c)
                const s   = cliStatus(c)
                const col = avColor(c.id)
                return (
                  <div key={c.id}
                    className="tx-row flex items-center gap-3 px-3 py-2.5 cursor-pointer active:scale-[0.99] transition-transform"
                    onClick={() => setSelId(c.id)}>
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
                      style={{ background: `${col}18`, color: col }}>
                      {initials(c.prenom + ' ' + c.nom)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-medium text-[#111110] truncate">{c.prenom} {c.nom}</span>
                        <SBadge s={s} />
                      </div>
                      <div className="text-[11px] text-[#a8a7a2]">
                        {c.tel}{c.ville ? ` · ${c.ville}` : ''}
                        {lastDate(c) !== '—' ? ` · ${lastDate(c)}` : ''}
                      </div>
                      {filter === 'vieux' && (() => { const d = oldestUnpaid(c); return d ? <span className="text-[10px] font-medium text-[#7b1fa2]">⏰ depuis {d.split('-').reverse().join('/')}</span> : null })()}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className={cn('font-mono text-[13px] font-semibold', rd > 0 ? 'text-[#c0392b]' : 'text-[#1a7a4a]')}>
                        {rd > 0 ? `${f(rd)} MRU` : 'Soldé'}
                      </div>
                      <div className="text-[10px] text-[#a8a7a2]">{f(totalAchats(c))} MRU total</div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── DESKTOP cards grid ── */}
            <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-5"
              style={{ background: 'linear-gradient(160deg,#f2efea 0%,#ede9e2 100%)' }}>
              {rows.map(c => {
                const rd  = resteDu(c)
                const s   = cliStatus(c)
                const col = avColor(c.id)
                return (
                  <div key={c.id}
                    onClick={() => setSelId(c.id)}
                    className="relative flex flex-col overflow-hidden rounded-[18px] cursor-pointer"
                    style={{
                      background: 'linear-gradient(160deg,#ffffff 0%,#f9f7f3 100%)',
                      border: '1px solid rgba(200,175,100,0.22)',
                      boxShadow: '0 1px 0 rgba(255,255,255,0.85) inset, 0 -1px 0 rgba(0,0,0,0.05) inset, 0 4px 8px rgba(0,0,0,0.05), 0 10px 28px rgba(0,0,0,0.07)',
                      transition: 'transform 0.22s ease, box-shadow 0.22s ease',
                    }}
                    onMouseEnter={e => Object.assign((e.currentTarget as HTMLElement).style, {
                      transform: 'translateY(-6px)',
                      boxShadow: '0 1px 0 rgba(255,255,255,0.85) inset, 0 -1px 0 rgba(0,0,0,0.05) inset, 0 16px 32px rgba(0,0,0,0.10), 0 36px 56px rgba(0,0,0,0.09)',
                    })}
                    onMouseLeave={e => Object.assign((e.currentTarget as HTMLElement).style, {
                      transform: 'translateY(0)',
                      boxShadow: '0 1px 0 rgba(255,255,255,0.85) inset, 0 -1px 0 rgba(0,0,0,0.05) inset, 0 4px 8px rgba(0,0,0,0.05), 0 10px 28px rgba(0,0,0,0.07)',
                    })}>

                    {/* Gold shimmer line at top */}
                    <div className="absolute inset-x-0 top-0 h-[1px]"
                      style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(212,175,55,0.55) 40%, rgba(255,220,80,0.7) 55%, rgba(212,175,55,0.55) 70%, transparent 100%)' }} />

                    {/* Body */}
                    <div className="flex flex-col gap-3.5 px-4 pt-5 pb-4">

                      {/* Avatar + name */}
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
                          style={{
                            background: `${col}16`,
                            color: col,
                            boxShadow: `0 0 0 2px ${col}22, 0 2px 10px ${col}28`,
                          }}>
                          {initials(c.prenom + ' ' + c.nom)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-[#111110] truncate">{c.prenom} {c.nom}</div>
                          {c.ville && <div className="text-[11px] text-[#a8a7a2] mt-0.5">{c.ville}</div>}
                        </div>
                      </div>

                      {/* Gold divider */}
                      <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(212,175,55,0.25) 0%, rgba(212,175,55,0.10) 60%, transparent 100%)' }} />

                      {/* Status + amount */}
                      <div className="flex items-end justify-between">
                        <div className="flex flex-col gap-1">
                          <SBadge s={s} />
                          {filter === 'vieux' && (() => { const d = oldestUnpaid(c); return d ? <span className="text-[10px] font-medium text-[#7b1fa2]">⏰ {d.split('-').reverse().join('/')}</span> : null })()}
                        </div>
                        {rd > 0
                          ? <div className="text-right">
                              <div className="font-mono text-[17px] font-bold leading-none" style={{ color: '#b5292b' }}>{f(rd)}</div>
                              <div className="mt-0.5 text-[10px] font-medium tracking-wide" style={{ color: 'rgba(181,41,43,0.5)' }}>MRU DÛ</div>
                            </div>
                          : <div className="text-right">
                              <div className="text-[13px] font-semibold text-[#1a7a4a]">Soldé</div>
                              <div className="mt-0.5 text-[10px] text-[#1a7a4a]/50">✓</div>
                            </div>
                        }
                      </div>
                    </div>

                    {/* Bottom accent bar — red if due, green if paid */}
                    <div className="h-[3px] w-full flex-shrink-0"
                      style={{ background: rd > 0
                        ? 'linear-gradient(90deg,#c0392b 0%,#e74c3c 50%,rgba(192,57,43,0.3) 100%)'
                        : 'linear-gradient(90deg,#1a7a4a 0%,#27ae60 50%,rgba(26,122,74,0.3) 100%)' }} />
                  </div>
                )
              })}
            </div>
          </>
        }
      </div>

      {/* Modals */}
      {selClient && (
        <ClientModal
          initial={selClient}
          onClose={() => setSelId(null)}
          onUpdate={updateClient}
          onPayment={payClient}
          boutiqueFermee={boutiqueFermee}
        />
      )}
      {showNew && (
        <NewClientModal
          onClose={() => setShowNew(false)}
          onSave={async (data) => {
            const id = await addClient({ ...data, transactions: [], payments: [] })
            setSelId(id)
          }}
        />
      )}
    </div>
  )
}
