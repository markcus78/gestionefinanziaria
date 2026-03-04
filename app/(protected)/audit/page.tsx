import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AuditClient } from './audit-client'
import type { AccessLog } from '@/lib/types/database'

export default async function AuditPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'strategic') redirect('/dashboard')

  const { data: logs } = await supabase
    .from('access_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Audit Log Accessi</h1>
      <AuditClient logs={(logs ?? []) as AccessLog[]} />
    </div>
  )
}
