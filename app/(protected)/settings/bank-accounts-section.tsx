'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Check, X, Building, CreditCard } from 'lucide-react'
import { addBankAccount, updateBankBalance, toggleBankAccount } from './actions'
import type { Company, BankAccount } from '@/lib/types/database'

function formatCents(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

function EditBalanceForm({ account }: { account: BankAccount }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await updateBankBalance(null, formData)
      if (result?.error) {
        setError(result.error)
      } else {
        setOpen(false)
        router.refresh()
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
      >
        <Pencil className="w-3 h-3" />
        Aggiorna saldo
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input type="hidden" name="id" value={account.id} />
      <input
        name="balance"
        type="number"
        step="0.01"
        defaultValue={(account.current_balance_cents / 100).toFixed(2)}
        className="w-28 px-2 py-1 text-xs bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <button type="submit" disabled={isPending} className="text-emerald-400 hover:text-emerald-300">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-300">
        <X className="w-3.5 h-3.5" />
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </form>
  )
}

function AddAccountForm({ companies }: { companies: Company[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await addBankAccount(null, formData)
      if (result?.error) {
        setError(result.error)
      } else {
        setOpen(false)
        router.refresh()
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-indigo-400 border border-indigo-500/30 hover:border-indigo-500/60 rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" />
        Aggiungi conto
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-3">
      <p className="text-sm font-medium text-zinc-200">Nuovo conto bancario</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Società</label>
          <select
            name="company_id"
            required
            className="w-full px-2.5 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Nome conto</label>
          <input
            name="name"
            required
            placeholder="es. BPM Conto principale"
            className="w-full px-2.5 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">IBAN (opzionale)</label>
          <input
            name="iban"
            placeholder="IT60 ..."
            className="w-full px-2.5 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Saldo attuale (€)</label>
          <input
            name="balance"
            type="number"
            step="0.01"
            defaultValue="0"
            className="w-full px-2.5 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm rounded-lg transition-colors"
        >
          {isPending ? 'Salvataggio...' : 'Salva'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded-lg transition-colors"
        >
          Annulla
        </button>
      </div>
    </form>
  )
}

export function BankAccountsSection({
  companies,
  bankAccounts,
}: {
  companies: Company[]
  bankAccounts: BankAccount[]
}) {
  const router = useRouter()
  const [togglingId, setTogglingId] = useState<string | null>(null)

  async function handleToggle(account: BankAccount) {
    setTogglingId(account.id)
    await toggleBankAccount(account.id, !account.is_active)
    setTogglingId(null)
    router.refresh()
  }

  const byCompany = companies.map((c) => ({
    company: c,
    accounts: bankAccounts.filter((a) => a.company_id === c.id),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium text-zinc-100">Conti Bancari</h2>
          <p className="text-sm text-zinc-400 mt-0.5">Gestisci i conti correnti per ogni società</p>
        </div>
        <AddAccountForm companies={companies} />
      </div>

      {byCompany.map(({ company, accounts }) => (
        <div key={company.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
            <Building className="w-4 h-4 text-zinc-500" />
            <span className="text-sm font-medium text-zinc-200">
              {company.code} — {company.name}
            </span>
          </div>

          {accounts.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-zinc-500">
              Nessun conto configurato
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Nome</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">IBAN</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Saldo</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">Aggiornato</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr
                    key={account.id}
                    className={`border-b border-zinc-800/50 last:border-0 ${!account.is_active ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-3.5 h-3.5 text-zinc-600" />
                        <span className="text-zinc-200">{account.name}</span>
                        {!account.is_active && (
                          <span className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">disabilitato</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 font-mono text-xs">
                      {account.iban || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-zinc-100">
                      {formatCents(account.current_balance_cents)}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">
                      {account.balance_updated_at
                        ? new Date(account.balance_updated_at).toLocaleDateString('it-IT')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 justify-end">
                        <EditBalanceForm account={account} />
                        <button
                          onClick={() => handleToggle(account)}
                          disabled={togglingId === account.id}
                          className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
                        >
                          {account.is_active ? 'Disabilita' : 'Abilita'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}
