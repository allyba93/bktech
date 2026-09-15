import { create } from 'zustand'
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDocs, onSnapshot, serverTimestamp, query, orderBy, writeBatch, where, runTransaction,
} from 'firebase/firestore'
import { db } from '@/firebase/config'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Statut = 'preparation' | 'confirme' | 'production' | 'en_chemin' | 'livre'

export interface RefStock {
  id: string; name: string; stock: number
  initial:    number   // stock at first receipt / creation
  added:      number   // cumulative added via deliveries
  sorti:      number   // cumulative sold
  amount:     number   // total revenue from sales
  prixVente:  number   // selling price (set at reception or product creation)
  prixAchat?: number   // last known purchase cost per unit
}
export interface Product {
  id: string; name: string; category: string; refs: RefStock[]
  lastCount?: { qty: number; date: string; time: string }
}

export interface PayMode { mode: string; amount: number }
export interface CmdLigne { ref: string; qte: number; pu: number; total: number }
export interface Commande {
  id: string; date: string; total: number; paid: number
  produit: string; lignes: CmdLigne[]; payModes: PayMode[]
}
export interface EnCours {
  id: string; produit: string; category: string; statut: Statut
  totalCmd: number; totalPaye: number; lignes: CmdLigne[]
  dateCmd: string; dateEst: string; transport?: number; prixRevient?: number
}
export interface FournPayment { date: string; desc: string; amount: number; modes: PayMode[] }
export interface Fournisseur {
  id: string; nom: string; cat: string; tel: string; email: string
  pays: string; delai: number; notes: string
  commandes: Commande[]; payments: FournPayment[]; encours: EnCours[]
}

export interface TxLine { desc: string; qty: number; pu: number; total: number; productId?: string; refId?: string; productName?: string }

export interface Tx {
  id: string; date: string; time?: string; total: number; paid: number
  lines: TxLine[]; payModes: PayMode[]
  sortedLines?: boolean[]
}
export interface ClientPaymentRec {
  date: string; desc: string; amount: number; modes: PayMode[]
  // Renseigné pour une imputation d'avoir : lie l'écriture au mouvement d'avoir,
  // afin que sa suppression retire aussi cette ligne (ces enregistrements n'ont
  // pas d'identifiant propre, un appariement par date/libellé serait fragile).
  avanceId?: string
}
export interface AvanceMvt {
  id: string; date: string; time: string
  // 'imputation' : l'avoir éteint une dette existante au lieu d'être versé en
  // espèces. Aucun mouvement de caisse — l'argent n'a jamais bougé.
  type: 'depot' | 'facture' | 'versement' | 'achat' | 'imputation'
  dir: 'credit' | 'debit'
  montant: number; desc: string; modes: PayMode[]
  lines?: { desc: string; productName: string; qty: number; pu: number; total: number }[]
  // Détail par facture, indispensable pour pouvoir annuler l'imputation.
  imputations?: { txId: string; montant: number }[]
}
export interface Client {
  id: string; prenom: string; nom: string; tel: string; ville: string
  email: string; type: string; credit: number; notes: string
  transactions: Tx[]; payments: ClientPaymentRec[]; avances?: AvanceMvt[]
}

export interface CashMvt {
  id: string; date: string; time: string; type: string; dir: string
  desc: string; cat: string; montant: number; modes: PayMode[]
}

export interface Category {
  id: string; name: string; samePrice: boolean
}


export interface EpargneMvt {
  id: string; date: string; time: string
  dir: 'entree' | 'sortie'
  montant: number; desc: string; cat: string
  modes: PayMode[]
}

export interface DettePayment {
  id: string; date: string; montant: number; desc: string; modes: PayMode[]
  type?: 'ajout' | 'versement'
  ajoutId?: string
  editedBy?: string; editedAt?: string; prevMontant?: number
  deleted?: boolean; deletedBy?: string; deletedAt?: string
}
export interface DetteDiverse {
  id: string; nom: string; montant: number; paid: number; notes: string
  payments: DettePayment[]
  currency?: 'MRU' | 'CFA'
}

export interface DraftLine {
  desc: string; productName?: string; qty: number; pu: number; total: number
  picked: boolean; productId?: string; refId?: string
}
export interface DraftInvoice {
  id: string; date: string; clientName: string; clientId?: string | null
  total: number; paid: number; payModes: PayMode[]; lines: DraftLine[]
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface AppState {
  // Data
  products:        Product[]
  categories:      Category[]
  fournisseurs:    Fournisseur[]
  clients:         Client[]
  cashMvts:        CashMvt[]
  ventesComptoir:  Tx[]
  ouverture:       number
  boutiqueFermee:  boolean
  soldeEpargne:    number
  epargneMvts:     EpargneMvt[]
  dettesDiverses:  DetteDiverse[]
  draftInvoices:   DraftInvoice[]

  // Loading
  loaded: boolean

  // Actions — Categories
  addCategory:    (c: Omit<Category, 'id'>) => Promise<string>
  updateCategory: (c: Category) => Promise<void>
  deleteCategory: (id: string) => Promise<void>

  // Actions — Products
  setProducts:      (p: Product[]) => void
  addProduct:       (p: Omit<Product, 'id'>) => Promise<string>
  updateProduct:    (p: Product) => Promise<void>
  deleteProduct:    (id: string) => Promise<void>
  updateStockRef:   (productId: string, refId: string, delta: number, saleInfo?: { qty: number; amount: number }) => void
  setProductCount:  (productId: string, qty: number) => Promise<void>

  // Actions — Fournisseurs
  setFournisseurs:  (f: Fournisseur[]) => void
  addFournisseur:   (f: Omit<Fournisseur, 'id'>) => Promise<string>
  updateFournisseur:(f: Fournisseur) => Promise<void>
  addCommande:      (fournId: string, cmd: Omit<Commande, 'id'>) => Promise<void>
  addEnCours:       (fournId: string, enc: Omit<EnCours, 'id'>) => Promise<void>
  updateEnCours:    (fournId: string, enc: EnCours) => Promise<void>
  livrerEncours:    (fournId: string, encId: string, transport: number, prixVentes: Record<string, number>) => Promise<void>
  payFourn:         (fournId: string, amounts: Record<string, number>, note: string, cmdId?: string) => Promise<void>

  // Actions — Clients
  setClients:       (c: Client[]) => void
  addClient:        (c: Omit<Client, 'id'>) => Promise<string>
  updateClient:     (c: Client) => Promise<void>
  addVente:         (clientId: string | null, tx: Omit<Tx, 'id'>, lines: TxLine[], payModes: PayMode[]) => Promise<string>
  annulerVente:     (txId: string, clientId: string | null) => Promise<Tx | null>
  deleteVente:      (txId: string, clientId: string | null) => Promise<void>
  payClient:        (clientId: string, amounts: Record<string, number>, note: string) => Promise<void>
  addClientAvance:    (clientId: string, mvt: Omit<AvanceMvt, 'id'>) => Promise<string>
  imputeAvoir:        (clientId: string, allocations: { txId: string; montant: number }[], desc: string) => Promise<void>
  updateClientAvance: (clientId: string, mvt: AvanceMvt) => Promise<void>
  deleteClientAvance: (clientId: string, mvtId: string) => Promise<void>

  // Actions — Cash
  setCashMvts:         (m: CashMvt[]) => void
  addCashMvt:          (m: Omit<CashMvt, 'id'>) => Promise<void>
  updateCashMvt:       (m: CashMvt) => Promise<void>
  deleteCashMvt:       (id: string) => Promise<void>
  setOuverture:        (n: number) => Promise<void>
  setBoutiqueFermee:   (v: boolean) => Promise<void>

  // Actions — Ventes comptoir
  setVentesComptoir: (v: Tx[]) => void
  toggleTxLineSortie:  (txId: string, lineIdx: number) => Promise<void>
  validateTxSortie:    (txId: string) => Promise<void>
  payTxDirect:         (txId: string, modes: PayMode[]) => Promise<void>
  updateTx:            (txId: string, clientId: string | null, lines: TxLine[], total: number, payModes?: PayMode[]) => Promise<void>

  // Actions — Caisse épargne
  addEpargneMvt:    (m: Omit<EpargneMvt, 'id'>) => Promise<void>
  setSoldeEpargne:  (n: number) => Promise<void>

  // Actions — Dettes diverses
  addDetteDiverse:    (d: Omit<DetteDiverse, 'id' | 'paid' | 'payments'>) => Promise<void>
  editDetteDiverse:   (id: string, nom: string, notes: string, currency: 'MRU' | 'CFA', montant: number) => Promise<void>
  addDetteMontant:    (id: string, montant: number, desc: string) => Promise<void>
  payDetteDiverse:    (detteId: string, montant: number, modes: PayMode[], desc: string, ajoutId?: string) => Promise<void>
  editDetteAjout:     (detteId: string, ajoutId: string, newMontant: number, newDesc: string, by: string) => Promise<void>
  deleteDetteAjout:   (detteId: string, ajoutId: string, by: string) => Promise<void>
  deleteDetteDiverse: (id: string) => Promise<void>

  // Actions — Draft Invoices (Bons de sortie)
  addDraftInvoice:      (d: Omit<DraftInvoice, 'id'>) => Promise<string>
  toggleDraftLine:      (draftId: string, lineIdx: number) => Promise<void>
  validateDraftInvoice: (draftId: string) => Promise<void>
  deleteDraftInvoice:   (draftId: string) => Promise<void>

  // Admin
  recalculateStockFromSortie: () => Promise<{ updated: number; totalSorti: number }>

  // Init
  setLoaded:        (v: boolean) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const todayStr = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}
const nowTime = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2)
const nowDateTime = () => `${todayStr()} ${nowTime()}`

