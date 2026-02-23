'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateUserRole } from './actions'
import type { UserProfile, UserRole } from '@/lib/types/database'

const ROLE_LABELS: Record<UserRole, string> = {
  strategic: 'Strategico',
  operational: 'Operativo',
  supervisor: 'Supervisore',
}

const ROLE_COLORS: Record<UserRole, string> = {
  strategic: 'text-indigo-400 bg-indigo-500/10',
  operational: 'text-emerald-400 bg-emerald-500/10',
  supervisor: 'text-amber-400 bg-amber-500/10',
}

function UserRow({ user, currentUserId }: { user: UserProfile; currentUserId: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleRoleChange(newRole: UserRole) {
    setLoading(true)
    await updateUserRole(user.id, newRole)
    setLoading(false)
    setEditing(false)
    router.refresh()
  }

  return (
    <tr className="border-b border-zinc-800/50 last:border-0">
      <td className="px-4 py-3">
        <span className="text-zinc-200 text-sm">{user.email ?? user.id}</span>
        {user.id === currentUserId && (
          <span className="ml-2 text-xs text-zinc-500">(tu)</span>
        )}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <div className="flex items-center gap-2">
            {(['strategic', 'operational', 'supervisor'] as UserRole[]).map((role) => (
              <button
                key={role}
                onClick={() => handleRoleChange(role)}
                disabled={loading}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                  user.role === role
                    ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                } disabled:opacity-50`}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
            <button
              onClick={() => setEditing(false)}
              className="text-xs text-zinc-500 hover:text-zinc-300 ml-1"
            >
              Annulla
            </button>
          </div>
        ) : (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[user.role]}`}>
            {ROLE_LABELS[user.role]}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            Modifica ruolo
          </button>
        )}
      </td>
    </tr>
  )
}

export function UsersSection({
  users,
  currentUserId,
}: {
  users: UserProfile[]
  currentUserId: string
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-medium text-zinc-100">Utenti</h2>
        <p className="text-sm text-zinc-400 mt-0.5">
          Gestisci i ruoli degli utenti. Solo gli utenti <strong className="text-zinc-300">strategici</strong> possono
          modificare i ruoli.
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Email</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Ruolo</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <UserRow key={user.id} user={user} currentUserId={currentUserId} />
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">
            Nessun utente registrato ancora. Crea gli utenti da Supabase Auth.
          </div>
        )}
      </div>
    </div>
  )
}
