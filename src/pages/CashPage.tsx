import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Plus, X, Check, Search, Wallet, TrendingDown, TrendingUp, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { InvoiceModal } from '@/components/InvoiceModal'
import type { InvoiceData } from '@/components/InvoiceModal'
import type { DetteDiverse, DettePayment, CashMvt, AvanceMvt, Tx, TxLine, Product } from '@/store/appStore'

// ─── Resizable hook ───────────────────────────────────────────────────────────
function useResizable(initial: number, min: number, max: number) {
  const [width, setWidth] = useState(initial)
  const dragging = useRef(false)
  const startX   = useRef(0)
  const startW   = useRef(initial)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    startX.current   = e.clientX
    startW.current   = width
    e.preventDefault()
  }, [width])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const diff = startX.current - e.clientX   // dragging left = increase right panel
      const next = Math.min(max, Math.max(min, startW.current + diff))
      setWidth(next)
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [min, max])

  return { width, onMouseDown }
}

// ─── Types ────────────────────────────────────────────────────────────────────
type MvtType = 'vente' | 'credit' | 'client' | 'fourn' | 'depense' | 'investissement' | 'entree' | 'ouverture' | 'cloture' | 'benefice'
type MvtDir  = 'entree' | 'sortie'
type PayMode = { mode: string; amount: number }

interface Mouvement {
  id: string
  date: string   // DD/MM/YYYY
  time: string   // HH:MM
  type: MvtType
  dir: MvtDir
  desc: string
  cat: string
  montant: number
  modes: PayMode[]
}

type FilterMvt  = 'all' | 'entree' | 'sortie' | 'vente' | 'credit' | 'client' | 'fourn' | 'depense' | 'investissement' | 'benefice' | 'paid' | 'non_sorti'
type FilterPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

// ─── Constants ────────────────────────────────────────────────────────────────
const CHANNELS = [
  { id: 'cash', name: 'Cash',    label: 'CSH', color: '#1a7a4a', bg: '#e8f5ee' },
  { id: 'bnk',  name: 'Bankily', label: 'BNK', color: '#e65c00', bg: '#fff0e6' },
  { id: 'msr',  name: 'Masravi', label: 'MSR', color: '#0066cc', bg: '#e6f0ff' },
  { id: 'sdd',  name: 'Seddad',  label: 'SDD', color: '#7b2d8b', bg: '#f5e6ff' },
  { id: 'bmb',  name: 'Bimban',  label: 'BMB', color: '#c0392b', bg: '#fdecea' },
] as const

const DEP_CATS  = ['Loyer','Salaires','Électricité / Eau','Transport','Fournitures','Réparations','Paiement fournisseur','Autre']
const INV_CATS  = ['Achat bagages']
const ENT_CATS  = ['Dépôt client','Apport de fonds','Remboursement','Correction','Autre']

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt   = (n: number) => n.toLocaleString('fr-FR')
const todayStr  = () => { const d = new Date(); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}` }
const pad   = (n: number) => String(n).padStart(2, '0')
const parseD = (s: string) => { const [d,m,y] = s.split('/'); return new Date(+y, +m-1, +d) }
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate()-n); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}` }
const isoToFr = (s: string) => { if (!s) return ''; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}` }
const nowTimeStr = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const EXTRA_MODES: Record<string, { label: string; color: string; bg: string }> = {
  'Crédit': { label: 'CRD', color: '#996600', bg: '#fdf3dc' },
  'Avance': { label: 'AVR', color: '#7c3aed', bg: '#f0e8ff' },
}
const chanInfo = (name: string) => CHANNELS.find(c => c.name === name) ?? (EXTRA_MODES[name] ? { ...EXTRA_MODES[name], name } : { label: name.slice(0,3).toUpperCase(), color: '#6b6a66', bg: '#f0efe9', name })

// ─── Type icon ────────────────────────────────────────────────────────────────
function TypeIcon({ type, dir }: { type: MvtType; dir: MvtDir }) {
  const bg    = type==='ouverture'?'#e8f0fb':type==='cloture'?'#f0efe9':type==='credit'?'#f0e8ff':type==='investissement'?'#fdf3dc':type==='benefice'?(dir==='entree'?'#e8f5ee':'#fdecea'):dir==='entree'?'#e8f5ee':'#fdecea'
  const color = type==='ouverture'?'#1a5fa8':type==='cloture'?'#6b6a66':type==='credit'?'#7c3aed':type==='investissement'?'#996600':type==='benefice'?(dir==='entree'?'#1a7a4a':'#c0392b'):dir==='entree'?'#1a7a4a':'#c0392b'
  const paths: Record<MvtType, React.ReactNode> = {
    vente:          <><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
    credit:         <><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
    client:         <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></>,
    fourn:          <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></>,
    depense:        <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    investissement: <><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></>,
    benefice:       <><polyline points="22,7 13,16 9,12 2,19"/><polyline points="15,7 22,7 22,14"/></>,
    entree:         <><polyline points="17,11 21,7 17,3"/><line x1="21" y1="7" x2="9" y2="7"/><path d="M3 21v-4a4 4 0 0 1 4-4h14"/></>,
    ouverture:      <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>,
    cloture:        <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
  }
  return (
    <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px]" style={{ background: bg }}>
      <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {paths[type]}
      </svg>
    </div>
  )
}

// ─── Mode badge ───────────────────────────────────────────────────────────────
function ModeBadge({ mode, amount }: PayMode) {
  const ch = chanInfo(mode)
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5" style={{ background: ch.bg }}>
      <span className="text-[9px] font-bold tracking-wide" style={{ color: ch.color }}>{ch.label}</span>
      <span className="font-mono text-[10px] font-medium" style={{ color: ch.color }}>{amount.toLocaleString('fr-FR')}</span>
    </span>
  )
}

// ─── Money input (auto dots every 3 digits) ───────────────────────────────────
function MoneyInput({ value, onChange, placeholder, className, autoFocus }: {
  value: string; onChange: (raw: string) => void
  placeholder?: string; className?: string; autoFocus?: boolean
}) {
  const fmt3 = (v: string) => { const d = v.replace(/\D/g, ''); return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '' }
  return (
    <input type="text" inputMode="numeric"
      value={fmt3(value)}
      onChange={e => onChange(e.target.value.replace(/\./g, ''))}
      placeholder={placeholder}
      className={className}
      autoFocus={autoFocus}
    />
  )
}

// ─── Dépense modal ────────────────────────────────────────────────────────────
function DepenseModal({ onClose, onSave }: { onClose: () => void; onSave: (m: Omit<Mouvement,'id'>) => void }) {
  const [montant, setMontant] = useState('')
  const [cat,     setCat]     = useState(DEP_CATS[0])
  const [desc,    setDesc]    = useState('')
  const [mode,    setMode]    = useState('Cash')
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45" onClick={onClose}>
      <div className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[460px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4">
          <h2 className="text-[15px] font-medium">Enregistrer une dépense</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer"><X size={13} className="text-[#6b6a66]"/></button>
        </div>
        <div className="flex flex-col gap-3.5 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Montant (MRU)</label>
              <MoneyInput value={montant} onChange={setMontant} placeholder="0"
                className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] font-mono outline-none focus:border-[#1a1a18] focus:bg-white"/>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Catégorie</label>
              <select value={cat} onChange={e => setCat(e.target.value)}
                className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white">
                {DEP_CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="ex: loyer du mois de mars"
              className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white"/>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Mode de paiement</label>
            <select value={mode} onChange={e => setMode(e.target.value)}
              className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white">
              {CHANNELS.map(c => <option key={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-black/[0.08] px-5 py-3">
          <button onClick={onClose} className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-4 py-2 text-[13px] font-medium cursor-pointer">Annuler</button>
          <button onClick={() => {
            const amt = parseFloat(montant)
            if (!amt || amt <= 0) { alert('Montant invalide'); return }
            onSave({ date:todayStr(), time:nowTimeStr(), type:'depense', dir:'sortie', desc:desc||cat, cat, montant:amt, modes:[{mode,amount:amt}] })
            onClose()
          }} className="flex items-center gap-1.5 rounded-[9px] border-none bg-[#c0392b] px-4 py-2 text-[13px] font-medium text-white cursor-pointer">
            <Check size={13}/> Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Investissement modal ─────────────────────────────────────────────────────
function InvestissementModal({ onClose, onSave }: { onClose: () => void; onSave: (m: Omit<Mouvement,'id'>) => void }) {
  const [montant, setMontant] = useState('')
  const [cat,     setCat]     = useState(INV_CATS[0])
  const [desc,    setDesc]    = useState('')
  const [mode,    setMode]    = useState('Cash')
  const inCls = 'rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white'
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45" onClick={onClose}>
      <div className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[460px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-medium">Enregistrer un investissement</h2>
            <p className="mt-0.5 text-[11px] text-[#996600]">Classé comme investissement, pas dépense</p>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer"><X size={13} className="text-[#6b6a66]"/></button>
        </div>
        <div className="flex flex-col gap-3.5 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Montant (MRU)</label>
              <MoneyInput value={montant} onChange={setMontant} placeholder="0" className={inCls + ' font-mono'}/>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Catégorie</label>
              <select value={cat} onChange={e => setCat(e.target.value)} className={inCls}>
                {INV_CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="ex: achat 50 valises" className={inCls}/>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Mode de paiement</label>
            <select value={mode} onChange={e => setMode(e.target.value)} className={inCls}>
              {CHANNELS.map(c => <option key={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-black/[0.08] px-5 py-3">
          <button onClick={onClose} className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-4 py-2 text-[13px] font-medium cursor-pointer">Annuler</button>
          <button onClick={() => {
            const amt = parseFloat(montant)
            if (!amt || amt <= 0) { alert('Montant invalide'); return }
            onSave({ date:todayStr(), time:nowTimeStr(), type:'investissement', dir:'sortie', desc:desc||cat, cat, montant:amt, modes:[{mode,amount:amt}] })
            onClose()
          }} className="flex items-center gap-1.5 rounded-[9px] border border-[#996600]/40 bg-[#fdf3dc] px-4 py-2 text-[13px] font-medium text-[#996600] cursor-pointer">
            <Check size={13}/> Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Entrée manuelle modal ────────────────────────────────────────────────────
function EntreeModal({ onClose, onSave }: { onClose: () => void; onSave: (m: Omit<Mouvement,'id'>) => void }) {
  const { clients, addClientAvance } = useAppStore()
  const [montant,      setMontant]      = useState('')
  const [cat,          setCat]          = useState(ENT_CATS[0])
  const [desc,         setDesc]         = useState('')
  const [mode,         setMode]         = useState('Cash')
  const [clientId,     setClientId]     = useState<string | null>(null)
  const [clientSearch, setClientSearch] = useState('')
  const [showPicker,   setShowPicker]   = useState(false)

  const isDepot = cat === 'Dépôt client'
  const selClient = clientId ? clients.find(c => c.id === clientId) : null
  const inCls = 'rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45" onClick={onClose}>
      <div className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[460px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4">
          <h2 className="text-[15px] font-medium">Entrée manuelle</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer"><X size={13} className="text-[#6b6a66]"/></button>
        </div>
        <div className="flex flex-col gap-3.5 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Montant (MRU)</label>
              <MoneyInput value={montant} onChange={setMontant} placeholder="0" className={inCls + ' font-mono'}/>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Catégorie</label>
              <select value={cat} onChange={e => { setCat(e.target.value); if (e.target.value !== 'Dépôt client') { setClientId(null); setClientSearch('') } }} className={inCls}>
                {ENT_CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Client selector — visible only for Dépôt client */}
          {isDepot && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Client *</label>
              <div className="relative">
                <button onClick={() => setShowPicker(p => !p)} type="button"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-left hover:border-[#a8a7a2] transition-colors">
                  <svg className="h-3.5 w-3.5 flex-shrink-0 text-[#a8a7a2]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <span className={cn('flex-1 text-[13px]', selClient ? 'font-medium text-[#111110]' : 'text-[#6b6a66]')}>
                    {selClient ? `${selClient.prenom} ${selClient.nom}` : 'Sélectionner un client…'}
                  </span>
                  {clientId && <button type="button" onClick={e => { e.stopPropagation(); setClientId(null); setClientSearch('') }}
                    className="flex h-4 w-4 items-center justify-center rounded border-none bg-transparent text-[#a8a7a2] hover:text-[#c0392b] cursor-pointer"><X size={10}/></button>}
                </button>
                {showPicker && (
                  <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-black/[0.08] bg-white shadow-lg">
                    <div className="p-2">
                      <div className="flex items-center gap-1.5 rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5">
                        <Search size={12} className="text-[#a8a7a2]"/>
                        <input autoFocus type="text" placeholder="Rechercher…" value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                          className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#a8a7a2]"/>
                      </div>
                    </div>
                    <div className="max-h-40 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                      {clients.filter(c => !clientSearch || (c.prenom+' '+c.nom+' '+c.tel).toLowerCase().includes(clientSearch.toLowerCase())).map(c => (
                        <button key={c.id} type="button" onClick={() => { setClientId(c.id); setShowPicker(false); setClientSearch('') }}
                          className={cn('flex w-full items-center gap-2.5 border-none border-b border-black/[0.04] bg-transparent px-3.5 py-2 text-left cursor-pointer hover:bg-[#f0efe9] transition-colors', clientId===c.id && 'bg-[#e8f5ee]')}>
                          <span className="flex-1 text-[13px] font-medium">{c.prenom} {c.nom}</span>
                          <span className="text-[11px] text-[#a8a7a2]">{c.tel}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)}
              placeholder={isDepot ? 'ex: avance mensuelle' : 'ex: apport de fonds propres'} className={inCls}/>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Mode de paiement</label>
            <select value={mode} onChange={e => setMode(e.target.value)} className={inCls}>
              {CHANNELS.map(c => <option key={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-black/[0.08] px-5 py-3">
          <button onClick={onClose} className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-4 py-2 text-[13px] font-medium cursor-pointer">Annuler</button>
          <button onClick={async () => {
            const amt = parseFloat(montant)
            if (!amt || amt <= 0) { alert('Montant invalide'); return }
            if (isDepot && !clientId) { alert('Sélectionnez un client'); return }
            const now = new Date()
            const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`
            const date = todayStr()
            onSave({ date, time, type:'entree', dir:'entree', desc: desc || (selClient ? `Dépôt — ${selClient.prenom} ${selClient.nom}` : cat), cat, montant:amt, modes:[{mode,amount:amt}] })
            if (isDepot && clientId) {
              const mvt: Omit<AvanceMvt,'id'> = { date, time, type:'depot', dir:'credit', montant:amt, desc: desc || `Dépôt caisse — ${mode}`, modes:[{mode,amount:amt}] }
              await addClientAvance(clientId, mvt)
            }
            onClose()
          }} className="flex items-center gap-1.5 rounded-[9px] border-none bg-[#1a7a4a] px-4 py-2 text-[13px] font-medium text-white cursor-pointer">
            <Check size={13}/> Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Ouverture modal ──────────────────────────────────────────────────────────
