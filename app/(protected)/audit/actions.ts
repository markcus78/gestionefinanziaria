'use server'

import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function logSessionRestored() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0].trim() ?? hdrs.get('x-real-ip') ?? null
  const ua = hdrs.get('user-agent') ?? null

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()

  await supabase.from('access_logs').insert({
    user_id: user.id,
    user_email: user.email ?? '',
    user_role: profile?.role ?? null,
    event_type: 'login',
    ip_address: ip,
    user_agent: ua,
  })

  const cookieStore = await cookies()
  cookieStore.set('wt_session', '1', { httpOnly: true, sameSite: 'lax', path: '/' })
}
