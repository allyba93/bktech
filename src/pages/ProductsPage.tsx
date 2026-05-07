import { useState, useMemo } from 'react'
import { Plus, X, Check, Search, Edit2, Trash2, Tag, ChevronDown, ChevronUp } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import type { Product, RefStock } from '@/store/appStore'

// ── Constants ──────────────────────────────────────────────────────────────
const CATS = ['Coques', 'Câbles', 'Chargeurs', 'Têtes chargeur', 'Accessoires']
const CAT_COLORS: Record<string, string> = {
  Coques: '#378ADD',
  Câbles: '#1D9E75',
  Chargeurs: '#BA7517',
  'Têtes chargeur': '#D85A30',
  Accessoires: '#7F77DD',
}

const newId = () => 'r' + Date.now() + Math.random().toString(36).slice(2)
const fmt = (n: number) => n.toLocaleString('fr-FR')

// ── Form types ─────────────────────────────────────────────────────────────
interface FormRef { _id: string; name: string }
interface FormState { name: string; category: string; refs: FormRef[] }

const emptyForm = (): FormState => ({
  name: '',
  category: CATS[0],
  refs: [{ _id: newId(), name: '' }],
})

function productToForm(p: Product): FormState {
  return {
    name: p.name,
    category: p.category,
    refs: p.refs.map(r => ({ _id: r.id, name: r.name })),
  }
}

// ── Category Badge ─────────────────────────────────────────────────────────
function CatBadge({ cat }: { cat: string }) {
  const color = CAT_COLORS[cat] ?? '#a8a7a2'
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap"
      style={{ backgroundColor: color + '18', color }}
    >
      {cat}
    </span>
  )
}