function OuvertureModal({ onClose, onSave, initialMontant }: { onClose: () => void; onSave: (amt: number, note: string) => void; initialMontant?: number }) {
  const [montant, setMontant] = useState(initialMontant != null ? String(initialMontant) : '')
  const [note,    setNote]    = useState('')
  const isEdit = initialMontant != null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45" onClick={onClose}>
      <div className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[400px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4">
          <h2 className="text-[15px] font-medium">{isEdit ? 'Modifier le solde d\'ouverture' : 'Ouvrir la caisse'}</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer"><X size={13} className="text-[#6b6a66]"/></button>
        </div>
        <div className="flex flex-col gap-3.5 p-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Solde d'ouverture (MRU)</label>
            <MoneyInput value={montant} onChange={setMontant} placeholder="0"
              className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[18px] font-mono outline-none focus:border-[#1a1a18] focus:bg-white"/>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Note (optionnel)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="ex: fonds de caisse du matin"
              className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white"/>
          </div>
          <div className="rounded-[9px] bg-[#e8f5ee] px-3.5 py-2.5 text-[12px] text-[#1a7a4a]">
            Ce montant sera le solde initial de la journée. Les ventes et encaissements s'y ajouteront.
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-black/[0.08] px-5 py-3">
          <button onClick={onClose} className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-4 py-2 text-[13px] font-medium cursor-pointer">Annuler</button>
          <button onClick={() => { const amt = parseFloat(montant); if (amt < 0) { alert('Montant invalide'); return }; onSave(amt||0, note||'Ouverture de caisse'); onClose() }}
            className="flex items-center gap-1.5 rounded-[9px] border-none bg-[#1a1a18] px-4 py-2 text-[13px] font-medium text-white cursor-pointer">
            <Check size={13}/> Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Clôture modal ────────────────────────────────────────────────────────────
function ClotureModal({ solde, mouvements, ouverture, soldeEpargne, beneficeNet, onClose, onSave }: {
  solde: number; mouvements: Mouvement[]; ouverture: number; soldeEpargne: number; beneficeNet: number; onClose: () => void
  onSave: (newOuv: number, notes: string, virementFond: number) => void
}) {
  const [newOuv,   setNewOuv]   = useState('')
  const [notes,    setNotes]    = useState('')
  const [virement, setVirement] = useState('')

  const td = todayStr()
  const todayMvts = mouvements.filter(m => m.date === td)
  const entrees  = todayMvts.filter(m => m.dir==='entree' && m.type!=='ouverture' && m.type!=='credit' && m.type!=='benefice').reduce((s,m)=>s+m.montant,0)
  const sorties  = todayMvts.filter(m => m.dir==='sortie' && m.type!=='cloture' && m.type!=='benefice').reduce((s,m)=>s+m.montant,0)
  const ventes   = todayMvts.filter(m => m.type==='vente')
  const ventesTotal = ventes.reduce((s,m)=>s+m.montant,0)
  // Effective opening balance = running total minus today's flows
  const openingBalance = solde - entrees + sorties

  // Validation
  const finalNewOuv  = parseFloat(newOuv)  || 0
  const finalVirement = parseFloat(virement) || 0
  const reste        = solde - finalNewOuv   // what's available to transfer after keeping newOuv
  const virementError = finalNewOuv > solde
    ? `Le montant en caisse (${fmt(finalNewOuv)}) dépasse le solde disponible (${fmt(solde)})`
    : finalVirement > reste
    ? `Le virement (${fmt(finalVirement)}) dépasse le disponible après réservation (${fmt(Math.max(0, reste))})`
    : null
  const canConfirm = !virementError

  // Mode breakdown
  const modeMap: Record<string, number> = {}
  ventes.forEach(m => m.modes.forEach(pm => { modeMap[pm.mode] = (modeMap[pm.mode]||0) + pm.amount }))

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45" onClick={onClose}>
      <div className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[500px] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4">
          <h2 className="text-[15px] font-medium">Clôture journalière</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer"><X size={13} className="text-[#6b6a66]"/></button>
        </div>
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-5">
          {/* Summary */}
          <div className="flex flex-col gap-2 rounded-[10px] bg-[#f0efe9] p-4">
            {[
              ['Solde ouverture', fmt(openingBalance)+' MRU', '#111110'],
              ['+ Entrées',       '+'+fmt(entrees)+' MRU', '#1a7a4a'],
              ['- Sorties',       '-'+fmt(sorties)+' MRU', '#c0392b'],
            ].map(([lbl,val,col]) => (
              <div key={lbl} className="flex justify-between text-[13px]">
                <span className="text-[#6b6a66]">{lbl}</span>
                <span className="font-mono font-medium" style={{ color: col }}>{val}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-black/[0.1] pt-2 text-[14px] font-semibold">
              <span>Solde de clôture</span>
              <span className="font-mono text-[#1a7a4a]">{fmt(solde)} MRU</span>
            </div>
            <div className="flex justify-between border-t border-black/[0.1] pt-2 text-[13px] font-semibold" style={{ color: beneficeNet >= 0 ? '#1a7a4a' : '#c0392b' }}>
              <span>Bénéfice net journée</span>
              <span className="font-mono">{beneficeNet >= 0 ? '+' : ''}{fmt(Math.round(beneficeNet))} MRU</span>
            </div>
            {/* Ventes breakdown */}
            <div className="mt-1 border-t border-black/[0.08] pt-3">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[.6px] text-[#a8a7a2]">
                Ventes ({ventes.length} transactions — {fmt(ventesTotal)} MRU)
              </p>
              {Object.entries(modeMap).map(([mode, amt]) => {
                const ch = chanInfo(mode)
                return (
                  <div key={mode} className="mb-1.5 flex items-center gap-2">
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: ch.bg, color: ch.color }}>{ch.label}</span>
                    <span className="flex-1 text-[12px]">{mode}</span>
                    <span className="font-mono text-[12px] font-medium">{fmt(amt)} MRU</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Solde d'ouverture demain (MRU)</label>
            <MoneyInput value={newOuv} onChange={setNewOuv} placeholder={String(solde)}
              className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] font-mono outline-none focus:border-[#1a1a18] focus:bg-white"/>
            <span className="text-[11px] text-[#a8a7a2]">Montant à laisser en caisse pour demain</span>
          </div>
          {/* Virement caisse de fond */}
          <div className={cn('flex flex-col gap-1.5 rounded-[10px] border p-3.5', virementError ? 'border-[#c0392b]/40 bg-[#fdecea]/40' : 'border-[#1a5fa8]/30 bg-[#e8f0fb]/40')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet size={13} className="text-[#1a5fa8]"/>
                <label className="text-[12px] font-semibold text-[#1a5fa8]">Virer à la caisse de fond (MRU)</label>
              </div>
              <span className="text-[11px] text-[#a8a7a2]">Max disponible : <strong className="font-mono text-[#1a5fa8]">{fmt(Math.max(0, reste))} MRU</strong></span>
            </div>
            <MoneyInput value={virement} onChange={setVirement} placeholder="0"
              className={cn('rounded-[9px] border bg-white px-3 py-2 text-[13px] font-mono outline-none', virementError ? 'border-[#c0392b]/60 focus:border-[#c0392b]' : 'border-[#1a5fa8]/30 focus:border-[#1a5fa8]')}/>
            {virementError
              ? <span className="text-[11px] text-[#c0392b]">{virementError}</span>
              : <div className="flex items-center justify-between text-[11px] text-[#6b6a66]">
                  <span>Caisse de fond actuelle : <strong className="font-mono text-[#1a5fa8]">{fmt(soldeEpargne)} MRU</strong></span>
                  {finalVirement > 0 && <span className="text-[#1a5fa8] font-medium">→ {fmt(soldeEpargne + finalVirement)} MRU</span>}
                </div>
            }
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Notes de clôture</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Remarques sur la journée..."
              className="resize-none rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white"/>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-black/[0.08] px-5 py-3">
          <button onClick={onClose} className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-4 py-2 text-[13px] font-medium cursor-pointer">Annuler</button>
          <button onClick={() => { if (!canConfirm) return; onSave(finalNewOuv, notes, finalVirement); onClose() }}
            disabled={!canConfirm}
            className={cn('flex items-center gap-1.5 rounded-[9px] border-none px-4 py-2 text-[13px] font-medium text-white', canConfirm ? 'bg-[#1a1a18] cursor-pointer' : 'bg-[#a8a7a2] cursor-not-allowed')}>
            <Check size={13}/> Clôturer la journée
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Caisse de fond mouvement modal (Alimenter / Retirer) ────────────────────
function EpargneTransfertModal({ dir, soldeEpargne, onClose, onSave }: {
  dir: 'entree' | 'sortie'; soldeEpargne: number; onClose: () => void
  onSave: (montant: number, modes: PayMode[], desc: string) => void
}) {
  const isEntree = dir === 'entree'
  const [montant, setMontant] = useState('')
  const [mode,    setMode]    = useState('Cash')
  const [desc,    setDesc]    = useState('')
  const amt        = parseFloat(montant) || 0
  const overdrawn  = !isEntree && amt > soldeEpargne
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45" onClick={onClose}>
      <div className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[420px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4">
          <div className="flex items-center gap-2">
            {isEntree ? <TrendingUp size={15} className="text-[#1a7a4a]"/> : <TrendingDown size={15} className="text-[#c0392b]"/>}
            <h2 className="text-[15px] font-medium">{isEntree ? 'Alimenter la caisse de fond' : 'Retirer de la caisse de fond'}</h2>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer"><X size={13} className="text-[#6b6a66]"/></button>
        </div>
        <div className="flex flex-col gap-3.5 p-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Montant (MRU)</label>
            <MoneyInput autoFocus value={montant} onChange={setMontant} placeholder="0"
              className={cn('rounded-[9px] border bg-[#f0efe9] px-3 py-2 text-[18px] font-mono outline-none focus:bg-white',
                overdrawn ? 'border-[#c0392b]/60 focus:border-[#c0392b]' : 'border-black/[0.08] focus:border-[#1a1a18]')}/>
            {!isEntree && (
              <div className={cn('flex items-center justify-between text-[11px]', overdrawn ? 'text-[#c0392b]' : 'text-[#a8a7a2]')}>
                <span>{overdrawn ? 'Solde insuffisant' : 'Disponible'}</span>
                <span className="font-mono font-medium">{fmt(soldeEpargne)} MRU</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value)}
              className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white">
              {CHANNELS.map(c => <option key={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Description (optionnel)</label>
            <input value={desc} onChange={e => setDesc(e.target.value)}
              placeholder={isEntree ? 'ex: virement fin de journée' : 'ex: paiement loyer'}
              className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white"/>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-black/[0.08] px-5 py-3">
          <button onClick={onClose} className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-4 py-2 text-[13px] font-medium cursor-pointer">Annuler</button>
          <button onClick={() => {
            if (!amt || amt <= 0) { alert('Montant invalide'); return }
            if (overdrawn) { alert(`Solde insuffisant. Disponible : ${fmt(soldeEpargne)} MRU`); return }
            onSave(amt, [{ mode, amount: amt }], desc || (isEntree ? 'Virement caisse de fond' : 'Retrait caisse de fond'))
            onClose()
          }} className={cn('flex items-center gap-1.5 rounded-[9px] border-none px-4 py-2 text-[13px] font-medium text-white cursor-pointer',
            isEntree ? 'bg-[#1a7a4a]' : overdrawn ? 'bg-[#c0392b]/50 cursor-not-allowed' : 'bg-[#c0392b]')}>
            <Check size={13}/> Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Ajouter dette diverse modal ──────────────────────────────────────────────
function DetteModal({ onClose, onSave }: {
  onClose: () => void
  onSave: (nom: string, montant: number, notes: string, currency: 'MRU' | 'CFA') => void
}) {
  const [nom,      setNom]      = useState('')
  const [montant,  setMontant]  = useState('')
  const [notes,    setNotes]    = useState('')
  const [currency, setCurrency] = useState<'MRU' | 'CFA'>('MRU')
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45" onClick={onClose}>
      <div className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[440px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4">
          <h2 className="text-[15px] font-medium">Ajouter une dette</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer"><X size={13} className="text-[#6b6a66]"/></button>
        </div>
        <div className="flex flex-col gap-3.5 p-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Créancier (nom de la personne)</label>
            <input autoFocus value={nom} onChange={e => setNom(e.target.value)} placeholder="ex: Ahmed Ould Brahim"
              className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white"/>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Devise</label>
            <div className="flex gap-2">
              {(['MRU', 'CFA'] as const).map(c => (
                <button key={c} type="button" onClick={() => setCurrency(c)}
                  className={cn('flex-1 rounded-[9px] border py-2 text-[13px] font-semibold cursor-pointer transition-colors',
                    currency === c ? 'border-[#1a1a18] bg-[#1a1a18] text-white' : 'border-black/[0.08] bg-[#f0efe9] text-[#6b6a66]')}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Montant total dû ({currency})</label>
            <MoneyInput value={montant} onChange={setMontant} placeholder="0"
              className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] font-mono outline-none focus:border-[#1a1a18] focus:bg-white"/>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Notes (motif, contexte…)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="ex: emprunt pour achat marchandise mars 2026"
              className="resize-none rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white"/>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-black/[0.08] px-5 py-3">
          <button onClick={onClose} className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-4 py-2 text-[13px] font-medium cursor-pointer">Annuler</button>
          <button onClick={() => {
            if (!nom.trim()) { alert('Entrez le nom du créancier'); return }
            const amt = parseFloat(montant)
            if (!amt || amt <= 0) { alert('Montant invalide'); return }
            onSave(nom.trim(), amt, notes, currency)
            onClose()
          }} className="flex items-center gap-1.5 rounded-[9px] border-none bg-[#1a1a18] px-4 py-2 text-[13px] font-medium text-white cursor-pointer">
            <Check size={13}/> Ajouter
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Payer dette diverse modal ────────────────────────────────────────────────
function PayDetteModal({ dette, soldeEpargne, onClose, onPay }: {
  dette: DetteDiverse; soldeEpargne: number; onClose: () => void
  onPay: (montant: number, modes: PayMode[], desc: string) => void
}) {
  const cur   = dette.currency ?? 'MRU'
  const reste = dette.montant - dette.paid
  const [montant, setMontant] = useState(String(reste))
  const [mode,    setMode]    = useState('Cash')
  const [desc,    setDesc]    = useState('')
  const amt = parseFloat(montant) || 0
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45" onClick={onClose}>
      <div className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[440px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4">
          <div>
            <div className="text-[15px] font-medium">Rembourser — {dette.nom}</div>
            <div className="mt-0.5 text-[11px] text-[#a8a7a2]">Reste dû : <span className="font-mono text-[#c0392b]">{fmt(reste)} {cur}</span></div>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer"><X size={13} className="text-[#6b6a66]"/></button>
        </div>
        <div className="flex flex-col gap-3.5 p-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Montant à payer ({cur})</label>
            <MoneyInput autoFocus value={montant} onChange={setMontant}
              className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[18px] font-mono outline-none focus:border-[#1a1a18] focus:bg-white"/>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Mode de paiement</label>
            <select value={mode} onChange={e => setMode(e.target.value)}
              className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white">
              {CHANNELS.map(c => <option key={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Description (optionnel)</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="ex: versement partiel avril"
              className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white"/>
          </div>
          {amt > 0 && (
            <div className={cn('flex items-center justify-between rounded-[9px] px-3.5 py-2.5 text-[12px]',
              soldeEpargne >= amt ? 'bg-[#e8f0fb]' : 'bg-[#fdecea]')}>
              <span className={soldeEpargne >= amt ? 'text-[#1a5fa8]' : 'text-[#c0392b]'}>
                {soldeEpargne >= amt ? 'Caisse de fond suffisante' : 'Caisse de fond insuffisante'}
              </span>
              <span className="font-mono font-medium" style={{ color: soldeEpargne >= amt ? '#1a5fa8' : '#c0392b' }}>
                {fmt(soldeEpargne)} → {fmt(soldeEpargne - amt)} MRU
              </span>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-black/[0.08] px-5 py-3">
          <button onClick={onClose} className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-4 py-2 text-[13px] font-medium cursor-pointer">Annuler</button>
          <button onClick={() => {
            if (!amt || amt <= 0) { alert('Montant invalide'); return }
            if (amt > reste) { alert(`Maximum remboursable : ${fmt(reste)} ${cur}`); return }
            if (amt > soldeEpargne) { alert(`Solde insuffisant. Disponible : ${fmt(soldeEpargne)} MRU`); return }
            onPay(amt, [{ mode, amount: amt }], desc || `Remboursement ${dette.nom}`)
            onClose()
          }} className={cn('flex items-center gap-1.5 rounded-[9px] border-none px-4 py-2 text-[13px] font-medium text-white cursor-pointer',
            soldeEpargne >= amt && amt > 0 ? 'bg-[#1a7a4a]' : 'bg-[#1a7a4a]/50')}>
            <Check size={13}/> Payer depuis la caisse de fond
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Dette detail modal ───────────────────────────────────────────────────────
function DetteDetailModal({ dette, currentUser, onClose, onAddMontant, onPay, onDelete, onEdit, onEditAjout, onDeleteAjout }: {
  dette: DetteDiverse; currentUser: string; onClose: () => void
  onAddMontant: (montant: number, desc: string) => void
  onPay: (montant: number, modes: PayMode[], desc: string, ajoutId?: string) => void
  onDelete: () => void
  onEdit: (nom: string, notes: string, currency: 'MRU' | 'CFA', montant: number) => void
  onEditAjout: (ajoutId: string, newMontant: number, newDesc: string) => void
  onDeleteAjout: (ajoutId: string) => void
}) {
  const cur   = dette.currency ?? 'MRU'
  const reste = dette.montant - dette.paid
  const pct   = dette.montant > 0 ? Math.round(dette.paid / dette.montant * 100) : 0
  const done  = reste <= 0

  const [confirmDel,       setConfirmDel]       = useState(false)
  const [editingDette,     setEditingDette]      = useState(false)
  const [editNom,          setEditNom]           = useState(dette.nom)
  const [editNotes,        setEditNotes]         = useState(dette.notes)
  const [editCurrency,     setEditCurrency]      = useState<'MRU' | 'CFA'>(dette.currency ?? 'MRU')
  const [editMontantDette, setEditMontantDette]  = useState(String(dette.montant))
  const [addingMontant,    setAddingMontant]     = useState(false)
  const [addMontant,       setAddMontant]        = useState('')
  const [addDesc,          setAddDesc]           = useState('')
  const [versingId,        setVersingId]         = useState<string | null>(null)
  const [vMontant,         setVMontant]          = useState('')
  const [vMode,            setVMode]             = useState('Cash')
  const [vDesc,            setVDesc]             = useState('')
  const [editingId,        setEditingId]         = useState<string | null>(null)
  const [editMontant,      setEditMontant]       = useState('')
  const [editDesc,         setEditDesc]          = useState('')
  const [confirmDelAjout,  setConfirmDelAjout]   = useState<string | null>(null)

  const openVersement = (id: string) => { setVersingId(id); setVMontant(''); setVMode('Cash'); setVDesc(''); setEditingId(null); setConfirmDelAjout(null) }
  const openEdit = (ajout: DettePayment) => { setEditingId(ajout.id); setEditMontant(String(ajout.montant)); setEditDesc(ajout.desc); setVersingId(null); setConfirmDelAjout(null); setAddingMontant(false) }

  const allPayments = dette.payments ?? []
  const ajouts: DettePayment[] = allPayments.filter(p => p.type !== 'versement').sort((a, b) => b.date.localeCompare(a.date))
  const versementsMap: Record<string, DettePayment[]> = {}
  const orphans: DettePayment[] = []
  allPayments.filter(p => p.type === 'versement').forEach(v => {
    if (v.ajoutId) { (versementsMap[v.ajoutId] ??= []).push(v) }
    else { orphans.push(v) }
  })
  const paidFor = (id: string) => (versementsMap[id] ?? []).filter(v => !v.deleted).reduce((s, v) => s + v.montant, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45" onClick={onClose}>
      <div className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[520px] max-h-[90vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="border-b border-black/[0.08] px-5 py-4">
          {editingDette ? (
            <div className="flex flex-col gap-2">
              <div className="text-[12px] font-medium text-[#1a5fa8]">Modifier la dette</div>
              <input value={editNom} onChange={e => setEditNom(e.target.value)} placeholder="Nom du créditeur"
                className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a5fa8] focus:bg-white"/>
              <input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes (optionnel)"
                className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a5fa8] focus:bg-white"/>
              <div className="flex gap-2">
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-[11px] text-[#6b6a66]">Montant total</label>
                  <MoneyInput value={editMontantDette} onChange={setEditMontantDette}
                    className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] font-mono outline-none focus:border-[#1a5fa8] focus:bg-white w-full"/>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#6b6a66]">Devise</label>
                  <div className="flex gap-1">
                    {(['MRU', 'CFA'] as const).map(c => (
                      <button key={c} onClick={() => setEditCurrency(c)}
                        className={cn('rounded-[7px] border px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors',
                          editCurrency === c ? 'border-[#1a5fa8] bg-[#1a5fa8] text-white' : 'border-black/[0.08] bg-[#f0efe9] text-[#6b6a66]')}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {parseFloat(editMontantDette) > 0 && parseFloat(editMontantDette) < dette.paid && (
                <div className="text-[11px] text-[#c0392b]">Le montant ne peut pas être inférieur au déjà payé ({fmt(dette.paid)} {editCurrency})</div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setEditingDette(false)} className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-1.5 text-[12px] cursor-pointer">Annuler</button>
                <button onClick={() => {
                  if (!editNom.trim()) { alert('Nom requis'); return }
                  const amt = parseFloat(editMontantDette)
                  if (!amt || amt <= 0) { alert('Montant invalide'); return }
                  if (amt < dette.paid) { alert(`Le montant ne peut pas être inférieur au déjà payé (${fmt(dette.paid)} ${editCurrency})`); return }
                  onEdit(editNom.trim(), editNotes.trim(), editCurrency, amt)
                  setEditingDette(false)
                }} className="flex items-center gap-1 rounded-[9px] border-none bg-[#1a5fa8] px-3 py-1.5 text-[12px] font-medium text-white cursor-pointer">
                  <Check size={11}/> Enregistrer
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-[16px] font-semibold">{dette.nom}</div>
                  <button onClick={() => { setEditNom(dette.nom); setEditNotes(dette.notes); setEditCurrency(dette.currency ?? 'MRU'); setEditMontantDette(String(dette.montant)); setEditingDette(true) }}
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[6px] border-none bg-[#f0efe9] cursor-pointer hover:bg-[#e8f0fb] text-[#a8a7a2] hover:text-[#1a5fa8] transition-colors">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                </div>
                {dette.notes && <div className="mt-0.5 text-[11px] text-[#a8a7a2] truncate">{dette.notes}</div>}
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f0efe9]">
                    <div className="h-full rounded-full bg-[#1a7a4a] transition-all" style={{ width: `${pct}%` }}/>
                  </div>
                  <span className="text-[11px] font-mono text-[#6b6a66]">{pct}%</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[12px]">
                  <span className="font-mono font-medium text-[#c0392b]">{fmt(reste)} {cur} restants</span>
                  <span className="text-[#a8a7a2]">/ {fmt(dette.montant)} {cur} total</span>
                  {done && <span className="rounded-full bg-[#e8f5ee] px-2 py-0.5 text-[10px] font-medium text-[#1a7a4a]">Soldé</span>}
                </div>
              </div>
              <button onClick={onClose} className="ml-3 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer"><X size={13} className="text-[#6b6a66]"/></button>
            </div>
          )}
        </div>

        {/* Add-montant inline form */}
        {addingMontant && (
          <div className="border-b border-black/[0.08] bg-[#fdecea]/30 px-5 py-4">
            <div className="mb-2 text-[13px] font-semibold text-[#c0392b]">Ajouter un montant à la dette</div>
            <div className="flex gap-2">
              <MoneyInput autoFocus value={addMontant} onChange={setAddMontant} placeholder={`Montant ${cur}`}
                className="flex-1 rounded-[9px] border border-black/[0.08] bg-white px-3 py-2 text-[13px] font-mono outline-none focus:border-[#c0392b]"/>
              <input value={addDesc} onChange={e => setAddDesc(e.target.value)} placeholder="Description (optionnel)"
                className="flex-1 rounded-[9px] border border-black/[0.08] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#c0392b]"/>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => setAddingMontant(false)} className="rounded-[9px] border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] cursor-pointer">Annuler</button>
              <button onClick={() => {
                const amt = parseFloat(addMontant)
                if (!amt || amt <= 0) { alert('Montant invalide'); return }
                onAddMontant(amt, addDesc || 'Ajout de montant')
                setAddingMontant(false); setAddMontant(''); setAddDesc('')
              }} className="flex items-center gap-1 rounded-[9px] border-none bg-[#c0392b] px-3 py-1.5 text-[12px] font-medium text-white cursor-pointer">
                <Plus size={11}/> Ajouter
              </button>
            </div>
          </div>
        )}

        {/* Grouped ajouts */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {ajouts.length === 0
            ? <div className="flex h-24 items-center justify-center text-[13px] text-[#a8a7a2]">Aucun historique</div>
            : ajouts.map(ajout => {
                const isDeleted  = !!ajout.deleted
                const paid       = isDeleted ? 0 : paidFor(ajout.id)
                const resteAjout = ajout.montant - paid
                const ajoutDone  = !isDeleted && resteAjout <= 0
                const pctAjout   = ajout.montant > 0 ? Math.round(paid / ajout.montant * 100) : 0
                const vers       = (versementsMap[ajout.id] ?? []).filter(v => !v.deleted).sort((a, b) => b.date.localeCompare(a.date))
                const isVersing  = versingId === ajout.id
                const isEditing  = editingId === ajout.id

                return (
                  <div key={ajout.id} className={cn('border-b border-black/[0.06]', isDeleted && 'opacity-55')}>
                    <div className="px-5 py-3">
                      <div className="flex items-start gap-3">
                        <div className={cn('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px]', isDeleted ? 'bg-[#f0efe9]' : 'bg-[#fdecea]')}>
                          <TrendingUp size={13} className={isDeleted ? 'text-[#a8a7a2]' : 'text-[#c0392b]'}/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn('font-mono text-[13px] font-semibold', isDeleted ? 'line-through text-[#a8a7a2]' : 'text-[#c0392b]')}>
                              +{fmt(ajout.montant)} {cur}
                            </span>
                            {isDeleted
                              ? <span className="rounded-full bg-[#fdecea] px-2 py-0.5 text-[10px] font-medium text-[#c0392b]">Supprimé</span>
                              : ajoutDone
                                ? <span className="rounded-full bg-[#e8f5ee] px-2 py-0.5 text-[10px] font-medium text-[#1a7a4a]">Remboursé</span>
                                : paid > 0 && <span className="text-[11px] font-mono text-[#a8a7a2]">reste {fmt(resteAjout)} {cur}</span>
                            }
                          </div>
                          <div className="text-[11px] text-[#6b6a66] truncate">{ajout.desc} · {ajout.date}</div>
                          {/* Audit trail */}
                          {isDeleted && ajout.deletedBy && (
                            <div className="mt-0.5 text-[10px] text-[#c0392b]">
                              Supprimé par <strong>{ajout.deletedBy}</strong> · {ajout.deletedAt}
                            </div>
                          )}
                          {!isDeleted && ajout.editedBy && (
                            <div className="mt-0.5 text-[10px] text-[#a8a7a2]">
                              Modifié par <strong>{ajout.editedBy}</strong> · {ajout.editedAt}
                              {ajout.prevMontant !== undefined && ` (était ${fmt(ajout.prevMontant)} ${cur})`}
                            </div>
                          )}
                          {/* Progress bar */}
                          {!isDeleted && paid > 0 && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#f0efe9]">
                                <div className="h-full rounded-full bg-[#1a7a4a] transition-all" style={{ width: `${pctAjout}%` }}/>
                              </div>
                              <span className="text-[9px] font-mono text-[#a8a7a2]">{pctAjout}%</span>
                            </div>
                          )}
                        </div>

                        {/* Action buttons (non-deleted only) */}
                        {!isDeleted && !isEditing && (
                          <div className="flex flex-shrink-0 items-center gap-1">
                            {/* Edit */}
                            <button onClick={() => openEdit(ajout)}
                              className="flex h-7 w-7 items-center justify-center rounded-[7px] border-none bg-[#f0efe9] cursor-pointer hover:bg-[#e8f0fb] text-[#6b6a66] hover:text-[#1a5fa8] transition-colors">
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            {/* Delete confirm */}
                            {confirmDelAjout !== ajout.id ? (
                              <button onClick={() => { setConfirmDelAjout(ajout.id); setEditingId(null); setVersingId(null) }}
                                className="flex h-7 w-7 items-center justify-center rounded-[7px] border-none bg-[#f0efe9] cursor-pointer hover:bg-[#fdecea] text-[#6b6a66] hover:text-[#c0392b] transition-colors">
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                              </button>
                            ) : (
                              <div className="flex items-center gap-1 rounded-[8px] border border-[#c0392b]/30 bg-[#fdecea] px-2 py-1">
                                <span className="text-[10px] text-[#c0392b] font-medium whitespace-nowrap">Supprimer ?</span>
                                <button onClick={() => setConfirmDelAjout(null)} className="rounded-[5px] border border-black/[0.08] bg-white px-1.5 py-0.5 text-[10px] cursor-pointer">Non</button>
                                <button onClick={() => { onDeleteAjout(ajout.id); setConfirmDelAjout(null) }} className="rounded-[5px] border-none bg-[#c0392b] px-1.5 py-0.5 text-[10px] font-medium text-white cursor-pointer">Oui</button>
                              </div>
                            )}
                            {/* Verser */}
                            {!ajoutDone && confirmDelAjout !== ajout.id && (
                              <button onClick={() => isVersing ? setVersingId(null) : openVersement(ajout.id)}
                                className={cn('flex items-center gap-1 rounded-[8px] border-none px-2.5 py-1.5 text-[11px] font-medium cursor-pointer transition-colors',
                                  isVersing ? 'bg-[#f0efe9] text-[#6b6a66]' : 'bg-[#1a7a4a] text-white')}>
                                {isVersing ? 'Annuler' : <><Check size={11}/> Verser</>}
                              </button>
                            )}
                          </div>
                        )}
                        {/* Cancel edit button */}
                        {isEditing && (
                          <button onClick={() => setEditingId(null)} className="flex-shrink-0 rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 text-[11px] cursor-pointer text-[#6b6a66]">Annuler</button>
                        )}
                      </div>

                      {/* Inline edit form */}
                      {isEditing && (
                        <div className="mt-3 rounded-[10px] border border-[#1a5fa8]/20 bg-[#e8f0fb]/40 p-3">
                          <div className="mb-1 text-[11px] font-medium text-[#1a5fa8]">Modifier le montant — par {currentUser}</div>
                          <div className="flex gap-2 mb-2">
                            <MoneyInput autoFocus value={editMontant} onChange={setEditMontant}
                              className="flex-1 rounded-[8px] border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] font-mono outline-none focus:border-[#1a5fa8]"/>
                            <input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description"
                              className="flex-1 rounded-[8px] border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] outline-none focus:border-[#1a5fa8]"/>
                          </div>
                          <div className="flex justify-end">
                            <button onClick={() => {
                              const amt = parseFloat(editMontant)
                              if (!amt || amt <= 0) { alert('Montant invalide'); return }
                              onEditAjout(ajout.id, amt, editDesc || ajout.desc)
                              setEditingId(null)
                            }} className="flex items-center gap-1 rounded-[8px] border-none bg-[#1a5fa8] px-3 py-1.5 text-[12px] font-medium text-white cursor-pointer">
                              <Check size={11}/> Enregistrer
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Inline versement form */}
                      {isVersing && (
                        <div className="mt-3 rounded-[10px] border border-[#1a7a4a]/20 bg-[#e8f5ee]/40 p-3">
                          <div className="flex gap-2 mb-2">
                            <MoneyInput autoFocus value={vMontant} onChange={setVMontant}
                              placeholder={`Max ${fmt(resteAjout)} ${cur}`}
                              className="flex-1 rounded-[8px] border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] font-mono outline-none focus:border-[#1a7a4a]"/>
                            <select value={vMode} onChange={e => setVMode(e.target.value)}
                              className="rounded-[8px] border border-black/[0.08] bg-white px-2 py-1.5 text-[12px] outline-none focus:border-[#1a7a4a]">
                              {CHANNELS.map(c => <option key={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                          <input value={vDesc} onChange={e => setVDesc(e.target.value)} placeholder="Description (optionnel)"
                            className="w-full rounded-[8px] border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] outline-none focus:border-[#1a7a4a] mb-2"/>
                          <div className="flex justify-end">
                            <button onClick={() => {
                              const amt = parseFloat(vMontant)
                              if (!amt || amt <= 0) { alert('Montant invalide'); return }
                              if (amt > resteAjout) { alert(`Maximum pour cet ajout : ${fmt(resteAjout)} ${cur}`); return }
                              onPay(amt, [{ mode: vMode, amount: amt }], vDesc || `Versement — ${dette.nom}`, ajout.id)
                              setVersingId(null)
                            }} className="flex items-center gap-1 rounded-[8px] border-none bg-[#1a7a4a] px-3 py-1.5 text-[12px] font-medium text-white cursor-pointer">
                              <Check size={11}/> Confirmer
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Versements liés (non-supprimés) */}
                    {!isDeleted && vers.map(v => (
                      <div key={v.id} className="flex items-center gap-2 border-t border-black/[0.04] bg-[#f2fff6] py-2 pl-16 pr-5">
                        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[7px] bg-[#e8f5ee]">
                          <TrendingDown size={10} className="text-[#1a7a4a]"/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-[12px] font-medium text-[#1a7a4a]">{v.desc}</div>
                          <div className="flex flex-wrap items-center gap-1 text-[10px] text-[#a8a7a2]">
                            <span>{v.date}</span>
                            {v.modes && v.modes.map((pm, i) => <ModeBadge key={i} {...pm}/>)}
                          </div>
                        </div>
                        <span className="flex-shrink-0 font-mono text-[13px] font-semibold text-[#1a7a4a]">-{fmt(v.montant)} {cur}</span>
                      </div>
                    ))}
                  </div>
                )
              })
          }

          {/* Orphan versements (no ajoutId — old data) */}
          {orphans.filter(v => !v.deleted).length > 0 && (
            <div>
              <div className="bg-[#f8f7f3] px-5 py-2 text-[10px] font-medium uppercase tracking-[.6px] text-[#a8a7a2]">Versements généraux</div>
              {orphans.filter(v => !v.deleted).sort((a, b) => b.date.localeCompare(a.date)).map(v => (
                <div key={v.id} className="flex items-center gap-3 border-t border-black/[0.04] px-5 py-2.5">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] bg-[#e8f5ee]">
                    <TrendingDown size={11} className="text-[#1a7a4a]"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[12px] font-medium">{v.desc}</div>
                    <div className="text-[10px] text-[#a8a7a2]">{v.date}</div>
                  </div>
                  <span className="font-mono text-[13px] font-medium text-[#1a7a4a]">-{fmt(v.montant)} {cur}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-black/[0.08] px-5 py-3">
          {!confirmDel ? (
            <button onClick={() => setConfirmDel(true)}
              className="flex items-center gap-1.5 rounded-[9px] border border-[#c0392b]/30 bg-[#fdecea] px-3 py-2 text-[12px] font-medium text-[#c0392b] cursor-pointer hover:opacity-80">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              Supprimer tout
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[#c0392b] font-medium">Confirmer ?</span>
              <button onClick={() => setConfirmDel(false)} className="rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 text-[11px] cursor-pointer">Non</button>
              <button onClick={() => { onDelete(); onClose() }} className="rounded-[8px] border-none bg-[#c0392b] px-2.5 py-1.5 text-[11px] font-medium text-white cursor-pointer">Oui</button>
            </div>
          )}
          <div className="flex-1"/>
          {!done && (
            <button onClick={() => { setAddingMontant(a => !a); setVersingId(null); setEditingId(null) }}
              className="flex items-center gap-1.5 rounded-[9px] border border-[#c0392b]/30 bg-[#fdecea] px-3 py-2 text-[12px] font-medium text-[#c0392b] cursor-pointer hover:opacity-85">
              <Plus size={12}/> Ajouter montant
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Edit / delete movement modal ─────────────────────────────────────────────
function EditMvtModal({ mvt, onClose, onSave, onDelete }: {
  mvt: Mouvement
  onClose: () => void
  onSave: (updated: Mouvement) => void
  onDelete: () => void
}) {
  const isDepense = mvt.type === 'depense'
  const isInv     = mvt.type === 'investissement'
  const isClient  = mvt.type === 'client'
  const cats = isDepense ? DEP_CATS : isInv ? INV_CATS : ENT_CATS
  const [montant, setMontant] = useState(String(mvt.montant))
  const [cat,     setCat]     = useState(mvt.cat)
  const [desc,    setDesc]    = useState(mvt.desc)
  const [mode,    setMode]    = useState(mvt.modes[0]?.mode ?? 'Cash')
  const [confirm, setConfirm] = useState(false)

  const inCls = "rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a18] focus:bg-white w-full"

  const title = isClient ? 'Modifier le paiement client' : isInv ? "Modifier l'investissement" : isDepense ? 'Modifier la dépense' : "Modifier l'entrée"

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45" onClick={onClose}>
      <div className="flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-black/[0.08] bg-white w-full sm:w-[460px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-medium">{title}</h2>
            <div className="mt-0.5 text-[11px] text-[#a8a7a2]">{mvt.date} · {mvt.time}</div>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer"><X size={13} className="text-[#6b6a66]"/></button>
        </div>

        <div className="flex flex-col gap-3.5 p-5">
          <div className={isClient ? '' : 'grid grid-cols-2 gap-3'}>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Montant (MRU)</label>
              <MoneyInput value={montant} onChange={setMontant} className={inCls}/>
            </div>
            {!isClient && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#6b6a66]">Catégorie</label>
                <select value={cat} onChange={e => setCat(e.target.value)} className={inCls}>
                  {cats.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} className={inCls}/>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#6b6a66]">Mode de paiement</label>
            <select value={mode} onChange={e => setMode(e.target.value)} className={inCls}>
              {CHANNELS.map(c => <option key={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-black/[0.08] px-5 py-3">
          {/* Delete */}
          {!confirm ? (
            <button onClick={() => setConfirm(true)}
              className="flex items-center gap-1.5 rounded-[9px] border border-[#c0392b]/30 bg-[#fdecea] px-3 py-2 text-[12px] font-medium text-[#c0392b] cursor-pointer hover:opacity-80">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              Supprimer
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[#c0392b] font-medium">Confirmer ?</span>
              <button onClick={() => setConfirm(false)} className="rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 text-[11px] cursor-pointer">Non</button>
              <button onClick={onDelete} className="rounded-[8px] border-none bg-[#c0392b] px-2.5 py-1.5 text-[11px] font-medium text-white cursor-pointer">Oui, supprimer</button>
            </div>
          )}
          <div className="flex-1"/>
          <button onClick={onClose} className="rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-4 py-2 text-[13px] font-medium cursor-pointer">Annuler</button>
          <button onClick={() => {
            const amt = parseFloat(montant)
            if (!amt || amt <= 0) { alert('Montant invalide'); return }
            onSave({ ...mvt, montant: amt, cat, desc: desc || mvt.desc, modes: [{ mode, amount: amt }] })
            onClose()
          }} className="flex items-center gap-1.5 rounded-[9px] border-none bg-[#1a1a18] px-4 py-2 text-[13px] font-medium text-white cursor-pointer">
            <Check size={13}/> Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Right panel ──────────────────────────────────────────────────────────────
function RightPanel({ mouvements }: { mouvements: Mouvement[]; width?: number }) {
  const todayIso  = new Date().toISOString().slice(0,10)
  const weekAgoIso = new Date(new Date().setDate(new Date().getDate()-6)).toISOString().slice(0,10)
  const [from, setFrom] = useState(weekAgoIso)
  const [to,   setTo]   = useState(todayIso)

  const filtered = useMemo(() => {
    if (!from || !to) return mouvements
    const fromD = new Date(from), toD = new Date(to); toD.setHours(23,59,59)
    return mouvements.filter(m => { const md = parseD(m.date); return md >= fromD && md <= toD })
  }, [mouvements, from, to])

  // Ventes par mode
  const modeMap: Record<string, number> = {}
  filtered.filter(m => m.type==='vente').forEach(m => m.modes.forEach(pm => { modeMap[pm.mode] = (modeMap[pm.mode]||0) + pm.amount }))
  const ventesTotal = Object.values(modeMap).reduce((s,v)=>s+v,0)

  // Sorties par catégorie
  const sortiesMap: Record<string, number> = {}
  filtered.filter(m => m.dir==='sortie' && m.type!=='cloture').forEach(m => { sortiesMap[m.cat] = (sortiesMap[m.cat]||0) + m.montant })

  // Bar chart — days in range
  const barDays = useMemo(() => {
    if (!from || !to) return []
    const days: { lbl: string; e: number; s: number; isToday: boolean; date: string }[] = []
    const cur = new Date(from)
    const end = new Date(to); end.setHours(23,59,59)
    while (cur <= end) {
      const dd = `${pad(cur.getDate())}/${pad(cur.getMonth()+1)}/${cur.getFullYear()}`
      const dayM = mouvements.filter(m => m.date === dd)
      const e = dayM.filter(m => m.dir==='entree' && m.type!=='ouverture').reduce((s,m)=>s+m.montant,0)
      const s = dayM.filter(m => m.dir==='sortie' && m.type!=='cloture').reduce((s,m)=>s+m.montant,0)
      days.push({ lbl: `${pad(cur.getDate())}/${pad(cur.getMonth()+1)}`, e, s, isToday: dd===todayStr(), date: dd })
      cur.setDate(cur.getDate()+1)
    }
    // Limit to 14 points
    if (days.length > 14) {
      const step = Math.ceil(days.length / 14)
      return days.filter((_,i) => i % step === 0)
    }
    return days
  }, [mouvements, from, to])

  const maxVal = Math.max(...barDays.map(d => Math.max(d.e, d.s)), 1)
  const nDays  = barDays.length
  const chartLbl = nDays <= 1 ? 'Flux du jour' : nDays <= 7 ? `Flux ${nDays} jours` : 'Flux de la période'

  const CAT_COLORS = ['#c0392b','#e65c00','#996600','#7b2d8b','#0066cc','#1a7a4a']

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-black/[0.08] bg-white" style={{ width: '100%' }}>
      {/* Header with date range */}
      <div className="flex flex-shrink-0 flex-col gap-2 border-b border-black/[0.08] px-4 py-3">
        <span className="text-[13px] font-medium">Résumé de la période</span>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="flex-1 rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2 py-1 text-[12px] outline-none focus:border-[#1a1a18] focus:bg-white"/>
          <span className="text-[12px] text-[#a8a7a2]">→</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="flex-1 rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2 py-1 text-[12px] outline-none focus:border-[#1a1a18] focus:bg-white"/>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth:'thin' }}>
        {/* Bar chart */}
        <div className="mb-4 overflow-hidden rounded-[10px] bg-[#f8f7f3] p-3">
          <p className="mb-2 text-[11px] font-medium text-[#6b6a66]">{chartLbl}</p>
          <div className="flex items-end gap-0.5" style={{ height: 60 }}>
            {barDays.map((d, i) => {
              const eh = maxVal > 0 ? Math.max(2, Math.round(d.e/maxVal*54)) : 2
              const sh = maxVal > 0 ? Math.max(2, Math.round(d.s/maxVal*54)) : 2
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
                  <div className="flex w-full items-end gap-px" style={{ height: 54 }}>
                    <div className="flex-1 rounded-t" style={{ height: eh, background: '#1a7a4a', opacity: d.isToday ? 1 : 0.5 }}/>
                    <div className="flex-1 rounded-t" style={{ height: sh, background: '#c0392b', opacity: d.isToday ? 1 : 0.5 }}/>
                  </div>
                  <span className="text-[8px] text-[#a8a7a2]" style={{ fontWeight: d.isToday ? 600 : 400 }}>{d.lbl}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex gap-3 text-[10px] text-[#6b6a66]">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-[#1a7a4a]"/>Entrées</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-[#c0392b]"/>Sorties</span>
          </div>
        </div>

        {/* Ventes par mode */}
        <div className="mb-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[.7px] text-[#a8a7a2]">Ventes par mode</p>
          {Object.keys(modeMap).length === 0
            ? <p className="text-[12px] text-[#a8a7a2]">Aucune vente</p>
            : (<>
                {CHANNELS.map(ch => {
                  const amt = modeMap[ch.name] ?? 0
                  if (!amt) return null
                  const pct = ventesTotal > 0 ? Math.round(amt/ventesTotal*100) : 0
                  return (
                    <div key={ch.id} className="mb-2 rounded-[9px] px-3 py-2.5" style={{ background: ch.bg }}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: ch.color }}/>
                        <span className="flex-1 text-[12px] font-medium" style={{ color: ch.color }}>{ch.name}</span>
                        <span className="font-mono text-[12px] font-medium" style={{ color: ch.color }}>{fmt(amt)} MRU</span>
                        <span className="text-[10px] font-medium w-8 text-right" style={{ color: ch.color, opacity: 0.8 }}>{pct}%</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full" style={{ background: `${ch.color}22` }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: ch.color }}/>
                      </div>
                    </div>
                  )
                })}
                <div className="mt-1 flex justify-between border-t border-black/[0.06] pt-2 text-[12px]">
                  <span className="font-medium text-[#6b6a66]">Total ventes</span>
                  <span className="font-mono font-medium text-[#111110]">{fmt(ventesTotal)} MRU</span>
                </div>
              </>)
          }
        </div>

        {/* Sorties par catégorie */}
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[.7px] text-[#a8a7a2]">Répartition des sorties</p>
          {Object.keys(sortiesMap).length === 0
            ? <p className="text-[12px] text-[#a8a7a2]">Aucune sortie</p>
            : (() => {
                const totalSorties = Object.values(sortiesMap).reduce((s, v) => s + v, 0)
                return Object.entries(sortiesMap).sort((a, b) => b[1] - a[1]).map(([cat, amt], i) => {
                  const pct = totalSorties > 0 ? Math.round(amt / totalSorties * 100) : 0
                  const color = CAT_COLORS[i % CAT_COLORS.length]
                  return (
                    <div key={cat} className="mb-2 rounded-[9px] bg-[#fdf5f5] px-3 py-2.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: color }}/>
                        <span className="flex-1 text-[12px] text-[#111110]">{cat}</span>
                        <span className="font-mono text-[12px] font-medium text-[#c0392b]">-{fmt(amt)} MRU</span>
                        <span className="text-[10px] font-medium w-8 text-right" style={{ color }}>{pct}%</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-black/[0.06]">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }}/>
                      </div>
                    </div>
                  )
                })
              })()
          }
        </div>
      </div>
    </div>
  )
}

// ─── Edit Invoice Modal ───────────────────────────────────────────────────────
function EditInvoiceModal({ tx, products, onClose, onSave, onDelete }: {
  tx: Tx
  clientId: string | null
  products: Product[]
  onClose: () => void
  onSave: (lines: TxLine[], total: number) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const initSubtotal = tx.lines.reduce((s, l) => s + l.total, 0)
  const [editLines,    setEditLines]    = useState<TxLine[]>(tx.lines.map(l => ({ ...l })))
  const [discountStr,  setDiscountStr]  = useState(String(Math.max(0, initSubtotal - tx.total)))
  const [search,       setSearch]       = useState('')
  const [deleting,     setDeleting]     = useState(false)
  const [saving,       setSaving]       = useState(false)

  const subtotal = editLines.reduce((s, l) => s + l.qty * l.pu, 0)
  const discount = parseFloat(discountStr) || 0
  const total    = Math.max(0, subtotal - discount)

  const updateLine = (i: number, field: 'qty' | 'pu', raw: string) => {
    const val = Math.max(0, parseFloat(raw) || 0)
    setEditLines(ls => ls.map((l, j) => j !== i ? l : { ...l, [field]: val, total: field === 'qty' ? val * l.pu : l.qty * val }))
  }

  const removeLine = (i: number) => setEditLines(ls => ls.filter((_, j) => j !== i))

  const addRef = (product: Product, ref: { id: string; name: string; prixVente: number }) => {
    setEditLines(ls => {
      const existing = ls.findIndex(l => l.productId === product.id && l.refId === ref.id)
      if (existing >= 0) {
        return ls.map((l, i) => i === existing ? { ...l, qty: l.qty + 1, total: (l.qty + 1) * l.pu } : l)
      }
      const pu = ref.prixVente && ref.prixVente > 0 ? ref.prixVente : 0
      return [...ls, { desc: ref.name, productName: product.name, qty: 1, pu, total: pu, productId: product.id, refId: ref.id }]
    })
    setSearch('')
  }

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return products.filter(p =>
      p.name.toLowerCase().includes(q) || p.refs.some(r => r.name.toLowerCase().includes(q))
    ).slice(0, 6)
  }, [products, search])

  const refCostMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of products) for (const r of p.refs) m.set(r.id, r.prixAchat ?? 0)
    return m
  }, [products])

  const handleSave = async () => {
    const zeroPrice = editLines.find(l => !l.pu || l.pu <= 0)
    if (zeroPrice) {
      alert(`"${zeroPrice.desc}" a un prix de vente à 0. Veuillez saisir un prix valide.`)
      return
    }
    const belowCost = editLines.find(l => {
      if (!l.refId) return false
      const cost = refCostMap.get(l.refId) ?? 0
      return cost > 0 && l.pu < cost
    })
    if (belowCost) {
      const cost = refCostMap.get(belowCost.refId!) ?? 0
      alert(`Prix de vente (${belowCost.pu.toLocaleString('fr-FR')} MRU) inférieur au prix d'achat (${cost.toLocaleString('fr-FR')} MRU) pour "${belowCost.desc}". Vente impossible.`)
      return
    }
    const finalLines = editLines.map(l => ({ ...l, total: l.qty * l.pu }))
    setSaving(true)
    try { await onSave(finalLines, total) }
    finally { setSaving(false) }
  }

  const inCls = 'w-full rounded-[7px] border border-black/[0.1] bg-[#f8f7f3] px-2 py-1.5 font-mono text-right text-[12px] outline-none focus:border-[#1a1a18] focus:bg-white'

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/45" onClick={onClose}>
      <div className="flex w-full flex-col overflow-hidden rounded-t-2xl md:rounded-2xl border border-black/[0.08] bg-white md:w-[560px] md:max-h-[90vh]"
        style={{ height: '92dvh' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-black/[0.08] px-4 py-3">
          <Pencil size={14} className="text-[#6b6a66]" />
          <span className="flex-1 text-[14px] font-medium">Modifier la facture <span className="font-mono text-[12px] text-[#a8a7a2]">{tx.id}</span></span>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f0efe9] border-none cursor-pointer hover:opacity-80">
            <X size={13} className="text-[#6b6a66]" />
          </button>
        </div>

        {/* Lines */}
        <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: 'thin' }}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a7a2]">Articles</div>
          <div className="flex flex-col gap-2 mb-4">
            {editLines.map((l, i) => (
              <div key={i} className="rounded-[10px] border border-black/[0.07] bg-[#f8f7f3] p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-[#111110] truncate">{l.desc}</div>
                    {l.productName && <div className="text-[10px] text-[#a8a7a2]">{l.productName}</div>}
                  </div>
                  <button onClick={() => removeLine(i)}
                    className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-md border-none bg-transparent cursor-pointer text-[#a8a7a2] hover:bg-[#fdecea] hover:text-[#c0392b]">
                    <X size={11} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[#6b6a66]">Qté</label>
                    <input type="number" min="1" step="1" value={l.qty}
                      onChange={e => updateLine(i, 'qty', e.target.value)} className={inCls} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[#6b6a66]">P.U. (MRU)</label>
                    <input type="number" min="0" step="1" value={l.pu}
                      onChange={e => updateLine(i, 'pu', e.target.value)} className={inCls} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[#6b6a66]">Total</label>
                    <div className="rounded-[7px] px-2 py-1.5 text-right font-mono text-[12px] font-semibold text-[#111110]">
                      {(l.qty * l.pu).toLocaleString('fr-FR')}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add product search */}
          <div className="mb-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a7a2]">Ajouter un produit</div>
            <div className="relative">
              <div className="flex items-center gap-2 rounded-[10px] border border-black/[0.1] bg-[#f8f7f3] px-3 py-2">
                <Search size={13} className="flex-shrink-0 text-[#a8a7a2]" />
                <input type="text" placeholder="Rechercher un produit ou référence…"
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#a8a7a2]" />
                {search && <button onClick={() => setSearch('')} className="border-none bg-transparent cursor-pointer text-[#a8a7a2] hover:text-[#6b6a66]"><X size={11}/></button>}
              </div>
              {filteredProducts.length > 0 && (
                <div className="mt-1 rounded-xl border border-black/[0.08] bg-white shadow-lg overflow-hidden">
                  {filteredProducts.map(p => (
                    <div key={p.id}>
                      <div className="px-3.5 py-2 text-[11px] font-semibold text-[#6b6a66] bg-[#f8f7f3]">{p.name}</div>
                      {p.refs.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()) || p.name.toLowerCase().includes(search.toLowerCase())).map(r => (
                        <button key={r.id} type="button"
                          onClick={() => addRef(p, r)}
                          className="flex w-full items-center justify-between border-none border-b border-black/[0.04] bg-white px-4 py-2.5 text-left cursor-pointer hover:bg-[#f0efe9] transition-colors">
                          <span className="text-[12px] font-medium text-[#111110]">{r.name}</span>
                          <span className="font-mono text-[11px] text-[#1a7a4a]">{r.prixVente?.toLocaleString('fr-FR')} MRU</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-xl border border-black/[0.07] bg-[#f8f7f3] p-4 space-y-2">
            <div className="flex justify-between text-[12px]">
              <span className="text-[#6b6a66]">Sous-total</span>
              <span className="font-mono font-medium">{subtotal.toLocaleString('fr-FR')} MRU</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-[#996600] flex-shrink-0">Remise (MRU)</span>
              <input type="number" min="0" step="1" value={discountStr}
                onChange={e => setDiscountStr(e.target.value)}
                className="flex-1 rounded-[7px] border border-black/[0.1] bg-[#fdf3dc] px-2 py-1.5 font-mono text-right text-[12px] outline-none focus:border-[#996600]" />
            </div>
            <div className="flex justify-between border-t border-black/[0.08] pt-2 text-[15px] font-bold">
              <span>Total</span>
              <span className="font-mono">{total.toLocaleString('fr-FR')} MRU</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 flex-col gap-2 border-t border-black/[0.08] px-4 py-3">
          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving || deleting}
              className="flex-1 rounded-[10px] border border-black/[0.08] bg-[#f0efe9] py-2.5 text-[13px] font-medium cursor-pointer hover:opacity-80 disabled:opacity-50">
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving || deleting || editLines.length === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-[10px] border-none bg-[#1a7a4a] py-2.5 text-[13px] font-semibold text-white cursor-pointer hover:opacity-90 disabled:opacity-50">
              {saving ? <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> : <Check size={14}/>}
              Sauvegarder
            </button>
          </div>
          <button
            disabled={saving || deleting}
            onClick={async () => {
              if (!window.confirm(`Supprimer définitivement la facture ${tx.id} ? Cette action est irréversible.`)) return
              setDeleting(true)
              try { await onDelete() } finally { setDeleting(false) }
            }}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-[#c0392b]/30 bg-[#fdecea] py-2 text-[12px] font-medium text-[#c0392b] cursor-pointer hover:bg-[#c0392b] hover:text-white transition-colors disabled:opacity-50">
            {deleting
              ? <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              : <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/><path d="M9,6V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2"/></svg>}
            Supprimer la facture
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
type Modal = 'depense' | 'investissement' | 'entree' | 'ouverture' | 'cloture' | 'alimenter' | 'retirer' | 'addDette' | null
// ─── Sortie Modal ─────────────────────────────────────────────────────────────
function SortieModal({ tx, mvt, boutiqueFermee, onClose, onViewPdf, onToggleLine, onValidate, onEncaisser }: {
  tx: Tx
  mvt: Mouvement
  boutiqueFermee: boolean
  onClose: () => void
  onViewPdf: () => void
  onToggleLine: (txId: string, i: number) => Promise<void>
  onValidate: (txId: string) => Promise<void>
  onEncaisser: (txId: string, modes: PayMode[]) => Promise<void>
}) {
  const lines   = tx.lines ?? []
  const sorted  = tx.sortedLines ?? lines.map(() => false)
  const pickedCount = sorted.filter(Boolean).length
  const allDone = lines.length > 0 && pickedCount === lines.length
  const reste   = (tx.total ?? 0) - (tx.paid ?? 0)

  const [payMode, setPayMode] = useState(CHANNELS[0].name)
  const [payAmt, setPayAmt]   = useState(reste > 0 ? String(reste) : '')
  const [paying, setPaying]   = useState(false)
  const [validating, setValidating] = useState(false)

  const handleEncaisser = async () => {
    const amt = parseFloat(payAmt.replace(/\s/g, '').replace(',', '.')) || 0
    if (amt <= 0 || boutiqueFermee) return
    setPaying(true)
    try { await onEncaisser(tx.id, [{ mode: payMode, amount: amt }]) }
    finally { setPaying(false) }
  }

  const handleValidate = async () => {
    setValidating(true)
    try { await onValidate(tx.id); onClose() }
    finally { setValidating(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}/>
      <div className="relative w-full md:max-w-md bg-white rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-black/[0.08]">
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-[#111110]">Sortie des références</div>
            <div className="text-[11px] text-[#a8a7a2] mt-0.5">{mvt.desc} · {pickedCount}/{lines.length} validée{pickedCount !== 1 ? 's' : ''}</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            <button onClick={onViewPdf}
              className="flex items-center gap-1.5 rounded-lg border border-black/[0.1] bg-[#f0efe9] px-2.5 py-1.5 text-[11px] font-medium text-[#6b6a66] cursor-pointer hover:opacity-80">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
              PDF
            </button>
            <button onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f0efe9] border-none cursor-pointer hover:opacity-80">
              <svg className="h-3.5 w-3.5 text-[#6b6a66]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-5 py-3 border-b border-black/[0.06]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-[#6b6a66]">{pickedCount}/{lines.length} référence{lines.length !== 1 ? 's' : ''} sortie{pickedCount !== 1 ? 's' : ''}</span>
            {!allDone && (
              <button onClick={() => lines.forEach((_, i) => { if (!sorted[i]) onToggleLine(tx.id, i) })}
                className="text-[11px] font-medium text-[#1a5fa8] bg-[#e8f0fb] rounded-md px-2 py-1 border-none cursor-pointer hover:opacity-80">
                Tout cocher
              </button>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#f0efe9]">
            <div className="h-full rounded-full transition-all duration-300"
              style={{ width: `${lines.length > 0 ? pickedCount / lines.length * 100 : 0}%`, background: allDone ? '#1a7a4a' : '#1a5fa8' }}/>
          </div>
        </div>

        {/* Lines */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {lines.map((line, i) => {
            const isPicked = sorted[i] ?? false
            return (
              <button key={i} onClick={() => onToggleLine(tx.id, i)}
                className={cn('flex w-full items-center gap-3 px-5 py-3.5 text-left cursor-pointer transition-colors',
                  isPicked ? 'bg-[#f0faf5]' : 'bg-white hover:bg-[#f8f7f3]')}
                style={{ border: 'none', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                <div className={cn('flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-all',
                  isPicked ? 'border-[#1a7a4a] bg-[#1a7a4a]' : 'border-black/[0.2] bg-white')}>
                  {isPicked && <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20,6 9,17 4,12"/></svg>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn('text-[13px] font-medium', isPicked ? 'text-[#1a7a4a] line-through decoration-[#1a7a4a]/40' : 'text-[#111110]')}>
                    {line.desc}
                  </div>
                  {line.productName && <div className="text-[11px] text-[#a8a7a2]">{line.productName}</div>}
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="font-mono text-[12px] font-medium text-[#111110]">{line.qty} × {line.pu.toLocaleString('fr-FR')} MRU</div>
                  <div className="text-[10px] text-[#a8a7a2]">{line.total.toLocaleString('fr-FR')} MRU</div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Encaissement section — only if there's a remaining balance */}
        {reste > 0 && (
          <div className="flex-shrink-0 border-t border-black/[0.08] px-5 py-4 bg-[#fdf9f0]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-semibold text-[#111110]">Encaissement</span>
              <span className="font-mono text-[13px] font-semibold text-[#c0392b]">Reste : {fmt(reste)} MRU</span>
            </div>
            <div className="flex gap-2">
              <select value={payMode} onChange={e => setPayMode(e.target.value)}
                className="h-9 rounded-[8px] border border-black/[0.1] bg-white px-2 text-[12px] font-medium text-[#111110] outline-none cursor-pointer">
                {CHANNELS.map(c => <option key={c.id}>{c.name}</option>)}
              </select>
              <input type="text" inputMode="numeric" value={payAmt} onChange={e => setPayAmt(e.target.value)}
                placeholder={fmt(reste)}
                className="flex-1 h-9 rounded-[8px] border border-black/[0.1] bg-white px-3 font-mono text-[13px] font-medium outline-none focus:border-[#1a1a18]"/>
              <button onClick={handleEncaisser} disabled={paying || boutiqueFermee}
                className={cn('h-9 rounded-[8px] px-4 text-[12px] font-semibold text-white border-none',
                  paying || boutiqueFermee ? 'bg-[#a8a7a2] cursor-not-allowed' : 'bg-[#1a7a4a] cursor-pointer hover:opacity-90')}>
                {paying ? '…' : 'Encaisser'}
              </button>
            </div>
          </div>
        )}

        {/* Footer — Valider button */}
        <div className="flex-shrink-0 border-t border-black/[0.08] px-5 py-3.5">
          {allDone
            ? <div className="flex items-center justify-center gap-2 py-0.5">
                <svg className="h-4 w-4 text-[#1a7a4a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20,6 9,17 4,12"/></svg>
                <span className="text-[13px] font-semibold text-[#1a7a4a]">Toutes les références ont été sorties</span>
              </div>
            : <button onClick={handleValidate} disabled={validating}
                className={cn('flex w-full items-center justify-center gap-2 rounded-[11px] py-2.5 text-[13px] font-semibold border-none transition-all',
                  validating ? 'bg-[#f0efe9] text-[#a8a7a2] cursor-not-allowed' : 'bg-[#1a1a18] text-white cursor-pointer hover:opacity-90')}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20,6 9,17 4,12"/></svg>
                {validating ? 'Validation…' : 'Valider la sortie'}
              </button>
          }
        </div>
      </div>
    </div>
  )
}

type CashTab = 'journaliere' | 'epargne'

export function CashPage() {
  const {
    cashMvts: rawMvts, addCashMvt, updateCashMvt, deleteCashMvt,
    ouverture, setOuverture, boutiqueFermee, setBoutiqueFermee, clients, products, ventesComptoir,
    soldeEpargne, epargneMvts, dettesDiverses, addEpargneMvt, addDetteDiverse, editDetteDiverse, addDetteMontant, payDetteDiverse, editDetteAjout, deleteDetteAjout, deleteDetteDiverse,
    toggleTxLineSortie, validateTxSortie, payTxDirect, updateTx, deleteVente, cashMvts: allCashMvts, deleteCashMvt: deleteCashMvtById,
  } = useAppStore()
  const { appUser } = useAuthStore()
  const currentUser = appUser?.name ?? appUser?.email ?? 'Inconnu'
  const [cashTab, setCashTab] = useState<CashTab>(() => {
    const s = localStorage.getItem('cashTab')
    return s === 'epargne' ? 'epargne' : 'journaliere'
  })
  // Force non-owners to journaliere
  useEffect(() => {
    if (appUser?.role !== 'owner' && cashTab === 'epargne') setCashTab('journaliere')
  }, [appUser?.role, cashTab])
  useEffect(() => { localStorage.setItem('cashTab', cashTab) }, [cashTab])
  const [mobileEpargneTab, setMobileEpargneTab] = useState<'historique' | 'creanciers'>('historique')
  const [detteDetailId, setDetteDetailId] = useState<string | null>(null)
  const detteDetail = detteDetailId ? dettesDiverses.find(d => d.id === detteDetailId) ?? null : null
  const [viewInvoice, setViewInvoice] = useState<InvoiceData | null>(null)
  const [editMvt, setEditMvt] = useState<Mouvement | null>(null)
  const [sortieModal, setSortieModal] = useState<{ tx: import('@/store/appStore').Tx; mvt: Mouvement } | null>(null)
  const [editInvoice, setEditInvoice] = useState<{ tx: Tx; clientId: string | null } | null>(null)
  const [deletingLines, setDeletingLines] = useState<string | null>(null)

  const deleteCashLines = useCallback(async (mvtId: string) => {
    if (!window.confirm('Supprimer cette ligne de la caisse ?')) return
    setDeletingLines(mvtId)
    try {
      await deleteCashMvtById(mvtId)
    } finally {
      setDeletingLines(null)
    }
  }, [deleteCashMvtById])

  // Quick lookup: txId → Tx (for sortie status badges)
  const txMap = useMemo(() => {
    const m = new Map<string, import('@/store/appStore').Tx>()
    for (const tx of ventesComptoir) m.set(tx.id, tx)
    for (const c of clients) for (const tx of c.transactions) m.set(tx.id, tx)
    return m
  }, [ventesComptoir, clients])

  // Quick lookup: txId → client display name
  const txClientMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of clients) {
      const name = `${c.prenom} ${c.nom}`.trim()
      for (const tx of c.transactions) m.set(tx.id, name)
    }
    return m
  }, [clients])
  // Derive credit/avoir invoice entries directly from sales data — no Firestore write needed
  // Map txId → time from real vente cashMvts (covers partial-payment old transactions)
  const txTimeMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const mvt of rawMvts as unknown as Mouvement[]) {
      if (mvt.type === 'vente' && mvt.time) {
        const match = mvt.desc.match(/Vente\s+(F-\S+)/)
        if (match) m[match[1]] = mvt.time
      }
    }
    return m
  }, [rawMvts])

  const derivedCreditMvts = useMemo((): Mouvement[] => {
    const result: Mouvement[] = []
    const add = (tx: { id: string; date: string; time?: string; total: number; payModes: { mode: string; amount: number }[] }, clientFullName: string, clientId: string) => {
      // Include tx if it ever had Crédit/Avance (even fully paid — amount may be 0)
      // so the row stays visible in CashPage until sortie is validated
      const nonCash = tx.payModes.filter(m => m.mode === 'Crédit' || m.mode === 'Avance')
      if (nonCash.length === 0) return
      const label = clientFullName ? ` — ${clientFullName}` : ''
      const time = txTimeMap[tx.id] ?? tx.time ?? '--:--'
      for (const pm of nonCash) {
        result.push({
          id: `inv_${tx.id}_${pm.mode}_${clientId}`,
          date: tx.date,
          time,
          type: 'credit' as MvtType,
          dir: 'entree' as MvtDir,
          desc: `Vente ${tx.id}${label}`,
          cat: pm.mode === 'Crédit' ? 'Crédit client' : 'Avoir client',
          // When credit is paid off (amount=0), show invoice total so row isn't blank
          montant: pm.amount > 0 ? pm.amount : tx.total,
          modes: pm.amount > 0 ? [{ mode: pm.mode, amount: pm.amount }] : [],
        })
      }
    }
    for (const client of clients) {
      const fullName = `${client.prenom} ${client.nom}`.trim()
      for (const tx of client.transactions) add(tx, fullName, client.id)
    }
    for (const tx of ventesComptoir) add(tx, '', '')
    return result
  }, [clients, ventesComptoir, txTimeMap])

  // Base cashMvts (filter out any legacy type:'credit' entries) merged with derived invoice entries
  const mouvements = useMemo((): Mouvement[] => {
    const base = (rawMvts as unknown as Mouvement[]).filter(m => m.type !== 'credit')
    // Deduplicate consecutive ouvertures (same session, no cloture in between).
    // Ouvertures after a cloture are a new session and must be kept.
    const sorted = [...base].sort((a, b) => {
      const dc = a.date.localeCompare(b.date)
      return dc !== 0 ? dc : a.time.localeCompare(b.time)
    })
    const keepIds = new Set<string>(sorted.map(m => m.id))
    const lastOuvPerDay = new Map<string, string>() // date → id of last consecutive ouverture
    for (const m of sorted) {
      if (m.type === 'ouverture') {
        const prev = lastOuvPerDay.get(m.date)
        if (prev) keepIds.delete(prev) // drop earlier consecutive duplicate
        lastOuvPerDay.set(m.date, m.id)
      } else if (m.type === 'cloture') {
        lastOuvPerDay.delete(m.date) // next ouverture starts a new session
      }
    }
    const deduped = base.filter(m => keepIds.has(m.id))
    return [...deduped, ...derivedCreditMvts]
  }, [rawMvts, derivedCreditMvts])

  function buildInvoice(mvt: Mouvement): InvoiceData | null {
    // Extract txId from desc: "Vente F-1234 — Prenom" or "Vente F-1234"
    const match = mvt.desc.match(/Vente\s+(F-\S+)/)
    if (!match) return null
    const txId = match[1]
    // Full client name in desc: "Vente F-xxx — Prenom Nom" (authoritative since we now store full name)
    const descClientName = mvt.desc.match(/—\s+(.+)$/)?.[1]?.trim().toLowerCase()
    // Find transaction — exact full-name match takes priority
    let foundClient: typeof clients[number] | null = null
    let foundTx: typeof clients[number]['transactions'][number] | null = null
    for (const c of clients) {
      const tx = c.transactions.find(t => t.id === txId)
      if (!tx) continue
      if (!foundClient) { foundClient = c; foundTx = tx }
      if (descClientName) {
        const cName = `${c.prenom} ${c.nom}`.trim().toLowerCase()
        if (cName === descClientName) { foundClient = c; foundTx = tx; break }
      }
    }
    // Try anonymous (comptoir) transactions
    if (!foundTx) {
      foundTx = ventesComptoir.find(t => t.id === txId) ?? null
    }
    if (!foundTx) {
      // Fallback: reconstruct minimal data from cashMvt alone
      return {
        txId, date: mvt.date, client: null,
        lines: [{ desc: mvt.desc, productName: '', qty: 1, pu: mvt.montant, total: mvt.montant }],
        subtotal: mvt.montant, discount: 0, total: mvt.montant,
        payModes: mvt.modes, paid: mvt.montant,
      }
    }
    const lines = foundTx.lines.map(l => {
      const product = products.find(p => p.id === l.productId)
      const ref     = product?.refs.find(r => r.id === l.refId)
      return {
        desc: ref?.name ?? l.desc,
        productName: product?.name ?? '',
        qty: l.qty, pu: l.pu, total: l.total,
      }
    })
    const subtotal = lines.reduce((s, l) => s + l.total, 0)
    return {
      txId, date: foundTx.date, client: foundClient,
      lines, subtotal, discount: subtotal - foundTx.total,
      total: foundTx.total, payModes: foundTx.payModes, paid: foundTx.paid,
    }
  }

  function openEditInvoice(mvt: Mouvement) {
    const match = mvt.desc.match(/Vente\s+(F-\S+)/)
    if (!match) return
    const txId = match[1]
    const tx = txMap.get(txId)
    if (!tx) return
    const clientId = clients.find(c => c.transactions.some(t => t.id === txId))?.id ?? null
    setEditInvoice({ tx, clientId })
  }

  const [kpiOpen,    setKpiOpen]    = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [period,     setPeriod]     = useState<FilterPeriod>('today')
  const [filterMvt,  setFilterMvt]  = useState<FilterMvt>('all')
  const [search,     setSearch]     = useState('')
  const [modal,      setModal]      = useState<Modal>(null)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  const addMvt = useCallback((m: Omit<Mouvement,'id'>) => {
    addCashMvt(m)
  }, [addCashMvt])

  // Solde du jour
  const td = todayStr()
  const todayMvts  = useMemo(() => mouvements.filter(m => m.date === td), [mouvements, td])
  const entreesDay = useMemo(() => todayMvts.filter(m => m.dir==='entree' && m.type!=='ouverture' && m.type!=='credit' && m.type!=='benefice').reduce((s,m)=>s+m.montant,0), [todayMvts])
  const sortiesDay = useMemo(() => todayMvts.filter(m => m.dir==='sortie' && m.type!=='cloture' && m.type!=='benefice').reduce((s,m)=>s+m.montant,0), [todayMvts])
  const ventesDay  = useMemo(() => todayMvts.filter(m => m.type==='vente'), [todayMvts])
  const ventesTotal= useMemo(() => ventesDay.reduce((s,m)=>s+m.montant,0), [ventesDay])
  const encaissDay = useMemo(() => todayMvts.filter(m => m.type==='client' && m.dir==='entree'), [todayMvts])
  const encaissTotal = useMemo(() => encaissDay.reduce((s,m)=>s+m.montant,0), [encaissDay])
  const clotureDuJour   = useMemo(() => todayMvts.find(m => m.type === 'cloture'),   [todayMvts])
  const ouvertureDuJour = useMemo(() => todayMvts.find(m => m.type === 'ouverture'), [todayMvts])
  // Caisse is open if the most recent ouverture/cloture movement today is an ouverture
  const caisseOuverte = useMemo(() => {
    const relevant = todayMvts
      .filter(m => m.type === 'ouverture' || m.type === 'cloture')
      .sort((a, b) => a.time.localeCompare(b.time))
    return relevant.length > 0 && relevant[relevant.length - 1].type === 'ouverture'
  }, [todayMvts])

  // Current session boundaries (last ouverture → first cloture after it, or open-ended)
  const sessionBounds = useMemo(() => {
    const relevant = todayMvts
      .filter(m => m.type === 'ouverture' || m.type === 'cloture')
      .sort((a, b) => a.time.localeCompare(b.time))
    // Find the last ouverture
    let lastOuvIdx = -1
    for (let i = relevant.length - 1; i >= 0; i--) {
      if (relevant[i].type === 'ouverture') { lastOuvIdx = i; break }
    }
    if (lastOuvIdx === -1) return null
    const start = relevant[lastOuvIdx].time
    // First cloture after the last ouverture
    const endMvt = relevant.slice(lastOuvIdx + 1).find(m => m.type === 'cloture')
    return { start, end: endMvt?.time ?? null }
  }, [todayMvts])

  // IDs of vente cashMvts within the current session window
  const sessionVenteMvtIds = useMemo(() => {
    if (!sessionBounds) return new Set<string>()
    const { start, end } = sessionBounds
    return new Set(
      todayMvts
        .filter(m => m.type === 'vente' && m.time >= start && (end === null || m.time <= end))
        .map(m => {
          const match = m.desc.match(/Vente\s+(F-\S+)/)
          return match ? match[1] : null
        })
        .filter(Boolean) as string[]
    )
  }, [todayMvts, sessionBounds])

  const beneficeSession = useMemo(() => {
    const refCostMap = new Map<string, number>()
    for (const p of products) for (const r of p.refs) refCostMap.set(r.id, r.prixAchat ?? 0)
    const allTxs = [...ventesComptoir, ...clients.flatMap(c => c.transactions)]
    // Only count txs whose vente cashMvt falls within the current session
    const sessionTxs = allTxs.filter(tx => tx.date === td && sessionVenteMvtIds.has(tx.id))
    return sessionTxs.reduce((total, tx) =>
      total + tx.lines.reduce((s, l) => {
        const cost = l.refId ? (refCostMap.get(l.refId) ?? 0) : 0
        return s + (l.pu - cost) * l.qty
      }, 0)
    , 0)
  }, [ventesComptoir, clients, products, td, sessionVenteMvtIds])

  // Depenses within session window
  const depensesJour = useMemo(() => {
    if (!sessionBounds) return 0
    const { start, end } = sessionBounds
    return todayMvts
      .filter(m => m.type === 'depense' && m.time >= start && (end === null || m.time <= end))
      .reduce((s, m) => s + m.montant, 0)
  }, [todayMvts, sessionBounds])

  const beneficeNet = beneficeSession - depensesJour

  const solde = useMemo(() => {
    // Use deduped mouvements (excludes credit rows which are non-cash)
    const sorted = mouvements
      .filter(m => m.type !== 'credit')
      .sort((a, b) => {
        const dc = parseD(a.date).getTime() - parseD(b.date).getTime()
        return dc !== 0 ? dc : a.time.localeCompare(b.time)
      })
    if (sorted.length === 0) return ouverture
    let balance = ouverture
    for (const m of sorted) {
      if (m.type === 'cloture' || m.type === 'ouverture') balance = m.montant
      else if (m.type === 'benefice') continue
      else if (m.dir === 'entree') balance += m.montant
      else balance -= m.montant
    }
    return balance
  }, [mouvements, ouverture])

  // Filtered list
  const filteredMvts = useMemo(() => {
    let from: Date, to: Date
    const now = new Date()
    if (period === 'today') { from = parseD(td); to = parseD(td) }
    else if (period === 'yesterday') { from = parseD(daysAgo(1)); to = parseD(daysAgo(1)) }
    else if (period === 'week') { from = parseD(daysAgo(6)); to = new Date() }
    else if (period === 'month') { from = new Date(now.getFullYear(), now.getMonth(), 1); to = now }
    else {
      if (!customFrom || !customTo) return []
      from = parseD(isoToFr(customFrom)); to = parseD(isoToFr(customTo))
    }
    to.setHours(23,59,59)
    let list = mouvements.filter(m => { const md = parseD(m.date); return md >= from && md <= to })
    if (filterMvt !== 'all') list = list.filter(m => {
      if (filterMvt==='entree')  return m.dir==='entree' && m.type!=='credit'
      if (filterMvt==='sortie')  return m.dir==='sortie'
      if (filterMvt==='vente')   return m.type==='vente' || m.type==='credit'
      if (filterMvt==='credit') {
        if (m.type !== 'credit') return false
        const tid = m.desc.match(/Vente\s+(F-\S+)/)?.[1]
        if (!tid) return true
        const tx = txMap.get(tid)
        return tx ? tx.paid < tx.total : true
      }
      if (filterMvt==='client')  return m.type==='client'
      if (filterMvt==='fourn')   return m.type==='fourn'
      if (filterMvt==='depense') return m.type==='depense'
      if (filterMvt==='investissement') return m.type==='investissement'
      if (filterMvt==='benefice') return m.type==='benefice'
      if (filterMvt==='paid') {
        if (m.type !== 'vente' && m.type !== 'credit') return false
        const tid = m.desc.match(/(?:Vente|Annulation|Encaissement)\s+(F-\S+)/)?.[1]
        if (!tid) return false
        const tx = txMap.get(tid)
        return tx ? tx.paid >= tx.total : false
      }
      if (filterMvt==='non_sorti') {
        if (m.type !== 'vente' && m.type !== 'credit') return false
        const tid = m.desc.match(/(?:Vente|Annulation|Encaissement)\s+(F-\S+)/)?.[1]
        if (!tid) return false
        const tx = txMap.get(tid)
        if (!tx) return false
        const sortedCount = (tx.sortedLines ?? []).filter(Boolean).length
        return sortedCount < tx.lines.length
      }
      return true
    })
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m => {
        if ((m.desc + m.cat).toLowerCase().includes(q)) return true
        const tid = m.desc.match(/(?:Vente|Annulation|Encaissement)\s+(F-\S+)/)?.[1]
        if (tid) {
          if (tid.toLowerCase().includes(q)) return true
          const clientName = txClientMap.get(tid)
          if (clientName?.toLowerCase().includes(q)) return true
        }
        return false
      })
    }
    return list.sort((a,b) => {
      const dateCmp = parseD(b.date).getTime() - parseD(a.date).getTime()
      return dateCmp !== 0 ? dateCmp : b.time.localeCompare(a.time)
    })
  }, [mouvements, period, filterMvt, search, customFrom, customTo, td, txMap, txClientMap])

  // Group by date
  const groups = useMemo(() => {
    const g: Record<string, Mouvement[]> = {}
    filteredMvts.forEach(m => { if (!g[m.date]) g[m.date] = []; g[m.date].push(m) })
    return Object.entries(g).sort(([a],[b]) => parseD(b).getTime() - parseD(a).getTime())
  }, [filteredMvts])

  const yesterday = daysAgo(1)

  const FILTER_PILLS: { key: FilterMvt; label: string; variant?: string }[] = [
    { key:'all',       label:'Tous' },
    { key:'entree',    label:'Entrées',      variant:'in' },
    { key:'sortie',    label:'Sorties',      variant:'out' },
    { key:'vente',     label:'Ventes POS' },
    { key:'paid',      label:'Payées' },
    { key:'non_sorti', label:'Non sorties' },
    { key:'credit',    label:'Crédits' },
    { key:'depense',        label:'Dépenses',       variant:'out' },
    { key:'investissement', label:'Investissements', variant:'out' },
    { key:'benefice',       label:'Bénéfices' },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Topbar */}
      <div className="flex flex-shrink-0 flex-col border-b border-black/[0.08] bg-white">
        <div className="flex items-center justify-between px-4 md:px-6 py-3">
          <div>
            <h1 className="text-[17px] font-medium">Caisse</h1>
            <p className="mt-0.5 text-[12px] text-[#a8a7a2] hidden sm:block">{new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}</p>
          </div>
        </div>
        {/* Desktop: full button row */}
        <div className="hidden sm:flex gap-2 px-4 md:px-6 pb-3">
          {cashTab === 'journaliere' ? <>
            <button onClick={() => setModal(caisseOuverte ? 'cloture' : 'ouverture')}
              className={cn('flex items-center justify-center gap-1.5 rounded-[9px] border px-3.5 py-2 text-[13px] font-medium cursor-pointer hover:opacity-90',
                caisseOuverte
                  ? 'border-[#996600] bg-[#fdf3dc] text-[#996600]'
                  : 'border-none bg-[#1a1a18] text-white')}>
              {caisseOuverte ? <><Check size={13}/> Clôturer caisse</> : <><Plus size={13}/> Ouvrir caisse</>}
            </button>
            <button onClick={() => setModal('entree')}
              className="flex items-center justify-center gap-1.5 rounded-[9px] border-none bg-[#1a7a4a] px-3.5 py-2 text-[13px] font-medium text-white cursor-pointer hover:opacity-90">
              <Plus size={13}/> Entrée manuelle
            </button>
            <button onClick={() => setModal('depense')}
              className="flex items-center justify-center gap-1.5 rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3.5 py-2 text-[13px] font-medium cursor-pointer hover:opacity-85">
              <Plus size={13}/> Dépense
            </button>
            <button onClick={() => setModal('investissement')}
              className="flex items-center justify-center gap-1.5 rounded-[9px] border border-[#996600]/40 bg-[#fdf3dc] px-3.5 py-2 text-[13px] font-medium text-[#996600] cursor-pointer hover:opacity-85">
              <Plus size={13}/> Investissement
            </button>
          </> : <>
            <button onClick={() => setModal('retirer')}
              className="flex items-center justify-center gap-1.5 rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3.5 py-2 text-[13px] font-medium cursor-pointer hover:opacity-85">
              <TrendingDown size={13}/> Retirer
            </button>
            <button onClick={() => setModal('addDette')}
              className="flex items-center justify-center gap-1.5 rounded-[9px] border border-[#c0392b]/40 bg-[#fdecea] px-3.5 py-2 text-[13px] font-medium text-[#c0392b] cursor-pointer hover:opacity-85">
              <Plus size={13}/> Ajouter dette
            </button>
            <button onClick={() => setModal('alimenter')}
              className="flex items-center justify-center gap-1.5 rounded-[9px] border-none bg-[#1a5fa8] px-3.5 py-2 text-[13px] font-medium text-white cursor-pointer hover:opacity-90">
              <TrendingUp size={13}/> Alimenter
            </button>
          </>}
        </div>

        {/* Mobile: collapsed toggle */}
        <div className="sm:hidden border-t border-black/[0.06]">
          <button
            onClick={() => setActionsOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-2 border-none bg-transparent cursor-pointer">
            <span className="text-[11px] font-semibold uppercase tracking-[.6px] text-[#a8a7a2]">Actions</span>
            <svg className={cn('h-3.5 w-3.5 text-[#a8a7a2] transition-transform', actionsOpen && 'rotate-180')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6,9 12,15 18,9"/></svg>
          </button>
          {actionsOpen && (
            <div className="grid grid-cols-2 gap-2 px-4 pb-3">
              {cashTab === 'journaliere' ? <>
                <button onClick={() => { setActionsOpen(false); setModal(caisseOuverte ? 'cloture' : 'ouverture') }}
                  className={cn('flex items-center justify-center gap-1.5 rounded-[9px] border px-3.5 py-2.5 text-[13px] font-medium cursor-pointer',
                    caisseOuverte
                      ? 'border-[#996600] bg-[#fdf3dc] text-[#996600]'
                      : 'border-none bg-[#1a1a18] text-white')}>
                  {caisseOuverte ? <><Check size={13}/> Clôturer caisse</> : <><Plus size={13}/> Ouvrir caisse</>}
                </button>
                <button onClick={() => { setActionsOpen(false); setModal('entree') }}
                  className="flex items-center justify-center gap-1.5 rounded-[9px] border-none bg-[#1a7a4a] px-3.5 py-2.5 text-[13px] font-medium text-white cursor-pointer">
                  <Plus size={13}/> Entrée manuelle
                </button>
                <button onClick={() => { setActionsOpen(false); setModal('depense') }}
                  className="flex items-center justify-center gap-1.5 rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3.5 py-2.5 text-[13px] font-medium cursor-pointer">
                  <Plus size={13}/> Dépense
                </button>
                <button onClick={() => { setActionsOpen(false); setModal('investissement') }}
                  className="flex items-center justify-center gap-1.5 rounded-[9px] border border-[#996600]/40 bg-[#fdf3dc] px-3.5 py-2.5 text-[13px] font-medium text-[#996600] cursor-pointer">
                  <Plus size={13}/> Investissement
                </button>
              </> : <>
                <button onClick={() => { setActionsOpen(false); setModal('retirer') }}
                  className="flex items-center justify-center gap-1.5 rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-3.5 py-2.5 text-[13px] font-medium cursor-pointer">
                  <TrendingDown size={13}/> Retirer
                </button>
                <button onClick={() => { setActionsOpen(false); setModal('addDette') }}
                  className="flex items-center justify-center gap-1.5 rounded-[9px] border border-[#c0392b]/40 bg-[#fdecea] px-3.5 py-2.5 text-[13px] font-medium text-[#c0392b] cursor-pointer">
                  <Plus size={13}/> Ajouter dette
                </button>
                <button onClick={() => { setActionsOpen(false); setModal('alimenter') }}
                  className="col-span-2 flex items-center justify-center gap-1.5 rounded-[9px] border-none bg-[#1a5fa8] px-3.5 py-2.5 text-[13px] font-medium text-white cursor-pointer">
                  <TrendingUp size={13}/> Alimenter
                </button>
              </>}
            </div>
          )}
        </div>
      </div>

      {/* Tab switcher — caisse de fond hidden for cashiers */}
      <div className="flex flex-shrink-0 border-b border-black/[0.08] bg-white px-6">
        {([['journaliere','Caisse du jour'],['epargne','Caisse de fond']] as [CashTab,string][])
          .filter(([key]) => key === 'journaliere' || appUser?.role === 'owner')

          .map(([key, label]) => (
            <button key={key} onClick={() => setCashTab(key)}
              className={cn('flex items-center gap-1.5 border-none bg-transparent px-4 py-2.5 text-[13px] font-medium cursor-pointer transition-colors',
                cashTab === key ? 'border-b-2 border-[#1a1a18] text-[#111110]' : 'text-[#a8a7a2] hover:text-[#6b6a66]')}
              style={{ borderBottom: cashTab === key ? '2px solid #1a1a18' : '2px solid transparent' }}>
              {key === 'epargne' && <Wallet size={13}/>}
              {label}
              {key === 'epargne' && <span className="ml-1 rounded-full bg-[#e8f0fb] px-2 py-0.5 font-mono text-[10px] text-[#1a5fa8]">{fmt(soldeEpargne)}</span>}
            </button>
          ))}
      </div>

      {cashTab === 'epargne' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Caisse de fond solde banner */}
          <div className="flex flex-shrink-0 items-center gap-6 border-b border-black/[0.08] bg-white px-6 py-4">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[.7px] text-[#a8a7a2]">Caisse de fond</div>
              <div className="mt-1 font-mono text-[28px] font-light text-[#1a5fa8] leading-none">{fmt(soldeEpargne)}</div>
              <div className="mt-1 text-[11px] text-[#a8a7a2]">MRU</div>
            </div>
            <div className="flex-1"/>
            <div className="text-right">
              <div className="text-[10px] font-medium uppercase tracking-[.7px] text-[#a8a7a2]">Dettes en cours</div>
              {(['MRU','CFA'] as const).map(cur => {
                const total = dettesDiverses.filter(d=>(d.currency??'MRU')===cur && d.paid<d.montant).reduce((s,d)=>s+(d.montant-d.paid),0)
                if (!total) return null
                return <div key={cur} className="mt-1 font-mono text-[18px] font-light text-[#c0392b] leading-tight">{fmt(total)} <span className="text-[12px]">{cur}</span></div>
              })}
              <div className="mt-1 text-[11px] text-[#a8a7a2]">{dettesDiverses.filter(d=>d.paid<d.montant).length} dette{dettesDiverses.filter(d=>d.paid<d.montant).length!==1?'s':''} en cours</div>
            </div>
          </div>

          {/* ── Mobile layout: full-width list ── */}
          {/* ── Mobile layout ── */}
          <div className="md:hidden flex flex-col flex-1 overflow-hidden">
            {/* Sub-tab bar */}
            <div className="flex flex-shrink-0 border-b border-black/[0.08] bg-white px-4">
              {([['historique','Historique'],['creanciers','Créanciers']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setMobileEpargneTab(key)}
                  className={cn('flex items-center gap-1.5 border-none bg-transparent px-4 py-2.5 text-[13px] font-medium cursor-pointer transition-colors',
                    mobileEpargneTab === key ? 'text-[#111110]' : 'text-[#a8a7a2]')}
                  style={{ borderBottom: mobileEpargneTab === key ? '2px solid #1a1a18' : '2px solid transparent' }}>
                  {label}
                  {key === 'creanciers' && dettesDiverses.filter(d => d.paid < d.montant).length > 0 &&
                    <span className="rounded-full bg-[#fdecea] px-1.5 py-0.5 text-[10px] font-medium text-[#c0392b]">
                      {dettesDiverses.filter(d => d.paid < d.montant).length}
                    </span>
                  }
                </button>
              ))}
            </div>

            {/* Historique tab */}
            {mobileEpargneTab === 'historique' && (
              <div className="flex-1 overflow-y-auto">
                {epargneMvts.length === 0
                  ? <div className="flex h-32 items-center justify-center text-[13px] text-[#a8a7a2]">Aucun mouvement</div>
                  : epargneMvts.map(m => (
                      <div key={m.id} className="flex items-center gap-3 border-b border-black/[0.04] px-4 py-2.5">
                        <div className={cn('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px]',
                          m.dir === 'entree' ? 'bg-[#e8f0fb]' : 'bg-[#fdecea]')}>
                          {m.dir === 'entree'
                            ? <TrendingUp size={13} className="text-[#1a5fa8]"/>
                            : <TrendingDown size={13} className="text-[#c0392b]"/>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-[13px] font-medium">{m.desc}</div>
                          <div className="text-[11px] text-[#a8a7a2]">{m.cat} · {m.date} {m.time}</div>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {m.modes?.map((pm, i) => <ModeBadge key={i} {...pm}/>)}
                          </div>
                        </div>
                        <span className={cn('flex-shrink-0 font-mono text-[13px] font-medium',
                          m.dir === 'entree' ? 'text-[#1a5fa8]' : 'text-[#c0392b]')}>
                          {m.dir === 'entree' ? '+' : '-'}{fmt(m.montant)} MRU
                        </span>
                      </div>
                    ))
                }
              </div>
            )}

            {/* Créanciers tab */}
            {mobileEpargneTab === 'creanciers' && (
              <div className="flex-1 overflow-y-auto">
                {dettesDiverses.length === 0
                  ? <div className="flex h-32 items-center justify-center text-[13px] text-[#a8a7a2]">Aucune dette enregistrée</div>
                  : <div className="px-3 py-2 flex flex-col">
                      {dettesDiverses.map(d => {
                        const cur   = d.currency ?? 'MRU'
                        const reste = d.montant - d.paid
                        const pct   = d.montant > 0 ? Math.round(d.paid / d.montant * 100) : 0
                        const done  = reste <= 0
                        return (
                          <div key={d.id}
                            className="tx-row flex items-center gap-3 px-3 py-2.5 cursor-pointer active:scale-[0.99] transition-transform"
                            onClick={() => setDetteDetailId(d.id)}>
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
                              style={{
                                background: done ? 'rgba(26,122,74,0.14)' : 'rgba(192,57,43,0.12)',
                                color: done ? '#1a7a4a' : '#c0392b',
                              }}>
                              {d.nom.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[13px] font-medium text-[#111110] truncate">{d.nom}</span>
                                {done
                                  ? <span className="rounded-full bg-[#e8f5ee] px-2 py-0.5 text-[10px] font-medium text-[#1a7a4a]">Soldé</span>
                                  : <span className="rounded-full bg-[#fdecea] px-2 py-0.5 text-[10px] font-medium text-[#c0392b]">{pct}%</span>
                                }
                              </div>
                              <div className="text-[11px] text-[#a8a7a2]">{d.notes || cur}</div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <div className={cn('font-mono text-[13px] font-semibold', done ? 'text-[#1a7a4a]' : 'text-[#c0392b]')}>
                                {done ? 'Soldé' : `${fmt(reste)} ${cur}`}
                              </div>
                              <div className="text-[10px] text-[#a8a7a2]">{fmt(d.montant)} {cur} total</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                }
              </div>
            )}
          </div>

          {/* ── Desktop layout: dettes left + history right ── */}
          <div className="hidden md:flex flex-1 overflow-hidden">
            {/* Left: dettes */}
            <div className="flex flex-col overflow-y-auto" style={{ minWidth: 0, flex: '1 1 0' }}>
              {/* Dettes diverses */}
              <div className="flex-shrink-0 border-b border-black/[0.08]">
                <div className="flex items-center justify-between px-5 py-3">
                  <span className="text-[12px] font-semibold uppercase tracking-[.6px] text-[#6b6a66]">Dettes diverses</span>
                  <span className="text-[11px] text-[#a8a7a2]">{dettesDiverses.length} créancier{dettesDiverses.length!==1?'s':''}</span>
                </div>
                {dettesDiverses.length === 0
                  ? <div className="px-5 pb-4 text-[13px] text-[#a8a7a2]">Aucune dette enregistrée</div>
                  : <>

                      {/* Desktop card grid */}
                      <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-5"
                        style={{ background: 'linear-gradient(160deg,#f4f2ef 0%,#edeae4 100%)' }}>
                        {dettesDiverses.map(d => {
                          const cur   = d.currency ?? 'MRU'
                          const reste = d.montant - d.paid
                          const pct   = d.montant > 0 ? Math.round(d.paid / d.montant * 100) : 0
                          const done  = reste <= 0
                          const initial = d.nom.charAt(0).toUpperCase()
                          return (
                            <div key={d.id} onClick={() => setDetteDetailId(d.id)}
                              className="relative flex flex-col overflow-hidden rounded-[18px] cursor-pointer"
                              style={{
                                background: 'linear-gradient(160deg,#ffffff 0%,#f9f7f3 100%)',
                                border: '1px solid rgba(192,57,43,0.18)',
                                boxShadow: '0 1px 0 rgba(255,255,255,0.85) inset, 0 -1px 0 rgba(0,0,0,0.05) inset, 0 4px 8px rgba(0,0,0,0.05), 0 10px 28px rgba(0,0,0,0.07)',
                                transition: 'transform 0.22s ease, box-shadow 0.22s ease',
                                opacity: done ? 0.72 : 1,
                              }}
                              onMouseEnter={e => Object.assign((e.currentTarget as HTMLElement).style, {
                                transform: 'translateY(-5px)',
                                boxShadow: '0 1px 0 rgba(255,255,255,0.85) inset, 0 -1px 0 rgba(0,0,0,0.05) inset, 0 16px 32px rgba(0,0,0,0.10), 0 36px 56px rgba(0,0,0,0.09)',
                              })}
                              onMouseLeave={e => Object.assign((e.currentTarget as HTMLElement).style, {
                                transform: 'translateY(0)',
                                boxShadow: '0 1px 0 rgba(255,255,255,0.85) inset, 0 -1px 0 rgba(0,0,0,0.05) inset, 0 4px 8px rgba(0,0,0,0.05), 0 10px 28px rgba(0,0,0,0.07)',
                              })}>

                              {/* Shimmer top line */}
                              <div className="absolute inset-x-0 top-0 h-[1px]"
                                style={{ background: done
                                  ? 'linear-gradient(90deg,transparent 0%,rgba(26,122,74,0.5) 50%,transparent 100%)'
                                  : 'linear-gradient(90deg,transparent 0%,rgba(192,57,43,0.45) 50%,transparent 100%)' }}/>

                              {/* Body */}
                              <div className="flex flex-col gap-3 px-4 pt-5 pb-4">

                                {/* Avatar + name */}
                                <div className="flex items-center gap-3">
                                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[14px] font-bold"
                                    style={{
                                      background: done ? 'rgba(26,122,74,0.1)' : 'rgba(192,57,43,0.1)',
                                      color: done ? '#1a7a4a' : '#c0392b',
                                      boxShadow: done ? '0 0 0 2px rgba(26,122,74,0.18)' : '0 0 0 2px rgba(192,57,43,0.18)',
                                    }}>
                                    {initial}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[13px] font-semibold text-[#111110] truncate">{d.nom}</div>
                                    {d.notes
                                      ? <div className="text-[11px] text-[#a8a7a2] truncate mt-0.5">{d.notes}</div>
                                      : <div className="text-[11px] text-[#a8a7a2] mt-0.5">{cur}</div>
                                    }
                                  </div>
                                </div>

                                {/* Divider */}
                                <div style={{ height: 1, background: 'linear-gradient(90deg,rgba(192,57,43,0.15) 0%,rgba(192,57,43,0.06) 60%,transparent 100%)' }}/>

                                {/* Progress bar */}
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] text-[#a8a7a2]">Remboursé</span>
                                    <span className="text-[10px] font-mono font-medium" style={{ color: done ? '#1a7a4a' : '#c0392b' }}>{pct}%</span>
                                  </div>
                                  <div className="h-1.5 overflow-hidden rounded-full bg-[#f0efe9]">
                                    <div className="h-full rounded-full transition-all"
                                      style={{ width:`${pct}%`, background: done ? '#1a7a4a' : 'linear-gradient(90deg,#c0392b,#e74c3c)' }}/>
                                  </div>
                                </div>

                                {/* Amount + status */}
                                <div className="flex items-end justify-between">
                                  {done
                                    ? <div>
                                        <div className="text-[13px] font-semibold text-[#1a7a4a]">Soldé</div>
                                        <div className="text-[10px] text-[#1a7a4a]/50">✓ tout remboursé</div>
                                      </div>
                                    : <div>
                                        <div className="font-mono text-[16px] font-bold leading-none text-[#c0392b]">{fmt(reste)}</div>
                                        <div className="mt-0.5 text-[10px] font-medium tracking-wide text-[#c0392b]/50">{cur} DÛ</div>
                                      </div>
                                  }
                                  <div className="text-right">
                                    <div className="text-[11px] text-[#a8a7a2]">/ {fmt(d.montant)}</div>
                                    <div className="text-[10px] text-[#a8a7a2]/60">{cur} total</div>
                                  </div>
                                </div>
                              </div>

                              {/* Bottom accent bar */}
                              <div className="h-[3px] w-full flex-shrink-0"
                                style={{ background: done
                                  ? 'linear-gradient(90deg,#1a7a4a 0%,#27ae60 50%,rgba(26,122,74,0.3) 100%)'
                                  : 'linear-gradient(90deg,#c0392b 0%,#e74c3c 50%,rgba(192,57,43,0.3) 100%)' }}/>
                            </div>
                          )
                        })}
                      </div>
                    </>
                }
              </div>
            </div>

            {/* Right: historique mouvements */}
            <div className="flex flex-col border-l border-black/[0.08] overflow-hidden" style={{ flex: '0 0 35%' }}>
              <div className="flex-shrink-0 border-b border-black/[0.06] bg-[#f8f7f3] px-5 py-3">
                <span className="text-[10px] font-semibold uppercase tracking-[.7px] text-[#6b6a66]">Historique mouvements</span>
              </div>
              <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth:'thin' }}>
                {epargneMvts.length === 0
                  ? <div className="flex h-32 items-center justify-center text-[13px] text-[#a8a7a2]">Aucun mouvement</div>
                  : epargneMvts.map(m => (
                      <div key={m.id} className="flex items-center gap-3 border-b border-black/[0.04] px-5 py-2.5 hover:bg-[#f8f7f3]">
                        <div className={cn('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px]',
                          m.dir === 'entree' ? 'bg-[#e8f0fb]' : 'bg-[#fdecea]')}>
                          {m.dir === 'entree'
                            ? <TrendingUp size={13} className="text-[#1a5fa8]"/>
                            : <TrendingDown size={13} className="text-[#c0392b]"/>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-[13px] font-medium">{m.desc}</div>
                          <div className="text-[11px] text-[#a8a7a2]">{m.cat} · {m.date} {m.time}</div>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {m.modes?.map((pm,i) => <ModeBadge key={i} {...pm}/>)}
                          </div>
                        </div>
                        <span className={cn('flex-shrink-0 font-mono text-[14px] font-medium',
                          m.dir==='entree' ? 'text-[#1a5fa8]' : 'text-[#c0392b]')}>
                          {m.dir==='entree'?'+':'-'}{fmt(m.montant)} MRU
                        </span>
                      </div>
                    ))
                }
              </div>
            </div>
          </div>{/* end desktop flex */}
        </div>
      )}

      {cashTab === 'journaliere' && <>
      {/* KPIs — mobile only, collapsible */}
      <div className="sm:hidden flex-shrink-0 border-b border-black/[0.08]">
        {/* Summary bar — always visible, tap to toggle */}
        <button
          onClick={() => setKpiOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2 border-none cursor-pointer"
          style={{ background: 'linear-gradient(135deg,#f0f4ff 0%,#e8f0fb 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="text-left">
              <div className="text-[9px] font-bold uppercase tracking-[.6px] text-[#1a5fa8]">Solde</div>
              <div className="font-mono text-[15px] font-bold leading-none text-[#0f2460]">{fmt(solde)} <span className="text-[10px] font-normal text-[#a8a7a2]">MRU</span></div>
            </div>
            <div className="h-6 w-px bg-black/[0.1]"/>
            <div className="text-left">
              <div className="text-[9px] font-bold uppercase tracking-[.6px] text-[#996600]">Ventes</div>
              <div className="font-mono text-[15px] font-bold leading-none text-[#996600]">{fmt(ventesTotal)} <span className="text-[10px] font-normal text-[#a8a7a2]">MRU</span></div>
            </div>
            <div className="h-6 w-px bg-black/[0.1]"/>
            <div className="flex items-center gap-1.5 text-[11px] text-[#1a7a4a] font-medium">
              <span>+{fmt(entreesDay)}</span>
              <span className="text-[#a8a7a2]">/</span>
              <span className="text-[#c0392b]">−{fmt(sortiesDay)}</span>
            </div>
          </div>
          <svg className={cn('h-3.5 w-3.5 text-[#a8a7a2] flex-shrink-0 transition-transform', kpiOpen && 'rotate-180')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6,9 12,15 18,9"/></svg>
        </button>

        {/* Expanded detail — hidden by default */}
        {kpiOpen && (
          <div className="px-3 pb-3 pt-1 flex flex-col gap-2" style={{ background: 'linear-gradient(135deg,#f0f4ff 0%,#e8f0fb 100%)' }}>
            {[
              { lbl:'Solde actuel',      val:fmt(solde),                                               sub:'MRU en caisse',  color:'#1a7a4a' },
              { lbl:'Ouverture',         val:fmt(ouverture),                                           sub:'MRU initial',    color:'#1a5fa8' },
              { lbl:'Entrées du jour',   val:'+'+fmt(entreesDay),                                      sub:'MRU encaissés',  color:'#1a7a4a' },
              { lbl:'Sorties du jour',   val:'-'+fmt(sortiesDay),                                      sub:'MRU décaissés',  color:'#c0392b' },
              { lbl:'Ventes du jour',    val:fmt(ventesTotal),                                         sub:ventesDay.length+' vente'+(ventesDay.length!==1?'s':''),  color:'#996600' },
              { lbl:'Encaissé factures', val:fmt(encaissTotal),                                        sub:encaissDay.length+' encaissement'+(encaissDay.length!==1?'s':''), color:'#7c3aed' },
              { lbl:'Marge brute',  val:fmt(Math.round(beneficeSession)),                             sub:'Prix vente − prix achat',                   color: beneficeSession >= 0 ? '#1a7a4a' : '#c0392b' },
              { lbl:'Bénéfice net', val:(beneficeNet>=0?'+':'')+fmt(Math.round(beneficeNet)),         sub:`Marge − dépenses (${fmt(depensesJour)} MRU)`, color: beneficeNet     >= 0 ? '#1a7a4a' : '#c0392b' },
            ].map(k => (
              <div key={k.lbl} className="flex items-center justify-between rounded-[10px] bg-white/70 px-3 py-2.5" style={{ border:'1px solid rgba(200,175,100,0.18)' }}>
                <div className="text-[12px] font-medium text-[#6b6a66]">{k.lbl}</div>
                <div className="text-right">
                  <div className="font-mono text-[14px] font-bold leading-none" style={{ color: k.color }}>{k.val}</div>
                  <div className="text-[9px] text-[#a8a7a2] mt-0.5">{k.sub}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-black/[0.08] bg-white px-3 py-2">
        {/* Desktop: 2 groupes — Période | Type de mouvement */}
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-[.7px] text-[#a8a7a2] select-none">Période</span>
          {(['today','yesterday','week','month','custom'] as FilterPeriod[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={cn('rounded-full border px-3 py-1 text-[11px] font-medium cursor-pointer transition-all whitespace-nowrap',
                period===p ? 'border-[#1a1a18] bg-[#1a1a18] text-[#f5f4f0]' : 'border-black/[0.08] bg-white text-[#6b6a66] hover:bg-[#f0efe9]')}>
              {p==='today'?"Aujourd'hui":p==='yesterday'?'Hier':p==='week'?'7 jours':p==='month'?'Ce mois':'Période…'}
            </button>
          ))}
          <div className="mx-1 h-4 w-px flex-shrink-0 bg-black/[0.12]"/>
          <span className="text-[9px] font-bold uppercase tracking-[.7px] text-[#a8a7a2] select-none">Type</span>
          {FILTER_PILLS.map(fp => (
            <button key={fp.key} onClick={() => setFilterMvt(fp.key)}
              className={cn('rounded-full border px-3 py-1 text-[11px] font-medium cursor-pointer transition-all whitespace-nowrap',
                filterMvt === fp.key
                  ? fp.variant==='in'  ? 'border-[#1a7a4a] bg-[#e8f5ee] text-[#1a7a4a]'
                  : fp.variant==='out' ? 'border-[#c0392b] bg-[#fdecea] text-[#c0392b]'
                  : fp.key==='credit'  ? 'border-[#7c3aed] bg-[#f0e8ff] text-[#7c3aed]'
                  :                     'border-[#1a1a18] bg-[#1a1a18] text-[#f5f4f0]'
                  : 'border-black/[0.08] bg-white text-[#6b6a66] hover:bg-[#f0efe9]')}>
              {fp.label}
            </button>
          ))}
        </div>

        {/* Mobile: 2 selects séparés */}
        <select value={period} onChange={e => setPeriod(e.target.value as FilterPeriod)}
          className="sm:hidden rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2 py-1.5 text-[12px] font-medium outline-none text-[#1a1a18]">
          <option value="today">Aujourd'hui</option>
          <option value="yesterday">Hier</option>
          <option value="week">7 jours</option>
          <option value="month">Ce mois</option>
          <option value="custom">Période…</option>
        </select>
        <select value={filterMvt} onChange={e => setFilterMvt(e.target.value as typeof filterMvt)}
          className="sm:hidden rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2 py-1.5 text-[12px] font-medium outline-none text-[#1a1a18]">
          {FILTER_PILLS.map(fp => <option key={fp.key} value={fp.key}>{fp.label}</option>)}
        </select>

        <div className="flex flex-1 items-center gap-1.5 rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 ml-auto max-w-[160px]">
          <Search size={12} className="flex-shrink-0 text-[#a8a7a2]"/>
          <input type="text" placeholder="Chercher..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-transparent text-[12px] outline-none placeholder:text-[#a8a7a2]"/>
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-black/[0.08] bg-white px-3 py-2">
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            className="flex-1 rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 text-[12px] outline-none focus:border-[#1a1a18]"/>
          <span className="text-[12px] text-[#a8a7a2]">→</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
            className="flex-1 rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 text-[12px] outline-none focus:border-[#1a1a18]"/>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: movements */}
        <div className="flex flex-1 flex-col overflow-hidden" style={{ minWidth: 0 }}>

          {/* Filter total banner */}
          {filterMvt !== 'all' && filteredMvts.length > 0 && (() => {
            const total = filteredMvts.reduce((s, m) => s + m.montant, 0)
            const count = filteredMvts.length
            const { bg, color, border, label } = filterMvt === 'entree'  ? { bg:'#e8f5ee', color:'#1a7a4a', border:'rgba(26,122,74,0.25)', label:'Total entrées' }
              : filterMvt === 'sortie'  ? { bg:'#fdecea', color:'#c0392b', border:'rgba(192,57,43,0.25)', label:'Total sorties' }
              : filterMvt === 'credit'  ? { bg:'#f0e8ff', color:'#7c3aed', border:'rgba(124,58,237,0.25)', label:'Total crédit' }
              : filterMvt === 'vente'   ? { bg:'#fdf3dc', color:'#996600', border:'rgba(153,102,0,0.25)',  label:'Total ventes' }
              : filterMvt === 'client'  ? { bg:'#e8f0fb', color:'#1a5fa8', border:'rgba(26,95,168,0.25)', label:'Total encaissements clients' }
              : filterMvt === 'fourn'   ? { bg:'#f5e6ff', color:'#7b2d8b', border:'rgba(123,45,139,0.25)', label:'Total fournisseurs' }
              : filterMvt === 'depense'   ? { bg:'#fdecea', color:'#c0392b', border:'rgba(192,57,43,0.25)', label:'Total dépenses' }
              : filterMvt === 'non_sorti' ? { bg:'#fff3e0', color:'#e65c00', border:'rgba(230,92,0,0.25)',  label:'Factures non sorties' }
              :                             { bg:'#e8f5ee', color:'#1a7a4a', border:'rgba(26,122,74,0.25)', label:'Total' }
            return (
              <div className="flex flex-shrink-0 items-center justify-between border-b px-4 py-2.5" style={{ background: bg, borderColor: border }}>
                <span className="text-[11px] font-medium" style={{ color }}>{label} · {count} opération{count !== 1 ? 's' : ''}</span>
                <span className="font-mono text-[14px] font-bold" style={{ color }}>{fmt(total)} MRU</span>
              </div>
            )
          })()}

          {/* Movement list — mobile */}
          <div className="md:hidden flex-1 overflow-y-auto px-3 py-2" style={{ scrollbarWidth:'thin', background:'linear-gradient(160deg,#f2efea 0%,#ede9e2 100%)' }}>
            {groups.length === 0
              ? <div className="flex h-full items-center justify-center text-[13px] text-[#a8a7a2]">Aucun mouvement sur cette période</div>
              : groups.map(([date, mvts]) => {
                  const isToday     = date === td
                  const isYesterday = date === yesterday
                  const lbl = isToday ? "Aujourd'hui" : isYesterday ? 'Hier' : date
                  const dayNet = mvts.filter(m=>m.dir==='entree'&&m.type!=='credit').reduce((s,m)=>s+m.montant,0)
                               - mvts.filter(m=>m.dir==='sortie'&&m.type!=='cloture').reduce((s,m)=>s+m.montant,0)
                  return (
                    <div key={date}>
                      {/* Date separator */}
                      <div className="sticky top-0 z-10 flex items-center justify-between px-1 py-1.5 mb-1"
                        style={{ background: 'linear-gradient(180deg,#f2efea 0%,transparent 100%)' }}>
                        <span className="text-[10px] font-bold uppercase tracking-[.7px] text-[#996600]">{lbl}</span>
                        <span className={cn('font-mono text-[10px] font-medium', dayNet>=0?'text-[#1a7a4a]':'text-[#c0392b]')}>
                          {dayNet>=0?'+':''}{fmt(dayNet)} MRU
                        </span>
                      </div>
                      {/* Rows — mobile: plain tx-row / desktop: luxury card */}
                      <div className="flex flex-col gap-1.5 mb-2">
                      {mvts.map(m => {
                        const canEdit = m.type === 'depense' || m.type === 'investissement' || m.type === 'entree' || m.type === 'ouverture' || (m.type === 'client' && appUser?.role === 'owner')
                        const txIdMatch = (m.type === 'vente' || m.type === 'credit') ? m.desc.match(/Vente\s+(F-\S+)/) : null
                        const rowTx = txIdMatch ? txMap.get(txIdMatch[1]) : undefined
                        const sortedCount = rowTx ? (rowTx.sortedLines ?? []).filter(Boolean).length : 0
                        const totalLines  = rowTx ? rowTx.lines.length : 0
                        const allSorted   = totalLines > 0 && sortedCount === totalLines
                        const partialSorted = sortedCount > 0 && !allSorted
                        return (
                        <div key={m.id}
                          className={cn('group flex items-center gap-2 px-3 py-2',
                            'md:rounded-[12px] md:px-4',
                            m.type === 'vente' || m.type === 'credit' ? 'cursor-pointer active:scale-[0.99]' : '',
                            'tx-row',
                          )}
                          style={{
                            background: m.type === 'credit'
                              ? 'linear-gradient(160deg,#faf8ff 0%,#f5f0ff 100%)'
                              : 'linear-gradient(160deg,#ffffff 0%,#f9f7f3 100%)',
                            border: rowTx
                              ? allSorted   ? '1px solid rgba(26,122,74,0.3)'
                              : partialSorted ? '1px solid rgba(26,95,168,0.3)'
                              : '1px solid rgba(200,175,100,0.18)'
                              : m.type === 'credit' ? '1px solid rgba(124,58,237,0.18)' : '1px solid rgba(200,175,100,0.18)',
                            boxShadow: '0 1px 0 rgba(255,255,255,0.8) inset, 0 2px 6px rgba(0,0,0,0.04), 0 6px 16px rgba(0,0,0,0.05)',
                          }}
                          onClick={rowTx
                            ? () => setSortieModal({ tx: rowTx, mvt: m })
                            : m.type === 'credit' ? () => setViewInvoice(buildInvoice(m)) : undefined}
                        >
                          <TypeIcon type={m.type} dir={m.dir}/>
                          <div className="flex-1 min-w-0">
                            {(m.type === 'vente' || m.type === 'credit') && txIdMatch ? (() => {
                              const txId      = txIdMatch[1]
                              const clientName = txClientMap.get(txId) ?? 'Comptoir'
                              return (
                                <>
                                  {/* Row 1: client + tx ID + sorti badge */}
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[13px] font-semibold text-[#111110]">{clientName}</span>
                                    <span className="font-mono text-[10px] font-medium text-[#ea580c] rounded px-1.5 py-0.5"
                                      style={{ background: 'rgba(234,88,12,0.09)' }}>{txId}</span>
                                    {rowTx && (
                                      <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                                        allSorted ? 'bg-[#e8f5ee] text-[#1a7a4a]' : partialSorted ? 'bg-[#e8f0fb] text-[#1a5fa8]' : 'bg-[#f0efe9] text-[#a8a7a2]')}>
                                        {allSorted && <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20,6 9,17 4,12"/></svg>}
                                        {allSorted ? 'Tout sorti' : `${sortedCount}/${totalLines} sorti`}
                                      </span>
                                    )}
                                  </div>
                                  {/* Row 2: modes + time */}
                                  <div className="mt-1 flex items-center gap-1 flex-wrap">
                                    {m.modes.map((pm, i) => <ModeBadge key={i} {...pm}/>)}
                                    <span className="text-[10px] text-[#a8a7a2]">{m.time?.slice(0,5)}</span>
                                  </div>
                                </>
                              )
                            })() : m.type === 'client' ? (() => {
                              const tid = m.desc.match(/(?:Encaissement|Vente|Annulation)\s+(F-\S+)/)?.[1]
                              const clientName = tid ? txClientMap.get(tid) ?? m.cat : m.cat
                              const tx = tid ? txMap.get(tid) : undefined
                              const refs = tx ? tx.lines.map(l => l.desc).join(' · ') : tid ?? ''
                              return (
                                <>
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-[13px] font-semibold text-[#111110]">{clientName}</span>
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-1 flex-wrap min-w-0">
                                    <span className="text-[11px] text-[#6b6a66]">Paiement</span>
                                    {tid && <span className="font-mono text-[10px] font-medium text-[#ea580c] rounded px-1.5 py-0.5" style={{ background:'rgba(234,88,12,0.09)' }}>{tid}</span>}
                                    {refs && <span className="truncate text-[10px] text-[#a8a7a2]">{refs}</span>}
                                  </div>
                                  <div className="mt-1 flex items-center gap-1 flex-wrap">
                                    {m.modes.map((pm, i) => <ModeBadge key={i} {...pm}/>)}
                                    <span className="text-[10px] text-[#a8a7a2]">{m.time?.slice(0,5)}</span>
                                  </div>
                                </>
                              )
                            })() : (
                              <>
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="truncate text-[12px] font-medium text-[#111110]">{m.desc}</span>
                                  {m.modes.length > 0 && m.type !== 'ouverture' && m.modes.map((pm,i) => <ModeBadge key={i} {...pm}/>)}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className="text-[10px] text-[#a8a7a2]">{m.cat} · {m.time}</span>
                                </div>
                              </>
                            )}
                          </div>
                          {m.type === 'ouverture'
                            ? <div className="flex-shrink-0 font-mono text-[14px] font-medium text-[#1a5fa8]">{fmt(m.montant)} MRU</div>
                            : m.type === 'cloture'
                            ? <div className="flex-shrink-0 font-mono text-[13px] text-[#a8a7a2]">{fmt(m.montant)} MRU</div>
                            : <div className={cn('flex-shrink-0 font-mono text-[14px] font-medium',
                                m.type === 'credit' ? 'text-[#7c3aed]' : m.dir==='entree'?'text-[#1a7a4a]':'text-[#c0392b]')}>
                                {m.type === 'credit' ? '' : m.dir==='entree'?'+':'-'}{fmt(m.montant)} MRU
                              </div>
                          }
                          {(m.type === 'vente' || m.type === 'credit') && txMap.get(m.desc.match(/Vente\s+(F-\S+)/)?.[1] ?? '') && (
                            <button
                              onClick={e => { e.stopPropagation(); openEditInvoice(m) }}
                              className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-[8px] border-none bg-transparent cursor-pointer text-[#a8a7a2] hover:bg-[#e8f0fb] hover:text-[#1a5fa8] md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {(() => {
                            if (m.id.startsWith('inv_')) return null
                            const tid = m.desc.match(/(?:Vente|Annulation|Encaissement)\s+(F-\S+)/)?.[1]
                            if (!tid) return null
                            const isAnnulation = m.type === 'vente' && m.dir === 'sortie'
                            const isOrphaned   = !txMap.has(tid)
                            if (!isAnnulation && !isOrphaned) return null
                            return (
                              <button
                                onClick={e => { e.stopPropagation(); deleteCashLines(m.id) }}
                                disabled={deletingLines === m.id}
                                title={isAnnulation ? 'Supprimer la ligne d\'annulation' : 'Supprimer la ligne (facture annulée)'}
                                className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-[8px] border-none bg-transparent cursor-pointer text-[#a8a7a2] hover:bg-[#fdecea] hover:text-[#c0392b] md:opacity-0 md:group-hover:opacity-100 transition-opacity disabled:opacity-50">
                                {deletingLines === m.id
                                  ? <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                  : <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/><path d="M9,6V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2"/></svg>}
                              </button>
                            )
                          })()}
                          {canEdit && (
                            <button
                              onClick={e => { e.stopPropagation(); setEditMvt(m) }}
                              className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-[8px] border-none bg-transparent cursor-pointer text-[#a8a7a2] hover:bg-[#f0efe9] hover:text-[#6b6a66] md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          )}
                        </div>
                        )
                      })}
                      </div>
                    </div>
                  )
                })
            }
          </div>

          {/* Movement list — desktop table */}
          <div className="hidden md:flex flex-1 flex-col overflow-hidden bg-white">
            {groups.length === 0
              ? <div className="flex flex-1 items-center justify-center text-[13px] text-[#a8a7a2]">Aucun mouvement sur cette période</div>
              : <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth:'thin' }}>
                  <table className="w-full" style={{ borderCollapse:'separate', borderSpacing:0, borderTop:'1px solid #ddd9d0' }}>
                    <thead className="sticky top-0 z-10">
                      <tr style={{ background:'#edeae2' }}>
                        <th className="w-24 px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[1px] text-[#6b6a66]" style={{ borderBottom:'2px solid #ccc8be', borderRight:'1px solid #ccc8be' }}>Heure</th>
                        <th className="w-10 px-3 py-3" style={{ borderBottom:'2px solid #ccc8be', borderRight:'1px solid #ccc8be' }}></th>
                        <th className="w-44 px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[1px] text-[#6b6a66]" style={{ borderBottom:'2px solid #ccc8be', borderRight:'1px solid #ccc8be' }}>Nom du client</th>
                        <th className="w-36 px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[1px] text-[#6b6a66]" style={{ borderBottom:'2px solid #ccc8be', borderRight:'1px solid #ccc8be' }}>N° Facture</th>
                        <th className="w-48 px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[1px] text-[#6b6a66]" style={{ borderBottom:'2px solid #ccc8be', borderRight:'1px solid #ccc8be' }}>Mode de paiement</th>
                        <th className="w-36 px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[1px] text-[#6b6a66]" style={{ borderBottom:'2px solid #ccc8be', borderRight:'1px solid #ccc8be' }}>Montant (MRU)</th>
                        <th className="w-16 px-3 py-3" style={{ borderBottom:'2px solid #ccc8be' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map(([date, mvts]) => {
                        const isToday2     = date === td
                        const isYesterday2 = date === yesterday
                        const lbl2 = isToday2 ? "Aujourd'hui" : isYesterday2 ? 'Hier' : date
                        const dayNet2 = mvts.filter(m=>m.dir==='entree'&&m.type!=='credit').reduce((s,m)=>s+m.montant,0)
                                      - mvts.filter(m=>m.dir==='sortie'&&m.type!=='cloture').reduce((s,m)=>s+m.montant,0)
                        return (
                          <React.Fragment key={date}>
                            {/* Date group header */}
                            <tr>
                              <td colSpan={7} className="py-1.5 px-4"
                                style={{ background:'#f5f2ea', borderBottom:'1px solid #ddd9d0', borderTop:'1px solid #ddd9d0' }}>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold uppercase tracking-[1px] text-[#996600]">{lbl2}</span>
                                  <span className={cn('font-mono text-[11px] font-semibold', dayNet2>=0?'text-[#1a7a4a]':'text-[#c0392b]')}>
                                    {dayNet2>=0?'+':''}{fmt(dayNet2)} MRU
                                  </span>
                                </div>
                              </td>
                            </tr>
                            {mvts.map(m => {
                              const canEdit2     = m.type==='depense' || m.type==='investissement' || m.type==='entree' || m.type==='ouverture' || (m.type==='client' && appUser?.role==='owner')
                              const txIdMatch2   = (m.type==='vente'||m.type==='credit') ? m.desc.match(/Vente\s+(F-\S+)/) : null
                              const rowTx2       = txIdMatch2 ? txMap.get(txIdMatch2[1]) : undefined
                              const sortedCount2 = rowTx2 ? (rowTx2.sortedLines??[]).filter(Boolean).length : 0
                              const totalLines2  = rowTx2 ? rowTx2.lines.length : 0
                              const allSorted2   = totalLines2>0 && sortedCount2===totalLines2
                              const partialSorted2 = sortedCount2>0 && !allSorted2

                              // N° Facture: only vente/credit rows
                              const factureId = (m.type==='vente'||m.type==='credit') && txIdMatch2 ? txIdMatch2[1] : ''
                              // Encaissement refs: only client payment rows (all F-numbers in desc)
                              const encaissIds = m.type==='client'
                                ? Array.from(m.desc.matchAll(/F-\S+/g)).map(x=>x[0])
                                : []

                              // Client name — extract from desc "... — Prenom Nom" for client/credit rows
                              const nameFromDesc = m.desc.match(/—\s*(.+)$/)?.[1]?.trim()
                              const clientName2 = factureId
                                ? txClientMap.get(factureId) ?? (nameFromDesc || 'Comptoir')
                                : m.type === 'client'
                                ? (nameFromDesc || txClientMap.get(encaissIds[0]) || m.cat)
                                : m.cat || m.desc

                              const idBadge = (id: string) => (
                                <span key={id} className="font-mono text-[11px] font-semibold rounded-[5px] px-2 py-0.5 whitespace-nowrap"
                                  style={{color:'#c05000', background:'rgba(234,88,12,0.08)', border:'1px solid rgba(234,88,12,0.18)'}}>
                                  {id}
                                </span>
                              )

                              const amountColor = m.type==='credit'?'#7c3aed':m.dir==='entree'?'#1a7a4a':'#c0392b'
                              const amountStr   = m.type==='ouverture'||m.type==='cloture' ? fmt(m.montant)
                                : `${m.type!=='credit'?(m.dir==='entree'?'+':'-'):''}${fmt(m.montant)}`

                              return (
                                <tr key={m.id}
                                  className={cn('group border-b border-[#f0ece4]',
                                    (m.type==='vente'||m.type==='credit') ? 'cursor-pointer' : '')}
                                  style={{ background: m.type==='client' ? '#fdfbff' : '#ffffff' }}
                                  onMouseEnter={e=>(e.currentTarget.style.background='#faf6ee')}
                                  onMouseLeave={e=>(e.currentTarget.style.background= m.type==='client'?'#fdfbff':'#ffffff')}
                                  onClick={rowTx2?()=>setSortieModal({tx:rowTx2,mvt:m}):m.type==='credit'?()=>setViewInvoice(buildInvoice(m)):undefined}
                                >
                                  {/* Heure — first column */}
                                  <td className="px-4 py-2 font-mono text-[12px] text-[#6b6a66] whitespace-nowrap" style={{ borderBottom:'1px solid #e8e4dc', borderRight:'1px solid #e8e4dc' }}>{m.time ? m.time.slice(0,5) : '—'}</td>

                                  {/* Icon */}
                                  <td className="px-3 py-2 w-10" style={{ borderBottom:'1px solid #e8e4dc', borderRight:'1px solid #e8e4dc' }}><TypeIcon type={m.type} dir={m.dir}/></td>

                                  {/* Nom du client */}
                                  <td className="px-4 py-2 w-44 max-w-[176px]" style={{ borderBottom:'1px solid #e8e4dc', borderRight:'1px solid #e8e4dc' }}>
                                    <div className="truncate text-[13px] font-semibold text-[#1a1a18]">{clientName2 || '—'}</div>
                                  </td>

                                  {/* N° Facture — vente/credit + encaissements client */}
                                  <td className="px-4 py-2 whitespace-nowrap" style={{ borderBottom:'1px solid #e8e4dc', borderRight:'1px solid #e8e4dc' }}>
                                    {factureId ? (
                                      <div className="flex items-center gap-1.5">
                                        {idBadge(factureId)}
                                        {rowTx2 && (
                                          <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                                            allSorted2?'bg-[#e8f5ee] text-[#1a7a4a]':partialSorted2?'bg-[#e8f0fb] text-[#1a5fa8]':'bg-[#f0efe9] text-[#a8a7a2]')}>
                                            {allSorted2&&<svg className="h-2 w-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20,6 9,17 4,12"/></svg>}
                                            {allSorted2?'Tout sorti':`${sortedCount2}/${totalLines2} sorti`}
                                          </span>
                                        )}
                                      </div>
                                    ) : encaissIds.length > 0 ? (
                                      <div className="flex items-center gap-1.5">{encaissIds.map(id => idBadge(id))}</div>
                                    ) : <span className="text-[#d0cec8] text-[11px]">—</span>}
                                  </td>

                                  {/* Mode de paiement */}
                                  <td className="px-4 py-2" style={{ borderBottom:'1px solid #e8e4dc', borderRight:'1px solid #e8e4dc' }}>
                                    <div className="flex flex-wrap gap-1">
                                      {m.modes.length>0 ? m.modes.map((pm,i)=><ModeBadge key={i} {...pm}/>) : <span className="text-[#d0cec8] text-[11px]">—</span>}
                                    </div>
                                  </td>

                                  {/* Montant */}
                                  <td className="px-4 py-2 text-right whitespace-nowrap" style={{ borderBottom:'1px solid #e8e4dc', borderRight:'1px solid #e8e4dc' }}>
                                    <span className="font-mono text-[13px] font-bold" style={{
                                      color: m.type==='ouverture'?'#1a5fa8':m.type==='cloture'?'#a8a7a2':amountColor
                                    }}>{amountStr}</span>
                                    <span className="ml-1 text-[10px] text-[#a8a7a2]">MRU</span>
                                  </td>

                                  {/* Actions */}
                                  <td className="px-2 py-2" style={{ borderBottom:'1px solid #e8e4dc' }}>
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {(m.type==='vente'||m.type==='credit') && txMap.get(m.desc.match(/Vente\s+(F-\S+)/)?.[1]??'') && (
                                        <button onClick={e=>{e.stopPropagation();openEditInvoice(m)}}
                                          className="flex h-7 w-7 items-center justify-center rounded-[7px] border-none bg-transparent cursor-pointer text-[#a8a7a2] hover:bg-[#e8f0fb] hover:text-[#1a5fa8]">
                                          <Pencil className="h-3.5 w-3.5"/>
                                        </button>
                                      )}
                                      {(()=>{
                                        if (m.id.startsWith('inv_')) return null
                                        const tid3=m.desc.match(/(?:Vente|Annulation|Encaissement)\s+(F-\S+)/)?.[1]
                                        if (!tid3) return null
                                        const isAnn=m.type==='vente'&&m.dir==='sortie'
                                        const isOrph=!txMap.has(tid3)
                                        if (!isAnn&&!isOrph) return null
                                        return <button onClick={e=>{e.stopPropagation();deleteCashLines(m.id)}} disabled={deletingLines===m.id}
                                          className="flex h-7 w-7 items-center justify-center rounded-[7px] border-none bg-transparent cursor-pointer text-[#a8a7a2] hover:bg-[#fdecea] hover:text-[#c0392b] disabled:opacity-50">
                                          {deletingLines===m.id
                                            ?<svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                            :<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/><path d="M9,6V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2"/></svg>}
                                        </button>
                                      })()}
                                      {canEdit2&&<button onClick={e=>{e.stopPropagation();setEditMvt(m)}}
                                        className="flex h-7 w-7 items-center justify-center rounded-[7px] border-none bg-transparent cursor-pointer text-[#a8a7a2] hover:bg-[#f0efe9] hover:text-[#6b6a66]">
                                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                      </button>}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
            }
          </div>
        </div>

        {/* Right: KPI sidebar — desktop only */}
        <div className="hidden md:flex flex-col flex-shrink-0 border-l border-black/[0.08] overflow-hidden" style={{ width: 192 }}>
          <div className="flex-shrink-0 border-b border-black/[0.06] px-4 py-2.5" style={{ background: 'linear-gradient(160deg,#f2efea 0%,#ede9e2 100%)' }}>
            <span className="text-[10px] font-semibold uppercase tracking-[.7px] text-[#a8a7a2]">Indicateurs</span>
          </div>
          <div className="flex-1 overflow-y-auto" style={{ background: 'linear-gradient(160deg,#f2efea 0%,#ede9e2 100%)', scrollbarWidth:'none' }}>
            {[
              { lbl:'Solde actuel',    val:fmt(solde),          sub:'MRU en caisse',  color:'#1a7a4a' },
              { lbl:'Ouverture',       val:fmt(ouverture),       sub:'MRU initial',    color:'#1a5fa8' },
              { lbl:'Entrées du jour', val:'+'+fmt(entreesDay),  sub:'MRU encaissés',  color:'#1a7a4a' },
              { lbl:'Sorties du jour', val:'-'+fmt(sortiesDay),  sub:'MRU décaissés',  color:'#c0392b' },
              { lbl:'Ventes du jour',  val:fmt(ventesTotal),     sub:ventesDay.length+' vente'+(ventesDay.length!==1?'s':''), color:'#996600' },
              { lbl:'Encaissé factures', val:fmt(encaissTotal),  sub:encaissDay.length+' encaissement'+(encaissDay.length!==1?'s':''), color:'#7c3aed' },
              { lbl:'Marge brute',  val:fmt(Math.round(beneficeSession)),                             sub:'Prix vente − prix achat', color: beneficeSession >= 0 ? '#1a7a4a' : '#c0392b' },
              { lbl:'Bénéfice net', val:(beneficeNet>=0?'+':'')+fmt(Math.round(beneficeNet)),         sub:'Marge − dépenses',        color: beneficeNet     >= 0 ? '#1a7a4a' : '#c0392b' },
            ].map(k => (
              <div key={k.lbl} className="relative overflow-hidden mx-3 my-2 rounded-[12px]"
                style={{
                  background: 'linear-gradient(160deg,#ffffff 0%,#f9f7f3 100%)',
                  border: '1px solid rgba(200,175,100,0.22)',
                  boxShadow: '0 1px 0 rgba(255,255,255,0.85) inset, 0 2px 6px rgba(0,0,0,0.04), 0 6px 14px rgba(0,0,0,0.06)',
                }}>
                <div className="absolute inset-x-0 top-0 h-[1px]"
                  style={{ background: 'linear-gradient(90deg,transparent,rgba(212,175,55,0.5),rgba(255,220,80,0.65),rgba(212,175,55,0.5),transparent)' }}/>
                <div className="px-3 py-2.5">
                  <div className="text-[9px] font-medium uppercase tracking-[.7px] text-[#a8a7a2]">{k.lbl}</div>
                  <div className="mt-1 font-mono text-[17px] font-semibold leading-none" style={{ color: k.color }}>{k.val}</div>
                  <div className="mt-1 text-[10px] text-[#a8a7a2]">{k.sub}</div>
                </div>
                <div className="h-[2px] w-full" style={{ background: `linear-gradient(90deg,${k.color} 0%,${k.color}88 60%,transparent 100%)` }}/>
              </div>
            ))}
          </div>
        </div>
      </div>
      </>}

      {/* Modals */}
      {modal === 'depense'        && <DepenseModal        onClose={() => setModal(null)} onSave={addMvt}/>}
      {modal === 'investissement' && <InvestissementModal onClose={() => setModal(null)} onSave={addMvt}/>}
      {modal === 'entree'         && <EntreeModal         onClose={() => setModal(null)} onSave={addMvt}/>}
      {modal === 'ouverture' && <OuvertureModal onClose={() => setModal(null)} onSave={(amt, note) => {
        setOuverture(amt)
        setBoutiqueFermee(false)
        addCashMvt({ date:td, time:nowTimeStr(), type:'ouverture' as const, dir:'entree' as const, desc:note, cat:'Ouverture', montant:amt, modes:[{mode:'Cash',amount:amt}] })
      }}/>}
      {modal === 'cloture'   && <ClotureModal   solde={solde} mouvements={mouvements} ouverture={ouverture} soldeEpargne={soldeEpargne} beneficeNet={beneficeNet} onClose={() => setModal(null)} onSave={(newOuv, notes, virementFond) => {
        addCashMvt({ date:td, time:nowTimeStr(), type:'cloture' as const, dir:'sortie' as const, desc:'Clôture journée'+(notes?' — '+notes:''), cat:'Clôture', montant:newOuv, modes:[] })
        const bnAbs = Math.abs(Math.round(beneficeNet))
        const bnDir: MvtDir = beneficeNet >= 0 ? 'entree' : 'sortie'
        addCashMvt({ date:td, time:nowTimeStr(), type:'benefice', dir: bnDir, desc:`Bénéfice net — marge ${fmt(Math.round(beneficeNet + depensesJour))} − dépenses ${fmt(depensesJour)} MRU`, cat:'Bénéfice', montant: bnAbs, modes:[] })
        setOuverture(newOuv)
        setBoutiqueFermee(true)
        if (virementFond > 0) {
          addEpargneMvt({ date:td, time:nowTimeStr(), dir:'entree', montant:virementFond, desc:'Virement caisse de fond', cat:'Virement', modes:[{mode:'Cash',amount:virementFond}] })
        }
      }}/>}
      {modal === 'alimenter' && <EpargneTransfertModal dir="entree" soldeEpargne={soldeEpargne} onClose={() => setModal(null)} onSave={(montant, modes, desc) => {
        addEpargneMvt({ date:todayStr(), time:nowTimeStr(), dir:'entree', montant, desc, cat:'Virement', modes })
      }}/>}
      {modal === 'retirer' && <EpargneTransfertModal dir="sortie" soldeEpargne={soldeEpargne} onClose={() => setModal(null)} onSave={(montant, modes, desc) => {
        addEpargneMvt({ date:todayStr(), time:nowTimeStr(), dir:'sortie', montant, desc, cat:'Retrait', modes })
      }}/>}
      {modal === 'addDette' && <DetteModal onClose={() => setModal(null)} onSave={(nom, montant, notes, currency) => {
        addDetteDiverse({ nom, montant, notes, currency })
      }}/>}
      {detteDetail && <DetteDetailModal dette={detteDetail} currentUser={currentUser} onClose={() => setDetteDetailId(null)}
        onAddMontant={(montant, desc) => addDetteMontant(detteDetail.id, montant, desc)}
        onPay={(montant, modes, desc, ajoutId) => payDetteDiverse(detteDetail.id, montant, modes, desc, ajoutId)}
        onDelete={() => deleteDetteDiverse(detteDetail.id)}
        onEdit={(nom, notes, currency, montant) => editDetteDiverse(detteDetail.id, nom, notes, currency, montant)}
        onEditAjout={(ajoutId, amt, desc) => editDetteAjout(detteDetail.id, ajoutId, amt, desc, currentUser)}
        onDeleteAjout={(ajoutId) => deleteDetteAjout(detteDetail.id, ajoutId, currentUser)}/>}
      {viewInvoice && (
        <InvoiceModal
          data={viewInvoice}
          onClose={() => setViewInvoice(null)}
          onUpdate={async (lines, discount) => {
            const subtotal = lines.reduce((s, l) => s + l.total, 0)
            const total    = Math.max(0, subtotal - discount)
            const clientId = viewInvoice.client?.id ?? null
            await updateTx(viewInvoice.txId, clientId, lines, total)
            setViewInvoice({ ...viewInvoice, lines, subtotal, discount, total })
          }}
        />
      )}
      {editMvt?.type === 'ouverture' && (
        <OuvertureModal
          initialMontant={editMvt.montant}
          onClose={() => setEditMvt(null)}
          onSave={(amt, note) => {
            const updated = { ...editMvt, montant: amt, desc: note || 'Ouverture de caisse', modes: [{ mode: 'Cash', amount: amt }] }
            updateCashMvt(updated as unknown as CashMvt)
            setOuverture(amt)
            setEditMvt(null)
          }}
        />
      )}
      {editMvt && editMvt.type !== 'ouverture' && (
        <EditMvtModal
          mvt={editMvt}
          onClose={() => setEditMvt(null)}
          onSave={updated => { updateCashMvt(updated as unknown as CashMvt); setEditMvt(null) }}
          onDelete={() => { deleteCashMvt(editMvt.id); setEditMvt(null) }}
        />
      )}
      {sortieModal && <SortieModal
        tx={txMap.get(sortieModal.tx.id) ?? sortieModal.tx}
        mvt={sortieModal.mvt}
        boutiqueFermee={boutiqueFermee}
        onClose={() => setSortieModal(null)}
        onViewPdf={() => { setSortieModal(null); setViewInvoice(buildInvoice(sortieModal.mvt)) }}
        onToggleLine={toggleTxLineSortie}
        onValidate={validateTxSortie}
        onEncaisser={payTxDirect}
      />}
      {editInvoice && (
        <EditInvoiceModal
          tx={editInvoice.tx}
          clientId={editInvoice.clientId}
          products={products}
          onClose={() => setEditInvoice(null)}
          onSave={async (lines, total) => {
            await updateTx(editInvoice.tx.id, editInvoice.clientId, lines, total)
            setEditInvoice(null)
          }}
          onDelete={async () => {
            await deleteVente(editInvoice.tx.id, editInvoice.clientId)
            setEditInvoice(null)
          }}
        />
      )}
    </div>
  )
}