const CHANNELS = ['Cash','Bankily','Masravi','Seddad','Bimban'] as const

// ─── Firestore helpers ────────────────────────────────────────────────────────
const COL = {
  products:        'products',
  categories:      'categories',
  fournisseurs:    'fournisseurs',
  clients:         'clients',
  cashMvts:        'cashMvts',
  ventesComptoir:  'ventesComptoir',
  epargneMvts:     'epargneMvts',
  dettesDiverses:  'dettesDiverses',
  draftInvoices:   'draftInvoices',
  settings:        'settings',
}

// Firestore stores fournisseurs/clients as single docs with embedded arrays
// (simpler for this app size — no need for sub-collections)

async function saveFournisseur(f: Fournisseur) {
  const { id, ...data } = f
  // New document: id is empty or temp
  if (!id || id === '' || id.startsWith('tmp_') || id.startsWith('new_')) {
    const ref = await addDoc(collection(db, COL.fournisseurs), { ...data, updatedAt: serverTimestamp() })
    return ref.id
  }
  // Update existing
  await updateDoc(doc(db, COL.fournisseurs, id), { ...data, updatedAt: serverTimestamp() })
  return id
}

async function saveClient(c: Client) {
  const { id, ...data } = c
  if (!id || id === '' || id.startsWith('tmp_') || id.startsWith('new_')) {
    const ref = await addDoc(collection(db, COL.clients), { ...data, updatedAt: serverTimestamp() })
    return ref.id
  }
  await updateDoc(doc(db, COL.clients, id), { ...data, updatedAt: serverTimestamp() })
  return id
}

async function saveProduct(p: Product) {
  const { id, ...data } = p
  if (!id || id.startsWith('tmp_') || id.startsWith('new_') || id.length < 10) {
    const ref = await addDoc(collection(db, COL.products), { ...data, updatedAt: serverTimestamp() })
    return ref.id
  }
  await updateDoc(doc(db, COL.products, id), { ...data, updatedAt: serverTimestamp() })
  return id
}

