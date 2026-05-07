// src/pages/LoginPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export function LoginPage() {
  const { signIn, loading, error, clearError } = useAuthStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    await signIn(email, password)
    if (!useAuthStore.getState().error) navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#f5f4f0] dark:bg-[#111110] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-2">
          <img src="/BK_Tech_logo_cropped2.PNG" alt="BK Tech" className="h-24 w-auto object-contain" />
          <div className="text-xs text-[#a8a7a2]">Gestion de boutique</div>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-[#1c1c1a] border border-black/[0.08] dark:border-white/[0.07] rounded-2xl p-6">
          <h1 className="text-[17px] font-medium text-[#111110] dark:text-[#f0efe9] mb-1">Connexion</h1>
          <p className="text-[12px] text-[#a8a7a2] mb-6">Accédez à votre espace de gestion</p>

          {error && (
            <div className="mb-4 p-3 bg-[#fdecea] border border-[#c0392b]/20 rounded-lg text-[12px] text-[#c0392b]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                className="input-base"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6b6a66]">Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="input-base"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full justify-center mt-2 disabled:opacity-50"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
