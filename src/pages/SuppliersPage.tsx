import { useState, useMemo, useEffect } from 'react'
import { Search, Plus, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import { useModalShake } from '@/lib/useModalShake'

// ─── Types ────────────────────────────────────────────────────────────────────
type Statut    = 'preparation' | 'confirme' | 'production' | 'en_chemin' | 'livre'
type PayMode   = { mode: string; amount: number }
type CmdLigne  = { ref: string; qte: number; pu: number; total: number }
type Commande  = { id: string; date: string; total: number; paid: number; produit: string; lignes: CmdLigne[]; payModes: PayMode[] }
type EnCours   = { id: string; produit: string; category: string; statut: Statut; totalCmd: number; totalPaye: number; lignes: CmdLigne[]; dateCmd: string; dateEst: string; transport?: number; prixRevient?: number }
type Payment   = { date: string; desc: string; amount: number; modes: PayMode[] }
type Fournisseur = { id: string; nom: string; cat: string; tel: string; email: string; pays: string; delai: number; notes: string; commandes: Commande[]; payments: Payment[]; encours: EnCours[] }
type TabName   = 'commandes' | 'encours' | 'paiements' | 'infos'
type FilterKey = 'all' | 'dette' | 'encours' | 'solde'

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUTS: { id: Statut; label: string; color: string; bg: string }[] = [
  { id: 'preparation', label: 'Préparation', color: '#6b6a66', bg: '#f0efe9' },
  { id: 'confirme',    label: 'Confirmée',   color: '#0066cc', bg: '#e6f0ff' },
  { id: 'production',  label: 'Production',  color: '#996600', bg: '#fdf3dc' },
  { id: 'en_chemin',   label: 'En chemin',   color: '#7b2d8b', bg: '#f5e6ff' },
  { id: 'livre',       label: 'Livrée',      color: '#1a7a4a', bg: '#e8f5ee' },
]

const CHANNELS = [
  { id: 'cash', name: 'Cash',    label: 'CSH', color: '#1a7a4a', bg: '#e8f5ee' },
  { id: 'bnk',  name: 'Bankily', label: 'BNK', color: '#e65c00', bg: '#fff0e6' },
  { id: 'msr',  name: 'Masravi', label: 'MSR', color: '#0066cc', bg: '#e6f0ff' },
  { id: 'sdd',  name: 'Seddad',  label: 'SDD', color: '#7b2d8b', bg: '#f5e6ff' },
  { id: 'bmb',  name: 'Bimban',  label: 'BMB', color: '#c0392b', bg: '#fdecea' },
] as const

const AV_COLORS = ['#f97316','#3b82f6','#1a7a4a','#7c3aed','#e11d48','#0891b2']
const avColor  = (id: string) => { const n = id.split('').reduce((s,ch)=>s+ch.charCodeAt(0),0); return AV_COLORS[n % AV_COLORS.length] }
const ini      = (n: string) => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
const f        = (n: number) => n.toLocaleString('fr-FR')
const todayStr = () => { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` }
const chanById = (name: string) => CHANNELS.find(c => c.name === name) ?? { label: name.slice(0,3).toUpperCase(), color: '#6b6a66', bg: '#f0efe9', name }
const statById = (id: Statut) => STATUTS.find(s => s.id === id) ?? STATUTS[0]

const dmyToISO     = (s: string) => { const p = s.split('/'); return p.length === 3 ? `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}` : s }
const isoNDaysAgo  = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const totalCmds = (f: Fournisseur) => f.commandes.reduce((s, c) => s + c.total, 0)
const totalPaye = (f: Fournisseur) => f.commandes.reduce((s, c) => s + c.paid, 0)
const resteDu   = (f: Fournisseur) => totalCmds(f) - totalPaye(f)
const lastDate  = (f: Fournisseur) => f.commandes.length ? f.commandes[0].date : '—'
const fStatus   = (f: Fournisseur): 'ok' | 'dette' | 'retard' => {
  if (resteDu(f) === 0) return 'ok'
  const hasOldDebt = f.commandes.some(c => c.paid < c.total && dmyToISO(c.date) < isoNDaysAgo(30))
  return hasOldDebt ? 'retard' : 'dette'
}
const STATUT_ORDER: Statut[] = ['preparation', 'confirme', 'production', 'en_chemin']

// ─── No demo data — loaded from Firestore ──────────────────────────────────────
// ─── Channel badge ────────────────────────────────────────────────────────────
function ChBadge({ mode, amount, showAmt = false }: { mode: string; amount?: number; showAmt?: boolean }) {
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

// ─── Status stepper ───────────────────────────────────────────────────────────
function Stepper({ statut }: { statut: Statut }) {
  const stIdx = STATUTS.findIndex(s => s.id === statut)
  return (
    <div className="flex items-start gap-0 px-4 py-3 bg-white border-b border-black/[0.06]">
      {STATUTS.map((s, si) => {
        const done = si <= stIdx
        const cur  = si === stIdx
        return (
          <div key={s.id} className="flex flex-1 items-center">
            <div className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold border-2"
                style={{ borderColor: done ? s.color : '#d3d1c7', background: done ? s.bg : '#fff', color: done ? s.color : '#a8a7a2' }}>
                {done && !cur ? '✓' : String(si + 1)}
              </div>
              <span className="text-center text-[9px] whitespace-nowrap"
                style={{ fontWeight: cur ? 600 : 400, color: cur ? s.color : '#a8a7a2' }}>
                {s.label}
              </span>
            </div>
            {si < STATUTS.length - 1 && (
              <div className="mb-4 h-0.5 min-w-[8px] flex-1"
                style={{ background: si < stIdx ? statById(statut).color : '#e5e4e0' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Commande detail panel ────────────────────────────────────────────────────

// ─── Pay form panel ───────────────────────────────────────────────────────────
function PayFormPanel({ due, onSave, onClose }: { due: number; onSave: (amounts: Record<string, number>, note: string) => void; onClose: () => void }) {
  const [amounts, setAmounts] = useState<Record<string, number>>({})
  const [note,    setNote]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const total = CHANNELS.reduce((s, ch) => s + (amounts[ch.id] ?? 0), 0)
  const set = (id: string, v: number) => setAmounts(p => ({ ...p, [id]: v }))

  return (
    <div className="mx-5 mt-3 flex-shrink-0 rounded-[10px] bg-[#f0efe9] p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium">Enregistrer un paiement</span>
          {due > 0 && <span className="rounded-full bg-[#fdecea] px-2 py-0.5 text-[10px] font-medium text-[#c0392b]">Reste dû : {f(due)} MRU</span>}
        </div>
        <button onClick={onClose} className="border-none bg-transparent cursor-pointer text-[15px] text-[#6b6a66]">✕</button>
      </div>
      <div className="mb-2.5 flex flex-col gap-1">
        <label className="text-[11px] font-medium text-[#6b6a66]">Note</label>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="ex: règlement commande C-0018"
          className="w-full rounded-[8px] border border-black/[0.08] bg-white px-3 py-1.5 text-[13px] outline-none focus:border-[#1a1a18]" />
      </div>
      <p className="mb-1.5 text-[11px] font-medium text-[#6b6a66]">Répartition par mode</p>
      <div className="mb-3 flex flex-col gap-1.5">
        {CHANNELS.map(ch => (
          <div key={ch.id} className="flex items-center gap-3 rounded-[9px] border border-black/[0.08] bg-white px-3 py-2">
            <div className="flex h-5 w-9 flex-shrink-0 items-center justify-center rounded" style={{ background: ch.bg }}>
              <span className="text-[9px] font-bold tracking-wide" style={{ color: ch.color }}>{ch.label}</span>
            </div>
            <span className="flex-1 text-[13px] font-medium">{ch.name}</span>
            <input type="number" min={0} placeholder="0"
              value={(amounts[ch.id] ?? 0) > 0 ? (amounts[ch.id] ?? 0) : ''}
              onChange={e => set(ch.id, parseFloat(e.target.value) || 0)}
              className="w-24 rounded-[7px] border px-2 py-1 text-right font-mono text-[13px] outline-none"
              style={{ borderColor: (amounts[ch.id]??0)>0?'#c0392b':'rgba(0,0,0,0.08)', background: (amounts[ch.id]??0)>0?'#fdecea':'#f0efe9' }} />
            <span className="w-7 text-[11px] text-[#a8a7a2]">MRU</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-black/[0.08] pt-2.5">
        <div className="text-[12px] text-[#6b6a66]">
          Total versé : <strong className="font-mono text-[#111110]">{f(total)} MRU</strong>
          {total > 0 && total < due && <span className="ml-2 text-[10px] text-[#996600]">(partiel)</span>}
          {total > due && due > 0 && <span className="ml-2 text-[10px] text-[#c0392b]">⚠ dépasse la dette</span>}
        </div>
        <button onClick={() => {
          if (total <= 0) { alert('Entrez au moins un montant'); return }
          if (saving) return
          setSaving(true)
          onSave(amounts, note || 'Paiement fournisseur')
        }} disabled={saving} className="flex items-center gap-1.5 rounded-[9px] border-none bg-[#c0392b] px-3.5 py-2 text-[12px] font-medium text-white cursor-pointer hover:opacity-90 disabled:opacity-60">
          <Check size={13} /> Valider
        </button>
      </div>
    </div>
  )
}


// ─── Modale réception + frais transport ──────────────────────────────────────
function ReceptionModal({ enc, onClose, onConfirm }: {
  enc: EnCours
  onClose: () => void
  onConfirm: (transport: number, prixVentes: Record<string, number>) => void
}) {
  const { categories } = useAppStore()
  const cat = categories.find(c => c.name === enc.category) ?? null
  const samePrice = cat?.samePrice ?? false

  const [transport, setTransport] = useState('')
  // Per-ref prix de vente
  const [prixVentes, setPrixVentes] = useState<Record<string, string>>({})
  // Shared prix de vente (samePrice mode)
  const [sharedPrix, setSharedPrix] = useState('')

  const totalQte     = enc.lignes.reduce((s, l) => s + l.qte, 0)
  const totalAchat   = enc.lignes.reduce((s, l) => s + l.total, 0)
  const transportAmt = parseFloat(transport) || 0
  const totalRevient = totalAchat + transportAmt
  const prixRevientU = totalQte  > 0 ? Math.round(totalRevient / totalQte) : 0
  const { ref: shakeRef, shake } = useModalShake()

  const buildPrixVentes = (): Record<string, number> => {
    if (samePrice) {
      const pv = parseFloat(sharedPrix) || 0
      return Object.fromEntries(enc.lignes.map(l => [l.ref, pv]))
    }
    return Object.fromEntries(enc.lignes.map(l => [l.ref, parseFloat(prixVentes[l.ref] ?? '') || 0]))
  }

  const canConfirm = samePrice
    ? parseFloat(sharedPrix) > 0
    : enc.lignes.every(l => parseFloat(prixVentes[l.ref] ?? '') > 0)

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50" onClick={shake}>
      <div ref={shakeRef} className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[580px] max-h-[92vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-black/[0.08] bg-[#f8f7f3] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-medium">Réceptionner la commande</h2>
            <p className="mt-0.5 text-[12px] text-[#a8a7a2]">{enc.produit}</p>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer">
            <X size={13} className="text-[#6b6a66]" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5" style={{ scrollbarWidth: 'thin' }}>
          <div className="rounded-[10px] bg-[#f0efe9] p-4">
            <label className="mb-1.5 block text-[12px] font-medium text-[#6b6a66]">Frais de transport (MRU)</label>
            <input type="number" min="0" placeholder="0" value={transport}
              onChange={e => setTransport(e.target.value)}
              className="w-full rounded-[9px] border border-black/[0.08] bg-white px-3 py-2.5 font-mono text-[16px] outline-none focus:border-[#1a1a18]"/>
            <div className="mt-2 flex items-start gap-1.5">
              <div className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded-full bg-[#996600] flex items-center justify-center">
                <span className="text-[8px] font-bold text-white">i</span>
              </div>
              <p className="text-[11px] text-[#996600]">
                Ajouté à la dette fournisseur · Réparti sur toutes les unités pour le prix de revient.
              </p>
            </div>
          </div>
          <div className="overflow-hidden rounded-[14px] border border-black/[0.06]" style={{ background: 'linear-gradient(145deg, #1a1a18 0%, #2a2a26 100%)' }}>
            <div className="px-5 pt-4 pb-3">
              <p className="text-[10px] font-semibold uppercase tracking-[1px] text-white/40">Prix de revient</p>
            </div>
            <div className="flex flex-col gap-0 px-5 pb-4">
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.06]">
                <span className="text-[12px] text-white/50">Commande</span>
                <span className="font-mono text-[13px] text-white/80">{totalAchat.toLocaleString('fr-FR')} MRU</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.06]">
                <span className="text-[12px] text-white/50">Transport</span>
                <span className={cn('font-mono text-[13px]', transportAmt > 0 ? 'text-[#f0a500]' : 'text-white/30')}>
                  {transportAmt > 0 ? `+${transportAmt.toLocaleString('fr-FR')} MRU` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.06]">
                <span className="text-[12px] text-white/50">Coût total</span>
                <span className="font-mono text-[13px] text-white/80">{totalRevient.toLocaleString('fr-FR')} MRU</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[12px] text-white/50">Unités</span>
                <span className="font-mono text-[13px] text-white/60">{totalQte.toLocaleString('fr-FR')} u</span>
              </div>
            </div>
            <div className="mx-4 mb-4 flex items-center justify-between rounded-[10px] px-4 py-3" style={{ background: 'rgba(26,122,74,0.25)', border: '1px solid rgba(26,122,74,0.4)' }}>
              <span className="text-[13px] font-medium text-white/70">Revient / unité</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-[22px] font-light text-[#4ade80]">{prixRevientU.toLocaleString('fr-FR')}</span>
                <span className="text-[11px] text-white/40">MRU</span>
              </div>
            </div>
          </div>
          {/* Prix de vente */}
          <div className="overflow-hidden rounded-[10px] border-2 border-[#1a5fa8]/40 bg-[#e8f0fb]/40">
            <div className="flex items-center gap-2 border-b border-[#1a5fa8]/20 bg-[#e8f0fb] px-4 py-2.5">
              <span className="flex-1 text-[11px] font-semibold uppercase tracking-[.6px] text-[#1a5fa8]">
                Prix de vente <span className="ml-1 text-[#c0392b]">*</span>
              </span>
              {cat && (
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#1a5fa8]">
                  {samePrice ? '💰 Prix unique' : '🏷 Prix par référence'}
                </span>
              )}
            </div>
            {samePrice ? (
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex-1 text-[13px] font-medium text-[#111110]">Prix de vente unique</span>
                <div className="flex items-center gap-1.5">
                  <input type="number" min={0} placeholder="0" autoFocus value={sharedPrix}
                    onChange={e => setSharedPrix(e.target.value)}
                    className={cn('w-28 rounded-[8px] border px-2.5 py-1.5 text-right font-mono text-[14px] outline-none',
                      !sharedPrix || parseFloat(sharedPrix) <= 0
                        ? 'border-[#f0a500] bg-[#fdf8ec] focus:border-[#f0a500]'
                        : 'border-[#1a5fa8]/40 bg-white focus:border-[#1a5fa8]')} />
                  <span className="text-[12px] text-[#6b6a66]">MRU / u</span>
                </div>
              </div>
            ) : (
              enc.lignes.map((l, i) => {
                const pv = prixVentes[l.ref] ?? ''
                return (
                  <div key={i} className="flex items-center gap-3 border-t border-black/[0.05] bg-white px-4 py-2.5">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#ea580c]" />
                      <span className="truncate text-[13px]">{l.ref}</span>
                    </div>
                    <span className="text-[11px] text-[#a8a7a2]">×{l.qte}</span>
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={0} placeholder="Prix*" value={pv} autoFocus={i === 0}
                        onChange={e => setPrixVentes(p => ({ ...p, [l.ref]: e.target.value }))}
                        className={cn('w-24 rounded-[8px] border px-2.5 py-1.5 text-right font-mono text-[12px] outline-none focus:bg-white',
                          pv === '' || parseFloat(pv) <= 0
                            ? 'border-[#f0a500] bg-[#fdf8ec] focus:border-[#f0a500]'
                            : 'border-black/[0.08] bg-[#f0efe9] focus:border-[#1a5fa8]')} />
                      <span className="text-[11px] text-[#6b6a66]">MRU</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-col gap-2 border-t border-black/[0.08] px-5 py-3">
          {!canConfirm && (
            <div className="flex items-center gap-2 rounded-[8px] border border-[#f0a500]/40 bg-[#fdf8ec] px-3 py-2">
              <span className="text-[11px] font-medium text-[#996600]">
                Saisissez le prix de vente dans la section bleue avant de confirmer
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="text-[12px] text-[#6b6a66]">
              PR moyen : <strong className="font-mono text-[#1a7a4a]">{prixRevientU.toLocaleString('fr-FR')} MRU/u</strong>
              {transportAmt > 0 && <span className="ml-3 text-[#e65c00]">Transport → épargne</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-4 py-2 text-[13px] font-medium cursor-pointer">Annuler</button>
              <button onClick={() => { onConfirm(transportAmt, buildPrixVentes()); onClose() }}
                disabled={!canConfirm}
                className="flex items-center gap-1.5 rounded-[9px] border-none bg-[#1a7a4a] px-4 py-2 text-[13px] font-medium text-white cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
                <Check size={13} /> Confirmer la réception
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CmdPanel({ cmd, onClose, onPayer }: { cmd: Commande; onClose: () => void; onPayer: (amounts: Record<string,number>, note: string) => void }) {
  const reste = cmd.total - cmd.paid
  const [showForm, setShowForm] = useState(false)
  return (
    <div className="mt-3 overflow-hidden rounded-[10px] border border-orange-200 bg-[#fff8f0]">
      <div className="flex items-center justify-between border-b border-orange-100 bg-[#fff0e0] px-3.5 py-2">
        <span className="text-[12px] font-medium text-[#ea580c]">Commande {cmd.id} — {cmd.date}</span>
        <button onClick={onClose} className="flex h-5 w-5 items-center justify-center rounded border-none bg-transparent cursor-pointer text-[#6b6a66] text-[13px] hover:bg-[#fdecea]">✕</button>
      </div>
      <div className="p-3.5">
        {/* Produit header */}
        <div className="mb-3 flex items-center gap-2 rounded-[8px] border border-orange-100 bg-[#fff8f0] px-3 py-2">
          <strong className="text-[13px]">{cmd.produit}</strong>
        </div>
        {/* Lines */}
        <div className="overflow-x-auto -mx-5 px-5">
          <div className="mb-0.5 grid gap-2 border-b border-orange-200 pb-1.5 text-[10px] font-medium uppercase tracking-[.6px] text-[#b45309]"
            style={{ gridTemplateColumns: '1fr 55px 90px 90px', minWidth: '340px' }}>
            <span>Référence</span><span className="text-center">Qté</span>
            <span className="text-right">Prix/u</span><span className="text-right">Total</span>
          </div>
          {cmd.lignes.map((l, i) => (
            <div key={i} className="grid items-center gap-2 border-b border-orange-50 py-1.5"
              style={{ gridTemplateColumns: '1fr 55px 90px 90px', minWidth: '340px' }}>
              <span className="flex items-center gap-1.5 text-[13px]">
                <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#ea580c]"/>
                {l.ref}
              </span>
              <span className="text-center text-[12px] text-[#6b6a66]">×{l.qte}</span>
              <span className="text-right font-mono text-[11px] text-[#6b6a66]">{f(l.pu)} MRU</span>
              <span className="text-right font-mono text-[12px] font-medium">{f(l.total)} MRU</span>
            </div>
          ))}
        </div>
        {/* Paiements */}
        <div className="mt-3 border-t border-orange-100 pt-2.5">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[.6px] text-[#b45309]">Paiements effectués</p>
          {cmd.payModes.length === 0
            ? <p className="text-[12px] text-[#a8a7a2]">Aucun paiement</p>
            : cmd.payModes.map((pm, i) => {
                const ch = chanById(pm.mode)
                return (
                  <div key={i} className="mb-1.5 flex items-center gap-3 rounded-[8px] px-3 py-2" style={{ background: ch.bg }}>
                    <div className="flex h-5 w-9 items-center justify-center rounded text-[9px] font-bold"
                      style={{ background: `${ch.color}20`, color: ch.color }}>{ch.label}</div>
                    <span className="flex-1 text-[13px] font-medium" style={{ color: ch.color }}>{ch.name}</span>
                    <span className="font-mono text-[13px] font-medium" style={{ color: ch.color }}>{f(pm.amount)} MRU</span>
                  </div>
                )
              })
          }
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-orange-100 bg-[#fff0e0] px-3.5 py-2">
        <div className="flex gap-4 text-[12px]">
          <span className="text-[#6b6a66]">Total : <strong className="font-mono text-[#111110]">{f(cmd.total)} MRU</strong></span>
          <span className="text-[#1a7a4a]">Payé : <strong className="font-mono">{f(cmd.paid)} MRU</strong></span>
          {reste > 0 && <span className="text-[#c0392b]">Reste : <strong className="font-mono">{f(reste)} MRU</strong></span>}
        </div>
        {reste > 0 && (
          <button onClick={() => setShowForm(f => !f)}
            className="rounded-[8px] border-none bg-[#c0392b] px-3 py-1.5 text-[11px] font-medium text-white cursor-pointer hover:opacity-90">
            {showForm ? 'Annuler' : 'Régler ce solde'}
          </button>
        )}
      </div>
      {showForm && reste > 0 && (
        <PayFormPanel
          due={reste}
          onClose={() => setShowForm(false)}
          onSave={(amounts, note) => { onPayer(amounts, note); setShowForm(false) }}
        />
      )}
    </div>
  )
}

// ─── En cours card ────────────────────────────────────────────────────────────
function EnCoursCard({ enc, onAvancer, onLivrer, onPayer }: {
  enc: EnCours
  onAvancer: () => void
  onLivrer: (transport: number, prixVentes: Record<string, number>) => void
  onPayer: () => void
}) {
  const [showReception, setShowReception] = useState(false)
  const st     = statById(enc.statut)
  const stIdx  = STATUTS.findIndex(s => s.id === enc.statut)
  const nextSt = stIdx < STATUTS.length - 1 ? STATUTS[stIdx + 1] : null
  const rd     = enc.totalCmd - enc.totalPaye
  const pct    = enc.totalCmd > 0 ? Math.round((enc.totalPaye / enc.totalCmd) * 100) : 0
  const canPay       = enc.statut !== 'preparation' && enc.statut !== 'livre'
  const canDeliver   = enc.statut === 'en_chemin' || enc.statut === 'production'
  const encTotal     = enc.lignes.reduce((s, l) => s + l.total, 0)
  const mustPayPartial = enc.statut === 'confirme' && enc.totalPaye === 0
  const mustPayFirst   = mustPayPartial

  return (
    <div className="mb-4 overflow-hidden rounded-[12px]"
      style={{ border: `2px solid ${canDeliver ? '#1a7a4a' : st.color + '40'}` }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: st.bg }}>
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <strong className="text-[14px] text-[#111110]">{enc.produit}</strong>
          </div>
          <span className="text-[11px] text-[#6b6a66]">
            Commandé le {enc.dateCmd} · Livraison est. <strong>{enc.dateEst}</strong>
          </span>
        </div>
        <div className="text-right">
          <div className="font-mono text-[13px] font-medium text-[#111110]">{f(encTotal)} MRU</div>
          <div className="text-[10px] font-medium" style={{ color: st.color }}>{st.label}</div>
        </div>
      </div>

      {/* Stepper */}
      <Stepper statut={enc.statut} />

      {/* Pay bar */}
      {canPay && (
        <div className="bg-white px-4 pb-3 pt-1">
          <div className="mb-1.5 flex justify-between text-[11px] text-[#6b6a66]">
            <span>Payé : <strong className="font-mono text-[#1a7a4a]">{f(enc.totalPaye)} MRU</strong></span>
            <span className="font-medium" style={{ color: rd > 0 ? '#c0392b' : '#1a7a4a' }}>Reste : {f(rd)} MRU</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#f0efe9]">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: pct === 100 ? '#1a7a4a' : pct > 0 ? '#996600' : '#f0efe9' }} />
          </div>
        </div>
      )}

      {/* Refs table */}
      <div className="overflow-x-auto -mx-[0px] px-[0px]">
        <div className="grid gap-2 bg-[#f8f7f3] px-4 py-2 text-[10px] font-medium uppercase tracking-[.6px] text-[#a8a7a2]"
          style={{ gridTemplateColumns: '1fr 60px 90px 90px', minWidth: '340px' }}>
          <span>Référence</span><span className="text-center">Qté</span>
          <span className="text-right">Prix/u</span><span className="text-right">Total</span>
        </div>
        {enc.lignes.map((l, i) => (
          <div key={i} className="grid items-center gap-2 border-b border-black/[0.04] bg-white px-4 py-2"
            style={{ gridTemplateColumns: '1fr 60px 90px 90px', minWidth: '340px' }}>
            <span className="flex items-center gap-1.5 text-[13px]">
              <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#ea580c]" />
              {l.ref}
            </span>
            <span className="text-center text-[12px] text-[#6b6a66]">×{l.qte}</span>
            <span className="text-right font-mono text-[11px] text-[#6b6a66]">{f(l.pu)} MRU</span>
            <span className="text-right font-mono text-[12px] font-medium">{f(l.total)} MRU</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between bg-[#f8f7f3] px-4 py-2.5">
        <div className="flex gap-2">
          {nextSt && !canDeliver && (
            mustPayFirst ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 rounded-[8px] border border-[#c0392b]/30 bg-[#fdecea] px-3 py-2">
                  <span className="text-[11px] font-medium text-[#c0392b]">
                    {mustPayPartial
                      ? 'Paiement requis — effectuez au moins un acompte avant la production'
                      : <>Soldez les <strong>{(rd).toLocaleString('fr-FR')} MRU</strong> restants avant l'expédition</>}
                  </span>
                </div>
                <button disabled className="rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-3 py-1.5 text-[11px] font-medium text-[#a8a7a2] cursor-not-allowed opacity-50">
                  Passer à : {nextSt.label} →
                </button>
              </div>
            ) : (
              <button onClick={onAvancer}
                className="rounded-[8px] border cursor-pointer px-3 py-1.5 text-[11px] font-medium"
                style={{ borderColor: st.color, background: st.bg, color: st.color }}>
                Passer à : {nextSt.label} →
              </button>
            )
          )}
          {canPay && rd > 0 && (
            <button onClick={onPayer}
              className="rounded-[8px] border border-[#c0392b] bg-[#fdecea] px-3 py-1.5 text-[11px] font-medium text-[#c0392b] cursor-pointer hover:opacity-90">
              Régler dette
            </button>
          )}
        </div>
        {canDeliver && (
          <button onClick={() => setShowReception(true)}
            className="flex items-center gap-2 rounded-[9px] border-none bg-[#1a7a4a] px-4 py-2 text-[12px] font-medium text-white cursor-pointer hover:opacity-90">
            <Check size={14} /> Réceptionner — Ajouter au stock
          </button>
        )}
      </div>
      {showReception && (
        <ReceptionModal enc={enc} onClose={() => setShowReception(false)} onConfirm={(t, pv) => { setShowReception(false); onLivrer(t, pv) }} />
      )}
    </div>
  )
}


// ─── Modale nouvelle commande (En cours) ─────────────────────────────────────
interface NouvelleCommande {
  produit: string
  category: string
  dateEst: string
  lignes: CmdLigne[]
}

const newLigneId = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2)

function NouvelleCommandeModal({ onClose, onSave }: {
  onClose: () => void
  onSave: (cmd: NouvelleCommande) => void
}) {
  const { categories, addCategory } = useAppStore()

  const [produit,   setProduit]   = useState('')
  const [catId,     setCatId]     = useState('')   // id from store, or '__new__'
  const [dateEst,   setDateEst]   = useState('')
  const [lignes,    setLignes]    = useState<{ id: string; ref: string; qte: number; pu: number }[]>([
    { id: newLigneId(), ref: '', qte: 0, pu: 0 }
  ])

  // New category form (shown when catId === '__new__')
  const [newCatName,      setNewCatName]      = useState('')
  const [newCatSamePrice, setNewCatSamePrice] = useState(false)
  const [savingCat,       setSavingCat]       = useState(false)

  const selectedCat = categories.find(c => c.id === catId) ?? null
  const total = lignes.reduce((s, l) => s + l.qte * l.pu, 0)

  const addLigne    = () => setLignes(prev => [...prev, { id: newLigneId(), ref: '', qte: 0, pu: 0 }])
  const removeLigne = (id: string) => setLignes(prev => prev.filter(l => l.id !== id))
  const updLigne    = (id: string, field: 'ref' | 'qte' | 'pu', val: string | number) =>
    setLignes(prev => prev.map(l => l.id === id ? { ...l, [field]: val } : l))

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return
    setSavingCat(true)
    try {
      const id = await addCategory({ name: newCatName.trim(), samePrice: newCatSamePrice })
      setCatId(id)
      setNewCatName('')
      setNewCatSamePrice(false)
    } finally {
      setSavingCat(false)
    }
  }

  const handleSave = () => {
    if (!produit.trim())   { window.alert('Entrez le nom du produit'); return }
    if (!selectedCat)      { window.alert('Sélectionnez ou créez une catégorie'); return }
    if (!dateEst)          { window.alert('Entrez la date de livraison estimée'); return }
    const valid = lignes.filter(l => l.ref.trim() && l.qte > 0 && l.pu > 0)
    if (!valid.length) { window.alert('Ajoutez au moins une référence avec nom, quantité et prix'); return }
    onSave({
      produit: produit.trim(),
      category: selectedCat.name,
      dateEst,
      lignes: valid.map(l => ({ ref: l.ref.trim(), qte: l.qte, pu: l.pu, total: l.qte * l.pu })),
    })
    onClose()
  }

  const inCls = "rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white w-full"
  const { ref: shakeRef, shake } = useModalShake()

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50" onClick={shake}>
      <div ref={shakeRef} className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[640px] max-h-[92vh]"
        onClick={e => e.stopPropagation()}>

        <div className="flex flex-shrink-0 items-center justify-between border-b border-black/[0.08] bg-[#f8f7f3] px-5 py-4">
          <h2 className="text-[15px] font-medium">Nouvelle commande en cours</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer">
            <X size={13} className="text-[#6b6a66]" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5" style={{ scrollbarWidth: 'thin' }}>

          {/* Produit + catégorie */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Nom du produit</label>
              <input value={produit} onChange={e => setProduit(e.target.value)}
                placeholder="ex: Coques iPhone 15" className={inCls}/>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Catégorie</label>
              <select value={catId} onChange={e => setCatId(e.target.value)} className={inCls}>
                <option value="">Choisir...</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.samePrice ? ' — prix unique' : ' — prix par réf.'}
                  </option>
                ))}
                <option value="__new__">+ Créer une catégorie...</option>
              </select>

              {/* Selected category info badge */}
              {selectedCat && (
                <div className={cn('flex items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-[11px] font-medium',
                  selectedCat.samePrice ? 'bg-[#e8f5ee] text-[#1a7a4a]' : 'bg-[#e8f0fb] text-[#1a5fa8]')}>
                  <span>{selectedCat.samePrice ? '💰 Prix unique pour toutes les références' : '🏷 Prix individuel par référence'}</span>
                </div>
              )}

              {/* New category inline form */}
              {catId === '__new__' && (
                <div className="rounded-[10px] border border-black/[0.08] bg-[#f8f7f3] p-3 flex flex-col gap-2.5">
                  <div className="text-[11px] font-semibold text-[#6b6a66] uppercase tracking-[.6px]">Nouvelle catégorie</div>
                  <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                    placeholder="Nom de la catégorie" autoFocus
                    className="rounded-[8px] border border-black/[0.08] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] w-full"/>
                  {/* samePrice toggle */}
                  <button type="button"
                    onClick={() => setNewCatSamePrice(p => !p)}
                    className={cn('flex items-center gap-2.5 rounded-[8px] border px-3 py-2.5 text-[12px] font-medium cursor-pointer transition-all text-left',
                      newCatSamePrice
                        ? 'border-[#1a7a4a] bg-[#e8f5ee] text-[#1a7a4a]'
                        : 'border-black/[0.08] bg-white text-[#6b6a66] hover:border-[#a8a7a2]')}>
                    {/* toggle pill */}
                    <div className={cn('relative h-4 w-7 flex-shrink-0 rounded-full transition-colors',
                      newCatSamePrice ? 'bg-[#1a7a4a]' : 'bg-[#d3d1c7]')}>
                      <div className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all',
                        newCatSamePrice ? 'left-[14px]' : 'left-0.5')}/>
                    </div>
                    <span>
                      {newCatSamePrice
                        ? 'Prix unique — toutes les références ont le même prix de vente'
                        : 'Prix par référence — chaque référence a son propre prix de vente'}
                    </span>
                  </button>
                  <button onClick={handleCreateCategory} disabled={!newCatName.trim() || savingCat}
                    className="flex items-center justify-center gap-1.5 rounded-[8px] border-none bg-[#1a1a18] px-3 py-2 text-[12px] font-medium text-white cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
                    <Check size={12}/> {savingCat ? 'Création...' : 'Créer cette catégorie'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Date estimation */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Date de livraison estimée</label>
            <input type="date" value={dateEst} onChange={e => setDateEst(e.target.value)} className={inCls}/>
          </div>

          {/* Références */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[12px] font-medium text-[#6b6a66]">Références commandées</label>
              <button onClick={addLigne}
                className="flex items-center gap-1 rounded-[7px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1 text-[11px] font-medium cursor-pointer hover:bg-[#e5e4e0]">
                <Plus size={11}/> Ajouter
              </button>
            </div>

            <div className="overflow-x-auto -mx-5 px-5">
              {/* Header */}
              <div className="grid gap-2 rounded-t-[8px] bg-[#f8f7f3] px-3 py-2 text-[10px] font-medium uppercase tracking-[.6px] text-[#a8a7a2]"
                style={{ gridTemplateColumns: '1fr 70px 90px 80px 24px', minWidth: '340px' }}>
                <span>Référence</span>
                <span className="text-center">Qté</span>
                <span className="text-right">Prix achat/u</span>
                <span className="text-right">Total</span>
                <span/>
              </div>

              {lignes.map(l => (
                <div key={l.id} className="grid items-center gap-2 border-t border-black/[0.06] bg-white px-3 py-2"
                  style={{ gridTemplateColumns: '1fr 70px 90px 80px 24px', minWidth: '340px' }}>
                  <input value={l.ref} onChange={e => updLigne(l.id, 'ref', e.target.value)}
                    placeholder="ex: iPhone 15 Pro Blanc"
                    className="rounded-[7px] border border-black/[0.08] bg-[#f0efe9] px-2 py-1.5 text-[12px] outline-none focus:border-[#1a1a18] focus:bg-white w-full"/>
                  <input type="number" min="0" value={l.qte || ''}
                    onChange={e => updLigne(l.id, 'qte', parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="rounded-[7px] border border-black/[0.08] bg-[#f0efe9] px-2 py-1.5 text-center font-mono text-[12px] outline-none focus:border-[#1a1a18] focus:bg-white w-full"/>
                  <input type="number" min="0" value={l.pu || ''}
                    onChange={e => updLigne(l.id, 'pu', parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="rounded-[7px] border border-black/[0.08] bg-[#f0efe9] px-2 py-1.5 text-right font-mono text-[12px] outline-none focus:border-[#1a1a18] focus:bg-white w-full"/>
                  <span className="text-right font-mono text-[11px] text-[#6b6a66]">
                    {(l.qte * l.pu).toLocaleString('fr-FR')}
                  </span>
                  <button onClick={() => removeLigne(l.id)} disabled={lignes.length === 1}
                    className="flex h-5 w-5 items-center justify-center rounded border-none bg-transparent cursor-pointer text-[#a8a7a2] hover:text-[#c0392b] disabled:opacity-30 disabled:cursor-not-allowed">
                    <X size={11}/>
                  </button>
                </div>
              ))}

              {/* Total */}
              <div className="flex justify-between rounded-b-[8px] border-t border-black/[0.08] bg-[#f8f7f3] px-3 py-2" style={{ minWidth: '340px' }}>
                <span className="text-[12px] font-medium text-[#6b6a66]">Total commande</span>
                <span className="font-mono text-[14px] font-medium text-[#1a1a18]">{total.toLocaleString('fr-FR')} MRU</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-black/[0.08] px-5 py-3">
          <button onClick={onClose} className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-4 py-2 text-[13px] font-medium cursor-pointer">Annuler</button>
          <button onClick={handleSave}
            className="flex items-center gap-1.5 rounded-[9px] border-none bg-[#1a1a18] px-4 py-2 text-[13px] font-medium text-white cursor-pointer hover:opacity-90">
            <Check size={13}/> Passer la commande
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Fournisseur detail modal ─────────────────────────────────────────────────
function FournModal({ initial, onClose, onUpdate, onLivrer, onPayFourn }: {
  initial: Fournisseur; onClose: () => void; onUpdate: (f: Fournisseur) => void
  onLivrer: (encId: string, transport: number, prixVentes: Record<string, number>) => void
  onPayFourn: (amounts: Record<string, number>, note: string, cmdId?: string) => void
}) {
  const [fourn, setFourn]     = useState<Fournisseur>(initial)
  const [tab, setTab]         = useState<TabName>('commandes')
  const [selCmd, setSelCmd]   = useState<string | null>(null)
  const [showPay, setShowPay] = useState(false)
  const [payingCmdId, setPayingCmdId] = useState<string | null>(null)
  const [showNewCmd, setShowNewCmd] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm]       = useState({ nom: initial.nom, cat: initial.cat, tel: initial.tel, email: initial.email, pays: initial.pays, delai: initial.delai, notes: initial.notes })

  const color = avColor(fourn.id)
  const ta    = totalCmds(fourn)
  const tp    = totalPaye(fourn)
  const rd    = resteDu(fourn)
  const selCmdObj = fourn.commandes.find(c => c.id === selCmd) ?? null

  // Payer une commande spécifique (pas toutes en FIFO)
  const paySpecificCmd = (cmdId: string, amounts: Record<string, number>, note: string) => {
    const total = CHANNELS.reduce((s, ch) => s + (amounts[ch.id] ?? 0), 0)
    if (total <= 0) return
    const modesUsed = CHANNELS
      .filter(ch => (amounts[ch.id] ?? 0) > 0)
      .map(ch => ({ mode: ch.name, amount: amounts[ch.id] }))

    // Update the specific commande
    const updCmds = fourn.commandes.map(cmd => {
      if (cmd.id !== cmdId) return cmd
      const due = cmd.total - cmd.paid
      const pay = Math.min(due, total)
      const newModes = [...cmd.payModes]
      modesUsed.forEach(m => {
        const ex = newModes.find(p => p.mode === m.mode)
        if (ex) ex.amount += m.amount; else newModes.push({ ...m })
      })
      return { ...cmd, paid: cmd.paid + pay, payModes: newModes }
    })

    // Recalculate totalPaye for encours linked to this commande
    const updEnCours = fourn.encours.map(enc => {
      const paye = updCmds
        .filter(cmd => cmd.produit === enc.produit)
        .reduce((s, cmd) => s + cmd.paid, 0)
      return { ...enc, totalPaye: Math.min(enc.totalCmd, paye) }
    })

    const newPay = { date: todayStr(), desc: note || `Paiement ${cmdId}`, amount: total, modes: modesUsed }
    const updated = { ...fourn, commandes: updCmds, encours: updEnCours, payments: [newPay, ...fourn.payments] }
    setFourn(updated)
    onUpdate(updated)
    setPayingCmdId(null)
  }

  // Sync local state when Firestore updates the fournisseur (ex: après un paiement)
  const storeFourn = useAppStore(s => s.fournisseurs.find(f => f.id === fourn.id))
  useEffect(() => {
    if (storeFourn) setFourn(storeFourn)
  }, [storeFourn])

  const savePayment = (amounts: Record<string, number>, note: string) => {
    onPayFourn(amounts, note, payingCmdId ?? undefined)
    setShowPay(false)
    setPayingCmdId(null)
  }

  const avancerStatut = (encId: string) => {
    const enc = fourn.encours.find(e => e.id === encId)
    if (!enc) return
    if (enc.statut === 'confirme' && enc.totalPaye === 0) return
    if (enc.statut === 'production' && enc.totalCmd - enc.totalPaye > 0) return
    const updEnCours = fourn.encours.map(e => {
      if (e.id !== encId) return e
      const idx = STATUT_ORDER.indexOf(e.statut)
      if (idx >= 0 && idx < STATUT_ORDER.length - 1) return { ...e, statut: STATUT_ORDER[idx + 1] as Statut }
      return e
    })
    const updated = { ...fourn, encours: updEnCours }
    setFourn(updated)
    onUpdate(updated)
  }

  const handleNewCommande = (cmd: { produit: string; category: string; dateEst: string; lignes: CmdLigne[] }) => {
    const today = new Date()
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`
    const dateEstFr = cmd.dateEst ? (() => { const [y,m,d] = cmd.dateEst.split('-'); return `${d}/${m}/${y}` })() : ''
    const total = cmd.lignes.reduce((s, l) => s + l.total, 0)
    const cmdId = 'C-' + Date.now().toString(36).slice(-4).toUpperCase()
    const encId = 'EC-' + Date.now().toString(36).toUpperCase()

    // 1. Ajouter dans Commandes (historique de la commande)
    const newCmd: Commande = {
      id:       cmdId,
      date:     dateStr,
      total:    total,
      paid:     0,
      produit:  cmd.produit,
      lignes:   cmd.lignes,
      payModes: [],
    }

    // 2. Ajouter dans En cours (suivi du statut)
    const newEnc: EnCours = {
      id:        encId,
      produit:   cmd.produit,
      category:  cmd.category,
      statut:    'preparation',
      totalCmd:  total,
      totalPaye: 0,
      lignes:    cmd.lignes,
      dateCmd:   dateStr,
      dateEst:   dateEstFr,
    }

    const updated = {
      ...fourn,
      commandes: [newCmd, ...fourn.commandes],
      encours:   [...fourn.encours, newEnc],
    }
    setFourn(updated)
    onUpdate(updated)
    setTab('encours')
    setShowNewCmd(false)
  }

  const marquerLivree = (encId: string, transport: number, prixVentes: Record<string, number>) => {
    const enc = fourn.encours.find(e => e.id === encId)
    if (!enc) return
    onLivrer(encId, transport, prixVentes)
    const totalQte    = enc.lignes.reduce((s, l) => s + l.qte, 0)
    const totalAchat  = enc.lignes.reduce((s, l) => s + l.total, 0)
    const transportU  = totalQte > 0 ? Math.round(transport / totalQte) : 0
    const prixRevient = totalQte > 0 ? Math.round((totalAchat + transport) / totalQte) : 0
    setNotif({
      msg: `${enc.produit} réceptionné · PR: ${prixRevient.toLocaleString('fr-FR')} MRU/u${transport > 0 ? ` (transport: ${transport.toLocaleString('fr-FR')} MRU)` : ''}`,
      detail: enc.lignes.map(l => `${l.ref} ×${l.qte} — PR: ${(l.pu + transportU).toLocaleString('fr-FR')} MRU`).join(' · '),
    })
    setTimeout(() => setNotif(null), 8000)
  }

  const [notif, setNotif] = useState<{ msg: string; detail: string } | null>(null)

  const upd = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm(p => ({ ...p, [k]: k === 'delai' ? parseInt(e.target.value) || 0 : e.target.value }))

  const saveEdit = () => {
    const updated = { ...fourn, ...form }
    setFourn(updated)
    onUpdate(updated)
    setEditing(false)
  }

  const { ref: shakeRef, shake } = useModalShake()

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45" onClick={shake}>
        <div ref={shakeRef} className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[780px] max-h-[92vh]"
          onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="flex flex-shrink-0 flex-col gap-2.5 border-b border-black/[0.08] bg-[#f8f7f3] px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] text-[15px] font-medium"
                style={{ background: `${color}18`, color }}>
                {ini(fourn.nom)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium truncate">{fourn.nom}</div>
                <div className="text-[11px] text-[#a8a7a2] truncate">{fourn.cat}{fourn.pays ? ' · ' + fourn.pays : ''}{fourn.tel ? ' · ' + fourn.tel : ''}</div>
              </div>
              <button onClick={onClose} className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer">
                <X size={13} className="text-[#6b6a66]" />
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setEditing(true); setTab('infos') }}
                className="flex-1 rounded-[9px] border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] font-medium cursor-pointer hover:opacity-80">
                Modifier
              </button>
              <button onClick={() => setShowNewCmd(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border-none bg-[#1a1a18] px-3 py-1.5 text-[12px] font-medium text-white cursor-pointer hover:opacity-90">
                <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Nouvelle commande
              </button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid flex-shrink-0 grid-cols-2 sm:grid-cols-4 gap-2 border-b border-black/[0.08] px-4 py-3">
            {([
              ['Commandé', f(ta) + ' MRU', 'text-[#1a5fa8]'],
              ['Payé',     f(tp) + ' MRU', 'text-[#1a7a4a]'],
              ['Reste dû', f(rd) + ' MRU', 'text-[#c0392b]'],
              ['Commandes', String(fourn.commandes.length), 'text-[#111110]'],
            ] as [string, string, string][]).map(([lbl, val, cls]) => (
              <div key={lbl} className="rounded-[9px] bg-[#f0efe9] px-3 py-2">
                <div className="text-[10px] font-medium uppercase tracking-[.6px] text-[#a8a7a2]">{lbl}</div>
                <div className={cn('mt-0.5 font-mono text-[14px] font-semibold leading-tight', cls)}>{val}</div>
              </div>
            ))}
          </div>

          {/* Pay form */}
          {showPay && <PayFormPanel due={payingCmdId ? (fourn.commandes.find(c=>c.id===payingCmdId)?.total ?? 0) - (fourn.commandes.find(c=>c.id===payingCmdId)?.paid ?? 0) : rd} onSave={savePayment} onClose={() => { setShowPay(false); setPayingCmdId(null) }} />}

          {/* Tabs */}
          <div className="flex flex-shrink-0 overflow-x-auto border-b border-black/[0.08] px-3" style={{ scrollbarWidth: 'none' }}>
            {(['commandes', 'encours', 'paiements', 'infos'] as TabName[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('flex-shrink-0 border-none bg-transparent cursor-pointer border-b-2 px-3 pb-2.5 pt-2 text-[12px] font-medium transition-all',
                  tab === t ? 'border-[#1a1a18] text-[#111110]' : 'border-transparent text-[#a8a7a2] hover:text-[#6b6a66]')}>
                {t === 'commandes' ? 'Commandes' : t === 'encours' ? `En cours (${fourn.encours.length})` : t === 'paiements' ? 'Paiements' : 'Infos'}
              </button>
            ))}
          </div>

          {/* Tab body */}
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>

            {/* ── Commandes ── */}
            {tab === 'commandes' && (
              <div className="p-3 sm:p-5">
                {fourn.commandes.length === 0
                  ? <div className="py-8 text-center text-[13px] text-[#a8a7a2]">Aucune commande</div>
                  : <div className="flex flex-col gap-2">
                    {fourn.commandes.map(cmd => {
                      const r = cmd.total - cmd.paid
                      const isOpen = selCmd === cmd.id
                      return (
                        <div key={cmd.id} onClick={() => setSelCmd(isOpen ? null : cmd.id)}
                          className="cursor-pointer rounded-[10px] border border-black/[0.07] bg-white overflow-hidden transition-all">
                          {/* Card header */}
                          <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-[11px] font-medium text-[#ea580c]">{cmd.id}</span>
                                {r === 0
                                  ? <span className="rounded-full bg-[#e8f5ee] px-2 py-0.5 text-[9px] font-medium text-[#1a7a4a]">✓ Soldée</span>
                                  : cmd.paid > 0
                                  ? <span className="rounded-full bg-[#fdf3dc] px-2 py-0.5 text-[9px] font-medium text-[#996600]">Partiel</span>
                                  : <span className="rounded-full bg-[#fdecea] px-2 py-0.5 text-[9px] font-medium text-[#c0392b]">Impayée</span>
                                }
                              </div>
                              <div className="mt-0.5 text-[12px] text-[#111110] truncate">{cmd.produit}</div>
                              <div className="text-[10px] text-[#a8a7a2]">{cmd.date}</div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <div className="font-mono text-[13px] font-semibold text-[#111110]">{f(cmd.total)} MRU</div>
                              {r > 0 && <div className="font-mono text-[11px] text-[#c0392b]">−{f(r)} MRU</div>}
                              {r === 0 && <div className="font-mono text-[11px] text-[#1a7a4a]">soldée</div>}
                            </div>
                          </div>
                          {/* Expanded detail */}
                          {isOpen && (
                            <div className="border-t border-black/[0.06] bg-[#f8f7f3] px-3.5 py-2.5" onClick={e => e.stopPropagation()}>
                              <CmdPanel cmd={cmd} onClose={() => setSelCmd(null)} onPayer={(amounts, note) => paySpecificCmd(cmd.id, amounts, note)} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                }
              </div>
            )}

            {/* ── En cours ── */}
            {tab === 'encours' && (
              <div className="p-5">
                {fourn.encours.length === 0
                  ? <div className="py-8 text-center text-[13px] text-[#a8a7a2]">Aucune commande en cours</div>
                  : fourn.encours.map(enc => (
                      <EnCoursCard
                        key={enc.id}
                        enc={enc}
                        onAvancer={() => avancerStatut(enc.id)}
                        onLivrer={(transport, pv) => marquerLivree(enc.id, transport, pv)}
                        onPayer={() => { setPayingCmdId(null); setShowPay(true) }}
                      />
                    ))
                }
                {fourn.encours.length > 0 && (
                  <div className="flex justify-end pt-1 text-[12px] text-[#6b6a66]">
                    Valeur totale : <strong className="ml-1.5 font-mono text-[#111110]">
                      {f(fourn.encours.reduce((s, e) => s + e.lignes.reduce((ss, l) => ss + l.total, 0), 0))} MRU
                    </strong>
                  </div>
                )}
              </div>
            )}

            {/* ── Paiements ── */}
            {tab === 'paiements' && (
              <div className="p-5">
                {fourn.payments.length === 0
                  ? <div className="py-8 text-center text-[13px] text-[#a8a7a2]">Aucun paiement</div>
                  : fourn.payments.map((p, i) => (
                      <div key={i} className="flex items-start gap-2.5 border-b border-black/[0.05] py-2.5">
                        <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-[#c0392b]" />
                        <div className="flex flex-1 flex-col gap-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-[#a8a7a2]">{p.date}</span>
                            <span className="flex-shrink-0 font-mono text-[13px] font-medium text-[#c0392b]">
                              −{f(p.amount)} MRU
                            </span>
                          </div>
                          <div className="text-[12px] text-[#111110] truncate">{p.desc}</div>
                          {p.modes.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {p.modes.map((m, j) => <ChBadge key={j} mode={m.mode} amount={m.amount} showAmt />)}
                            </div>
                          )}
                        </div>
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
                      {([['Nom', 'nom'], ['Catégorie', 'cat'], ['Téléphone', 'tel'], ['Email', 'email'], ['Pays / Ville', 'pays']] as [string, keyof typeof form][]).map(([lbl, k]) => (
                        <div key={k} className="flex flex-col gap-1">
                          <label className="text-[11px] font-medium text-[#6b6a66]">{lbl}</label>
                          <input value={String(form[k])} onChange={upd(k)}
                            className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white" />
                        </div>
                      ))}
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-[#6b6a66]">Délai livraison (jours)</label>
                        <input type="number" value={form.delai} onChange={upd('delai')}
                          className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] font-mono outline-none focus:border-[#1a1a18] focus:bg-white" />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-[#6b6a66]">Notes</label>
                      <textarea value={form.notes} onChange={upd('notes')} rows={2}
                        className="resize-none rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white" />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditing(false)} className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-4 py-2 text-[13px] font-medium cursor-pointer">Annuler</button>
                      <button onClick={saveEdit} className="flex items-center gap-1.5 rounded-[9px] border-none bg-[#1a1a18] px-4 py-2 text-[13px] font-medium text-white cursor-pointer">
                        <Check size={13} /> Enregistrer
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {([['Nom', fourn.nom], ['Catégorie', fourn.cat], ['Téléphone', fourn.tel||'—'], ['Email', fourn.email||'—'], ['Pays / Ville', fourn.pays||'—'], ['Délai livraison', fourn.delai+' jours'], ['Total commandé', f(ta)+' MRU'], ['Reste dû', f(rd)+' MRU']] as [string,string][]).map(([lbl, val]) => (
                        <div key={lbl} className="rounded-[9px] bg-[#f0efe9] px-3.5 py-2.5">
                          <div className="text-[10px] font-medium uppercase tracking-[.6px] text-[#a8a7a2]">{lbl}</div>
                          <div className="mt-1 text-[13px] font-medium text-[#111110]">{val}</div>
                        </div>
                      ))}
                    </div>
                    {fourn.notes && (
                      <div className="mt-3 rounded-[9px] bg-[#fdf3dc] px-3.5 py-2.5">
                        <div className="text-[10px] font-medium uppercase tracking-[.6px] text-[#996600]">Notes</div>
                        <div className="mt-1 text-[13px] text-[#111110]">{fourn.notes}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Nouvelle commande modal */}
      {showNewCmd && (
        <NouvelleCommandeModal
          onClose={() => setShowNewCmd(false)}
          onSave={handleNewCommande}
        />
      )}

      {/* Notification */}
      {notif && (
        <div className="fixed bottom-6 right-6 z-[200] max-w-[calc(100vw-2rem)] rounded-[12px] bg-[#1a7a4a] p-4 text-white"
          style={{ boxShadow: '0 8px 24px rgba(0,0,0,.2)', animation: 'slideUp .3s ease' }}>
          <style>{`@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
          <div className="mb-1 font-medium">Stock mis à jour !</div>
          <div className="text-[11px] opacity-85">{notif.msg}</div>
          {notif.detail && <div className="mt-1.5 border-t border-white/20 pt-1.5 text-[10px] opacity-70">{notif.detail}</div>}
        </div>
      )}
    </>
  )
}

// ─── New fournisseur modal ────────────────────────────────────────────────────
function NewFournModal({ onClose, onSave }: { onClose: () => void; onSave: (d: Omit<Fournisseur,'id'|'commandes'|'payments'|'encours'>) => void }) {
  const [form, setForm] = useState({ nom:'', cat:'Coques & Accessoires', tel:'', email:'', pays:'', delai:14, notes:'' })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm(p => ({ ...p, [k]: k === 'delai' ? parseInt(e.target.value)||0 : e.target.value }))
  const { ref: shakeRef, shake } = useModalShake()
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45" onClick={shake}>
      <div ref={shakeRef} className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[500px] max-h-[92vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-black/[0.08] px-5 py-4">
          <h2 className="text-[15px] font-medium">Nouveau fournisseur</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer"><X size={13} className="text-[#6b6a66]"/></button>
        </div>
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            {([['Nom du fournisseur','nom','TechSupply SARL'],['Pays / Ville','pays','Chine — Shenzhen']] as [string,keyof typeof form,string][]).map(([lbl,k,ph]) => (
              <div key={k} className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#6b6a66]">{lbl}</label>
                <input value={String(form[k])} onChange={set(k)} placeholder={ph}
                  className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white"/>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Catégorie</label>
            <select value={form.cat} onChange={set('cat')}
              className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white">
              {['Coques & Accessoires','Câbles & Chargeurs','Écrans & Pièces','Électronique','Divers'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([['Téléphone','tel','+86 XXX XXXX'],['Email','email','contact@fourn.com']] as [string,keyof typeof form,string][]).map(([lbl,k,ph]) => (
              <div key={k} className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#6b6a66]">{lbl}</label>
                <input value={String(form[k])} onChange={set(k)} placeholder={ph}
                  className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white"/>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Délai livraison (jours)</label>
            <input type="number" value={form.delai||''} onChange={set('delai')} placeholder="14"
              className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] font-mono outline-none focus:border-[#1a1a18] focus:bg-white"/>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Notes</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Notes..."
              className="resize-none rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white"/>
          </div>
        </div>
        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-black/[0.08] px-5 py-3">
          <button onClick={onClose} className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-4 py-2 text-[13px] font-medium cursor-pointer">Annuler</button>
          <button onClick={() => { if(!form.nom){alert('Entrez le nom');return}; onSave(form); onClose() }}
            className="flex items-center gap-1.5 rounded-[9px] border-none bg-[#1a1a18] px-4 py-2 text-[13px] font-medium text-white cursor-pointer">
            <Check size={13}/> Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function SuppliersPage() {
  const { fournisseurs: fourns, addFournisseur, updateFournisseur, livrerEncours, payFourn } = useAppStore()
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState<FilterKey>('all')
  const [selId,    setSelId]    = useState<string | null>(null)
  const [showNew,  setShowNew]  = useState(false)

  const selFourn = fourns.find(f => f.id === selId) ?? null

  const kDettes   = useMemo(() => fourns.reduce((s, f) => s + resteDu(f), 0), [fourns])
  const kCmds     = useMemo(() => fourns.reduce((s, f) => s + totalCmds(f), 0), [fourns])
  const kPaye     = useMemo(() => fourns.reduce((s, f) => s + f.payments.reduce((ss, p) => ss + p.amount, 0), 0), [fourns])
  const kEnCours  = useMemo(() => fourns.reduce((s, f) => s + f.encours.length, 0), [fourns])

  const rows = useMemo(() => {
    const q = search.toLowerCase()
    return fourns.filter(f => {
      if (filter === 'dette'   && resteDu(f) === 0) return false
      if (filter === 'encours' && f.encours.length === 0) return false
      if (filter === 'solde'   && resteDu(f) > 0) return false
      if (q && !(f.nom + ' ' + f.cat + ' ' + f.pays).toLowerCase().includes(q)) return false
      return true
    })
  }, [fourns, search, filter])

  const updateFourn = (updated: Fournisseur) => {
    updateFournisseur(updated)
    setSelId(updated.id)
  }

  const KPI_CARDS = [
    { label:'Total commandé',    val: kCmds.toLocaleString('fr-FR'),   sub:'MRU', kpiCls:'kpi-amber', color:'#996600' },
    { label:'Dettes totales',    val: kDettes.toLocaleString('fr-FR'), sub:'MRU', kpiCls:'kpi-red',   color:'#c0392b' },
    { label:'Payé ce mois',      val: kPaye.toLocaleString('fr-FR'),   sub:'MRU', kpiCls:'kpi-blue',  color:'#1a5fa8' },
    { label:'En cours',          val: String(kEnCours),                sub:'cmds', kpiCls:'kpi-green', color:'#1a7a4a' },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Topbar */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-black/[0.08] bg-white px-4 md:px-6 py-3.5">
        <div>
          <h1 className="text-[17px] font-medium">Fournisseurs</h1>
          <p className="mt-0.5 text-[12px] text-[#a8a7a2] hidden sm:block">
            {new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}
          </p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 rounded-[9px] border-none bg-[#1a1a18] px-3.5 py-2 text-[13px] font-medium text-white cursor-pointer hover:opacity-90">
          <Plus size={14}/> <span className="hidden sm:inline">Nouveau fournisseur</span><span className="sm:hidden">Nouveau</span>
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid flex-shrink-0 grid-cols-2 sm:grid-cols-4 gap-3 px-4 md:px-6 py-3.5">
        {KPI_CARDS.map(k => (
          <div key={k.label} className={k.kpiCls + ' px-3 py-3 md:px-4 md:py-4'}>
            <div className="text-[9px] font-bold uppercase tracking-[.6px]" style={{ color: k.color }}>{k.label}</div>
            <div className="font-mono text-[18px] md:text-[22px] font-bold leading-none mt-1" style={{ color: k.color }}>{k.val}</div>
            {k.sub && <div className="text-[9px] mt-1 text-[#a8a7a2]">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-black/[0.08] bg-white px-3 py-2">
        {/* Filter — select on mobile, pills on desktop */}
        <select value={filter} onChange={e => setFilter(e.target.value as FilterKey)}
          className="sm:hidden rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2 py-1.5 text-[12px] font-medium outline-none text-[#1a1a18]">
          <option value="all">Tous</option>
          <option value="dette">Avec dettes</option>
          <option value="encours">En cours</option>
          <option value="solde">Soldés</option>
        </select>
        <div className="hidden sm:flex items-center gap-1.5">
          {(['all','dette','encours','solde'] as FilterKey[]).map(fk => (
            <button key={fk} onClick={() => setFilter(fk)}
              className={cn('cursor-pointer whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all',
                filter === fk
                  ? fk === 'all' ? 'border-[#1a1a18] bg-[#1a1a18] text-[#f5f4f0]'
                  : fk === 'solde' ? 'border-[#1a7a4a] bg-[#e8f5ee] text-[#1a7a4a]'
                  : 'border-[#c0392b] bg-[#fdecea] text-[#c0392b]'
                  : 'border-black/[0.08] bg-white text-[#6b6a66] hover:bg-[#f0efe9]')}>
              {fk === 'all' ? 'Tous' : fk === 'dette' ? 'Avec dettes' : fk === 'encours' ? 'En cours' : 'Soldés'}
            </button>
          ))}
        </div>
        {/* Search */}
        <div className="flex flex-1 items-center gap-1.5 rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 ml-auto max-w-[180px]">
          <Search size={12} className="flex-shrink-0 text-[#a8a7a2]"/>
          <input type="text" placeholder="Chercher..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-transparent text-[12px] outline-none placeholder:text-[#a8a7a2]"/>
        </div>
      </div>

      {/* Fournisseur list */}
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ background: 'linear-gradient(180deg,#eef5ff 0%,#f5f9ff 100%)', scrollbarWidth: 'thin' }}>
        {rows.length === 0
          ? <div className="flex h-full items-center justify-center text-[13px] text-[#a8a7a2]">Aucun fournisseur trouvé</div>
          : rows.map(fr => {
              const rd2 = resteDu(fr)
              const s   = fStatus(fr)
              const col = avColor(fr.id)
              const enc = fr.encours.length
              return (
                <div key={fr.id}
                  className="tx-row flex items-center gap-3 px-3 py-2.5 cursor-pointer active:scale-[0.99] transition-transform"
                  onClick={() => setSelId(fr.id)}>
                  {/* Avatar */}
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] text-[12px] font-semibold"
                    style={{ background: `${col}18`, color: col }}>
                    {ini(fr.nom)}
                  </div>
                  {/* Name + info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium text-[#111110] truncate">{fr.nom}</span>
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium',
                        s==='ok'?'bg-[#e8f5ee] text-[#1a7a4a]':s==='retard'?'bg-[#fdecea] text-[#c0392b]':'bg-[#fdf3dc] text-[#996600]')}>
                        {s==='ok'?'Soldé':s==='retard'?'⚠ Retard':'Dette'}
                      </span>
                      {enc > 0 && (
                        <span className="inline-flex rounded-full bg-[#f5e6ff] px-2 py-0.5 text-[10px] font-medium text-[#7b2d8b]">
                          {enc} en cours
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#a8a7a2]">
                      {fr.cat}{fr.pays ? ` · ${fr.pays}` : ''}
                      {lastDate(fr) !== '—' ? ` · ${lastDate(fr)}` : ''}
                    </div>
                  </div>
                  {/* Amount */}
                  <div className="flex-shrink-0 text-right">
                    <div className={cn('font-mono text-[13px] font-semibold', rd2 > 0 ? 'text-[#c0392b]' : 'text-[#1a7a4a]')}>
                      {rd2 > 0 ? `${f(rd2)} MRU` : 'Soldé'}
                    </div>
                    <div className="text-[10px] text-[#a8a7a2]">{f(totalCmds(fr))} MRU total</div>
                  </div>
                </div>
              )
            })
        }
      </div>

      {/* Modals */}
      {selFourn && (
        <FournModal initial={selFourn} onClose={() => setSelId(null)} onUpdate={updateFourn} onLivrer={(encId, transport, pv) => livrerEncours(selFourn!.id, encId, transport, pv)} onPayFourn={(amounts, note, cmdId) => payFourn(selFourn!.id, amounts, note, cmdId)} />
      )}
      {showNew && (
        <NewFournModal
          onClose={() => setShowNew(false)}
          onSave={async (data) => {
            try {
              const id = await addFournisseur({ ...data, commandes:[], payments:[], encours:[] })
              setSelId(id)
              setShowNew(false)
            } catch (err) {
              console.error('Erreur ajout fournisseur:', err)
              alert('Erreur Firebase: ' + String(err))
            }
          }}
        />
      )}
    </div>
  )
}
