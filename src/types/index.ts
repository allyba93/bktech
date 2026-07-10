// ── USERS ──────────────────────────────────────────────
export type UserRole = 'owner' | 'cashier' | 'chine'

export interface AppUser {
  uid: string
  name: string
  role: UserRole
  email: string
  active: boolean
  createdAt: string
  lastLogin?: string
}

// ── PRODUCTS & CATALOG ─────────────────────────────────
export interface ProductRef {
  id: string
  name: string
  stock: number
  prixVente?: number
  prixAchat?: number
}

export interface Product {
  id: string
  name: string
  category: string
  refs: ProductRef[]
}

// ── SALES ──────────────────────────────────────────────
export type PaymentMode = 'Cash' | 'Bankily' | 'Masravi' | 'Seddad' | 'Bimban' | 'Crédit'
export type SaleStatus = 'paid' | 'partial' | 'credit'

export interface PaymentEntry {
  mode: PaymentMode
  amount: number
}

export interface SaleLine {
  productId: string
  productName: string
  refId: string
  refName: string
  unitPrice: number
  adjPrice: number | null
  qty: number
}

export interface Sale {
  id: string
  date: string
  clientId: string | null   // null = anonymous counter sale
  cashierId: string
  lines: SaleLine[]
  subtotal: number          // sum of lines at catalog price
  total: number             // after discount
  paid: number              // amount received
  remaining: number         // total - paid
  payments: PaymentEntry[]
  status: SaleStatus
  discountNote?: string
}

// ── CLIENTS ────────────────────────────────────────────
export interface ClientPayment {
  id: string
  date: string
  amount: number
  mode: PaymentMode
  note: string
  invoiceId?: string
}

export interface ClientInvoice {
  id: string
  date: string
  total: number
  paid: number
  remaining: number
  status: SaleStatus
  lines: string[]           // product descriptions
}

export interface Client {
  id: string
  name: string
  phone: string
  creditLimit: number
  paymentDelay: number      // days before alert
  balance: number           // current amount owed
  totalPurchases: number
  notes: string
  invoices: ClientInvoice[]
  payments: ClientPayment[]
  createdAt: string
  updatedAt: string
}

// ── SUPPLIERS ──────────────────────────────────────────
export type OrderStatus = 'pending' | 'transit' | 'delivered'

export interface OrderPayment {
  id: string
  date: string
  amount: number
  mode: PaymentMode
  note: string
}

export interface OrderLine {
  product: string           // free text: "Coques téléphone — Luxe"
  ref: string               // free text: "iPhone 15"
  modele: string
  qty: number
  qtyReceived: number
  unitPrice: number
}

export interface SupplierOrder {
  id: string
  date: string
  status: OrderStatus
  total: number
  paid: number
  remaining: number
  notes: string
  lines: OrderLine[]
  payments: OrderPayment[]
}

export interface Supplier {
  id: string
  name: string
  contact: string
  country: string
  category: string
  notes: string
  balance: number           // amount owed to supplier
  totalPurchases: number
  orders: SupplierOrder[]
  createdAt: string
}

// ── CASH REGISTER ──────────────────────────────────────
export type MovementType = 'in' | 'out'
export type MovementCategory =
  | 'sale'
  | 'recovery'
  | 'supplier'
  | 'salary'
  | 'rent'
  | 'transport'
  | 'other'

export interface CashMovement {
  id: string
  type: MovementType
  category: MovementCategory
  description: string
  amount: number
  mode: PaymentMode
  date: string
  userId: string
  saleId?: string           // linked sale if applicable
  orderId?: string          // linked supplier order
}

export interface DayClosing {
  id: string
  date: string
  openingBalance: number
  totalIn: number
  totalOut: number
  theoreticalBalance: number
  physicalBalance: number
  difference: number
  note: string
  closedBy: string
  byMode: Record<PaymentMode, number>
}

// ── STOCK MOVEMENT ─────────────────────────────────────
export type StockMovementType = 'in' | 'out' | 'adjustment'

export interface StockMovement {
  id: string
  type: StockMovementType
  productId: string
  refId: string
  productName: string
  refName: string
  quantity: number
  description: string
  date: string
  userId: string
  orderId?: string
  saleId?: string
}

// ── CART (local state for POS) ──────────────────────────
export interface CartLine {
  key: string               // productId_refId
  productId: string
  productName: string
  refId: string
  refName: string
  unitPrice: number
  adjPrice: number | null
  qty: number
  stock: number
  prixAchat?: number
}

// ── CHINA ORDERS ───────────────────────────────────────
export type ChinaOrderStatus =
  | 'attente_client'   // waiting for client deposit
  | 'commande'         // order placed in China, advance paid
  | 'production'       // goods being produced
  | 'expedition'       // goods shipped
  | 'recu'             // goods received in Mauritania
  | 'livre'            // delivered to client, settled

export type ChinaShipping = 'fret' | 'bateau'

export interface ChinaPayment {
  id: string
  date: string
  amount: number       // toujours en MRU
  amountRmb?: number   // montant original en RMB (paiements fournisseur)
  exchangeRate?: number // taux utilisé : 1 RMB = ? MRU
  mode: string
  note?: string
  proofUrl?: string    // URL photo preuve de paiement client
}

export interface ChinaOrder {
  id: string
  clientName: string
  clientPhone?: string
  description: string
  orderDate: string
  // Client side (MRU)
  clientTotalAmount: number
  clientPayments: ChinaPayment[]
  // Supplier side
  supplierTotalAmountRmb: number   // montant en RMB ¥
  supplierTotalAmount: number      // équivalent MRU = RMB × taux
  exchangeRate: number             // taux de référence : 1 RMB = ? MRU
  supplierPayments: ChinaPayment[]
  // Shipping
  shippingMethod?: ChinaShipping
  shippingCost: number
  shippingDate?: string
  // Status
  status: ChinaOrderStatus
  notes?: string
  createdAt: string
  updatedAt: string
}

// ── FIRESTORE COLLECTION PATHS ─────────────────────────
export const COLLECTIONS = {
  users:          'users',
  products:       'products',
  sales:          'sales',
  clients:        'clients',
  suppliers:      'suppliers',
  cashMovements:  'cashMovements',
  dayClosings:    'dayClosings',
  stockMovements: 'stockMovements',
  chinaOrders:    'chinaOrders',
} as const
