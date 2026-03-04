'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export async function signIn(_: unknown, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email e password sono obbligatori' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user) {
    return { error: 'Credenziali non valide. Riprova.' }
  }

  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0].trim() ?? hdrs.get('x-real-ip') ?? null
  const ua = hdrs.get('user-agent') ?? null

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', data.user.id).single()

  await supabase.from('access_logs').insert({
    user_id: data.user.id,
    user_email: data.user.email ?? email,
    user_role: profile?.role ?? null,
    event_type: 'login',
    ip_address: ip,
    user_agent: ua,
  })

  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createClient()

  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0].trim() ?? hdrs.get('x-real-ip') ?? null
  const ua = hdrs.get('user-agent') ?? null

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase
      .from('user_profiles').select('role').eq('id', user.id).single()
    await supabase.from('access_logs').insert({
      user_id: user.id,
      user_email: user.email ?? '',
      user_role: profile?.role ?? null,
      event_type: 'logout',
      ip_address: ip,
      user_agent: ua,
    })
  }

  await supabase.auth.signOut()
  redirect('/login')
}