// ── Ref Detail Modal ───────────────────────────────────────────────────────
function RefsModal({ product, onClose }: { product: Product; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45"
      onClick={onClose}
    >
      <div
        className="flex flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-white"
        style={{ width: 520, maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-medium text-[#111110]">{product.name}</span>
              <CatBadge cat={product.category} />
            </div>
            <div className="text-[12px] text-[#a8a7a2] mt-0.5">
              {product.refs.length} référence{product.refs.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0efe9] border-none cursor-pointer hover:opacity-80"
          >
            <X size={13} className="text-[#6b6a66]" />
          </button>
        </div>

        {/* Refs table */}
        <div className="overflow-y-auto flex-1">
          {product.refs.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-[#a8a7a2]">Aucune référence</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-black/[0.06] bg-[#f8f7f3]">
                  <th className="px-5 py-2.5 text-left font-medium text-[#6b6a66]">Référence</th>
                  <th className="px-5 py-2.5 text-right font-medium text-[#6b6a66]">Stock</th>
                </tr>
              </thead>
              <tbody>
                {product.refs.map((r, i) => (
                  <tr
                    key={r.id}
                    className={`border-b border-black/[0.05] ${i % 2 === 0 ? 'bg-white' : 'bg-[#fafaf8]'}`}
                  >
                    <td className="px-5 py-2.5 text-[#111110] font-medium">{r.name}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-[#1a7a4a]">{fmt(r.stock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Form Modal ─────────────────────────────────────────────────────────────
function FormModal({
  initial,
  onClose,
  onSave,
}: {
  initial: FormState
  onClose: () => void
  onSave: (f: FormState) => Promise<void>
}) {
  const [form, setForm] = useState<FormState>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const addRef = () =>
    setForm(f => ({ ...f, refs: [...f.refs, { _id: newId(), name: '' }] }))

  const removeRef = (id: string) =>
    setForm(f => ({ ...f, refs: f.refs.filter(r => r._id !== id) }))

  const updateRef = (id: string, value: string) =>
    setForm(f => ({
      ...f,
      refs: f.refs.map(r => (r._id === id ? { ...r, name: value } : r)),
    }))

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Le nom est requis'); return }
    if (form.refs.some(r => !r.name.trim())) { setError('Chaque référence doit avoir un nom'); return }
    setError('')
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45"
      onClick={onClose}
    >
      <div
        className="flex flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-white"
        style={{ width: 540, maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4 flex-shrink-0">
          <span className="text-[15px] font-medium text-[#111110]">
            {initial.name ? 'Modifier le produit' : 'Nouveau produit'}
          </span>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0efe9] border-none cursor-pointer hover:opacity-80"
          >
            <X size={13} className="text-[#6b6a66]" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-[#6b6a66] uppercase tracking-wide">Nom du produit</label>
            <input
              className="w-full rounded-[9px] border border-black/[0.1] bg-[#f8f7f3] px-3 py-2 text-[13px] text-[#111110] outline-none focus:border-[#1a1a18] placeholder:text-[#a8a7a2]"
              placeholder="ex: iPhone 15 Pro"
              value={form.name}
              onChange={e => setField('name', e.target.value)}
            />
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-[#6b6a66] uppercase tracking-wide">Catégorie</label>
            <select
              className="w-full rounded-[9px] border border-black/[0.1] bg-[#f8f7f3] px-3 py-2 text-[13px] text-[#111110] outline-none focus:border-[#1a1a18] cursor-pointer"
              value={form.category}
              onChange={e => setField('category', e.target.value)}
            >
              {CATS.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Refs */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-[#6b6a66] uppercase tracking-wide">
                Références ({form.refs.length})
              </label>
              <button
                onClick={addRef}
                className="flex items-center gap-1 rounded-[7px] bg-[#f0efe9] px-2.5 py-1 text-[11px] font-medium text-[#111110] hover:bg-[#e8e7e1] cursor-pointer border-none"
              >
                <Plus size={11} />
                Ajouter
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              {form.refs.map((r, i) => (
                <div key={r._id} className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-[#f0efe9] flex items-center justify-center text-[10px] text-[#a8a7a2] flex-shrink-0">
                    {i + 1}
                  </div>
                  <input
                    className="flex-1 rounded-[9px] border border-black/[0.1] bg-[#f8f7f3] px-3 py-1.5 text-[12px] text-[#111110] outline-none focus:border-[#1a1a18] placeholder:text-[#a8a7a2]"
                    placeholder="Nom de la référence"
                    value={r.name}
                    onChange={e => updateRef(r._id, e.target.value)}
                  />
                  <button
                    onClick={() => removeRef(r._id)}
                    disabled={form.refs.length === 1}
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-[#fdecea] cursor-pointer hover:opacity-80 border-none disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <X size={11} className="text-[#c0392b]" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-[9px] bg-[#fdecea] px-3 py-2 text-[12px] text-[#c0392b]">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-black/[0.08] px-5 py-3.5 flex-shrink-0">
          <button
            onClick={onClose}
            className="rounded-[9px] border border-black/[0.1] bg-white px-4 py-2 text-[12px] font-medium text-[#6b6a66] hover:bg-[#f0efe9] cursor-pointer"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-[9px] bg-[#1a1a18] px-4 py-2 text-[12px] font-medium text-[#f5f4f0] hover:opacity-80 cursor-pointer border-none disabled:opacity-50"
          >
            <Check size={13} />
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete Confirm Modal ───────────────────────────────────────────────────
function DeleteModal({ name, onConfirm, onClose }: { name: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45"
      onClick={onClose}
    >
      <div
        className="flex flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-white"
        style={{ width: 400 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-5">
          <div className="text-[15px] font-medium text-[#111110] mb-1">Supprimer le produit</div>
          <div className="text-[13px] text-[#6b6a66]">
            Voulez-vous vraiment supprimer <span className="font-medium text-[#111110]">«{name}»</span> ? Cette action est irréversible.
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-black/[0.08] px-5 py-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="rounded-[9px] border border-black/[0.1] bg-white px-4 py-2 text-[12px] font-medium text-[#6b6a66] hover:bg-[#f0efe9] cursor-pointer"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="rounded-[9px] bg-[#c0392b] px-4 py-2 text-[12px] font-medium text-white hover:opacity-80 cursor-pointer border-none"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export function ProductsPage() {
  const { products, addProduct, updateProduct } = useAppStore()

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Modal state
  const [refsModal, setRefsModal] = useState<Product | null>(null)
  const [formModal, setFormModal] = useState<{ open: boolean; product: Product | null }>({ open: false, product: null })
  const [deleteModal, setDeleteModal] = useState<Product | null>(null)

  // Filtered + sorted products
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return products.filter(p => {
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
      const matchCat = catFilter === 'all' || p.category === catFilter
      return matchSearch && matchCat
    })
  }, [products, search, catFilter])

  // Stats
  const totalProducts = products.length
  const totalRefs = products.reduce((s, p) => s + p.refs.length, 0)
  const totalStock = products.reduce((s, p) => s + p.refs.reduce((ss, r) => ss + r.stock, 0), 0)

  const openCreate = () => setFormModal({ open: true, product: null })
  const openEdit = (p: Product) => setFormModal({ open: true, product: p })
  const closeForm = () => setFormModal({ open: false, product: null })

  const handleSave = async (f: FormState) => {
    if (formModal.product) {
      // Edit: preserve existing ref ids and stocks where possible
      const existingRefs = formModal.product.refs
      const updatedRefs: RefStock[] = f.refs.map(r => {
        const existing = existingRefs.find(er => er.id === r._id)
        if (existing) {
          return { ...existing, name: r.name.trim() }
        }
        return { id: r._id, name: r.name.trim(), stock: 0, initial: 0, added: 0, sorti: 0, amount: 0, prixVente: 0 }
      })
      await updateProduct({
        ...formModal.product,
        name: f.name.trim(),
        category: f.category,
        refs: updatedRefs,
      })
    } else {
      const newRefs: RefStock[] = f.refs.map(r => ({
        id: r._id, name: r.name.trim(),
        stock: 0, initial: 0, added: 0, sorti: 0, amount: 0, prixVente: 0,
      }))
      await addProduct({ name: f.name.trim(), category: f.category, refs: newRefs })
    }
  }

  const handleDelete = (p: Product) => {
    setDeleteModal(p)
  }

  const confirmDelete = () => {
    if (!deleteModal) return
    const id = deleteModal.id
    useAppStore.setState(s => ({ products: s.products.filter(p => p.id !== id) }))
    setDeleteModal(null)
  }

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.07] bg-[#f5f4f0] flex-shrink-0">
        <div>
          <h1 className="text-[17px] font-semibold text-[#111110]">Produits</h1>
          <p className="text-[12px] text-[#a8a7a2] mt-0.5">Catalogue de tous les produits</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-[10px] bg-[#1a1a18] px-3.5 py-2 text-[12px] font-medium text-[#f5f4f0] hover:opacity-80 cursor-pointer border-none"
        >
          <Plus size={13} />
          Nouveau produit
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-3 px-6 py-3 border-b border-black/[0.07] bg-[#f5f4f0] flex-shrink-0">
        {[
          { label: 'Produits', value: fmt(totalProducts) },
          { label: 'Références', value: fmt(totalRefs) },
          { label: 'Stock total', value: fmt(totalStock) },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-2 rounded-[10px] border border-black/[0.08] bg-white px-3.5 py-2">
            <span className="text-[18px] font-semibold text-[#111110] font-mono">{s.value}</span>
            <span className="text-[11px] text-[#a8a7a2]">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-black/[0.08] bg-white px-3 py-2">
        {/* Category — select on mobile, pills on desktop */}
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="sm:hidden rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2 py-1.5 text-[12px] font-medium outline-none text-[#1a1a18]">
          <option value="all">Toutes catégories</option>
          {CATS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="hidden sm:flex items-center gap-1.5">
          <button onClick={() => setCatFilter('all')}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium cursor-pointer border-none transition-colors ${
              catFilter === 'all' ? 'bg-[#1a1a18] text-[#f5f4f0]' : 'bg-[#f0efe9] text-[#6b6a66] hover:bg-[#e8e7e1]'
            }`}>
            Tous
          </button>
          {CATS.map(c => (
            <button key={c} onClick={() => setCatFilter(c)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium cursor-pointer border-none transition-colors ${
                catFilter === c ? 'text-white' : 'bg-[#f0efe9] text-[#6b6a66] hover:bg-[#e8e7e1]'
              }`}
              style={catFilter === c ? { backgroundColor: CAT_COLORS[c] } : {}}>
              {c}
            </button>
          ))}
        </div>
        {/* Search */}
        <div className="flex flex-1 items-center gap-1.5 rounded-[8px] border border-black/[0.08] bg-[#f0efe9] px-2.5 py-1.5 ml-auto max-w-[180px]">
          <Search size={12} className="flex-shrink-0 text-[#a8a7a2]"/>
          <input
            className="w-full bg-transparent text-[12px] outline-none placeholder:text-[#a8a7a2]"
            placeholder="Chercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ background: 'linear-gradient(180deg,#eef5ff 0%,#f5f9ff 100%)' }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Tag size={32} className="text-[#a8a7a2] mb-3" />
            <div className="text-[14px] font-medium text-[#6b6a66]">Aucun produit trouvé</div>
            <div className="text-[12px] text-[#a8a7a2] mt-1">
              {search || catFilter !== 'all' ? 'Modifiez vos filtres' : 'Créez votre premier produit'}
            </div>
          </div>
        ) : (
          <div className="rounded-[12px] border border-black/[0.08] bg-white overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-black/[0.07] bg-[#f8f7f3]">
                  <th className="px-4 py-3 text-left font-medium text-[#6b6a66] w-6"></th>
                  <th className="px-4 py-3 text-left font-medium text-[#6b6a66]">Produit</th>
                  <th className="px-4 py-3 text-left font-medium text-[#6b6a66]">Catégorie</th>
                  <th className="px-4 py-3 text-right font-medium text-[#6b6a66]">Réfs</th>
                  <th className="px-4 py-3 text-right font-medium text-[#6b6a66]">Stock total</th>
                  <th className="px-4 py-3 text-right font-medium text-[#6b6a66]"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const totalStockP = p.refs.reduce((s, r) => s + r.stock, 0)
                  const isExpanded = expandedId === p.id

                  return (
                    <>
                      <tr
                        key={p.id}
                        className={`border-b border-black/[0.05] transition-colors ${
                          i % 2 === 0 ? 'bg-white' : 'bg-[#fafaf8]'
                        } hover:bg-[#f5f4f0]`}
                      >
                        {/* Expand toggle */}
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleExpand(p.id)}
                            className="flex h-5 w-5 items-center justify-center rounded-md bg-[#f0efe9] border-none cursor-pointer hover:opacity-80"
                          >
                            {isExpanded ? (
                              <ChevronUp size={11} className="text-[#6b6a66]" />
                            ) : (
                              <ChevronDown size={11} className="text-[#6b6a66]" />
                            )}
                          </button>
                        </td>

                        {/* Name */}
                        <td className="px-4 py-3">
                          <button
                            className="text-left font-medium text-[#111110] hover:text-[#1a5fa8] cursor-pointer bg-transparent border-none p-0"
                            onClick={() => setRefsModal(p)}
                          >
                            {p.name}
                          </button>
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3">
                          <CatBadge cat={p.category} />
                        </td>

                        {/* Refs count */}
                        <td className="px-4 py-3 text-right font-mono text-[#6b6a66]">
                          {p.refs.length}
                        </td>

                        {/* Total stock */}
                        <td className="px-4 py-3 text-right font-mono text-[#1a7a4a]">
                          {fmt(totalStockP)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(p)}
                              className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-[#f0efe9] border-none cursor-pointer hover:opacity-80"
                              title="Modifier"
                            >
                              <Edit2 size={11} className="text-[#6b6a66]" />
                            </button>
                            <button
                              onClick={() => handleDelete(p)}
                              className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-[#fdecea] border-none cursor-pointer hover:opacity-80"
                              title="Supprimer"
                            >
                              <Trash2 size={11} className="text-[#c0392b]" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded refs */}
                      {isExpanded && p.refs.length > 0 && (
                        <tr key={`${p.id}-expanded`} className="border-b border-black/[0.05] bg-[#f8f7f3]">
                          <td colSpan={6} className="px-6 pb-3 pt-1">
                            <div className="rounded-[9px] border border-black/[0.06] bg-white overflow-hidden">
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="border-b border-black/[0.06] bg-[#f0efe9]">
                                    <th className="px-4 py-2 text-left font-medium text-[#6b6a66]">Référence</th>
                                    <th className="px-4 py-2 text-right font-medium text-[#6b6a66]">Stock</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.refs.map((r, ri) => (
                                    <tr
                                      key={r.id}
                                      className={`border-b border-black/[0.04] last:border-0 ${
                                        ri % 2 === 0 ? 'bg-white' : 'bg-[#fafaf8]'
                                      }`}
                                    >
                                      <td className="px-4 py-2 font-medium text-[#111110]">{r.name}</td>
                                      <td className="px-4 py-2 text-right font-mono text-[#1a7a4a]">{fmt(r.stock)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {refsModal && (
        <RefsModal product={refsModal} onClose={() => setRefsModal(null)} />
      )}

      {formModal.open && (
        <FormModal
          initial={formModal.product ? productToForm(formModal.product) : emptyForm()}
          onClose={closeForm}
          onSave={handleSave}
        />
      )}

      {deleteModal && (
        <DeleteModal
          name={deleteModal.name}
          onConfirm={confirmDelete}
          onClose={() => setDeleteModal(null)}
        />
      )}
    </div>
  )
}