// ─── Store implementation ─────────────────────────────────────────────────────
export const useAppStore = create<AppState>((set, get) => ({
  products:        [],
  categories:      [],
  fournisseurs:    [],
  clients:         [],
  cashMvts:        [],
  ventesComptoir:  [],
  epargneMvts:     [],
  dettesDiverses:  [],
  draftInvoices:   [],
  ouverture:       0,
  boutiqueFermee:  false,
  soldeEpargne:    0,
  loaded:          false,

  setProducts:          (products) => set({ products }),
  setFournisseurs:      (fournisseurs) => set({ fournisseurs }),
  setClients:           (clients) => set({ clients }),
  setCashMvts:          (cashMvts) => set({ cashMvts }),
  setVentesComptoir:    (ventesComptoir) => set({ ventesComptoir }),
  setBoutiqueFermee: async (v) => {
    set({ boutiqueFermee: v })
    await updateDoc(doc(db, COL.settings, 'caisse'), { boutiqueFermee: v }).catch(async () => {
      const { setDoc } = await import('firebase/firestore')
      await setDoc(doc(db, COL.settings, 'caisse'), { boutiqueFermee: v })
    })
  },

  setOuverture: async (n) => {
    set({ ouverture: n })
    await updateDoc(doc(db, COL.settings, 'caisse'), { ouverture: n }).catch(async () => {
      // Doc may not exist yet — create it
      const { setDoc } = await import('firebase/firestore')
      await setDoc(doc(db, COL.settings, 'caisse'), { ouverture: n })
    })
  },
  setLoaded:            (v) => set({ loaded: v }),

  // ── Categories ─────────────────────────────────────────────────────────────
  addCategory: async (data) => {
    const tempId = 'tmp_' + genId()
    const c: Category = { ...data, id: tempId }
    set(s => ({ categories: [...s.categories, c] }))
    try {
      const ref = await addDoc(collection(db, COL.categories), { ...data, createdAt: serverTimestamp() })
      set(s => ({ categories: s.categories.map(x => x.id === tempId ? { ...x, id: ref.id } : x) }))
      return ref.id
    } catch (err) {
      set(s => ({ categories: s.categories.filter(x => x.id !== tempId) }))
      throw err
    }
  },
  updateCategory: async (c) => {
    set(s => ({ categories: s.categories.map(x => x.id === c.id ? c : x) }))
    const { id, ...data } = c
    await updateDoc(doc(db, COL.categories, id), data)
  },
  deleteCategory: async (id) => {
    set(s => ({ categories: s.categories.filter(x => x.id !== id) }))
    await deleteDoc(doc(db, COL.categories, id))
  },

  // ── Products CRUD ──────────────────────────────────────────────────────────
  addProduct: async (data) => {
    const tempId = 'tmp_' + genId()
    const p: Product = { ...data, id: tempId }
    set(s => ({ products: [p, ...s.products] }))
    try {
      const realId = await saveProduct(p)
      set(s => ({ products: s.products.map(x => x.id === tempId ? { ...x, id: realId } : x) }))
      return realId
    } catch (err) {
      set(s => ({ products: s.products.filter(x => x.id !== tempId) }))
      throw err
    }
  },

  updateProduct: async (p) => {
    set(s => ({ products: s.products.map(x => x.id === p.id ? p : x) }))
    await saveProduct(p)
  },

  deleteProduct: async (id) => {
    set(s => ({ products: s.products.filter(x => x.id !== id) }))
    await deleteDoc(doc(db, COL.products, id))
  },

  // ── Stock ──────────────────────────────────────────────────────────────────
  updateStockRef: (productId, refId, delta, saleInfo) => {
    const products = get().products.map(p => {
      if (p.id !== productId) return p
      return {
        ...p,
        refs: p.refs.map(r => {
          if (r.id !== refId) return r
          const newStock = Math.max(0, r.stock + delta)
          if (saleInfo) {
            return {
              ...r, stock: newStock,
              sorti:  (r.sorti  ?? 0) + saleInfo.qty,
              amount: (r.amount ?? 0) + saleInfo.amount,
            }
          }
          // Manual adjustment: track in `added` (positive = add, negative = remove)
          return { ...r, stock: newStock, added: (r.added ?? 0) + delta }
        })
      }
    })
    set({ products })
    const prod = products.find(p => p.id === productId)
    if (prod) saveProduct(prod)
  },

  setProductCount: async (productId, qty) => {
    const count = { qty, date: todayStr(), time: nowTime() }
    const products = get().products.map(p => p.id !== productId ? p : { ...p, lastCount: count })
    set({ products })
    const prod = products.find(p => p.id === productId)
    if (prod) await saveProduct(prod)
  },

  // ── Fournisseurs ───────────────────────────────────────────────────────────
  addFournisseur: async (data) => {
    // 1. Optimistic: add to local store immediately with temp id
    const tempId = 'tmp_' + genId()
    const f: Fournisseur = { ...data, id: tempId, commandes: [], payments: [], encours: [] }
    set(s => ({ fournisseurs: [...s.fournisseurs, f] }))
    try {
      // 2. Save to Firestore — get real id
      const realId = await saveFournisseur({ ...f, id: '' })
      // 3. Replace temp with real id
      set(s => ({ fournisseurs: s.fournisseurs.map(x => x.id === tempId ? { ...x, id: realId } : x) }))
      return realId
    } catch (err) {
      // 4. On error: remove temp and rethrow
      console.error('addFournisseur error:', err)
      set(s => ({ fournisseurs: s.fournisseurs.filter(x => x.id !== tempId) }))
      throw err
    }
  },

  updateFournisseur: async (f) => {
    set(s => ({ fournisseurs: s.fournisseurs.map(x => x.id === f.id ? f : x) }))
    await saveFournisseur(f)
  },

  addCommande: async (fournId, cmd) => {
    const fourn = get().fournisseurs.find(f => f.id === fournId)
    if (!fourn) return
    const newCmd = { ...cmd, id: 'C-' + genId().slice(0,6).toUpperCase() }
    const updated = { ...fourn, commandes: [newCmd, ...fourn.commandes] }
    set(s => ({ fournisseurs: s.fournisseurs.map(f => f.id === fournId ? updated : f) }))
    await saveFournisseur(updated)
  },

  addEnCours: async (fournId, enc) => {
    const fourn = get().fournisseurs.find(f => f.id === fournId)
    if (!fourn) return
    const newEnc = { ...enc, id: 'EC-' + genId().slice(0,6).toUpperCase() }
    const updated = { ...fourn, encours: [...fourn.encours, newEnc] }
    set(s => ({ fournisseurs: s.fournisseurs.map(f => f.id === fournId ? updated : f) }))
    await saveFournisseur(updated)
  },

  updateEnCours: async (fournId, enc) => {
    const fourn = get().fournisseurs.find(f => f.id === fournId)
    if (!fourn) return
    const updated = { ...fourn, encours: fourn.encours.map(e => e.id === enc.id ? enc : e) }
    set(s => ({ fournisseurs: s.fournisseurs.map(f => f.id === fournId ? updated : f) }))
    await saveFournisseur(updated)
  },

  livrerEncours: async (fournId, encId, transport, prixVentes) => {
    const fourn = get().fournisseurs.find(f => f.id === fournId)
    if (!fourn) return
    const enc = fourn.encours.find(e => e.id === encId)
    if (!enc) return

    // Transport per unit spread evenly across all units in the order
    const totalQte = enc.lignes.reduce((s, l) => s + l.qte, 0)
    const transportU = totalQte > 0 && transport > 0 ? transport / totalQte : 0

    // Update commande lignes.pu to include transport share — so refCostMap stays correct
    const updCommandes = fourn.commandes.map(cmd => {
      if (cmd.produit !== enc.produit) return cmd
      return {
        ...cmd,
        lignes: cmd.lignes.map(l => {
          const inEnc = enc.lignes.find(el => el.ref === l.ref)
          if (!inEnc) return l
          return { ...l, pu: l.pu + transportU }
        })
      }
    })

    // Transport is paid separately from épargne — does NOT affect fournisseur debt total
    const updated = { ...fourn, commandes: updCommandes, encours: fourn.encours.filter(e => e.id !== encId) }
    set(s => ({ fournisseurs: s.fournisseurs.map(f => f.id === fournId ? updated : f) }))
    await saveFournisseur(updated)

    // Create or update product in stock
    const existingProduct = get().products.find(p => p.name === enc.produit)
    if (existingProduct) {
      const updatedRefs = existingProduct.refs.map(r => {
        const ligne = enc.lignes.find(l => l.ref === r.name)
        if (!ligne) return r
        const pv = prixVentes[r.name] ?? r.prixVente ?? 0
        return { ...r, stock: r.stock + ligne.qte, added: (r.added ?? 0) + ligne.qte, prixVente: pv || r.prixVente || 0, prixAchat: ligne.pu + transportU }
      })
      enc.lignes.forEach(l => {
        if (!existingProduct.refs.find(r => r.name === l.ref)) {
          updatedRefs.push({ id: 'r' + genId(), name: l.ref, stock: l.qte, initial: l.qte, added: 0, sorti: 0, amount: 0, prixVente: prixVentes[l.ref] ?? 0, prixAchat: l.pu + transportU })
        }
      })
      await get().updateProduct({ ...existingProduct, refs: updatedRefs })
    } else {
      await get().addProduct({
        name: enc.produit,
        category: enc.category ?? '',
        refs: enc.lignes.map(l => ({ id: 'r' + genId(), name: l.ref, stock: l.qte, initial: l.qte, added: 0, sorti: 0, amount: 0, prixVente: prixVentes[l.ref] ?? 0, prixAchat: l.pu + transportU })),
      })
    }

    // Transport deducted from caisse épargne
    if (transport > 0) {
      await get().addEpargneMvt({
        date: todayStr(), time: nowTime(),
        dir: 'sortie',
        desc: `Transport — ${enc.produit}`,
        cat: 'Transport', montant: transport,
        modes: [{ mode: 'Cash', amount: transport }]
      })
    }
  },

  payFourn: async (fournId, amounts, note, cmdId) => {
    const fourn = get().fournisseurs.find(f => f.id === fournId)
    if (!fourn) return
    const total = Object.values(amounts).reduce((s, v) => s + v, 0)
    const modesUsed = CHANNELS.filter(ch => (amounts[ch] ?? 0) > 0).map(ch => ({ mode: ch, amount: amounts[ch] }))
    const modeRem: Record<string, number> = {}
    modesUsed.forEach(m => { modeRem[m.mode] = m.amount })
    let totalRem = total

    const updCmds = fourn.commandes.map(cmd => {
      // Si cmdId précisé, ne payer que cette commande — sinon FIFO sur toutes
      if (cmdId && cmd.id !== cmdId) return cmd
      const due = cmd.total - cmd.paid
      if (due <= 0 || totalRem <= 0) return cmd
      const pay = Math.min(due, totalRem); totalRem -= pay
      let left = pay
      const newModes = [...cmd.payModes]
      modesUsed.forEach(m => {
        const avail = modeRem[m.mode] ?? 0
        if (avail > 0 && left > 0) {
          const share = Math.min(avail, left)
          modeRem[m.mode] = avail - share; left -= share
          const ex = newModes.find(p => p.mode === m.mode)
          if (ex) ex.amount += share; else newModes.push({ mode: m.mode, amount: share })
        }
      })
      return { ...cmd, paid: cmd.paid + pay, payModes: newModes }
    })

    const newPay: FournPayment = { date: todayStr(), desc: note, amount: total, modes: modesUsed }

    // Recalcule totalPaye de chaque encours depuis les commandes mises à jour
    const updEnCours = fourn.encours.map(enc => {
      const paye = updCmds
        .filter(cmd => cmd.produit === enc.produit)
        .reduce((s, cmd) => s + cmd.paid, 0)
      return { ...enc, totalPaye: Math.min(enc.totalCmd, paye) }
    })

    const updated = { ...fourn, commandes: updCmds, encours: updEnCours, payments: [newPay, ...fourn.payments] }
    set(s => ({ fournisseurs: s.fournisseurs.map(f => f.id === fournId ? updated : f) }))
    await saveFournisseur(updated)

    // Fournisseur payments deducted from caisse épargne
    await get().addEpargneMvt({
      date: todayStr(), time: nowTime(),
      dir: 'sortie',
      desc: `${note} — ${fourn.nom}`,
      cat: 'Paiement fournisseur', montant: total,
      modes: modesUsed,
    })
  },

  // ── Clients ────────────────────────────────────────────────────────────────
  addClient: async (data) => {
    const tempId = 'tmp_' + genId()
    const c: Client = { ...data, id: tempId, transactions: [], payments: [] }
    set(s => ({ clients: [...s.clients, c] }))
    try {
      const realId = await saveClient({ ...c, id: '' })
      set(s => ({ clients: s.clients.map(x => x.id === tempId ? { ...x, id: realId } : x) }))
      return realId
    } catch (err) {
      console.error('addClient error:', err)
      set(s => ({ clients: s.clients.filter(x => x.id !== tempId) }))
      throw err
    }
  },

  updateClient: async (c) => {
    set(s => ({ clients: s.clients.map(x => x.id === c.id ? c : x) }))
    await saveClient(c)
  },

  addVente: async (clientId, tx, lines, payModes) => {
    const _d = new Date()
    const yymmdd = _d.getFullYear().toString().slice(2) + String(_d.getMonth()+1).padStart(2,'0') + String(_d.getDate()).padStart(2,'0')
    const todayPrefix = `F-${yymmdd}-`
    const counterRef = doc(db, COL.settings, `counter-${yymmdd}`)
    let seq = 1
    await runTransaction(db, async (t) => {
      const snap = await t.get(counterRef)
      seq = snap.exists() ? (snap.data().seq as number) + 1 : 1
      t.set(counterRef, { seq })
    })
    const txId = `${todayPrefix}${seq}`
    const total = lines.reduce((s, l) => s + l.total, 0)
    const paid  = payModes.filter(m => m.mode !== 'Crédit').reduce((s, m) => s + m.amount, 0)
    const newTx: Tx = { ...tx, id: txId, time: nowTime(), total, paid, lines, payModes }

    // Update client or save as anonymous comptoir sale
    if (clientId) {
      const client = get().clients.find(c => c.id === clientId)
      if (client) {
        const updated = { ...client, transactions: [newTx, ...client.transactions] }
        set(s => ({ clients: s.clients.map(c => c.id === clientId ? updated : c) }))
        await saveClient(updated)
      }
    } else {
      // Anonymous sale — persist to ventesComptoir collection
      set(s => ({ ventesComptoir: [newTx, ...s.ventesComptoir] }))
      await addDoc(collection(db, COL.ventesComptoir), { ...newTx, createdAt: serverTimestamp() })
    }

    // Decrement stock immediately at sale creation so all devices see updated stock via Firestore
    for (const l of lines) {
      if (l.productId && l.refId) {
        get().updateStockRef(l.productId, l.refId, -l.qty, { qty: l.qty, amount: l.total })
      }
    }

    const clientName = clientId ? (get().clients.find(c => c.id === clientId)?.prenom ?? '') : ''
    const mvtDesc = `Vente ${txId}${clientName ? ' — ' + clientName : ''}`

    // Single cash movement grouping all paid modes (Crédit and Avance excluded)
    const cashModes = payModes.filter(m => m.mode !== 'Crédit' && m.mode !== 'Avance' && m.amount > 0)
    if (cashModes.length > 0) {
      const montantTotal = cashModes.reduce((s, m) => s + m.amount, 0)
      await get().addCashMvt({
        date: todayStr(), time: nowTime(),
        type: 'vente', dir: 'entree',
        desc: mvtDesc, cat: 'Vente POS', montant: montantTotal,
        modes: cashModes,
      })
    }

    return txId
  },

  annulerVente: async (txId, clientId) => {
    let tx: Tx | undefined
    if (clientId) {
      const client = get().clients.find(c => c.id === clientId)
      if (!client) return null
      tx = client.transactions.find(t => t.id === txId)
      if (!tx) return null
      const updated = { ...client, transactions: client.transactions.filter(t => t.id !== txId) }
      set(s => ({ clients: s.clients.map(c => c.id === clientId ? updated : c) }))
      await saveClient(updated)
    } else {
      tx = get().ventesComptoir.find(t => t.id === txId)
      if (!tx) return null
      set(s => ({ ventesComptoir: s.ventesComptoir.filter(t => t.id !== txId) }))
      try {
        const q = query(collection(db, COL.ventesComptoir), where('id', '==', txId))
        const snap = await getDocs(q)
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
      } catch (e) {
        console.error('annulerVente delete error:', e)
      }
    }
    // Always restore stock — it was decremented at sale creation for all lines
    tx.lines.forEach(l => {
      if (!l.productId || !l.refId) return
      get().updateStockRef(l.productId, l.refId, +l.qty, { qty: -l.qty, amount: -l.total })
    })
    // Remove original cash movements (cleaner than adding reversal lines)
    const toDelete = get().cashMvts.filter(m => m.desc.includes(txId))
    set(s => ({ cashMvts: s.cashMvts.filter(m => !m.desc.includes(txId)) }))
    await Promise.all(toDelete.map(m => deleteDoc(doc(db, COL.cashMvts, m.id))))
    return tx
  },

  deleteVente: async (txId, clientId) => {
    let tx: Tx | undefined
    if (clientId) {
      const client = get().clients.find(c => c.id === clientId)
      if (!client) return
      tx = client.transactions.find(t => t.id === txId)
      if (!tx) return
      const updated = { ...client, transactions: client.transactions.filter(t => t.id !== txId) }
      set(s => ({ clients: s.clients.map(c => c.id === clientId ? updated : c) }))
      await saveClient(updated)
    } else {
      tx = get().ventesComptoir.find(t => t.id === txId)
      if (!tx) return
      set(s => ({ ventesComptoir: s.ventesComptoir.filter(t => t.id !== txId) }))
      const snap = await getDocs(query(collection(db, COL.ventesComptoir), where('id', '==', txId)))
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
    }
    // Always restore stock — it was decremented at sale creation for all lines
    tx.lines.forEach(l => {
      if (!l.productId || !l.refId) return
      get().updateStockRef(l.productId, l.refId, +l.qty, { qty: -l.qty, amount: -l.total })
    })
    // Delete associated cash movements
    const toDelete = get().cashMvts.filter(m => m.desc.includes(txId))
    set(s => ({ cashMvts: s.cashMvts.filter(m => !m.desc.includes(txId)) }))
    await Promise.all(toDelete.map(m => deleteDoc(doc(db, COL.cashMvts, m.id))))
  },

  payClient: async (clientId, amounts, note) => {
    const client = get().clients.find(c => c.id === clientId)
    if (!client) return
    const total = Object.values(amounts).reduce((s, v) => s + v, 0)
    const modesUsed = CHANNELS.filter(ch => (amounts[ch] ?? 0) > 0).map(ch => ({ mode: ch, amount: amounts[ch] }))
    // Track remaining per channel across multiple invoices (same pattern as payFourn)
    const modeRem: Record<string, number> = {}
    modesUsed.forEach(m => { modeRem[m.mode] = m.amount })
    let totalRem = total

    const updTxs = client.transactions.map(tx => {
      const due = tx.total - tx.paid
      if (due <= 0 || totalRem <= 0) return tx
      const pay = Math.min(due, totalRem); totalRem -= pay
      const newModes = tx.payModes.map(p => ({ ...p }))
      let payRem = pay
      modesUsed.forEach(m => {
        const avail = modeRem[m.mode] ?? 0
        if (avail <= 0 || payRem <= 0) return
        const share = Math.min(avail, payRem)
        modeRem[m.mode] = avail - share
        payRem -= share
        const ex = newModes.find(p => p.mode === m.mode)
        if (ex) ex.amount += share
        else newModes.push({ mode: m.mode, amount: share })
      })
      const creditEntry = newModes.find(p => p.mode === 'Crédit')
      if (creditEntry) creditEntry.amount = Math.max(0, creditEntry.amount - pay)
      return { ...tx, paid: tx.paid + pay, payModes: newModes.filter(p => p.amount > 0) }
    })

    const newPay: ClientPaymentRec = { date: todayStr(), desc: note, amount: total, modes: modesUsed }
    const updated = { ...client, transactions: updTxs, payments: [newPay, ...client.payments] }
    set(s => ({ clients: s.clients.map(c => c.id === clientId ? updated : c) }))
    await saveClient(updated)

    // Cash movement
    await get().addCashMvt({
      date: todayStr(), time: nowTime(),
      type: 'client', dir: 'entree',
      desc: `${note} — ${client.prenom} ${client.nom}`,
      cat: 'Paiement client', montant: total,
      modes: modesUsed
    })
  },

  addClientAvance: async (clientId, mvt) => {
    const client = get().clients.find(c => c.id === clientId)
    if (!client) return ''
    const newMvt: AvanceMvt = { ...mvt, id: genId() }
    const updated = { ...client, avances: [...(client.avances ?? []), newMvt] }
    set(s => ({ clients: s.clients.map(c => c.id === clientId ? updated : c) }))
    await saveClient(updated)
    if (mvt.type === 'versement' && mvt.modes.length > 0) {
      await get().addCashMvt({
        date: mvt.date, time: mvt.time,
        type: 'client', dir: 'sortie',
        desc: `Versement — ${client.prenom} ${client.nom}`,
        cat: 'Versement client', montant: mvt.montant,
        modes: mvt.modes,
      })
    }
    return newMvt.id
  },

  // Éteint tout ou partie de la dette d'un client avec son avoir, au lieu de le
  // lui verser en espèces. Volontairement SANS écriture de caisse : l'argent est
  // déjà entré lors du dépôt, en réenregistrer une entrée compterait la même
  // somme deux fois dans le chiffre d'affaires. Le mode 'Avance' est déjà exclu
  // des agrégats monétaires ailleurs dans l'app.
  imputeAvoir: async (clientId, allocations, desc) => {
    const client = get().clients.find(c => c.id === clientId)
    if (!client) return
    const wanted = allocations.filter(a => a.montant > 0)
    if (wanted.length === 0) return

    const solde = (client.avances ?? []).reduce((s, m) => m.dir === 'credit' ? s + m.montant : s - m.montant, 0)
    const demande = wanted.reduce((s, a) => s + a.montant, 0)
    if (demande > solde) throw new Error(`Avoir insuffisant : ${solde} disponible, ${demande} demandé`)

    const byTx: Record<string, number> = {}
    wanted.forEach(a => { byTx[a.txId] = (byTx[a.txId] ?? 0) + a.montant })

    // Plafonne chaque imputation au restant dû, et retient ce qui a réellement
    // été appliqué — c'est ce détail qui rend l'annulation possible.
    const applied: { txId: string; montant: number }[] = []
    const updTxs = client.transactions.map(tx => {
      const want = byTx[tx.id]
      if (!want) return tx
      const pay = Math.min(want, tx.total - tx.paid)
      if (pay <= 0) return tx
      applied.push({ txId: tx.id, montant: pay })
      const newModes = tx.payModes.map(p => ({ ...p }))
      const ex = newModes.find(p => p.mode === 'Avance')
      if (ex) ex.amount += pay
      else newModes.push({ mode: 'Avance', amount: pay })
      const creditEntry = newModes.find(p => p.mode === 'Crédit')
      if (creditEntry) creditEntry.amount = Math.max(0, creditEntry.amount - pay)
      return { ...tx, paid: tx.paid + pay, payModes: newModes.filter(p => p.amount > 0) }
    })

    const total = applied.reduce((s, a) => s + a.montant, 0)
    if (total <= 0) return

    const label = desc || 'Imputation avoir sur dette'
    const mvt: AvanceMvt = {
      id: genId(), date: todayStr(), time: nowTime(),
      type: 'imputation', dir: 'debit', montant: total, desc: label,
      modes: [{ mode: 'Avance', amount: total }],
      imputations: applied,
    }
    // L'imputation figure aussi dans l'historique des paiements, avec les
    // factures concernées dans le libellé : c'est là qu'on cherche « comment
    // cette facture a-t-elle été réglée ». `avanceId` permet de retirer
    // exactement cette ligne si l'imputation est annulée.
    const refs = applied.map(a => a.txId).join(', ')
    const newPay: ClientPaymentRec = {
      date: todayStr(),
      desc: `${label} — ${refs}`,
      amount: total,
      modes: [{ mode: 'Avance', amount: total }],
      avanceId: mvt.id,
    }

    const updated: Client = {
      ...client,
      transactions: updTxs,
      payments: [newPay, ...client.payments],
      avances: [...(client.avances ?? []), mvt],
    }
    set(s => ({ clients: s.clients.map(c => c.id === clientId ? updated : c) }))
    await saveClient(updated)
  },

  updateClientAvance: async (clientId, mvt) => {
    const client = get().clients.find(c => c.id === clientId)
    if (!client) return
    const oldMvt = (client.avances ?? []).find(a => a.id === mvt.id)
    const updated = { ...client, avances: (client.avances ?? []).map(a => a.id === mvt.id ? mvt : a) }
    set(s => ({ clients: s.clients.map(c => c.id === clientId ? updated : c) }))
    await saveClient(updated)
    // Sync cashMvt if this is a versement (amount or modes may have changed)
    if (oldMvt?.type === 'versement') {
      const cashMvt = get().cashMvts.find(m =>
        m.type === 'client' && m.dir === 'sortie' &&
        m.date === oldMvt.date && m.time === oldMvt.time
      )
      if (cashMvt) await get().updateCashMvt({ ...cashMvt, montant: mvt.montant, modes: mvt.modes })
    }
  },

  deleteClientAvance: async (clientId, mvtId) => {
    const client = get().clients.find(c => c.id === clientId)
    if (!client) return
    const mvt = (client.avances ?? []).find(a => a.id === mvtId)

    // Annuler une imputation doit rendre aux factures ce qui leur avait été
    // imputé : sinon l'avoir est restitué alors que la dette reste éteinte,
    // et l'argent apparaît deux fois.
    let transactions = client.transactions
    if (mvt?.type === 'imputation' && mvt.imputations?.length) {
      const byTx: Record<string, number> = {}
      mvt.imputations.forEach(i => { byTx[i.txId] = (byTx[i.txId] ?? 0) + i.montant })
      transactions = client.transactions.map(tx => {
        const undo = Math.min(byTx[tx.id] ?? 0, tx.paid)
        if (undo <= 0) return tx
        const newModes = tx.payModes.map(p => ({ ...p }))
        const av = newModes.find(p => p.mode === 'Avance')
        if (av) av.amount = Math.max(0, av.amount - undo)
        const cr = newModes.find(p => p.mode === 'Crédit')
        if (cr) cr.amount += undo
        else newModes.push({ mode: 'Crédit', amount: undo })
        return { ...tx, paid: tx.paid - undo, payModes: newModes.filter(p => p.amount > 0) }
      })
    }

    const updated = {
      ...client,
      transactions,
      avances: (client.avances ?? []).filter(a => a.id !== mvtId),
      // Retire l'écriture de paiement liée à cette imputation, sinon elle
      // resterait dans l'historique alors que la dette est de nouveau ouverte.
      payments: client.payments.filter(p => p.avanceId !== mvtId),
    }
    set(s => ({ clients: s.clients.map(c => c.id === clientId ? updated : c) }))
    await saveClient(updated)
    // Delete cashMvt for versement (don't go through deleteCashMvt which has unrelated reversal logic)
    if (mvt?.type === 'versement') {
      const cashMvt = get().cashMvts.find(m =>
        m.type === 'client' && m.dir === 'sortie' &&
        m.date === mvt.date && m.time === mvt.time
      )
      if (cashMvt) {
        set(s => ({ cashMvts: s.cashMvts.filter(x => x.id !== cashMvt.id) }))
        await deleteDoc(doc(db, COL.cashMvts, cashMvt.id))
      }
    }
  },

  // ── Cash ───────────────────────────────────────────────────────────────────
  addCashMvt: async (m) => {
    const ref = doc(collection(db, COL.cashMvts))
    const mvt: CashMvt = { ...m, id: ref.id }
    set(s => ({ cashMvts: [...s.cashMvts, mvt] }))
    try {
      await setDoc(ref, { ...m, createdAt: serverTimestamp() })
    } catch (e) {
      // Cette erreur était auparavant avalée, et le mouvement retiré du state
      // local : la facture restait marquée payée pendant que l'encaissement
      // disparaissait de la caisse, sans rien signaler. Des règlements ont été
      // perdus ainsi (F-260915-4, F-260825-15).
      //
      // On ne retire plus l'écriture localement — le SDK Firestore met les
      // écritures en file et les rejoue à la reconnexion, donc la supprimer
      // ferait diverger l'affichage de ce qui finira réellement en base — et
      // l'échec est propagé pour que l'appelant, et l'utilisateur, le voient.
      console.error('Cash mvt save error:', e)
      // Alerte directe plutôt que de compter sur l'appelant : une erreur
      // propagée dans un gestionnaire d'évènement React se transforme en rejet
      // de promesse silencieux, et l'utilisateur ne verrait rien — c'est
      // exactement le problème qu'on corrige.
      if (typeof window !== 'undefined') {
        window.alert(
          "⚠️ L'écriture en caisse n'a pas pu être enregistrée.\n\n" +
          `Mouvement : ${m.desc} — ${m.montant} MRU\n\n` +
          'La facture a bien été mise à jour, mais la caisse non. ' +
          'Vérifiez votre connexion, puis ressaisissez ce mouvement pour que le solde soit juste.',
        )
      }
      throw e
    }
  },

  updateCashMvt: async (m) => {
    set(s => ({ cashMvts: s.cashMvts.map(x => x.id === m.id ? m : x) }))
    try {
      const { id, ...data } = m
      await updateDoc(doc(db, COL.cashMvts, id), data)
    } catch (e) {
      console.error('updateCashMvt error:', e)
    }
  },

  deleteCashMvt: async (id) => {
    const mvt = get().cashMvts.find(x => x.id === id)

    if (mvt?.type === 'client') {
      try {
        const desc = mvt.desc ?? ''
        // payTxDirect creates: "Encaissement F-XXX — Prenom Nom"
        const txId = desc.match(/Encaissement\s+(\S+)/)?.[1]

        if (txId) {
          // Reverse the specific transaction's paid amount
          for (const client of get().clients) {
            const txIdx = client.transactions.findIndex(t => t.id === txId)
            if (txIdx < 0) continue
            const tx = client.transactions[txIdx]
            const totalPaid = mvt.montant
            const newPayModes = (tx.payModes ?? []).map(p => ({ ...p }))
            ;(mvt.modes ?? []).forEach(pm => {
              const ex = newPayModes.find(p => p.mode === pm.mode)
              if (ex) ex.amount = Math.max(0, ex.amount - pm.amount)
            })
            const creditEntry = newPayModes.find(p => p.mode === 'Crédit')
            if (creditEntry) creditEntry.amount += totalPaid
            else newPayModes.push({ mode: 'Crédit', amount: totalPaid })
            const cleanedModes = newPayModes.filter(p => p.amount > 0 || p.mode === 'Crédit' || p.mode === 'Avance')
            const updatedTx = { ...tx, paid: Math.max(0, tx.paid - totalPaid), payModes: cleanedModes }
            const updatedClient = {
              ...client,
              transactions: client.transactions.map((t, i) => i === txIdx ? updatedTx : t),
            }
            set(s => ({ clients: s.clients.map(c => c.id === client.id ? updatedClient : c) }))
            await saveClient(updatedClient)
            break
          }
        } else {
          // payClient creates: "note — Prenom Nom"
          // The note is the first part before " — "
          const noteFromDesc = desc.split(' — ')[0]
          for (const client of get().clients) {
            // Match payment record by amount + date + desc
            let payIdx = client.payments.findIndex(p =>
              p.amount === mvt.montant && p.date === mvt.date && p.desc === noteFromDesc
            )
            // Fallback: match by amount + desc only (date might differ)
            if (payIdx < 0) {
              payIdx = client.payments.findIndex(p =>
                p.amount === mvt.montant && p.desc === noteFromDesc
              )
            }
            if (payIdx < 0) continue

            const newPayments = client.payments.filter((_, i) => i !== payIdx)
            // Best-effort tx reversal: subtract from transactions in order
            let remaining = mvt.montant
            const reversedTxs = client.transactions.map(tx => {
              if (remaining <= 0) return tx
              const reversal = Math.min(tx.paid, remaining)
              if (reversal <= 0) return tx
              remaining -= reversal
              const newPayModes = (tx.payModes ?? []).map(p => ({ ...p }))
              ;(mvt.modes ?? []).forEach(pm => {
                const ex = newPayModes.find(p => p.mode === pm.mode)
                if (ex) ex.amount = Math.max(0, ex.amount - pm.amount)
              })
              const creditEntry = newPayModes.find(p => p.mode === 'Crédit')
              if (creditEntry) creditEntry.amount += reversal
              else newPayModes.push({ mode: 'Crédit', amount: reversal })
              const cleanedModes = newPayModes.filter(p => p.amount > 0 || p.mode === 'Crédit' || p.mode === 'Avance')
              return { ...tx, paid: Math.max(0, tx.paid - reversal), payModes: cleanedModes }
            })
            const updatedClient = { ...client, payments: newPayments, transactions: reversedTxs }
            set(s => ({ clients: s.clients.map(c => c.id === client.id ? updatedClient : c) }))
            await saveClient(updatedClient)
            break
          }
        }
      } catch (e) {
        console.error('deleteCashMvt reversal error:', e)
      }
    }

    set(s => ({ cashMvts: s.cashMvts.filter(x => x.id !== id) }))
    try {
      await deleteDoc(doc(db, COL.cashMvts, id))
    } catch (e) {
      console.error('deleteCashMvt error:', e)
    }
  },

  // ── Caisse épargne ─────────────────────────────────────────────────────────
  setSoldeEpargne: async (n) => {
    set({ soldeEpargne: n })
    const { setDoc } = await import('firebase/firestore')
    await setDoc(doc(db, COL.settings, 'epargne'), { solde: n }, { merge: true })
  },

  addEpargneMvt: async (m) => {
    const id = genId()
    const mvt: EpargneMvt = { ...m, id }
    // Update solde
    const delta = m.dir === 'entree' ? m.montant : -m.montant
    const newSolde = get().soldeEpargne + delta
    set(s => ({ epargneMvts: [mvt, ...s.epargneMvts], soldeEpargne: newSolde }))
    await addDoc(collection(db, COL.epargneMvts), { ...m, createdAt: serverTimestamp() })
    const { setDoc } = await import('firebase/firestore')
    await setDoc(doc(db, COL.settings, 'epargne'), { solde: newSolde }, { merge: true })
  },

  // ── Dettes diverses ────────────────────────────────────────────────────────
  addDetteDiverse: async (data) => {
    const id = genId()
    const initMvt: DettePayment = { id: genId(), date: todayStr(), montant: data.montant, desc: data.notes || 'Création de la dette', modes: [], type: 'ajout' }
    const dette: DetteDiverse = { ...data, id, paid: 0, payments: [initMvt] }
    set(s => ({ dettesDiverses: [dette, ...s.dettesDiverses] }))
    await setDoc(doc(db, COL.dettesDiverses, id), { ...dette, createdAt: serverTimestamp() })
  },

  addDetteMontant: async (id, montant, desc) => {
    const dette = get().dettesDiverses.find(d => d.id === id)
    if (!dette) return
    const mvt: DettePayment = { id: genId(), date: todayStr(), montant, desc: desc || 'Ajout de montant', modes: [], type: 'ajout' }
    const updated: DetteDiverse = { ...dette, montant: dette.montant + montant, payments: [mvt, ...dette.payments] }
    set(s => ({ dettesDiverses: s.dettesDiverses.map(d => d.id === id ? updated : d) }))
    await updateDoc(doc(db, COL.dettesDiverses, id), { montant: updated.montant, payments: updated.payments })
  },

  payDetteDiverse: async (detteId, montant, modes, desc, ajoutId?) => {
    const dette = get().dettesDiverses.find(d => d.id === detteId)
    if (!dette) return
    const payment: DettePayment = { id: genId(), date: todayStr(), montant, modes, desc, type: 'versement', ...(ajoutId ? { ajoutId } : {}) }
    const updated: DetteDiverse = {
      ...dette,
      paid: dette.paid + montant,
      payments: [payment, ...dette.payments],
    }
    set(s => ({ dettesDiverses: s.dettesDiverses.map(d => d.id === detteId ? updated : d) }))
    await updateDoc(doc(db, COL.dettesDiverses, detteId), {
      paid: updated.paid, payments: updated.payments
    })
    // Debit epargne
    await get().addEpargneMvt({
      date: todayStr(), time: nowTime(),
      dir: 'sortie', montant,
      desc: `${desc} — ${dette.nom}`,
      cat: 'Remboursement dette', modes,
    })
  },

  editDetteAjout: async (detteId, ajoutId, newMontant, newDesc, by) => {
    const dette = get().dettesDiverses.find(d => d.id === detteId)
    if (!dette) return
    const ajout = dette.payments.find(p => p.id === ajoutId)
    if (!ajout) return
    const delta = newMontant - ajout.montant
    const updatedPayments = dette.payments.map(p =>
      p.id === ajoutId
        ? { ...p, montant: newMontant, desc: newDesc, editedBy: by, editedAt: nowDateTime(), prevMontant: p.prevMontant ?? p.montant }
        : p
    )
    const updated: DetteDiverse = { ...dette, montant: dette.montant + delta, payments: updatedPayments }
    set(s => ({ dettesDiverses: s.dettesDiverses.map(d => d.id === detteId ? updated : d) }))
    await updateDoc(doc(db, COL.dettesDiverses, detteId), { montant: updated.montant, payments: updated.payments })
  },

  deleteDetteAjout: async (detteId, ajoutId, by) => {
    const dette = get().dettesDiverses.find(d => d.id === detteId)
    if (!dette) return
    const ajout = dette.payments.find(p => p.id === ajoutId)
    if (!ajout || ajout.deleted) return
    const now = nowDateTime()
    const linkedVers = dette.payments.filter(p => p.type === 'versement' && p.ajoutId === ajoutId && !p.deleted)
    const paidDelta = linkedVers.reduce((s, v) => s + v.montant, 0)
    const updatedPayments = dette.payments.map(p => {
      if (p.id === ajoutId) return { ...p, deleted: true, deletedBy: by, deletedAt: now }
      if (p.type === 'versement' && p.ajoutId === ajoutId && !p.deleted) return { ...p, deleted: true, deletedBy: by, deletedAt: now }
      return p
    })
    const updated: DetteDiverse = { ...dette, montant: dette.montant - ajout.montant, paid: dette.paid - paidDelta, payments: updatedPayments }
    set(s => ({ dettesDiverses: s.dettesDiverses.map(d => d.id === detteId ? updated : d) }))
    await updateDoc(doc(db, COL.dettesDiverses, detteId), { montant: updated.montant, paid: updated.paid, payments: updated.payments })
  },

  editDetteDiverse: async (id, nom, notes, currency, montant) => {
    set(s => ({ dettesDiverses: s.dettesDiverses.map(d => d.id === id ? { ...d, nom, notes, currency, montant } : d) }))
    await updateDoc(doc(db, COL.dettesDiverses, id), { nom, notes, currency, montant })
  },

  deleteDetteDiverse: async (id) => {
    set(s => ({ dettesDiverses: s.dettesDiverses.filter(d => d.id !== id) }))
    await deleteDoc(doc(db, COL.dettesDiverses, id))
  },

  toggleTxLineSortie: async (txId, lineIdx) => {
    // Stock is now managed at addVente creation — this only tracks physical dispatch UI state
    const comptoir = get().ventesComptoir.find(t => t.id === txId)
    if (comptoir) {
      const sorted = [...(comptoir.sortedLines ?? comptoir.lines.map(() => false))]
      sorted[lineIdx] = !sorted[lineIdx]
      set(s => ({ ventesComptoir: s.ventesComptoir.map(t => t.id === txId ? { ...t, sortedLines: sorted } : t) }))
      const snap = await getDocs(query(collection(db, COL.ventesComptoir), where('id', '==', txId)))
      if (!snap.empty) await updateDoc(snap.docs[0].ref, { sortedLines: sorted })
      return
    }
    for (const client of get().clients) {
      const txIdx = client.transactions.findIndex(t => t.id === txId)
      if (txIdx < 0) continue
      const tx = client.transactions[txIdx]
      const sorted = [...(tx.sortedLines ?? tx.lines.map(() => false))]
      sorted[lineIdx] = !sorted[lineIdx]
      const updatedClient = {
        ...client,
        transactions: client.transactions.map((t, i) => i === txIdx ? { ...t, sortedLines: sorted } : t),
      }
      set(s => ({ clients: s.clients.map(c => c.id === client.id ? updatedClient : c) }))
      await saveClient(updatedClient)
      return
    }
  },

  // ── Draft Invoices (Bons de sortie) ──────────────────────────────────────────
  addDraftInvoice: async (data) => {
    const ref = doc(collection(db, COL.draftInvoices))
    const draft: DraftInvoice = { ...data, id: ref.id }
    set(s => ({ draftInvoices: [draft, ...s.draftInvoices] }))
    await setDoc(ref, { ...data, createdAt: serverTimestamp() })
    return ref.id
  },

  toggleDraftLine: async (draftId, lineIdx) => {
    const draft = get().draftInvoices.find(d => d.id === draftId)
    if (!draft) return
    const lines = draft.lines.map((l, i) => i === lineIdx ? { ...l, picked: !l.picked } : l)
    set(s => ({ draftInvoices: s.draftInvoices.map(d => d.id === draftId ? { ...d, lines } : d) }))
    await updateDoc(doc(db, COL.draftInvoices, draftId), { lines })
  },

  validateDraftInvoice: async (draftId) => {
    const draft = get().draftInvoices.find(d => d.id === draftId)
    if (!draft) return

    // Generate sequential invoice ID (same counter as addVente)
    const _d = new Date()
    const yymmdd = _d.getFullYear().toString().slice(2) + String(_d.getMonth()+1).padStart(2,'0') + String(_d.getDate()).padStart(2,'0')
    const counterRef = doc(db, COL.settings, `counter-${yymmdd}`)
    let seq = 1
    await runTransaction(db, async (t) => {
      const snap = await t.get(counterRef)
      seq = snap.exists() ? (snap.data().seq as number) + 1 : 1
      t.set(counterRef, { seq })
    })
    const txId = `F-${yymmdd}-${seq}`

    // Build Tx from draft and save to the right collection
    const txLines: TxLine[] = draft.lines.map(l => ({
      desc: l.desc, productName: l.productName, qty: l.qty, pu: l.pu, total: l.total,
      productId: l.productId, refId: l.refId,
    }))
    const newTx: Tx = {
      id: txId, date: todayStr(), time: nowTime(),
      total: draft.total, paid: draft.paid,
      lines: txLines, payModes: draft.payModes,
      sortedLines: draft.lines.map(l => l.picked),
    }
    if (draft.clientId) {
      const client = get().clients.find(c => c.id === draft.clientId)
      if (client) {
        const updated = { ...client, transactions: [newTx, ...client.transactions] }
        set(s => ({ clients: s.clients.map(c => c.id === draft.clientId ? updated : c) }))
        await saveClient(updated)
      }
    } else {
      set(s => ({ ventesComptoir: [newTx, ...s.ventesComptoir] }))
      await addDoc(collection(db, COL.ventesComptoir), { ...newTx, createdAt: serverTimestamp() })
    }

    // Decrement stock for all lines (validate = physical dispatch of entire order)
    for (const l of draft.lines) {
      if (l.productId && l.refId) {
        get().updateStockRef(l.productId, l.refId, -l.qty, { qty: l.qty, amount: l.total })
      }
    }

    // Cash movement for paid portion
    const cashModes = draft.payModes.filter(m => m.mode !== 'Crédit' && m.mode !== 'Avance' && m.amount > 0)
    if (cashModes.length > 0) {
      const clientName = draft.clientName ? ` — ${draft.clientName}` : ''
      await get().addCashMvt({
        date: todayStr(), time: nowTime(),
        type: 'vente', dir: 'entree',
        desc: `Vente ${txId}${clientName}`,
        cat: 'Vente POS',
        montant: cashModes.reduce((s, m) => s + m.amount, 0),
        modes: cashModes,
      })
    }

    set(s => ({ draftInvoices: s.draftInvoices.filter(d => d.id !== draftId) }))
    await deleteDoc(doc(db, COL.draftInvoices, draftId))
  },

  deleteDraftInvoice: async (draftId) => {
    set(s => ({ draftInvoices: s.draftInvoices.filter(d => d.id !== draftId) }))
    await deleteDoc(doc(db, COL.draftInvoices, draftId))
  },

  recalculateStockFromSortie: async () => {
    const { ventesComptoir, clients, products } = get()

    // Accumulate sold qty+amount per (productId, refId) across ALL transactions
    // Stock is now decremented at sale creation so we count all lines, not just sorted ones
    const sortieMap = new Map<string, { qty: number; amount: number }>()
    const allTxs = [...ventesComptoir, ...clients.flatMap(c => c.transactions)]
    for (const tx of allTxs) {
      tx.lines.forEach(l => {
        if (!l.productId || !l.refId) return
        const key = `${l.productId}__${l.refId}`
        const prev = sortieMap.get(key) ?? { qty: 0, amount: 0 }
        sortieMap.set(key, { qty: prev.qty + l.qty, amount: prev.amount + l.total })
      })
    }

    let updated = 0
    let totalSorti = 0
    const updatedProducts = products.map(p => ({
      ...p,
      refs: p.refs.map(r => {
        const key = `${p.id}__${r.id}`
        const s = sortieMap.get(key) ?? { qty: 0, amount: 0 }
        const newSorti  = s.qty
        const newAmount = s.amount
        const newStock  = Math.max(0, (r.initial ?? 0) + (r.added ?? 0) - newSorti)
        totalSorti += newSorti
        if (r.sorti !== newSorti || r.stock !== newStock) updated++
        return { ...r, sorti: newSorti, amount: newAmount, stock: newStock }
      }),
    }))

    set({ products: updatedProducts })
    await Promise.all(updatedProducts.map(p => saveProduct(p)))
    return { updated, totalSorti }
  },

  validateTxSortie: async (txId) => {
    const comptoir = get().ventesComptoir.find(t => t.id === txId)
    if (comptoir) {
      const sortedLines = comptoir.lines.map(() => true)
      set(s => ({ ventesComptoir: s.ventesComptoir.map(t => t.id === txId ? { ...t, sortedLines } : t) }))
      const snap = await getDocs(query(collection(db, COL.ventesComptoir), where('id', '==', txId)))
      if (!snap.empty) await updateDoc(snap.docs[0].ref, { sortedLines })
      return
    }
    for (const client of get().clients) {
      const txIdx = client.transactions.findIndex(t => t.id === txId)
      if (txIdx < 0) continue
      const tx = client.transactions[txIdx]
      const sortedLines = tx.lines.map(() => true)
      const updatedClient = {
        ...client,
        transactions: client.transactions.map((t, i) => i === txIdx ? { ...t, sortedLines } : t),
      }
      set(s => ({ clients: s.clients.map(c => c.id === client.id ? updatedClient : c) }))
      await saveClient(updatedClient)
      return
    }
  },

  updateTx: async (txId, clientId, lines, total, payModes) => {
    // Find existing tx to get current paid amount
    let existingTx: Tx | undefined
    if (clientId) {
      existingTx = get().clients.find(c => c.id === clientId)?.transactions.find(t => t.id === txId)
    } else {
      existingTx = get().ventesComptoir.find(t => t.id === txId)
    }

    let newPayModes: PayMode[]
    let newPaid: number
    let newCashModes: PayMode[]

    if (payModes) {
      // Use explicit payModes provided by the user
      newCashModes = payModes.filter(m => m.mode !== 'Crédit' && m.mode !== 'Avance')
      newPaid = Math.min(newCashModes.reduce((s, m) => s + m.amount, 0), total)
      newPayModes = payModes
    } else {
      // Auto-recalculate: cap cash modes at new total, recompute credit
      const existingModes = existingTx?.payModes ?? []
      const cashModes = existingModes.filter(m => m.mode !== 'Crédit' && m.mode !== 'Avance')
      const cashTotal = cashModes.reduce((s, m) => s + m.amount, 0)
      const cappedCash = Math.min(cashTotal, total)
      newCashModes = cashTotal > 0 && cappedCash < cashTotal
        ? cashModes.map(m => ({ ...m, amount: Math.round(m.amount / cashTotal * cappedCash) })).filter(m => m.amount > 0)
        : cashModes
      const newCredit = Math.max(0, total - cappedCash)
      newPaid = Math.min(existingTx?.paid ?? total, total)
      newPayModes = [
        ...newCashModes,
        ...(newCredit > 0 ? [{ mode: 'Crédit', amount: newCredit }] : []),
      ]
    }

    const updates = { lines, total, paid: newPaid, payModes: newPayModes }

    // H4: Adjust stock for changed line quantities
    if (existingTx) {
      const oldQtyMap = new Map<string, { qty: number; pu: number }>()
      for (const l of existingTx.lines) {
        if (l.productId && l.refId) {
          const k = `${l.productId}|${l.refId}`
          const e = oldQtyMap.get(k)
          if (e) e.qty += l.qty
          else oldQtyMap.set(k, { qty: l.qty, pu: l.pu })
        }
      }
      const newQtyMap = new Map<string, { qty: number; pu: number }>()
      for (const l of lines) {
        if (l.productId && l.refId) {
          const k = `${l.productId}|${l.refId}`
          const e = newQtyMap.get(k)
          if (e) e.qty += l.qty
          else newQtyMap.set(k, { qty: l.qty, pu: l.pu })
        }
      }
      for (const k of new Set([...oldQtyMap.keys(), ...newQtyMap.keys()])) {
        const [productId, refId] = k.split('|')
        const oldQty = oldQtyMap.get(k)?.qty ?? 0
        const newQty = newQtyMap.get(k)?.qty ?? 0
        const delta = newQty - oldQty
        if (delta !== 0) {
          const pu = newQtyMap.get(k)?.pu ?? oldQtyMap.get(k)?.pu ?? 0
          get().updateStockRef(productId, refId, -delta, { qty: delta, amount: delta * pu })
        }
      }
    }

    if (clientId) {
      const client = get().clients.find(c => c.id === clientId)
      if (!client) return
      const updatedClient = {
        ...client,
        transactions: client.transactions.map(t => t.id === txId ? { ...t, ...updates } : t),
      }
      set(s => ({ clients: s.clients.map(c => c.id === clientId ? updatedClient : c) }))
      await saveClient(updatedClient)
    } else {
      set(s => ({ ventesComptoir: s.ventesComptoir.map(t => t.id === txId ? { ...t, ...updates } : t) }))
      const snap = await getDocs(query(collection(db, COL.ventesComptoir), where('id', '==', txId)))
      if (!snap.empty) await updateDoc(snap.docs[0].ref, updates)
    }

    // Sync the vente cashMvt so solde/ventesTotal reflect the change
    if (newPaid > 0) {
      const venteMvt = get().cashMvts.find(m => m.type === 'vente' && m.desc?.includes(txId))
      const cashModesForMvt = newCashModes.filter(m => m.amount > 0)
      if (venteMvt) {
        if (venteMvt.montant !== newPaid) {
          await get().updateCashMvt({ ...venteMvt, montant: newPaid, modes: cashModesForMvt })
        }
      } else {
        // No cashMvt existed (was a pure credit invoice) — create one now
        const tx = existingTx
        const clientName = clientId
          ? (get().clients.find(c => c.id === clientId)?.prenom ?? '')
          : ''
        const mvtDesc = `Vente ${txId}${clientName ? ' — ' + clientName : ''}`
        const txDate = tx?.date ?? todayStr()
        const txTime = tx?.time ?? nowTime()
        await get().addCashMvt({
          date: txDate, time: txTime,
          type: 'vente', dir: 'entree',
          desc: mvtDesc, cat: 'Vente POS',
          montant: newPaid, modes: cashModesForMvt,
        })
      }
    } else {
      // newPaid is 0 — if a cashMvt existed, remove it (fully credit again)
      const venteMvt = get().cashMvts.find(m => m.type === 'vente' && m.desc?.includes(txId))
      if (venteMvt && venteMvt.montant !== 0) {
        await get().updateCashMvt({ ...venteMvt, montant: 0, modes: [] })
      }
    }
  },

  payTxDirect: async (txId, modes) => {
    const totalPaid = modes.reduce((s, m) => s + m.amount, 0)
    if (totalPaid <= 0) return

    const applyModes = (existing: PayMode[]): PayMode[] => {
      const updated = existing.map(p => ({ ...p }))
      modes.forEach(m => {
        const ex = updated.find(p => p.mode === m.mode)
        if (ex) ex.amount += m.amount
        else updated.push({ ...m })
      })
      // Reduce Crédit by the amount paid; keep Crédit/Avance entries even at 0
      // so derivedCreditMvts can still detect "this tx had credit" after full payment
      const creditEntry = updated.find(p => p.mode === 'Crédit')
      if (creditEntry) creditEntry.amount = Math.max(0, creditEntry.amount - totalPaid)
      return updated.filter(p => p.amount > 0 || p.mode === 'Crédit' || p.mode === 'Avance')
    }

    // Try comptoir
    const comptoir = get().ventesComptoir.find(t => t.id === txId)
    if (comptoir) {
      const newPayModes = applyModes(comptoir.payModes)
      const updated = { ...comptoir, paid: comptoir.paid + totalPaid, payModes: newPayModes }
      set(s => ({ ventesComptoir: s.ventesComptoir.map(t => t.id === txId ? updated : t) }))
      const snap = await getDocs(query(collection(db, COL.ventesComptoir), where('id', '==', txId)))
      if (!snap.empty) await updateDoc(snap.docs[0].ref, { paid: updated.paid, payModes: updated.payModes })
      await get().addCashMvt({
        date: todayStr(), time: nowTime(),
        type: 'vente', dir: 'entree',
        desc: `Encaissement ${txId}`,
        cat: 'Vente POS', montant: totalPaid, modes,
      })
      return
    }

    // Try client
    for (const client of get().clients) {
      const txIdx = client.transactions.findIndex(t => t.id === txId)
      if (txIdx < 0) continue
      const tx = client.transactions[txIdx]
      const newPayModes = applyModes(tx.payModes)
      const updatedTx = { ...tx, paid: tx.paid + totalPaid, payModes: newPayModes }
      const updatedClient = {
        ...client,
        transactions: client.transactions.map((t, i) => i === txIdx ? updatedTx : t),
      }
      set(s => ({ clients: s.clients.map(c => c.id === client.id ? updatedClient : c) }))
      await saveClient(updatedClient)
      await get().addCashMvt({
        date: todayStr(), time: nowTime(),
        type: 'client', dir: 'entree',
        desc: `Encaissement ${txId} — ${client.prenom} ${client.nom}`,
        cat: 'Paiement client', montant: totalPaid, modes,
      })
      return
    }
  },
}))

