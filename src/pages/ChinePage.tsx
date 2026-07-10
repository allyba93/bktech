import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Plus, X, Search, ChevronRight, ChevronDown, Package, Truck, Ship, Check,
  DollarSign, ArrowDownLeft, ArrowUpRight, Edit2, Trash2, ImagePlus, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { db, storage } from '@/firebase/config'
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import type { ChinaOrder, ChinaPayment, ChinaOrderStatus, ChinaShipping } from '@/types'

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_LIST: { id: ChinaOrderStatus; label: string; color: string; bg: string; icon: LucideIcon }[] = [
  { id: 'attente_client', label: 'Attente client', color: '#6b6a66', bg: '#f0efe9', icon: DollarSign },
  { id: 'commande',       label: 'Commandée',      color: '#0066cc', bg: '#e6f0ff', icon: Package },
  { id: 'production',     label: 'Production',     color: '#cc7700', bg: '#fff3dc', icon: Package },
  { id: 'expedition',     label: 'Expédition',     color: '#7b2d8b', bg: '#f5e6ff', icon: Truck },
  { id: 'recu',           label: 'Reçue',          color: '#1a7a4a', bg: '#e8f5ee', icon: Check },
  { id: 'livre',          label: 'Livrée',         color: '#0f2460', bg: '#e6eaf5', icon: Check },
]

const PAYMENT_MODES = ['Cash', 'Bankily', 'Masravi', 'Seddad', 'Bimban', 'Virement']

const COL = 'chinaOrders'

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt   = (n: number) => n.toLocaleString('fr-FR')
const today = () => new Date().toISOString().slice(0, 10)
const uid   = () => Math.random().toString(36).slice(2, 10)

const statById = (id: ChinaOrderStatus) => STATUS_LIST.find(s => s.id === id) ?? STATUS_LIST[0]

const clientPaid        = (o: ChinaOrder) => (o.clientPayments   ?? []).reduce((s, p) => s + (p.amount ?? 0), 0)
const clientRemaining   = (o: ChinaOrder) => Math.max(0, (o.clientTotalAmount ?? 0) - clientPaid(o))
const supplierPaid      = (o: ChinaOrder) => (o.supplierPayments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0)
const supplierRemaining = (o: ChinaOrder) => Math.max(0, (o.supplierTotalAmount ?? 0) - supplierPaid(o))
const totalCost         = (o: ChinaOrder) => (o.supplierTotalAmount ?? 0) + (o.shippingCost ?? 0)
const profit            = (o: ChinaOrder) => (o.clientTotalAmount ?? 0) - totalCost(o)

function normalizeOrder(id: string, data: Record<string, unknown>): ChinaOrder {
  return {
    id,
    clientName:             (data.clientName             as string)         ?? '',
    description:            (data.description            as string)         ?? '',
    orderDate:              (data.orderDate              as string)         ?? '',
    clientTotalAmount:      (data.clientTotalAmount      as number)         ?? 0,
    clientPayments:         (data.clientPayments         as ChinaPayment[]) ?? [],
    supplierTotalAmountRmb: (data.supplierTotalAmountRmb as number)         ?? 0,
    supplierTotalAmount:    (data.supplierTotalAmount    as number)         ?? 0,
    exchangeRate:           (data.exchangeRate           as number)         ?? 0,
    supplierPayments:       (data.supplierPayments       as ChinaPayment[]) ?? [],
    shippingCost:           (data.shippingCost           as number)         ?? 0,
    status:                 (data.status                 as ChinaOrderStatus) ?? 'attente_client',
    clientPhone:    data.clientPhone    ? (data.clientPhone    as string)         : undefined,
    shippingMethod: data.shippingMethod ? (data.shippingMethod as ChinaShipping)  : undefined,
    shippingDate:   data.shippingDate   ? (data.shippingDate   as string)         : undefined,
    notes:          data.notes          ? (data.notes          as string)         : undefined,
    createdAt:  (data.createdAt  as string) ?? '',
    updatedAt:  (data.updatedAt  as string) ?? '',
  }
}

