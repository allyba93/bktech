import { useState, useEffect } from 'react'
import { X, User, Shield, Edit2, Check, Loader2 } from 'lucide-react'
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/firebase/config'
import { AppUser, COLLECTIONS } from '@/types'
import { useAuthStore } from '@/store/authStore'

interface Props {
  onClose: () => void
}

export function UsersModal({ onClose }: Props) {
  const { appUser: currentUser, setAppUser } = useAuthStore()
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<'owner' | 'cashier'>('cashier')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getDocs(collection(db, COLLECTIONS.users))
      .then(snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppUser))
        list.sort((a, b) => a.name.localeCompare(b.name))
        setUsers(list)
      })
      .finally(() => setLoading(false))
  }, [])

  const startEdit = (u: AppUser) => {
    setEditId(u.uid)
    setEditName(u.name)
    setEditRole(u.role)
  }

  const cancelEdit = () => { setEditId(null) }

  const saveEdit = async (uid: string) => {
    if (!editName.trim()) return
    setSaving(true)
    try {
      await updateDoc(doc(db, COLLECTIONS.users, uid), {
        name: editName.trim(),
        role: editRole,
      })
      setUsers(prev => prev.map(u =>
        u.uid === uid ? { ...u, name: editName.trim(), role: editRole } : u
      ))
      // If editing current user, update store too
      if (currentUser && uid === currentUser.uid) {
        setAppUser({ ...currentUser, name: editName.trim(), role: editRole })
      }
      setEditId(null)
    } finally {
      setSaving(false)
    }
  }

  const isOwner = currentUser?.role === 'owner'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(26,95,168,0.1)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#1a5fa8,#0f2460)' }}>
              <User size={15} className="text-white" />
            </div>
            <span className="text-[16px] font-bold text-[#0f2460]">Utilisateurs</span>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[rgba(26,95,168,0.07)] flex items-center justify-center cursor-pointer hover:opacity-80">
            <X size={15} style={{ color: '#0f2460' }} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={22} className="animate-spin text-[#1a5fa8]" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-10 text-[13px] text-[#a8a7a2]">Aucun utilisateur trouvé</div>
          ) : users.map(u => (
            <div key={u.uid}
              className="rounded-xl border border-[rgba(26,95,168,0.1)] bg-[rgba(26,95,168,0.03)] px-4 py-3">
              {editId === u.uid ? (
                /* Edit mode */
                <div className="flex flex-col gap-2">
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(u.uid); if (e.key === 'Escape') cancelEdit() }}
                    className="w-full rounded-lg border border-[rgba(26,95,168,0.25)] bg-white px-3 py-2 text-[13px] font-medium text-[#0f2460] outline-none focus:border-[#1a5fa8]"
                    placeholder="Nom complet"
                  />
                  {isOwner && (
                    <div className="flex gap-2">
                      {(['owner', 'cashier'] as const).map(r => (
                        <button key={r} onClick={() => setEditRole(r)}
                          className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors cursor-pointer ${
                            editRole === r
                              ? 'bg-[#1a5fa8] text-white border-[#1a5fa8]'
                              : 'bg-white text-[#1a5fa8] border-[rgba(26,95,168,0.25)]'
                          }`}>
                          {r === 'owner' ? 'Propriétaire' : 'Caissier'}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={cancelEdit}
                      className="flex-1 py-1.5 rounded-lg text-[12px] font-semibold border border-[rgba(26,95,168,0.2)] text-[#1a5fa8] bg-white cursor-pointer hover:opacity-80">
                      Annuler
                    </button>
                    <button onClick={() => saveEdit(u.uid)} disabled={saving}
                      className="flex-1 py-1.5 rounded-lg text-[12px] font-semibold bg-[#1a5fa8] text-white cursor-pointer hover:opacity-90 flex items-center justify-center gap-1.5 disabled:opacity-60">
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      Enregistrer
                    </button>
                  </div>
                </div>
              ) : (
                /* Display mode */
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,#1a5fa8,#0f2460)' }}>
                    {u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-[#0f2460] truncate">{u.name}</span>
                      {u.uid === currentUser?.uid && (
                        <span className="text-[10px] font-medium bg-[#e8f0ff] text-[#1a5fa8] px-1.5 py-0.5 rounded-full flex-shrink-0">Vous</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Shield size={10} className={u.role === 'owner' ? 'text-[#1a5fa8]' : 'text-[#a8a7a2]'} />
                      <span className="text-[11px] text-[#1a5fa8]/60">
                        {u.role === 'owner' ? 'Propriétaire' : 'Caissier'}
                      </span>
                      {u.email && <span className="text-[11px] text-[#a8a7a2] truncate">· {u.email}</span>}
                    </div>
                  </div>
                  {(isOwner || u.uid === currentUser?.uid) && (
                    <button onClick={() => startEdit(u)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer hover:bg-[rgba(26,95,168,0.1)] transition-colors flex-shrink-0">
                      <Edit2 size={13} className="text-[#1a5fa8]" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