// ─── Firebase listeners (real-time sync) ──────────────────────────────────────
export function initAppListeners() {
  const unsubs: (() => void)[] = []

  // Categories
  unsubs.push(onSnapshot(query(collection(db, COL.categories)), snap => {
    const categories = snap.docs.map(d => ({ id: d.id, ...d.data() } as Category))
    useAppStore.setState({ categories })
  }))

  // Products
  unsubs.push(onSnapshot(collection(db, COL.products), snap => {
    const fromFirestore = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Product))
      .sort((a: any, b: any) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0))
    useAppStore.setState(s => {
      const tmpEntries = s.products.filter(p => p.id.startsWith('tmp_'))
      return { products: [...tmpEntries, ...fromFirestore], loaded: true }
    })
  }))

  // Fournisseurs
  unsubs.push(onSnapshot(query(collection(db, COL.fournisseurs)), snap => {
    const fromFirestore = snap.docs.map(d => ({ id: d.id, ...d.data() } as Fournisseur))
    // Keep any optimistic (tmp_) entries not yet confirmed
    useAppStore.setState(s => {
      const tmpEntries = s.fournisseurs.filter(f => f.id.startsWith('tmp_'))
      return { fournisseurs: [...fromFirestore, ...tmpEntries] }
    })
  }))

  // Clients
  unsubs.push(onSnapshot(query(collection(db, COL.clients)), snap => {
    const fromFirestore = snap.docs.map(d => ({ id: d.id, ...d.data() } as Client))
    useAppStore.setState(s => {
      const tmpEntries = s.clients.filter(f => f.id.startsWith('tmp_'))
      return { clients: [...fromFirestore, ...tmpEntries] }
    })
  }))

  // Cash movements
  unsubs.push(onSnapshot(collection(db, COL.cashMvts), snap => {
    const cashMvts = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as CashMvt))
      .sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
    useAppStore.setState({ cashMvts, loaded: true })
  }))

  // Anonymous (comptoir) sales
  unsubs.push(onSnapshot(collection(db, COL.ventesComptoir), snap => {
    const ventesComptoir = snap.docs
      .map(d => {
        const data = d.data()
        const tx = { id: d.id, ...data } as Tx
        if (!tx.time && data.createdAt?.toDate) {
          const dt = data.createdAt.toDate() as Date
          tx.time = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
        }
        return tx
      })
      .sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
    useAppStore.setState({ ventesComptoir })
  }))

  // Settings (ouverture de caisse)
  unsubs.push(onSnapshot(doc(db, COL.settings, 'caisse'), snap => {
    if (snap.exists()) {
      const data = snap.data()
      if (typeof data.ouverture === 'number') useAppStore.setState({ ouverture: data.ouverture })
      if (typeof data.boutiqueFermee === 'boolean') useAppStore.setState({ boutiqueFermee: data.boutiqueFermee })
    }
  }))

  // Settings (caisse épargne solde)
  unsubs.push(onSnapshot(doc(db, COL.settings, 'epargne'), snap => {
    if (snap.exists()) {
      const data = snap.data()
      if (typeof data.solde === 'number') useAppStore.setState({ soldeEpargne: data.solde })
    }
  }))

  // Epargne movements
  unsubs.push(onSnapshot(collection(db, COL.epargneMvts), snap => {
    const epargneMvts = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as EpargneMvt))
      .sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
    useAppStore.setState({ epargneMvts })
  }))

  // Dettes diverses
  unsubs.push(onSnapshot(collection(db, COL.dettesDiverses), snap => {
    const dettesDiverses = snap.docs
      .map(d => ({ ...d.data(), id: d.id } as DetteDiverse))
      .sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
    useAppStore.setState({ dettesDiverses })
  }))

  // Draft invoices (bons de sortie)
  unsubs.push(onSnapshot(collection(db, COL.draftInvoices), snap => {
    const draftInvoices = snap.docs
      .map(d => ({ ...d.data(), id: d.id } as DraftInvoice))
      .sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
    useAppStore.setState({ draftInvoices })
  }))

  return () => unsubs.forEach(u => u())
}

// ─── Seed helper (batch write — single onSnapshot) ────────────────────────────
export async function seedProducts(items: Omit<Product, 'id'>[]) {
  const batch = writeBatch(db)
  items.forEach(p => {
    const ref = doc(collection(db, COL.products))
    batch.set(ref, { ...p, updatedAt: serverTimestamp() })
  })
  await batch.commit()
}
