import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ReportsClient } from './reports-client'
import type { Report } from '@/lib/types/database'

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'strategic') redirect('/dashboard')

  const { data: reports } = await supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Segnalazioni</h1>
        <p className="text-sm text-zinc-400 mt-1">Messaggi inviati dal team tramite l&apos;app.</p>
      </div>
      <ReportsClient reports={(reports ?? []) as Report[]} />
    </div>
  )
}
