import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Settings } from 'lucide-react'
import { TabNav } from './tab-nav'
import { BankAccountsSection } from './bank-accounts-section'
import { ChannelsSection } from './channels-section'
import { ThresholdsSection } from './thresholds-section'
import { UsersSection } from './users-section'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const tab = params.tab ?? 'banche'

  // Dati sempre necessari
  const [{ data: companies }, { data: channels }, { data: userProfile }] = await Promise.all([
    supabase.from('companies').select('*').eq('is_active', true).order('code'),
    supabase.from('cash_channels').select('*').order('name'),
    supabase.from('user_profiles').select('role').eq('id', user.id).single(),
  ])

  const isStrategic = userProfile?.role === 'strategic'

  // Dati per tab specifica
  let bankAccounts = null
  let companyCashChannels = null
  let users = null

  if (tab === 'banche') {
    const { data } = await supabase
      .from('bank_accounts')
      .select('*')
      .order('company_id')
    bankAccounts = data
  }

  if (tab === 'canali') {
    const { data } = await supabase.from('company_cash_channels').select('*')
    companyCashChannels = data
  }

  if (tab === 'utenti') {
    if (!isStrategic) redirect('/settings?tab=banche')
    const { data } = await supabase.from('user_profiles').select('*').order('role')
    users = data
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-5 h-5 text-indigo-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Impostazioni</h1>
      </div>

      <TabNav activeTab={tab} />

      <div className="mt-6">
        {tab === 'banche' && (
          <BankAccountsSection
            companies={companies ?? []}
            bankAccounts={bankAccounts ?? []}
          />
        )}

        {tab === 'canali' && (
          <ChannelsSection
            companies={companies ?? []}
            channels={channels ?? []}
            companyCashChannels={companyCashChannels ?? []}
          />
        )}

        {tab === 'soglie' && (
          <ThresholdsSection companies={companies ?? []} />
        )}

        {tab === 'utenti' && isStrategic && (
          <UsersSection users={users ?? []} currentUserId={user.id} />
        )}
      </div>
    </div>
  )
}
