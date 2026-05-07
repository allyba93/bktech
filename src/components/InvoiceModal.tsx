import { useRef, useState, useEffect, useMemo } from 'react'
import { X, Printer, Download, MessageCircle, Loader2, Pencil, Check, RotateCcw } from 'lucide-react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import type { Client } from '@/store/appStore'

export interface InvoiceData {
  txId:      string
  date:      string
  client:    Client | null
  lines:     { desc: string; productName: string; qty: number; pu: number; total: number }[]
  subtotal:  number
  discount:  number
  total:     number
  payModes:  { mode: string; amount: number }[]
  paid:      number
}

const fmt = (n: number) => n.toLocaleString('fr-FR') + ' MRU'

const MODE_COLORS: Record<string, { color: string; bg: string }> = {
  Cash:    { color: '#1a7a4a', bg: '#e8f5ee' },
  Bankily: { color: '#e65c00', bg: '#fff0e6' },
  Masravi: { color: '#0066cc', bg: '#e6f0ff' },
  Seddad:  { color: '#7b2d8b', bg: '#f5e6ff' },
  Bimban:  { color: '#c0392b', bg: '#fdecea' },
  Crédit:  { color: '#996600', bg: '#fdf3dc' },
}

// ── PDF generation via html2canvas ────────────────────────────────────────────
// Always renders from an off-screen clone at a fixed 620 px width so the result
// is identical on any device regardless of mobile viewport / CSS transforms.
async function generatePdf(el: HTMLElement, filename: string): Promise<Blob> {
  const INVOICE_W = 620

  // Clone into a detached off-screen host so the live display is never touched
  const host = document.createElement('div')
  host.style.cssText =
    `position:fixed;top:-9999px;left:-9999px;width:${INVOICE_W}px;background:#fff;overflow:visible`
  const clone = el.cloneNode(true) as HTMLElement
  clone.style.transform = 'none'
  clone.style.width     = `${INVOICE_W}px`
  host.appendChild(clone)
  document.body.appendChild(host)

  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(host, {
      scale:           2,
      useCORS:         true,
      backgroundColor: '#ffffff',
      width:           INVOICE_W,
      windowWidth:     INVOICE_W,
    })
  } finally {
    document.body.removeChild(host)
  }

  const imgData = canvas.toDataURL('image/jpeg', 0.95)
  const pdf   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()   // 210 mm
  const pageH = pdf.internal.pageSize.getHeight()  // 297 mm

  const ratio = canvas.width / canvas.height
  const imgH  = pageW / ratio   // natural height at full A4 width

  if (imgH <= pageH) {
    // Content fits — stretch to fill full A4 (no blank strip at bottom)
    pdf.addImage(imgData, 'JPEG', 0, 0, pageW, pageH)
  } else {
    // Content taller than A4 — scale down to fit height, center horizontally
    const scaledW = pageH * ratio
    const marginX = (pageW - scaledW) / 2
    pdf.addImage(imgData, 'JPEG', marginX, 0, scaledW, pageH)
  }

  pdf.setProperties({ title: filename })
  return pdf.output('blob')
}

async function generatePdfAndSave(el: HTMLElement, filename: string): Promise<void> {
  const INVOICE_W = 620
  const host = document.createElement('div')
  host.style.cssText =
    `position:fixed;top:-9999px;left:-9999px;width:${INVOICE_W}px;background:#fff;overflow:visible`
  const clone = el.cloneNode(true) as HTMLElement
  clone.style.transform = 'none'
  clone.style.width     = `${INVOICE_W}px`
  host.appendChild(clone)
  document.body.appendChild(host)

  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(host, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff',
      width: INVOICE_W, windowWidth: INVOICE_W,
    })
  } finally {
    document.body.removeChild(host)
  }

  const imgData = canvas.toDataURL('image/jpeg', 0.95)
  const pdf   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const ratio = canvas.width / canvas.height
  const imgH  = pageW / ratio
  if (imgH <= pageH) {
    pdf.addImage(imgData, 'JPEG', 0, 0, pageW, pageH)
  } else {
    const scaledW = pageH * ratio
    pdf.addImage(imgData, 'JPEG', (pageW - scaledW) / 2, 0, scaledW, pageH)
  }
  pdf.setProperties({ title: filename })
  pdf.save(filename)
}

