import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore, initAuthListener } from '@/store/authStore'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/LoginPage'

// Pages
import { DashboardPage }   from '@/pages/DashboardPage'
import { POSPage }         from '@/pages/POSPage'
import { StockPage }       from '@/pages/StockPage'
import { ClientsPage }     from '@/pages/ClientsPage'
import { SuppliersPage }   from '@/pages/SuppliersPage'
import { CashPage }        from '@/pages/CashPage'
import { ReportsPage }     from '@/pages/ReportsPage'
// Routes accessible by cashiers
const CASHIER_ROUTES = ['/pos', '/cash', '/stock']

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  if (loading) return <div className="flex h-screen items-center justify-center text-[#a8a7a2] text-sm">Chargement...</div>
  if (!user)   return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireOwner({ children }: { children: React.ReactNode }) {
  const { appUser, loading } = useAuthStore()
  if (loading) return null
  if (appUser?.role !== 'owner') return <Navigate to="/pos" replace />
  return <>{children}</>
}

export { CASHIER_ROUTES }

export default function App() {
  useEffect(() => {
    const unsub = initAuthListener()
    return () => { unsub() }
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/pos" replace />} />
          {/* Owner-only pages */}
          <Route path="dashboard"   element={<RequireOwner><DashboardPage /></RequireOwner>} />
          <Route path="clients"     element={<RequireOwner><ClientsPage /></RequireOwner>} />
          <Route path="suppliers"   element={<RequireOwner><SuppliersPage /></RequireOwner>} />
          <Route path="reports"     element={<RequireOwner><ReportsPage /></RequireOwner>} />
          {/* Shared pages */}
          <Route path="pos"         element={<POSPage />} />
          <Route path="stock"       element={<StockPage />} />
          <Route path="cash"        element={<CashPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
