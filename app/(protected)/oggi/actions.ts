'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { error: string }

function refresh() {
  revalidatePath('/oggi')
  revalidatePath('/', 'layout')
}

// Segna fatta (o di nuovo da fare) un'attività per la sua data prevista
export async function setTaskDone(ruleId: string, periodKey: string, done: boolean): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) return { error: 'Data non valida' }
  const { error } = done
    ? await supabase.from('daily_task_done').upsert({ rule_id: ruleId, period_key: periodKey, done_by: user.email }, { onConflict: 'rule_id,period_key' })
    : await supabase.from('daily_task_done').delete().eq('rule_id', ruleId).eq('period_key', periodKey)
  if (error) return { error: error.message }
  refresh()
  return { ok: true }
}

// «Visto, è giusto così»: la segnalazione non ricompare finché la sua chiave non cambia
export async function dismissSignal(key: string): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const { error } = await supabase.from('signal_dismissals').upsert({ key, dismissed_by: user.email }, { onConflict: 'key' })
  if (error) return { error: error.message }
  refresh()
  return { ok: true }
}

// Calendario: giorni del mese, festivi, attiva/spenta
export async function updateTaskRule(id: string, days: number[], holiday: 'prima' | 'dopo', active: boolean): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  if (days.some(d => !Number.isInteger(d) || d < 1 || d > 31)) return { error: 'I giorni vanno da 1 a 31' }
  const { error } = await supabase.from('daily_task_rules').update({ days, holiday, active }).eq('id', id)
  if (error) return { error: error.message }
  refresh()
  return { ok: true }
}
