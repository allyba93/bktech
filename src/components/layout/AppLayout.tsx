import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutGrid, ShoppingCart, Package, Users, Truck,
  DollarSign, BarChart2, LogOut, Moon, Sun, Menu, X, ClipboardCheck, Ship,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { getInitials } from '@/lib/utils'
import { CASHIER_ROUTES, CHINE_ROUTES } from '@/App'

const NAV_ALL = [
  { to: '/dashboard',   label: 'Tableau de bord', icon: LayoutGrid,   section: 'Principal' },
  { to: '/pos',         label: 'Point de Vente',  icon: ShoppingCart, section: null },
  { to: '/preparation', label: 'Préparation',     icon: ClipboardCheck, section: null },
  { to: '/stock',       label: 'Stock',           icon: Package,      section: null },
  { to: '/clients',     label: 'Clients',         icon: Users,        section: 'Finance' },
  { to: '/suppliers',   label: 'Fournisseurs',    icon: Truck,        section: null },
  { to: '/cash',        label: 'Caisse',          icon: DollarSign,   section: null },
  { to: '/reports',     label: 'Rapports',        icon: BarChart2,    section: 'Rapport' },
  { to: '/chine',       label: 'Chine',           icon: Ship,         section: null },
]

export function AppLayout() {
  const { appUser, signOut } = useAuthStore()
  const [dark, setDark] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [userPanelOpen, setUserPanelOpen] = useState(false)
  const [showDecompteBanner, setShowDecompteBanner] = useState(false)

  // Show banner from 18:30 GMT, dismiss resets each day
  useEffect(() => {
    const todayKey = () => `decompte-dismissed-${new Date().toISOString().slice(0, 10)}`
    const check = () => {
      const now = new Date()
      const isAfter1830 = now.getUTCHours() > 18 || (now.getUTCHours() === 18 && now.getUTCMinutes() >= 30)
      const dismissed = localStorage.getItem(todayKey()) === '1'
      setShowDecompteBanner(isAfter1830 && !dismissed)
    }
    check()
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }, [])
  const navigate = useNavigate()
  const location = useLocation()

  const role = appUser?.role
  const NAV = role === 'owner'
    ? NAV_ALL
    : role === 'chine'
      ? NAV_ALL.filter(n => CHINE_ROUTES.includes(n.to))
      : NAV_ALL.filter(n => CASHIER_ROUTES.includes(n.to))

  // Close menu/panel on navigation
  useEffect(() => { setMenuOpen(false); setUserPanelOpen(false) }, [location.pathname])

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  const toggleTheme = () => {
    setDark((d) => {
      document.documentElement.classList.toggle('dark', !d)
      return !d
    })
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const currentPage = NAV.find(n => n.to === location.pathname)?.label ?? 'ElectroPro'

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── DESKTOP SIDEBAR ─────────────────────────────────────────── */}
      <aside className="bk-sidebar hidden md:flex w-[220px] flex-col flex-shrink-0">
        {/* Logo — white zone */}
        <div className="w-full border-b border-[rgba(26,95,168,0.12)] flex items-center justify-center py-4" style={{ background: '#ffffff', flexShrink: 0 }}>
          <img src="/BK_Tech_logo_cropped2.PNG" alt="BK Tech" className="h-28 w-auto object-contain" style={{ mixBlendMode: 'multiply' }} />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-3 flex flex-col gap-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <div key={item.to}>
              {item.section && (
                <div className="text-[10px] font-medium text-[#1a5fa8]/60 uppercase tracking-[0.8px] px-2.5 pt-2.5 pb-1">
                  {item.section}
                </div>
              )}
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-[9px] text-[15px] font-bold transition-colors cursor-pointer select-none ${
                    isActive
                      ? 'bg-[#1a5fa8]/15 text-[#0f2460]'
                      : 'text-[#1a5fa8]/70 hover:bg-[#1a5fa8]/10 hover:text-[#0f2460]'
                  }`
                }
              >
                <item.icon size={17} />
                <span className="flex-1">{item.label}</span>
              </NavLink>
            </div>
          ))}
        </nav>

        {/* Footer — click to open user panel */}
        <button onClick={() => setUserPanelOpen(true)}
          className="px-2.5 py-3.5 border-t border-[rgba(26,95,168,0.12)] flex items-center gap-2.5 w-full text-left hover:bg-[rgba(26,95,168,0.05)] transition-colors cursor-pointer">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#1a5fa8,#0f2460)' }}>
            {getInitials(appUser?.name ?? 'U')}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-[#0f2460] truncate">{appUser?.name}</div>
            <div className="text-[11px] text-[#1a5fa8]/60">{appUser?.role === 'owner' ? 'Propriétaire' : appUser?.role === 'chine' ? 'Chine' : 'Caissier'}</div>
          </div>
          <div className="w-[22px] h-[22px] rounded-md bg-white border border-[rgba(26,95,168,0.15)] flex items-center justify-center flex-shrink-0">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 2L8.5 6H1.5L5 2Z" fill="#1a5fa8" opacity="0.6"/></svg>
          </div>
        </button>
      </aside>

      {/* ── MOBILE TOPBAR ───────────────────────────────────────────── */}
      <div className="bk-topbar md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-5 h-20" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={() => setMenuOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-xl cursor-pointer active:bg-[#1a5fa8]/10"
          style={{ background: 'rgba(26,95,168,0.08)', border: '1px solid rgba(26,95,168,0.18)' }}>
          <Menu size={22} style={{ color: '#0f2460' }} />
        </button>

        {/* Logo in gradient ellipse — click → POS */}
        <div className="bk-logo-ellipse cursor-pointer" onClick={() => navigate('/pos')}>
          <img src="/BK_Tech_logo_cropped2.PNG" alt="BK Tech" className="h-12 w-auto object-contain" />
        </div>

        <button onClick={() => setUserPanelOpen(true)}
          className="w-11 h-11 rounded-xl flex items-center justify-center text-[14px] font-bold cursor-pointer active:opacity-80"
          style={{ background: 'linear-gradient(135deg,#1a5fa8,#0f2460)', color: '#fff', boxShadow: '0 2px 8px rgba(15,36,96,0.25)' }}>
          {getInitials(appUser?.name ?? 'U')}
        </button>
      </div>

      {/* ── USER PANEL (desktop: popup above sidebar footer / mobile: bottom sheet) ── */}
      {userPanelOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 md:bg-black/20" onClick={() => setUserPanelOpen(false)} />

          {/* Desktop: card above sidebar footer */}
          <div className="hidden md:block absolute left-3 bottom-[72px] w-[196px] rounded-2xl bg-white shadow-2xl border border-[rgba(26,95,168,0.12)] overflow-hidden">
            {/* User info */}
            <div className="flex items-center gap-3 px-4 py-4 border-b border-[rgba(26,95,168,0.1)]">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#1a5fa8,#0f2460)' }}>
                {getInitials(appUser?.name ?? 'U')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-[#0f2460] truncate">{appUser?.name}</div>
                <div className="text-[11px] text-[#1a5fa8]/60 mt-0.5">{appUser?.role === 'owner' ? 'Propriétaire' : appUser?.role === 'chine' ? 'Chine' : 'Caissier'}</div>
                {appUser?.email && <div className="text-[11px] text-[#1a5fa8]/45 truncate">{appUser.email}</div>}
              </div>
            </div>
            {/* Actions */}
            <div className="px-2 py-2 flex flex-col gap-1">
              <button onClick={() => { setUserPanelOpen(false); toggleTheme() }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl hover:bg-[rgba(26,95,168,0.07)] cursor-pointer transition-colors">
                {dark ? <Sun size={15} className="text-[#1a5fa8]" /> : <Moon size={15} className="text-[#1a5fa8]" />}
                <span className="text-[13px] font-semibold text-[#0f2460]">{dark ? 'Mode clair' : 'Mode sombre'}</span>
              </button>
              <button onClick={() => { setUserPanelOpen(false); handleSignOut() }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl hover:bg-red-50 cursor-pointer transition-colors">
                <LogOut size={15} className="text-red-500" />
                <span className="text-[13px] font-semibold text-red-600">Déconnexion</span>
              </button>
            </div>
          </div>

          {/* Mobile: bottom sheet */}
          <div className="md:hidden absolute bottom-0 left-0 right-0 flex items-end justify-center">
            <div className="w-full max-w-sm rounded-t-2xl bg-white shadow-2xl" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-[#d0cfc9]" />
              </div>
              {/* User info */}
              <div className="flex items-center gap-4 px-6 py-4 border-b border-[rgba(26,95,168,0.1)]">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-[18px] font-bold text-white flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg,#1a5fa8,#0f2460)' }}>
                  {getInitials(appUser?.name ?? 'U')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[17px] font-bold text-[#0f2460] truncate">{appUser?.name}</div>
                  <div className="text-[13px] text-[#1a5fa8]/70 mt-0.5">{appUser?.role === 'owner' ? 'Propriétaire' : appUser?.role === 'chine' ? 'Chine' : 'Caissier'}</div>
                  {appUser?.email && <div className="text-[12px] text-[#1a5fa8]/50 mt-0.5 truncate">{appUser.email}</div>}
                </div>
              </div>
              {/* Actions */}
              <div className="px-4 py-3 flex flex-col gap-2">
                <button onClick={() => { setUserPanelOpen(false); toggleTheme() }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-[rgba(26,95,168,0.06)] border border-[rgba(26,95,168,0.1)] cursor-pointer active:opacity-80">
                  {dark ? <Sun size={18} className="text-[#1a5fa8]" /> : <Moon size={18} className="text-[#1a5fa8]" />}
                  <span className="text-[15px] font-semibold text-[#0f2460]">{dark ? 'Mode clair' : 'Mode sombre'}</span>
                </button>
                <button onClick={() => { setUserPanelOpen(false); handleSignOut() }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-red-50 border border-red-200 cursor-pointer active:opacity-80">
                  <LogOut size={18} className="text-red-500" />
                  <span className="text-[15px] font-semibold text-red-600">Déconnexion</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MOBILE DRAWER OVERLAY ───────────────────────────────────── */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />

          {/* Drawer */}
          <div className="relative flex flex-col w-[220px] h-full shadow-2xl bg-white border-r border-[rgba(26,95,168,0.15)]">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-[rgba(26,95,168,0.12)]">
              <img src="/BK_Tech_logo_cropped2.PNG" alt="BK Tech" className="h-14 w-auto object-contain" style={{ mixBlendMode: 'multiply' }} />
              <button onClick={() => setMenuOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-[rgba(26,95,168,0.08)] border border-[rgba(26,95,168,0.15)] cursor-pointer">
                <X size={15} style={{ color: '#0f2460' }} />
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5 overflow-y-auto">
              {NAV.map((item) => (
                <div key={item.to}>
                  {item.section && (
                    <div className="text-[10px] font-medium text-[#1a5fa8]/60 uppercase tracking-[0.8px] px-3 pt-4 pb-1.5">
                      {item.section}
                    </div>
                  )}
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-3 rounded-xl text-[16px] font-bold transition-all cursor-pointer select-none ${
                        isActive
                          ? 'bg-[rgba(26,95,168,0.12)] text-[#0f2460]'
                          : 'text-[#1a5fa8]/70 hover:bg-[rgba(26,95,168,0.07)] hover:text-[#0f2460]'
                      }`
                    }
                  >
                    <item.icon size={19} />
                    <span className="flex-1">{item.label}</span>
                  </NavLink>
                </div>
              ))}
            </nav>

            {/* Drawer footer */}
            <div className="px-3 py-4 border-t border-[rgba(26,95,168,0.12)] flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#1a5fa8,#0f2460)' }}>
                {getInitials(appUser?.name ?? 'U')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[#0f2460] truncate">{appUser?.name}</div>
                <div className="text-[11px] text-[#1a5fa8]/60">{appUser?.role === 'owner' ? 'Propriétaire' : appUser?.role === 'chine' ? 'Chine' : 'Caissier'}</div>
              </div>
              <button onClick={toggleTheme}
                className="w-9 h-9 rounded-xl bg-[rgba(26,95,168,0.08)] border border-[rgba(26,95,168,0.15)] flex items-center justify-center cursor-pointer">
                {dark ? <Sun size={15} className="text-[#1a5fa8]" /> : <Moon size={15} className="text-[#1a5fa8]" />}
              </button>
              <button onClick={handleSignOut}
                className="w-9 h-9 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center cursor-pointer">
                <LogOut size={15} className="text-red-500" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN ────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#f5f4f0] dark:bg-[#111110] min-w-0 md:pt-0 pt-20">
        <Outlet />
      </main>

      {/* ── DÉCOMPTE BANNER ─────────────────────────────────────────── */}
      {showDecompteBanner && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-32px)] max-w-md"
          style={{ filter: 'drop-shadow(0 8px 24px rgba(15,36,96,0.18))' }}>
          <div className="flex items-center gap-3 rounded-2xl border border-[#1a5fa8]/20 bg-white px-4 py-3.5">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'linear-gradient(135deg,#1a5fa8,#0f2460)' }}>
              <ClipboardCheck size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-[#0f2460]">Heure du décompte</div>
              <div className="text-[11px] text-[#6b6a66]">Pensez à saisir le stock physique</div>
            </div>
            <button
              onClick={() => {
                const todayKey = `decompte-dismissed-${new Date().toISOString().slice(0, 10)}`
                localStorage.setItem(todayKey, '1')
                setShowDecompteBanner(false)
                navigate('/stock')
              }}
              className="flex-shrink-0 rounded-[10px] border-none bg-[#1a5fa8] px-3 py-2 text-[12px] font-semibold text-white cursor-pointer hover:opacity-90">
              Faire décompte
            </button>
            <button
              onClick={() => {
                const todayKey = `decompte-dismissed-${new Date().toISOString().slice(0, 10)}`
                localStorage.setItem(todayKey, '1')
                setShowDecompteBanner(false)
              }}
              className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg border-none bg-[#f0efe9] cursor-pointer hover:opacity-80">
              <X size={13} className="text-[#6b6a66]" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
