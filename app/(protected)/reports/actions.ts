'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ReportType, ReportStatus } from '@/lib/types/database'

export async function createReport(report_type: ReportType, page: string, description: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase.from('reports').insert({
    created_by: user.id,
    author_email: user.email ?? null,
    report_type, page, description,
  })
  if (error) return { error: error.message }

  const apiKey = process.env.RESEND_API_KEY
  if (apiKey) {
    const typeLabel = { bug: 'Bug', domanda: 'Domanda', integrazione: 'Integrazione', altro: 'Altro' }[report_type]
    const dateStr = new Date().toLocaleDateString('it-IT')
    const text = `[SEGNALAZIONE — ${dateStr}]\nDa: ${user.email}\nTipo: ${typeLabel}\nPagina: ${page}\nDescrizione: "${description}"`
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'GestFin <noreply@resend.wellnesstown.it>',
          to: ['marco@wellnesstown.it'],
          subject: `[GestFin] Segnalazione: ${typeLabel} — ${page}`,
          html: `<div style="font-family:monospace;background:#18181b;color:#e4e4e7;padding:16px;border-radius:8px;white-space:pre-wrap">${text}</div><p style="color:#71717a;font-size:12px;margin-top:16px">→ <a href="https://gestionefinanziariawt.vercel.app/reports" style="color:#818cf8">Apri Segnalazioni</a></p>`,
        }),
      })
    } catch { /* graceful degradation */ }
  }

  revalidatePath('/reports')
  revalidatePath('/', 'layout')
  return { success: true as const }
}

export async function markAsRead(reportId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const { error } = await supabase.from('reports').update({ is_read: true }).eq('id', reportId)
  if (error) return { error: error.message }
  revalidatePath('/reports')
  revalidatePath('/', 'layout')
  return { success: true as const }
}

export async function updateReportNotes(reportId: string, notes: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const { error } = await supabase.from('reports').update({ notes }).eq('id', reportId)
  if (error) return { error: error.message }
  revalidatePath('/reports')
  return { success: true as const }
}

export async function updateReportStatus(reportId: string, status: ReportStatus) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const { data, error } = await supabase
    .from('reports')
    .update({ status, is_read: true })
    .eq('id', reportId)
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
    return { error: `Aggiornamento bloccato (ruolo: ${profile?.role ?? 'non trovato'})` }
  }
  revalidatePath('/reports')
  revalidatePath('/', 'layout')
  return { success: true as const }
}