// ── Module-level form helpers (MUST be outside any component to avoid remount) ──
const inputCls = 'w-full bg-white border border-[#d3d1c7] rounded-xl px-3 py-3 text-[15px] text-[#1a1a18] focus:outline-none focus:border-[#1a5fa8]'

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-semibold text-[#6b6a66]">{label}</label>
      {children}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Stepper({ status }: { status: ChinaOrderStatus }) {
  const curIdx = STATUS_LIST.findIndex(s => s.id === status)
  return (
    <div className="flex items-center gap-0 py-3 px-4 bg-white border-b border-black/[0.06]">
      {STATUS_LIST.map((s, si) => {
        const done = si <= curIdx
        return (
          <div key={s.id} className="flex flex-1 items-center">
            <div className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold border-2 transition-all"
                style={{ borderColor: done ? s.color : '#d3d1c7', background: done ? s.bg : '#fff', color: done ? s.color : '#a8a7a2' }}>
                {done ? <Check size={10} /> : si + 1}
              </div>
              <span className="text-[9px] font-medium text-center leading-tight hidden sm:block"
                style={{ color: done ? s.color : '#a8a7a2' }}>{s.label}</span>
            </div>
            {si < STATUS_LIST.length - 1 && (
              <div className="h-[2px] flex-1 mx-1 rounded-full transition-all"
                style={{ background: si < curIdx ? s.color : '#e8e7e1' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/90" />
      <button onClick={onClose}
        className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 cursor-pointer hover:bg-white/30 z-10">
        <X size={18} className="text-white" />
      </button>
      <img src={url} alt="preuve de paiement"
        className="relative max-w-[92vw] max-h-[85dvh] rounded-2xl object-contain shadow-2xl"
        onClick={e => e.stopPropagation()} />
    </div>
  )
}

function PaymentRow({ p, onDelete }: { p: ChinaPayment; onDelete?: () => void }) {
  const [lightbox, setLightbox] = useState(false)
  return (
    <>
      <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.04] last:border-0">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-bold text-[#1a1a18]">{fmt(p.amount)} MRU</span>
            {p.amountRmb && (
              <span className="text-[11px] text-[#6b6a66]">
                (¥{fmt(p.amountRmb)} × {p.exchangeRate})
              </span>
            )}
            <span className="text-[10px] font-bold rounded-md px-1.5 py-0.5 bg-[#e6f0ff] text-[#0066cc]">{p.mode}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#6b6a66]">
            <span>{p.date}</span>
            {p.note && <span>· {p.note}</span>}
          </div>
        </div>
        {p.proofUrl && (
          <button type="button" onClick={() => setLightbox(true)} className="flex-shrink-0 cursor-pointer">
            <img src={p.proofUrl} alt="preuve"
              className="w-10 h-10 rounded-lg object-cover border border-[#d3d1c7] hover:opacity-80 transition-opacity" />
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-red-50 text-[#a8a7a2] hover:text-red-500 cursor-pointer transition-colors">
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {lightbox && p.proofUrl && <ImageLightbox url={p.proofUrl} onClose={() => setLightbox(false)} />}
    </>
  )
}

// ── Add Payment Modal ──────────────────────────────────────────────────────────

function AddPaymentModal({
  title,
  currency = 'MRU',
  defaultRate,
  showProof,
  onClose,
  onSave,
}: {
  title: string
  currency?: 'MRU' | 'RMB'
  defaultRate?: number
  showProof?: boolean
  onClose: () => void
  onSave: (p: Omit<ChinaPayment, 'id'>) => void
}) {
  const isRmb = currency === 'RMB'
  const [amountRmb, setAmountRmb]       = useState('')
  const [rate, setRate]                 = useState(String(defaultRate ?? ''))
  const [amountMru, setAmountMru]       = useState('')
  const [mode, setMode]                 = useState('Cash')
  const [date, setDate]                 = useState(today())
  const [note, setNote]                 = useState('')
  const [proofFile, setProofFile]       = useState<File | null>(null)
  const [proofPreview, setProofPreview] = useState<string | null>(null)
  const [uploading, setUploading]       = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const mruEquiv = isRmb
    ? (parseFloat(amountRmb) || 0) * (parseFloat(rate) || 0)
    : parseFloat(amountMru) || 0

  const canSave = isRmb
    ? (parseFloat(amountRmb) > 0 && parseFloat(rate) > 0)
    : parseFloat(amountMru) > 0

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setProofFile(file)
    const reader = new FileReader()
    reader.onload = ev => setProofPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!canSave) return
    setUploading(true)
    try {
      let proofUrl: string | undefined
      if (proofFile) {
        const ext = proofFile.name.split('.').pop() ?? 'jpg'
        const r = storageRef(storage, `china-proofs/${uid()}.${ext}`)
        await uploadBytes(r, proofFile)
        proofUrl = await getDownloadURL(r)
      }
      if (isRmb) {
        onSave({
          amount: mruEquiv,
          amountRmb: parseFloat(amountRmb),
          exchangeRate: parseFloat(rate),
          mode,
          date,
          ...(note.trim() && { note: note.trim() }),
          ...(proofUrl    && { proofUrl }),
        })
      } else {
        onSave({
          amount: parseFloat(amountMru),
          mode,
          date,
          ...(note.trim() && { note: note.trim() }),
          ...(proofUrl    && { proofUrl }),
        })
      }
      onClose()
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.08]">
          <h3 className="text-[16px] font-bold text-[#0f2460]">{title}</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f0efe9] cursor-pointer">
            <X size={15} className="text-[#6b6a66]" />
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>

          {isRmb ? (
            <>
              <F label="Montant (¥ RMB)">
                <input type="number" inputMode="decimal" value={amountRmb} onChange={e => setAmountRmb(e.target.value)}
                  className={inputCls + ' font-bold'} placeholder="0" autoFocus />
              </F>
              <F label="Taux de change (1 RMB = ? MRU)">
                <input type="number" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)}
                  className={inputCls} placeholder="ex: 60" />
              </F>
              {mruEquiv > 0 && (
                <div className="rounded-xl bg-[#e6f0ff] px-4 py-3 flex items-center justify-between">
                  <span className="text-[13px] text-[#0066cc] font-semibold">Équivalent MRU</span>
                  <span className="text-[18px] font-bold text-[#0f2460]">{fmt(Math.round(mruEquiv))} MRU</span>
                </div>
              )}
            </>
          ) : (
            <F label="Montant (MRU)">
              <input type="number" inputMode="decimal" value={amountMru} onChange={e => setAmountMru(e.target.value)}
                className={inputCls + ' font-bold'} placeholder="0" autoFocus />
            </F>
          )}

          <F label="Mode de paiement">
            <div className="flex flex-wrap gap-2">
              {PAYMENT_MODES.map(m => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={cn('rounded-xl px-3 py-2 text-[13px] font-bold border cursor-pointer transition-all',
                    mode === m ? 'bg-[#1a5fa8] text-white border-[#1a5fa8]' : 'bg-white text-[#6b6a66] border-[#d3d1c7]')}>
                  {m}
                </button>
              ))}
            </div>
          </F>

          <F label="Date">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </F>

          <F label="Note (optionnel)">
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              className={inputCls} placeholder="Remarque…" />
          </F>

          {showProof && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-[#6b6a66]">Photo preuve (optionnel)</label>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
                onChange={handleFileChange} className="hidden" />
              {proofPreview ? (
                <div className="relative">
                  <img src={proofPreview} alt="preuve" className="w-full h-40 object-cover rounded-xl border border-[#d3d1c7]" />
                  <button type="button" onClick={() => { setProofFile(null); setProofPreview(null) }}
                    className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 cursor-pointer">
                    <X size={13} className="text-white" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 w-full h-20 rounded-xl border-2 border-dashed border-[#d3d1c7] text-[#6b6a66] text-[13px] font-medium cursor-pointer hover:border-[#1a5fa8]/50 hover:text-[#1a5fa8] transition-all">
                  <ImagePlus size={18} />
                  <span>Ajouter une photo</span>
                </button>
              )}
            </div>
          )}

          <button onClick={handleSave} disabled={!canSave || uploading}
            className="w-full rounded-xl bg-[#1a5fa8] text-white text-[14px] font-bold py-3 cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
            {uploading ? 'Envoi en cours…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Order Form Modal ───────────────────────────────────────────────────────────

function OrderFormModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: ChinaOrder
  onClose: () => void
  onSave: (data: Omit<ChinaOrder, 'id' | 'clientPayments' | 'supplierPayments' | 'createdAt' | 'updatedAt'>) => Promise<void>
}) {
  const [clientName, setClientName]         = useState(initial?.clientName ?? '')
  const [clientPhone, setClientPhone]       = useState(initial?.clientPhone ?? '')
  const [description, setDescription]       = useState(initial?.description ?? '')
  const [orderDate, setOrderDate]           = useState(initial?.orderDate ?? today())
  const [clientTotalAmount, setClientTotal] = useState(String(initial?.clientTotalAmount ?? ''))
  const [supplierRmb, setSupplierRmb]       = useState(String(initial?.supplierTotalAmountRmb ?? ''))
  const [exchangeRate, setExchangeRate]     = useState(String(initial?.exchangeRate ?? ''))
  const [shippingCost, setShippingCost]     = useState(String(initial?.shippingCost ?? '0'))
  const [status, setStatus]                 = useState<ChinaOrderStatus>(initial?.status ?? 'attente_client')
  const [notes, setNotes]                   = useState(initial?.notes ?? '')
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState('')

  const rmbVal  = parseFloat(supplierRmb) || 0
  const rateVal = parseFloat(exchangeRate) || 0
  const supplierMru = Math.round(rmbVal * rateVal)

  const handleSave = async () => {
    if (!clientName.trim() || !description.trim()) return
    setSaving(true)
    setError('')
    try {
      await onSave({
        clientName: clientName.trim(),
        description: description.trim(),
        orderDate,
        clientTotalAmount:      parseFloat(clientTotalAmount) || 0,
        supplierTotalAmountRmb: rmbVal,
        exchangeRate:           rateVal,
        supplierTotalAmount:    supplierMru,
        shippingCost: 0,
        status,
        ...(clientPhone.trim() && { clientPhone: clientPhone.trim() }),
        ...(notes.trim()       && { notes: notes.trim() }),
      })
      onClose()
    } catch (e) {
      console.error(e)
      setError('Erreur lors de l\'enregistrement. Vérifiez votre connexion.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end sm:justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col" style={{ maxHeight: '92dvh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.08] flex-shrink-0">
          <h3 className="text-[17px] font-bold text-[#0f2460]">
            {initial ? 'Modifier commande' : 'Nouvelle commande Chine'}
          </h3>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f0efe9] cursor-pointer">
            <X size={16} className="text-[#6b6a66]" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          <div className="px-5 py-5 flex flex-col gap-4">

            {/* ── CLIENT ── */}
            <div>
              <p className="text-[11px] font-bold text-[#1a5fa8] uppercase tracking-widest mb-3">Client</p>
              <div className="flex flex-col gap-3">
                <F label="Nom *">
                  <input value={clientName} onChange={e => setClientName(e.target.value)}
                    className={inputCls} placeholder="Nom du client" />
                </F>
                <F label="Téléphone">
                  <input value={clientPhone} onChange={e => setClientPhone(e.target.value)}
                    className={inputCls} placeholder="+222 XX XX XX XX" />
                </F>
              </div>
            </div>

            <div className="h-px bg-[#f0efe9]" />

            {/* ── COMMANDE ── */}
            <div>
              <p className="text-[11px] font-bold text-[#1a5fa8] uppercase tracking-widest mb-3">Commande</p>
              <div className="flex flex-col gap-3">
                <F label="Description *">
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                    className={inputCls + ' resize-none'}
                    placeholder="Ex: Coques iPhone 15 Pro, 200 pièces…" />
                </F>
                <F label="Date commande">
                  <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                    className={inputCls} />
                </F>
                <F label="Statut">
                  <select value={status} onChange={e => setStatus(e.target.value as ChinaOrderStatus)}
                    className={inputCls}>
                    {STATUS_LIST.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </F>
              </div>
            </div>

            <div className="h-px bg-[#f0efe9]" />

            {/* ── FINANCIER ── */}
            <div>
              <p className="text-[11px] font-bold text-[#1a5fa8] uppercase tracking-widest mb-3">Financier</p>
              <div className="flex flex-col gap-3">
                <F label="Prix total client (MRU)">
                  <input type="number" inputMode="decimal" value={clientTotalAmount} onChange={e => setClientTotal(e.target.value)}
                    className={inputCls} placeholder="0" />
                </F>
                <F label="Coût fournisseur Chine (¥ RMB)">
                  <input type="number" inputMode="decimal" value={supplierRmb} onChange={e => setSupplierRmb(e.target.value)}
                    className={inputCls} placeholder="0" />
                </F>
                <F label="Taux de change (1 RMB = ? MRU)">
                  <input type="number" inputMode="decimal" value={exchangeRate} onChange={e => setExchangeRate(e.target.value)}
                    className={inputCls} placeholder="ex: 60" />
                </F>
                {supplierMru > 0 && (
                  <div className="rounded-xl bg-[#e6f0ff] px-4 py-3 flex items-center justify-between">
                    <span className="text-[13px] text-[#0066cc] font-semibold">= Équivalent MRU</span>
                    <span className="text-[18px] font-bold text-[#0f2460]">{fmt(supplierMru)} MRU</span>
                  </div>
                )}
                <F label="Coût transport / fret (MRU)">
                  <input type="number" inputMode="decimal" value={shippingCost} onChange={e => setShippingCost(e.target.value)}
                    className={inputCls} placeholder="0" />
                </F>
              </div>
            </div>

            <div className="h-px bg-[#f0efe9]" />

            {/* ── NOTES ── */}
            <F label="Notes internes">
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                className={inputCls + ' resize-none'}
                placeholder="Remarques, références…" />
            </F>

            {/* bottom padding for iOS */}
            <div className="h-2" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-black/[0.08] flex-shrink-0 flex flex-col gap-2"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-[13px] text-red-600 font-medium">
              {error}
            </div>
          )}
          <button onClick={handleSave} disabled={saving}
            className="w-full rounded-xl bg-[#1a5fa8] text-white text-[15px] font-bold py-3.5 cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed">
            {saving ? 'Enregistrement…' : initial ? 'Enregistrer' : 'Créer commande'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Order Detail Modal ─────────────────────────────────────────────────────────

function OrderDetailModal({
  order,
  onClose,
  onEdit,
  onDelete,
  onAddClientPayment,
  onDeleteClientPayment,
  onAddSupplierPayment,
  onDeleteSupplierPayment,
  onStatusChange,
}: {
  order: ChinaOrder
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onAddClientPayment: (p: Omit<ChinaPayment, 'id'>) => void
  onDeleteClientPayment: (id: string) => void
  onAddSupplierPayment: (p: Omit<ChinaPayment, 'id'>) => void
  onDeleteSupplierPayment: (id: string) => void
  onStatusChange: (s: ChinaOrderStatus) => void
  onUpdateShipping: (method: ChinaShipping | '', cost: string, date: string) => void
}) {
  const [tab, setTab]           = useState<'client' | 'fournisseur' | 'suivi'>('suivi')
  const [addClientPay, setAddClientPay]     = useState(false)
  const [addSupplierPay, setAddSupplierPay] = useState(false)
  const [confirmDelete, setConfirmDelete]   = useState(false)

  // Shipping inline edit
  const [shipMethod, setShipMethod] = useState<ChinaShipping | ''>(order.shippingMethod ?? '')
  const [shipCost, setShipCost]     = useState(order.shippingCost ? String(order.shippingCost) : '')
  const [shipDate, setShipDate]     = useState(order.shippingDate ?? '')
  const [shipSaving, setShipSaving] = useState(false)

  const cp    = clientPaid(order)
  const cr    = clientRemaining(order)
  const sp    = supplierPaid(order)
  const sr    = supplierRemaining(order)
  const prof  = profit(order)
  const totCost = totalCost(order)

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center pt-4 sm:pt-0">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative w-full max-w-lg sm:rounded-2xl rounded-b-2xl bg-white shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
          {/* Header compact */}
          <div className="flex-shrink-0 bg-gradient-to-br from-[#0f2460] to-[#1a5fa8] px-4 pt-3 pb-3">
            {/* Ligne 1 : nom + actions */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex-1 min-w-0">
                <div className="text-white text-[16px] font-bold leading-tight truncate">{order.clientName}</div>
                {order.clientPhone && <div className="text-white/60 text-[11px] truncate">{order.clientPhone}</div>}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={onEdit} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 cursor-pointer hover:bg-white/25">
                  <Edit2 size={12} className="text-white" />
                </button>
                <button onClick={() => setConfirmDelete(true)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 cursor-pointer hover:bg-red-500/60">
                  <Trash2 size={12} className="text-white" />
                </button>
                <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 cursor-pointer hover:bg-white/25">
                  <X size={13} className="text-white" />
                </button>
              </div>
            </div>
            {/* Ligne 2 : description */}
            <div className="text-white/70 text-[11px] mb-2 line-clamp-1">{order.description}</div>
            {/* Ligne 3 : chips financiers compacts */}
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded-lg bg-white/10 px-2 py-1.5 flex items-center justify-between">
                <span className="text-[9px] text-white/60 font-semibold">Client</span>
                <span className="text-[12px] font-bold text-white">{fmt(order.clientTotalAmount)}</span>
              </div>
              <div className="rounded-lg bg-white/10 px-2 py-1.5 flex items-center justify-between">
                <span className="text-[9px] text-white/60 font-semibold">Coût</span>
                <span className="text-[12px] font-bold text-white">{fmt(totCost)}</span>
              </div>
              <div className="rounded-lg px-2 py-1.5 flex items-center justify-between"
                style={{ background: prof >= 0 ? 'rgba(26,122,74,0.35)' : 'rgba(192,57,43,0.35)' }}>
                <span className="text-[9px] text-white/60 font-semibold">Bénéf.</span>
                <span className={cn('text-[12px] font-bold', prof >= 0 ? 'text-green-300' : 'text-red-300')}>
                  {prof >= 0 ? '+' : ''}{fmt(prof)}
                </span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-black/[0.08] flex-shrink-0">
            {([['suivi', 'Suivi'], ['client', 'Client'], ['fournisseur', 'Fournisseur']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className={cn('flex-1 py-3 text-[13px] font-bold cursor-pointer transition-colors border-b-2', tab === id ? 'text-[#1a5fa8] border-[#1a5fa8]' : 'text-[#6b6a66] border-transparent hover:text-[#1a5fa8]')}>
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* ── SUIVI ── */}
            {tab === 'suivi' && (
              <div>
                <Stepper status={order.status} />
                <div className="px-4 py-3 flex flex-col gap-2">
                  <div className="text-[11px] font-bold text-[#6b6a66] uppercase tracking-wider mb-1">Changer le statut</div>
                  {STATUS_LIST.map(s => (
                    <button key={s.id} onClick={() => onStatusChange(s.id)}
                      className={cn('flex items-center gap-3 w-full px-4 py-3 rounded-xl border cursor-pointer transition-all text-left',
                        order.status === s.id ? 'border-[#1a5fa8]' : 'border-[#e8e7e1] hover:border-[#1a5fa8]/50')}
                      style={{ background: order.status === s.id ? s.bg : undefined }}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: s.bg }}>
                        <s.icon size={15} style={{ color: s.color }} />
                      </div>
                      <span className="text-[14px] font-semibold" style={{ color: s.color }}>{s.label}</span>
                      {order.status === s.id && <Check size={14} className="ml-auto" style={{ color: s.color }} />}
                    </button>
                  ))}
                </div>
                {/* ── Livraison client (remplir après réception) ── */}
                <div className="mx-4 mb-2 mt-1">
                  <div className="rounded-2xl border border-[#e8e7e1] overflow-hidden">
                    <div className="flex items-center gap-2 bg-[#f5f4f0] px-4 py-2.5">
                      <Truck size={13} className="text-[#1a5fa8]" />
                      <span className="text-[11px] font-bold text-[#1a5fa8] uppercase tracking-wider">Livraison vers client</span>
                    </div>
                    <div className="px-4 py-3 flex flex-col gap-3">
                      <F label="Mode d'expédition">
                        <div className="flex gap-2">
                          {(['fret', 'bateau'] as const).map(m => (
                            <button key={m} type="button" onClick={() => setShipMethod(shipMethod === m ? '' : m)}
                              className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-[13px] font-bold cursor-pointer transition-all',
                                shipMethod === m ? 'bg-[#1a5fa8] text-white border-[#1a5fa8]' : 'bg-white text-[#6b6a66] border-[#d3d1c7]')}>
                              {m === 'fret' ? <Truck size={13} /> : <Ship size={13} />}
                              {m === 'fret' ? 'Fret aérien' : 'Maritime'}
                            </button>
                          ))}
                        </div>
                      </F>
                      <F label="Coût transport (MRU)">
                        <input type="number" inputMode="decimal" value={shipCost} onChange={e => setShipCost(e.target.value)}
                          className={inputCls} placeholder="0" />
                      </F>
                      <F label="Date d'expédition">
                        <input type="date" value={shipDate} onChange={e => setShipDate(e.target.value)}
                          className={inputCls} />
                      </F>
                      <button
                        disabled={shipSaving}
                        onClick={async () => {
                          setShipSaving(true)
                          await onUpdateShipping(shipMethod, shipCost, shipDate)
                          setShipSaving(false)
                        }}
                        className="w-full rounded-xl bg-[#1a5fa8] text-white text-[13px] font-bold py-2.5 cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50">
                        {shipSaving ? 'Enregistrement…' : 'Enregistrer livraison'}
                      </button>
                    </div>
                  </div>
                </div>

                {order.notes && (
                  <div className="mx-4 mb-4 rounded-xl bg-[#fffbe6] border border-[#e8d44d]/30 px-4 py-3">
                    <div className="text-[11px] font-bold text-[#6b6a66] mb-1">Notes</div>
                    <p className="text-[13px] text-[#1a1a18]">{order.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── CLIENT ── */}
            {tab === 'client' && (
              <div className="px-4 py-4">
                {/* Summary bars */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-xl bg-[#e8f5ee] px-4 py-3">
                    <div className="text-[10px] font-bold text-[#1a7a4a]/70 uppercase tracking-wider">Reçu</div>
                    <div className="text-[18px] font-bold text-[#1a7a4a]">{fmt(cp)}</div>
                    <div className="text-[11px] text-[#1a7a4a]/70">MRU</div>
                  </div>
                  <div className="rounded-xl px-4 py-3" style={{ background: cr > 0 ? '#fdecea' : '#e8f5ee' }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: cr > 0 ? '#c0392b' : '#1a7a4a', opacity: 0.7 }}>Restant</div>
                    <div className="text-[18px] font-bold" style={{ color: cr > 0 ? '#c0392b' : '#1a7a4a' }}>{fmt(cr)}</div>
                    <div className="text-[11px]" style={{ color: cr > 0 ? '#c0392b' : '#1a7a4a', opacity: 0.7 }}>sur {fmt(order.clientTotalAmount)}</div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mb-4">
                  <div className="h-2 rounded-full bg-[#e8e7e1] overflow-hidden">
                    <div className="h-full rounded-full bg-[#1a7a4a] transition-all"
                      style={{ width: `${Math.min(100, order.clientTotalAmount > 0 ? (cp / order.clientTotalAmount) * 100 : 0)}%` }} />
                  </div>
                </div>
                {/* Payment list */}
                <div className="mb-3">
                  {order.clientPayments.length === 0
                    ? <p className="text-center text-[13px] text-[#a8a7a2] py-4">Aucun paiement reçu</p>
                    : order.clientPayments.map(p => (
                      <PaymentRow key={p.id} p={p} onDelete={() => onDeleteClientPayment(p.id)} />
                    ))
                  }
                </div>
                <button onClick={() => setAddClientPay(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-[#1a5fa8]/30 text-[#1a5fa8] text-[13px] font-bold cursor-pointer hover:border-[#1a5fa8]/60 hover:bg-[#1a5fa8]/5 transition-all">
                  <Plus size={15} /> Ajouter un paiement client
                </button>
              </div>
            )}

            {/* ── FOURNISSEUR ── */}
            {tab === 'fournisseur' && (
              <div className="px-4 py-4">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-xl bg-[#e6f0ff] px-4 py-3">
                    <div className="text-[10px] font-bold text-[#0066cc]/70 uppercase tracking-wider">Payé Chine</div>
                    <div className="text-[18px] font-bold text-[#0066cc]">{fmt(sp)}</div>
                    <div className="text-[11px] text-[#0066cc]/70">MRU</div>
                  </div>
                  <div className="rounded-xl px-4 py-3" style={{ background: sr > 0 ? '#fdecea' : '#e8f5ee' }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: sr > 0 ? '#c0392b' : '#1a7a4a', opacity: 0.7 }}>Restant</div>
                    <div className="text-[18px] font-bold" style={{ color: sr > 0 ? '#c0392b' : '#1a7a4a' }}>{fmt(sr)}</div>
                    <div className="text-[11px]" style={{ color: sr > 0 ? '#c0392b' : '#1a7a4a', opacity: 0.7 }}>sur {fmt(order.supplierTotalAmount)}</div>
                  </div>
                </div>
                <div className="mb-4">
                  <div className="h-2 rounded-full bg-[#e8e7e1] overflow-hidden">
                    <div className="h-full rounded-full bg-[#0066cc] transition-all"
                      style={{ width: `${Math.min(100, order.supplierTotalAmount > 0 ? (sp / order.supplierTotalAmount) * 100 : 0)}%` }} />
                  </div>
                </div>
                {order.shippingCost > 0 && (
                  <div className="mb-3 rounded-xl bg-[#f5f4f0] px-4 py-3 flex items-center gap-3">
                    <Truck size={14} className="text-[#6b6a66] flex-shrink-0" />
                    <span className="text-[13px] text-[#6b6a66]">Transport / Fret</span>
                    <span className="ml-auto text-[14px] font-bold text-[#1a1a18]">{fmt(order.shippingCost)} MRU</span>
                  </div>
                )}
                <div className="mb-3">
                  {order.supplierPayments.length === 0
                    ? <p className="text-center text-[13px] text-[#a8a7a2] py-4">Aucun paiement effectué</p>
                    : order.supplierPayments.map(p => (
                      <PaymentRow key={p.id} p={p} onDelete={() => onDeleteSupplierPayment(p.id)} />
                    ))
                  }
                </div>
                <button onClick={() => setAddSupplierPay(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-[#0066cc]/30 text-[#0066cc] text-[13px] font-bold cursor-pointer hover:border-[#0066cc]/60 hover:bg-[#0066cc]/5 transition-all">
                  <Plus size={15} /> Ajouter un paiement fournisseur
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add payment modals */}
      {addClientPay && (
        <AddPaymentModal title="Paiement client reçu"
          showProof
          onClose={() => setAddClientPay(false)}
          onSave={onAddClientPayment} />
      )}
      {addSupplierPay && (
        <AddPaymentModal title="Paiement fournisseur (¥ RMB)"
          currency="RMB"
          defaultRate={order.exchangeRate || undefined}
          onClose={() => setAddSupplierPay(false)}
          onSave={onAddSupplierPayment} />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmDelete(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-[17px] font-bold text-[#0f2460] mb-2">Supprimer la commande ?</h3>
            <p className="text-[13px] text-[#6b6a66] mb-5">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-3 rounded-xl border border-[#d3d1c7] text-[14px] font-semibold text-[#6b6a66] cursor-pointer hover:bg-[#f0efe9]">Annuler</button>
              <button onClick={() => { onDelete(); setConfirmDelete(false) }} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-[14px] font-bold cursor-pointer hover:bg-red-600">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Order Card ─────────────────────────────────────────────────────────────────

function OrderCard({ order, onClick }: { order: ChinaOrder; onClick: () => void }) {
  const s   = statById(order.status)
  const cp  = clientPaid(order)
  const cr  = clientRemaining(order)
  const sp  = supplierPaid(order)
  const prof = profit(order)

  return (
    <button onClick={onClick} className="w-full text-left rounded-2xl bg-white border border-[#e8e7e1] hover:border-[#1a5fa8]/40 hover:shadow-md shadow-sm transition-all cursor-pointer overflow-hidden">
      {/* Top */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-[#0f2460] truncate">{order.clientName}</div>
          {order.clientPhone && <div className="text-[12px] text-[#6b6a66]">{order.clientPhone}</div>}
          <div className="text-[12px] text-[#6b6a66] mt-1 line-clamp-1">{order.description}</div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[10px] font-bold" style={{ background: s.bg, color: s.color }}>{s.label}</span>
          {order.shippingMethod && (
            <span className="inline-flex items-center gap-1 text-[10px] text-[#6b6a66]">
              {order.shippingMethod === 'fret' ? <Truck size={10} /> : <Ship size={10} />}
              {order.shippingMethod}
            </span>
          )}
        </div>
      </div>

      {/* Finance row */}
      <div className="grid grid-cols-3 gap-0 border-t border-[#f0efe9]">
        <div className="px-3 py-2.5 border-r border-[#f0efe9]">
          <div className="text-[9px] font-bold text-[#6b6a66]/70 uppercase tracking-wider flex items-center gap-1"><ArrowDownLeft size={8} className="text-[#1a7a4a]" />Client reçu</div>
          <div className="text-[13px] font-bold text-[#1a7a4a]">{fmt(cp)}</div>
          {cr > 0 && <div className="text-[9px] text-red-500">reste {fmt(cr)}</div>}
        </div>
        <div className="px-3 py-2.5 border-r border-[#f0efe9]">
          <div className="text-[9px] font-bold text-[#6b6a66]/70 uppercase tracking-wider flex items-center gap-1"><ArrowUpRight size={8} className="text-[#0066cc]" />Payé Chine</div>
          <div className="text-[13px] font-bold text-[#0066cc]">{fmt(sp)}</div>
          <div className="text-[9px] text-[#6b6a66]">/ {fmt(order.supplierTotalAmount)}</div>
        </div>
        <div className="px-3 py-2.5">
          <div className="text-[9px] font-bold text-[#6b6a66]/70 uppercase tracking-wider">Bénéfice</div>
          <div className={cn('text-[13px] font-bold', prof >= 0 ? 'text-[#1a7a4a]' : 'text-red-500')}>{prof >= 0 ? '+' : ''}{fmt(prof)}</div>
          <div className="text-[9px] text-[#6b6a66]">MRU</div>
        </div>
      </div>

      {/* Date */}
      <div className="px-4 py-2 border-t border-[#f0efe9] flex items-center justify-between">
        <span className="text-[11px] text-[#a8a7a2]">Commandé le {order.orderDate}</span>
        <ChevronRight size={14} className="text-[#a8a7a2]" />
      </div>
    </button>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function ChinePage() {
  const [orders, setOrders]         = useState<ChinaOrder[]>([])
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilter]   = useState<ChinaOrderStatus | 'all'>('all')
  const [showForm, setShowForm]     = useState(false)
  const [editOrder, setEditOrder]   = useState<ChinaOrder | null>(null)
  const [detailOrder, setDetail]    = useState<ChinaOrder | null>(null)
  const [loading, setLoading]       = useState(true)
  const [fsError, setFsError]       = useState('')
  const [showStats, setShowStats]   = useState(false)

  // Firestore listener
  useEffect(() => {
    const q = query(collection(db, COL), orderBy('orderDate', 'desc'))
    const unsub = onSnapshot(
      q,
      snap => {
        setOrders(snap.docs.map(d => normalizeOrder(d.id, d.data())))
        setLoading(false)
        setFsError('')
      },
      err => {
        console.error('chinaOrders listener:', err)
        setFsError(`Erreur Firestore : ${err.message}`)
        setLoading(false)
      }
    )
    return unsub
  }, [])

  // Keep detail in sync with live orders
  useEffect(() => {
    if (detailOrder) {
      const live = orders.find(o => o.id === detailOrder.id)
      if (live) setDetail(live)
    }
  }, [orders])

  // ── CRUD ──
  const createOrder = async (data: Omit<ChinaOrder, 'id' | 'clientPayments' | 'supplierPayments' | 'createdAt' | 'updatedAt'>) => {
    await addDoc(collection(db, COL), {
      ...data,
      clientPayments: [],
      supplierPayments: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  const updateOrder = async (id: string, data: Partial<ChinaOrder>) => {
    await updateDoc(doc(db, COL, id), { ...data, updatedAt: serverTimestamp() })
  }

  const deleteOrder = async (id: string) => {
    await deleteDoc(doc(db, COL, id))
    setDetail(null)
  }

  const addClientPayment = async (order: ChinaOrder, p: Omit<ChinaPayment, 'id'>) => {
    const payment: ChinaPayment = { ...p, id: uid() }
    await updateOrder(order.id, { clientPayments: [...order.clientPayments, payment] })
  }

  const deleteClientPayment = async (order: ChinaOrder, payId: string) => {
    await updateOrder(order.id, { clientPayments: order.clientPayments.filter(p => p.id !== payId) })
  }

  const addSupplierPayment = async (order: ChinaOrder, p: Omit<ChinaPayment, 'id'>) => {
    const payment: ChinaPayment = { ...p, id: uid() }
    await updateOrder(order.id, { supplierPayments: [...order.supplierPayments, payment] })
  }

  const deleteSupplierPayment = async (order: ChinaOrder, payId: string) => {
    await updateOrder(order.id, { supplierPayments: order.supplierPayments.filter(p => p.id !== payId) })
  }

  // ── Filter ──
  const filtered = useMemo(() => {
    let list = orders
    if (filterStatus !== 'all') list = list.filter(o => o.status === filterStatus)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(o =>
        o.clientName.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q) ||
        (o.clientPhone ?? '').includes(q)
      )
    }
    return list
  }, [orders, filterStatus, search])

  // ── Accounting summary ──
  const stats = useMemo(() => {
    const active = orders.filter(o => o.status !== 'livre')
    return {
      totalOrders: orders.length,
      activeOrders: active.length,
      totalInvested: orders.reduce((s, o) => s + supplierPaid(o) + (o.status !== 'livre' ? 0 : o.shippingCost), 0),
      totalReceivedFromClients: orders.reduce((s, o) => s + clientPaid(o), 0),
      totalOutstanding: orders.reduce((s, o) => s + clientRemaining(o), 0),
      totalProfit: orders.filter(o => o.status === 'livre').reduce((s, o) => s + profit(o), 0),
    }
  }, [orders])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex-shrink-0 bg-white border-b border-[#e8e7e1] px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[20px] font-bold text-[#0f2460]">Commandes Chine</h1>
            <p className="text-[12px] text-[#6b6a66]">{stats.totalOrders} commande{stats.totalOrders !== 1 ? 's' : ''} · {stats.activeOrders} en cours</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowStats(s => !s)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#d3d1c7] bg-white cursor-pointer hover:bg-[#f5f4f0] transition-colors">
              <span className="text-[11px] font-semibold text-[#6b6a66]">KPI</span>
              <ChevronDown size={13} className="text-[#6b6a66] transition-transform duration-200"
                style={{ transform: showStats ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-[#1a5fa8] text-white text-[13px] font-bold px-4 py-2.5 rounded-xl cursor-pointer hover:opacity-90 transition-opacity shadow-sm">
              <Plus size={16} /> Nouvelle
            </button>
          </div>
        </div>

        {/* Stats — masquées par défaut, visibles sur toggle */}
        {showStats && (
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {[
              { label: 'Investi',  value: stats.totalInvested,            bg: '#f5f4f0', color: '#0f2460' },
              { label: 'Reçu',     value: stats.totalReceivedFromClients, bg: '#e8f5ee', color: '#1a7a4a' },
              { label: 'Restant',  value: stats.totalOutstanding,          bg: '#fdecea', color: '#c0392b' },
              { label: 'Bénéfice', value: stats.totalProfit,              bg: stats.totalProfit >= 0 ? '#e6eaf5' : '#fdecea', color: stats.totalProfit >= 0 ? '#0f2460' : '#c0392b' },
            ].map(k => (
              <div key={k.label} className="rounded-xl px-2 py-2 flex flex-col gap-0.5" style={{ background: k.bg }}>
                <span className="text-[9px] font-bold truncate" style={{ color: k.color, opacity: 0.6 }}>{k.label}</span>
                <span className="text-[12px] font-bold leading-tight truncate" style={{ color: k.color }}>
                  {k.label === 'Bénéfice' && k.value > 0 ? '+' : ''}{fmt(k.value)}
                </span>
                <span className="text-[9px] font-medium" style={{ color: k.color, opacity: 0.5 }}>MRU</span>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#a8a7a2]" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[#d3d1c7] pl-9 pr-4 py-2.5 text-[14px] text-[#1a1a18] focus:outline-none focus:border-[#1a5fa8] bg-white"
            placeholder="Rechercher client, description…" />
        </div>

        {/* Status filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button onClick={() => setFilter('all')}
            className={cn('flex-shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-bold border cursor-pointer transition-all',
              filterStatus === 'all' ? 'bg-[#0f2460] text-white border-[#0f2460]' : 'bg-white text-[#6b6a66] border-[#d3d1c7] hover:border-[#0f2460]/50')}>
            Tout ({orders.length})
          </button>
          {STATUS_LIST.map(s => {
            const count = orders.filter(o => o.status === s.id).length
            if (count === 0) return null
            return (
              <button key={s.id} onClick={() => setFilter(s.id)}
                className={cn('flex-shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-bold border cursor-pointer transition-all whitespace-nowrap',
                  filterStatus === s.id ? 'text-white border-transparent' : 'bg-white border-[#d3d1c7] hover:border-current')}
                style={filterStatus === s.id ? { background: s.color, borderColor: s.color } : { color: s.color }}>
                {s.label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {fsError ? (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-4 text-[13px] text-red-600 font-medium mt-4">
            {fsError}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20 text-[#a8a7a2] text-[14px]">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Package size={40} className="text-[#d3d1c7]" />
            <p className="text-[14px] text-[#a8a7a2]">
              {search || filterStatus !== 'all' ? 'Aucune commande trouvée' : 'Aucune commande pour l\'instant'}
            </p>
            {!search && filterStatus === 'all' && (
              <button onClick={() => setShowForm(true)}
                className="mt-2 flex items-center gap-2 bg-[#1a5fa8] text-white text-[13px] font-bold px-4 py-2.5 rounded-xl cursor-pointer hover:opacity-90">
                <Plus size={14} /> Créer une commande
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-4">
            {filtered.map(order => (
              <OrderCard key={order.id} order={order} onClick={() => setDetail(order)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showForm && (
        <OrderFormModal
          onClose={() => setShowForm(false)}
          onSave={async data => { await createOrder(data) }}
        />
      )}

      {editOrder && (
        <OrderFormModal
          initial={editOrder}
          onClose={() => setEditOrder(null)}
          onSave={async data => { await updateOrder(editOrder.id, data); setEditOrder(null) }}
        />
      )}

      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditOrder(detailOrder); setDetail(null) }}
          onDelete={() => deleteOrder(detailOrder.id)}
          onAddClientPayment={p => addClientPayment(detailOrder, p)}
          onDeleteClientPayment={id => deleteClientPayment(detailOrder, id)}
          onAddSupplierPayment={p => addSupplierPayment(detailOrder, p)}
          onDeleteSupplierPayment={id => deleteSupplierPayment(detailOrder, id)}
          onStatusChange={s => updateOrder(detailOrder.id, { status: s })}
          onUpdateShipping={async (method, cost, date) => {
            const costNum = parseFloat(cost) || 0
            await updateOrder(detailOrder.id, {
              shippingCost: costNum,
              ...(method ? { shippingMethod: method } : {}),
              ...(date   ? { shippingDate: date }     : {}),
              supplierTotalAmount: (detailOrder.supplierTotalAmountRmb * detailOrder.exchangeRate) + costNum,
            })
          }}
        />
      )}
    </div>
  )
}