type EditLine = InvoiceData['lines'][number]

const inCls = 'w-full rounded-[7px] border border-black/[0.1] bg-[#f8f7f3] px-2 py-1.5 font-mono text-right text-[12px] outline-none focus:border-[#1a1a18] focus:bg-white'

export function InvoiceModal({ data, onClose, onUpdate }: {
  data: InvoiceData
  onClose: () => void
  onUpdate?: (lines: EditLine[], discount: number) => Promise<void>
}) {
  const printRef    = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState<'pdf' | 'wa' | null>(null)
  const [previewScale, setPreviewScale] = useState(1)
  const [marginBottom, setMarginBottom]  = useState(0)

  // ── Edit mode ────────────────────────────────────────────────────────────────
  const [editMode,     setEditMode]     = useState(false)
  const [editLines,    setEditLines]    = useState<EditLine[]>(() => data.lines.map(l => ({ ...l })))
  const [editDiscount, setEditDiscount] = useState(String(data.discount || 0))
  const [saving,       setSaving]       = useState(false)

  useEffect(() => {
    setEditLines(data.lines.map(l => ({ ...l })))
    setEditDiscount(String(data.discount || 0))
    setEditMode(false)
  }, [data])

  const editSubtotal = useMemo(() => editLines.reduce((s, l) => s + l.qty * l.pu, 0), [editLines])
  const editTotal    = useMemo(() => Math.max(0, editSubtotal - (parseFloat(editDiscount) || 0)), [editSubtotal, editDiscount])

  const handleSave = async () => {
    if (!onUpdate) return
    const updatedLines = editLines.map(l => ({ ...l, total: l.qty * l.pu }))
    const discount = parseFloat(editDiscount) || 0
    setSaving(true)
    try {
      await onUpdate(updatedLines, discount)
      setEditMode(false)
    } finally {
      setSaving(false)
    }
  }

  const updateLine = (i: number, field: 'qty' | 'pu', raw: string) => {
    const val = parseFloat(raw) || 0
    setEditLines(ls => ls.map((l, j) => j !== i ? l : { ...l, [field]: val, total: field === 'qty' ? val * l.pu : l.qty * val }))
  }

  useEffect(() => {
    if (editMode) return
    const update = () => {
      if (!containerRef.current || !printRef.current) return
      const availW  = containerRef.current.clientWidth - 32
      const s       = Math.min(1, availW / 620)
      const invoiceH = printRef.current.scrollHeight
      setPreviewScale(s)
      setMarginBottom(s < 1 ? Math.round(invoiceH * (s - 1)) : 0)
    }
    requestAnimationFrame(update)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [data, editMode])

  const clientLabel = data.client ? `${data.client.prenom} ${data.client.nom}`.trim() : 'Comptoir'
  const filename = `${clientLabel}-${data.txId}-${data.date.replace(/\//g,'-')}.pdf`

  // ── Download PDF ─────────────────────────────────────────────────────────
  const handleDownloadPdf = async () => {
    if (!printRef.current) return
    setLoading('pdf')
    // Open the window synchronously while the user gesture is still active
    const win = window.open('', '_blank')
    try {
      const blob = await generatePdf(printRef.current, filename)
      const url  = URL.createObjectURL(blob)
      if (win) {
        win.location.href = url
        setTimeout(() => URL.revokeObjectURL(url), 60000)
      } else {
        // Popup blocked — fall back to direct download
        await generatePdfAndSave(printRef.current, filename)
      }
    } finally {
      setLoading(null)
    }
  }

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const content = printRef.current?.innerHTML ?? ''
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"/><title>${clientLabel} — ${data.txId}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; font-size: 12px; color: #111110; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>
${content}
<script>window.onload=function(){window.print()}<\/script>
</body></html>`)
    win.document.close()
  }

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  const handleWhatsApp = async () => {
    if (!printRef.current) return
    setLoading('wa')
    try {
      // 1. Download PDF
      const blob = await generatePdf(printRef.current, filename)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = filename
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 200)

      // 2. Build WhatsApp message
      const clientName = data.client
        ? `${data.client.prenom} ${data.client.nom}`.trim()
        : 'cher client'
      const reste = data.total - data.paid
      const payDesc = data.payModes
        .map(m => `${m.mode} ${m.amount.toLocaleString('fr-FR')} MRU`).join(' + ')

      const msg = [
        `Bonjour ${clientName} 👋`,
        ``,
        `Voici votre facture *${data.txId}* du ${data.date} :`,
        data.lines.map(l => `• ${l.desc} ×${l.qty} — ${l.total.toLocaleString('fr-FR')} MRU`).join('\n'),
        ``,
        `*Total : ${fmt(data.total)}*`,
        data.discount > 0 ? `Remise appliquée : ${fmt(data.discount)}` : '',
        payDesc ? `Règlement : ${payDesc}` : '',
        reste > 0 ? `⚠️ Reste dû : *${fmt(reste)}*` : `✅ Entièrement payé`,
        ``,
        `Le PDF a été téléchargé — veuillez le joindre à ce message.`,
        ``,
        `Merci pour votre confiance 🙏\n_BK Tech_`,
      ].filter(Boolean).join('\n')

      // 3. Open WhatsApp with pre-filled message
      const tel = data.client?.tel?.replace(/\s+/g, '') ?? ''
      const encodedMsg = encodeURIComponent(msg)
      const waUrl = tel
        ? `https://wa.me/${tel.startsWith('+') ? tel.slice(1) : tel}?text=${encodedMsg}`
        : `https://wa.me/?text=${encodedMsg}`

      // Small delay so PDF download starts first
      setTimeout(() => window.open(waUrl, '_blank'), 400)
    } finally {
      setLoading(null)
    }
  }

  const reste         = data.total - data.paid
  const hasCreditMode = data.payModes.some(m => m.mode === 'Crédit')
  const isSolde       = hasCreditMode && data.paid >= data.total
  const isPartiel     = hasCreditMode && data.paid > 0 && data.paid < data.total
  const isCredit      = hasCreditMode && data.paid === 0
  // Only show cash payment modes (non-Crédit) with non-zero amounts
  const realPayModes  = data.payModes.filter(m => m.mode !== 'Crédit' && m.amount > 0)
  const clientName    = data.client
    ? `${data.client.prenom} ${data.client.nom}`.trim()
    : null

  return (
    <div className="fixed inset-0 z-[70] flex justify-center bg-black/50" style={{ alignItems: 'flex-end', paddingBottom: '8vh' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex w-full flex-col overflow-hidden rounded-t-2xl border border-black/[0.08] bg-white sm:w-[740px] sm:rounded-2xl sm:max-h-[92vh] sm:h-auto" style={{ height: '92dvh' }}>

        {/* Toolbar */}
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-black/[0.08] bg-white px-4 py-3">
          <span className="flex-1 text-[14px] font-medium">{clientLabel} <span className="font-mono text-[12px] text-[#a8a7a2]">· {data.txId}</span></span>

          {editMode ? (
            <>
              <button onClick={() => setEditMode(false)} disabled={saving}
                className="flex items-center gap-1.5 rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-2 text-[12px] font-medium text-[#6b6a66] cursor-pointer hover:opacity-80 disabled:opacity-50">
                <RotateCcw size={13} /> Annuler
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 rounded-[9px] border-none bg-[#1a7a4a] px-3 py-2 text-[12px] font-medium text-white cursor-pointer hover:opacity-90 disabled:opacity-50">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Sauvegarder
              </button>
            </>
          ) : (
            <>
              {onUpdate && (
                <button onClick={() => setEditMode(true)} disabled={loading !== null}
                  className="flex items-center gap-1.5 rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-2 text-[12px] font-medium text-[#6b6a66] cursor-pointer hover:opacity-80 disabled:opacity-50">
                  <Pencil size={13} />
                  <span className="hidden sm:inline">Modifier</span>
                </button>
              )}

              {/* WhatsApp */}
              <button onClick={handleWhatsApp} disabled={loading !== null}
                className="flex items-center gap-1.5 rounded-[9px] border border-[#25d366]/40 bg-[#25d366]/10 px-2.5 py-2 text-[12px] font-medium text-[#128c4f] cursor-pointer hover:opacity-80 disabled:opacity-50">
                {loading === 'wa' ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
                <span className="hidden sm:inline">WhatsApp</span>
              </button>

              {/* Download PDF */}
              <button onClick={handleDownloadPdf} disabled={loading !== null}
                className="flex items-center gap-1.5 rounded-[9px] border border-black/[0.08] bg-[#e8f0fb] px-2.5 py-2 text-[12px] font-medium text-[#1a5fa8] cursor-pointer hover:opacity-80 disabled:opacity-50">
                {loading === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                <span className="hidden sm:inline">PDF</span>
              </button>

              {/* Print */}
              <button onClick={handlePrint} disabled={loading !== null}
                className="hidden sm:flex items-center gap-1.5 rounded-[9px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-2 text-[12px] font-medium text-[#6b6a66] cursor-pointer hover:opacity-80 disabled:opacity-50">
                <Printer size={14} /> Imprimer
              </button>
            </>
          )}

          <button onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f0efe9] border-none cursor-pointer hover:opacity-80">
            <X size={13} className="text-[#6b6a66]" />
          </button>
        </div>

        {/* WhatsApp hint */}
        {data.client?.tel && (
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-black/[0.08] bg-[#f0fdf4] px-5 py-2 text-[11px] text-[#15803d]">
            <MessageCircle size={12} />
            Le PDF sera téléchargé automatiquement — joignez-le dans WhatsApp au message pré-rempli.
            {' '}<span className="font-medium">{data.client.tel}</span>
          </div>
        )}

        {/* Edit form */}
        {editMode && (
          <div className="flex-1 overflow-y-auto bg-[#f5f4f0] p-4">
            <div className="mx-auto max-w-[580px] rounded-xl bg-white p-5 shadow-sm">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#a8a7a2]">Articles</div>
              <div className="flex flex-col gap-2">
                {editLines.map((l, i) => (
                  <div key={i} className="rounded-[10px] border border-black/[0.07] bg-[#f8f7f3] p-3">
                    <div className="mb-2 text-[12px] font-medium text-[#111110] truncate">{l.desc}</div>
                    {l.productName && <div className="mb-2 text-[11px] text-[#a8a7a2]">{l.productName}</div>}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-[#6b6a66]">Qté</label>
                        <input type="number" min="0" step="1" value={l.qty}
                          onChange={e => updateLine(i, 'qty', e.target.value)}
                          className={inCls} />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-[#6b6a66]">Prix unit. (MRU)</label>
                        <input type="number" min="0" step="1" value={l.pu}
                          onChange={e => updateLine(i, 'pu', e.target.value)}
                          className={inCls} />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-[#6b6a66]">Total</label>
                        <div className="rounded-[7px] border border-transparent bg-transparent px-2 py-1.5 text-right font-mono text-[12px] font-semibold text-[#111110]">
                          {(l.qty * l.pu).toLocaleString('fr-FR')} MRU
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2 border-t border-black/[0.07] pt-4">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-[#6b6a66]">Sous-total</span>
                  <span className="font-mono font-medium">{editSubtotal.toLocaleString('fr-FR')} MRU</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[12px] text-[#996600]">Remise (MRU)</label>
                  <input type="number" min="0" step="1" value={editDiscount}
                    onChange={e => setEditDiscount(e.target.value)}
                    className="flex-1 rounded-[7px] border border-black/[0.1] bg-[#fdf3dc] px-2 py-1.5 font-mono text-right text-[12px] outline-none focus:border-[#996600] focus:bg-white" />
                </div>
                <div className="flex items-center justify-between border-t border-black/[0.1] pt-2 text-[14px] font-bold">
                  <span>Total</span>
                  <span className="font-mono">{editTotal.toLocaleString('fr-FR')} MRU</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Invoice preview */}
        {!editMode && <div ref={containerRef} className="flex-1 overflow-y-auto bg-[#f5f4f0]" style={{ padding: '16px 0' }}>
          <div style={{ width: 620, margin: '0 auto', transformOrigin: 'top center', transform: `scale(${previewScale})`, marginBottom }}>
          <div ref={printRef}
            style={{ background: 'white', borderRadius: 12, overflow: 'hidden', fontFamily: 'system-ui, sans-serif', fontSize: 12, color: '#111110' }}>
            <div style={{ padding: '20px 28px 28px' }}>

              {/* ── Header: 3 columns ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>

                {/* Left — shop info (French + Arabic) */}
                <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  {/* French */}
                  <div style={{ flex: '1 1 0', minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0f2460', letterSpacing: '-.2px', lineHeight: 1.1 }}>BK Tech</div>
                    <div style={{ fontSize: 9, color: '#6b6a66', marginTop: 2, lineHeight: 1.4 }}>Pochettes et accessoires en gros</div>
                    <div style={{ fontSize: 9, color: '#a8a7a2', marginTop: 3, lineHeight: 1.5 }}>
                      Marché Mamoud<br/>
                      Tél : 48324812 / 27865296
                    </div>
                  </div>
                  {/* Divider */}
                  <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(0,0,0,0.07)', flexShrink: 0 }}/>
                  {/* Arabic */}
                  <div style={{ flex: '1 1 0', minWidth: 0, textAlign: 'right', direction: 'rtl' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0f2460', letterSpacing: '-.2px', lineHeight: 1.1 }}>بي كي تيك</div>
                    <div style={{ fontSize: 9, color: '#6b6a66', marginTop: 2, lineHeight: 1.4 }}>أكياس وإكسسوارات بالجملة</div>
                    <div style={{ fontSize: 9, color: '#a8a7a2', marginTop: 3, lineHeight: 1.5 }}>
                      سوق محمود<br/>
                      هاتف : 48324812 / 27865296
                    </div>
                  </div>
                </div>

                {/* Center — logo */}
                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                  <img src="/BK_Tech_logo_cropped2.PNG" alt="BK Tech"
                    style={{ height: 58, width: 'auto', objectFit: 'contain', display: 'block' }} />
                </div>

                {/* Right — invoice ref + client */}
                <div style={{ flex: '1 1 0', minWidth: 0, textAlign: 'right' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#111110', letterSpacing: '.3px' }}>{data.txId}</div>
                  <div style={{ fontSize: 10, color: '#6b6a66', marginTop: 2 }}>{data.date}</div>
                  <div style={{ marginTop: 6, borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: 6 }}>
                    {clientName ? (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#111110' }}>{clientName}</div>
                        {data.client?.tel   && <div style={{ fontSize: 10, color: '#6b6a66', marginTop: 1 }}>{data.client.tel}</div>}
                        {data.client?.ville && <div style={{ fontSize: 10, color: '#6b6a66' }}>{data.client.ville}</div>}
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: '#a8a7a2', fontStyle: 'italic' }}>Client comptoir</div>
                    )}
                  </div>
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,0.08)', margin: '0 0 14px' }} />

              {/* Items table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                <thead>
                  <tr>
                    {[
                      { label: 'Article',  right: false },
                      { label: 'Produit',  right: false },
                      { label: 'Qté',      right: true  },
                      { label: 'P.U.',     right: true  },
                      { label: 'Total',    right: true  },
                    ].map(h => (
                      <th key={h.label} style={{
                        background: '#f8f7f3',
                        padding: '7px 10px',
                        fontSize: 9, fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: '.6px',
                        color: '#a8a7a2',
                        textAlign: h.right ? 'right' : 'left',
                        borderBottom: '1px solid rgba(0,0,0,0.08)',
                      }}>{h.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l, i) => (
                    <tr key={i} style={{ background: i % 2 === 1 ? '#fafaf8' : 'white' }}>
                      <td style={{ padding: '8px 10px', fontSize: 12, borderBottom: '1px solid rgba(0,0,0,0.04)', fontWeight: 500 }}>{l.desc}</td>
                      <td style={{ padding: '8px 10px', fontSize: 11, color: '#6b6a66', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>{l.productName}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>{l.qty}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>{l.pu.toLocaleString('fr-FR')}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>{l.total.toLocaleString('fr-FR')} MRU</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div style={{ marginLeft: 'auto', width: 260 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, color: '#6b6a66' }}>
                  <span>Total pièces</span>
                  <span style={{ fontFamily: 'monospace' }}>{data.lines.reduce((s, l) => s + l.qty, 0)} pcs</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, color: '#6b6a66' }}>
                  <span>Sous-total</span><span style={{ fontFamily: 'monospace' }}>{fmt(data.subtotal)}</span>
                </div>
                {data.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, color: '#996600' }}>
                    <span>Remise</span><span style={{ fontFamily: 'monospace' }}>−{fmt(data.discount)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 6px', fontSize: 15, fontWeight: 700, color: '#111110', borderTop: '2px solid #111110', marginTop: 4 }}>
                  <span>TOTAL</span><span style={{ fontFamily: 'monospace' }}>{fmt(data.total)}</span>
                </div>
                {/* Credit invoice — soldé */}
                {isSolde && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:10, padding:'7px 14px', background:'#e8f5ee', borderRadius:8, border:'1.5px solid rgba(26,122,74,0.45)', fontSize:13, fontWeight:700, color:'#1a7a4a' }}>
                    ✓ SOLDÉ
                  </div>
                )}
                {/* Credit invoice — partially paid */}
                {isPartiel && (
                  <>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', fontSize:12, color:'#1a7a4a' }}>
                      <span>Encaissé</span><span style={{ fontFamily:'monospace' }}>{fmt(data.paid)}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:13, fontWeight:600, color:'#c0392b' }}>
                      <span>Reste dû</span><span style={{ fontFamily:'monospace' }}>{fmt(reste)}</span>
                    </div>
                  </>
                )}
                {/* Credit invoice — unpaid */}
                {isCredit && (
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:12, color:'#996600' }}>
                    <span>À encaisser</span><span style={{ fontFamily:'monospace' }}>{fmt(reste)}</span>
                  </div>
                )}
                {/* Non-credit partial payment */}
                {!hasCreditMode && data.paid > 0 && data.paid < data.total && (
                  <>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', fontSize:12, color:'#1a7a4a' }}>
                      <span>Versé</span><span style={{ fontFamily:'monospace' }}>{fmt(data.paid)}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:13, fontWeight:600, color:'#c0392b' }}>
                      <span>Reste dû</span><span style={{ fontFamily:'monospace' }}>{fmt(reste)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Payment modes */}
              <div style={{ marginTop: 24, borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 16 }}>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.8px', color: '#a8a7a2', marginBottom: 8 }}>
                  Règlement
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {realPayModes.map(m => {
                    const c = MODE_COLORS[m.mode] ?? { color: '#6b6a66', bg: '#f0efe9' }
                    return (
                      <span key={m.mode} style={{ background: c.bg, color: c.color, borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 600 }}>
                        {m.mode} — {m.amount.toLocaleString('fr-FR')} MRU
                      </span>
                    )
                  })}
                  {/* Credit invoice status badge */}
                  {isSolde && (
                    <span style={{ background: '#e8f5ee', color: '#1a7a4a', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>
                      ✓ Soldé
                    </span>
                  )}
                  {(isPartiel || isCredit) && (
                    <span style={{ background: '#fdf3dc', color: '#996600', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 600 }}>
                      Crédit — {reste.toLocaleString('fr-FR')} MRU {isPartiel ? 'restant' : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div style={{ marginTop: 28, textAlign: 'center', fontSize: 10, color: '#a8a7a2', borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 14 }}>
                Merci pour votre confiance — BK Tech, Mauritanie
              </div>
            </div>
          </div>
          </div>
        </div>}
      </div>
    </div>
  )
}
