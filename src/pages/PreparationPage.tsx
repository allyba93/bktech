import { useState } from 'react'
import { Check, Trash2, CheckCheck, X, PackageCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import type { DraftInvoice } from '@/store/appStore'

const fmt    = (n: number) => n.toLocaleString('fr-FR')
const fmtMRU = (n: number) => n.toLocaleString('fr-FR') + ' MRU'

const MODE_COLORS: Record<string, { color: string; bg: string }> = {
  Cash:    { color: '#1a7a4a', bg: '#e8f5ee' },
  Bankily: { color: '#e65c00', bg: '#fff0e6' },
  Masravi: { color: '#0066cc', bg: '#e6f0ff' },
  Seddad:  { color: '#7b2d8b', bg: '#f5e6ff' },
  Bimban:  { color: '#c0392b', bg: '#fdecea' },
  Crédit:  { color: '#996600', bg: '#fdf3dc' },
  Avance:  { color: '#7c3aed', bg: '#f0e8ff' },
}

function progress(draft: DraftInvoice) {
  const total  = draft.lines.length
  const picked = draft.lines.filter(l => l.picked).length
  return { picked, total, pct: total > 0 ? Math.round(picked / total * 100) : 0 }
}

function StatusBadge({ draft }: { draft: DraftInvoice }) {
  const { picked, total } = progress(draft)
  if (picked === 0)
    return <span className="rounded-full bg-[#fdf3dc] px-2 py-0.5 text-[10px] font-semibold text-[#996600]">En attente</span>
  if (picked < total)
    return <span className="rounded-full bg-[#e8f0fb] px-2 py-0.5 text-[10px] font-semibold text-[#1a5fa8]">En cours {picked}/{total}</span>
  return <span className="rounded-full bg-[#e8f5ee] px-2 py-0.5 text-[10px] font-semibold text-[#1a7a4a]">Prêt ✓</span>
}

// ── Picking Panel ──────────────────────────────────────────────────────────────
function PickingPanel({ draft, onClose }: { draft: DraftInvoice; onClose: () => void }) {
  const toggleDraftLine      = useAppStore(s => s.toggleDraftLine)
  const validateDraftInvoice = useAppStore(s => s.validateDraftInvoice)
  const deleteDraftInvoice   = useAppStore(s => s.deleteDraftInvoice)
  const [validating, setValidating] = useState(false)

  const { picked, total } = progress(draft)
  const allPicked = picked === total && total > 0

  const handleCheckAll = async () => {
    for (let i = 0; i < draft.lines.length; i++) {
      if (!draft.lines[i].picked) await toggleDraftLine(draft.id, i)
    }
  }

  const handleValidate = async () => {
    if (!allPicked) return
    if (!window.confirm(`Valider ce bon de sortie et l'ajouter à la caisse ?`)) return
    setValidating(true)
    try {
      await validateDraftInvoice(draft.id)
      onClose()
    } catch (e) {
      console.error(e)
      alert('Erreur lors de la validation')
    } finally {
      setValidating(false)
    }
  }

  const handleDelete = () => {
    if (!window.confirm(`Annuler ce bon de sortie ?`)) return
    deleteDraftInvoice(draft.id)
    onClose()
  }

  return (
    <div className="flex h-full flex-col bg-white">

      {/* Header */}
      <div className="flex flex-shrink-0 items-start justify-between border-b border-black/[0.08] px-5 py-4">
        <div>
          <div className="text-[16px] font-semibold text-[#111110]">
            {draft.clientName || 'Client comptoir'}
          </div>
          <div className="mt-0.5 text-[12px] text-[#a8a7a2]">{draft.date} · {fmtMRU(draft.total)}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {draft.payModes.map(m => {
              const c = MODE_COLORS[m.mode] ?? { color: '#6b6a66', bg: '#f0efe9' }
              return (
                <span key={m.mode} style={{ background: c.bg, color: c.color }}
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold">
                  {m.mode} {fmt(m.amount)} MRU
                </span>
              )
            })}
          </div>
        </div>
        <button onClick={onClose}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#f0efe9] border-none cursor-pointer hover:opacity-80">
          <X size={14} className="text-[#6b6a66]" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="flex-shrink-0 border-b border-black/[0.06] px-5 py-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="font-medium text-[#6b6a66]">{picked} sur {total} référence{total !== 1 ? 's' : ''} sortie{picked !== 1 ? 's' : ''}</span>
          {!allPicked && (
            <button onClick={handleCheckAll}
              className="flex items-center gap-1 rounded-md bg-[#f0efe9] px-2 py-1 text-[11px] font-medium text-[#6b6a66] cursor-pointer hover:opacity-80 border-none">
              <CheckCheck size={12} /> Tout cocher
            </button>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#f0efe9]">
          <div className="h-full rounded-full transition-all duration-300"
            style={{ width: `${picked / Math.max(1, total) * 100}%`, background: allPicked ? '#1a7a4a' : '#1a5fa8' }} />
        </div>
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {draft.lines.map((line, i) => (
          <button
            key={i}
            onClick={() => toggleDraftLine(draft.id, i)}
            className={cn(
              'flex w-full items-center gap-3 border-b border-black/[0.04] px-5 py-3.5 text-left transition-colors cursor-pointer',
              line.picked ? 'bg-[#f0faf5]' : 'bg-white hover:bg-[#f8f7f3]'
            )}
          >
            {/* Checkbox */}
            <div className={cn(
              'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-all',
              line.picked
                ? 'border-[#1a7a4a] bg-[#1a7a4a]'
                : 'border-black/[0.2] bg-white'
            )}>
              {line.picked && <Check size={11} className="text-white" strokeWidth={3} />}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className={cn('text-[13px] font-medium', line.picked ? 'text-[#1a7a4a] line-through decoration-[#1a7a4a]/40' : 'text-[#111110]')}>
                {line.desc}
              </div>
              {line.productName && (
                <div className="text-[11px] text-[#a8a7a2]">{line.productName}</div>
              )}
            </div>

            {/* Qty + Price */}
            <div className="flex-shrink-0 text-right">
              <div className="font-mono text-[13px] font-medium text-[#111110]">{fmtMRU(line.total)}</div>
              <div className="text-[10px] text-[#a8a7a2]">{fmt(line.qty)} × {fmt(line.pu)}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Footer actions */}
      <div className="flex flex-shrink-0 items-center justify-between border-t border-black/[0.08] px-5 py-3.5">
        <button onClick={handleDelete}
          className="flex items-center gap-1.5 rounded-[9px] border border-[#c0392b] bg-[#fdecea] px-3 py-2 text-[12px] font-medium text-[#c0392b] cursor-pointer hover:opacity-80">
          <Trash2 size={13} /> Annuler
        </button>

        <button
          onClick={handleValidate}
          disabled={!allPicked || validating}
          className={cn(
            'flex items-center gap-2 rounded-[11px] px-5 py-2.5 text-[13px] font-semibold transition-all',
            allPicked && !validating
              ? 'bg-[#1a7a4a] text-white cursor-pointer hover:opacity-90'
              : 'bg-[#f0efe9] text-[#a8a7a2] cursor-not-allowed'
          )}
        >
          <PackageCheck size={15} />
          {validating ? 'Validation…' : 'Valider → Caisse'}
        </button>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export function PreparationPage() {
  const draftInvoices = useAppStore(s => s.draftInvoices)
  const [selected, setSelected] = useState<DraftInvoice | null>(null)

  // Keep selected in sync with live store data
  const liveDraft = selected ? draftInvoices.find(d => d.id === selected.id) ?? null : null

  return (
    <div className="flex h-full overflow-hidden bg-[#f5f4f0]">

      {/* ── Left: list ── */}
      <div className={cn(
        'flex flex-col border-r border-black/[0.08] bg-white',
        liveDraft ? 'hidden md:flex md:w-[340px] flex-shrink-0' : 'flex w-full md:w-[340px] flex-shrink-0'
      )}>
        {/* Header */}
        <div className="flex-shrink-0 border-b border-black/[0.08] px-5 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-[17px] font-semibold text-[#111110]">Bons de sortie</h1>
            {draftInvoices.length > 0 && (
              <span className="rounded-full bg-[#1a5fa8]/10 px-2.5 py-0.5 text-[12px] font-semibold text-[#1a5fa8]">
                {draftInvoices.length}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-[#a8a7a2]">Factures en attente de sortie de stock</p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {draftInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <PackageCheck size={32} className="mb-3 text-[#a8a7a2]" strokeWidth={1.5} />
              <div className="text-[14px] font-medium text-[#6b6a66]">Aucun bon en cours</div>
              <div className="mt-1 text-[12px] text-[#a8a7a2]">
                Créez un bon de sortie depuis le Point de Vente
              </div>
            </div>
          ) : (
            draftInvoices.map(draft => {
              const { picked, total, pct } = progress(draft)
              const isSelected = liveDraft?.id === draft.id
              return (
                <button
                  key={draft.id}
                  onClick={() => setSelected(draft)}
                  className={cn(
                    'flex w-full flex-col gap-2 border-b border-black/[0.05] px-5 py-4 text-left transition-colors cursor-pointer',
                    isSelected ? 'bg-[#e8f0fb]' : 'bg-white hover:bg-[#f8f7f3]'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-[#111110] truncate">
                        {draft.clientName || 'Client comptoir'}
                      </div>
                      <div className="text-[11px] text-[#a8a7a2]">{draft.date}</div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="font-mono text-[13px] font-semibold text-[#111110]">{fmtMRU(draft.total)}</div>
                      <StatusBadge draft={draft} />
                    </div>
                  </div>

                  {/* Progress */}
                  <div>
                    <div className="h-1 overflow-hidden rounded-full bg-[#f0efe9]">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: picked === total ? '#1a7a4a' : '#1a5fa8' }} />
                    </div>
                    <div className="mt-1 text-[10px] text-[#a8a7a2]">
                      {picked}/{total} {picked === total && total > 0 ? '— Prêt à valider' : 'référence' + (total !== 1 ? 's' : '')}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Right: picking panel ── */}
      {liveDraft ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <PickingPanel draft={liveDraft} onClose={() => setSelected(null)} />
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-[13px] text-[#a8a7a2]">
          Sélectionnez un bon de sortie
        </div>
      )}
    </div>
  )
}
