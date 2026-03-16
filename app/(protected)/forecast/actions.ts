'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ── Revenue forecast (channel_id = null = forecast globale per società) ────────
// Nota: UNIQUE(company_id, channel_id, year, month) non impedisce più NULL duplicati
// in PostgreSQL → usiamo check-then-update manuale.

export async function upsertRevenueForecast(
  companyId: string,
  year: number,
  month: number,
  cents: number
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: existing } = await supabase
    .from('monthly_revenue_forecasts')
    .select('id')
    .eq('company_id', companyId)
    .is('channel_id', null)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()

  let error
  if (existing) {
    ;({ error } = await supabase
      .from('monthly_revenue_forecasts')
      .update({ forecast_gross_cents: cents, updated_at: new Date().toISOString() })
      .eq('id', existing.id))
  } else {
    ;({ error } = await supabase
      .from('monthly_revenue_forecasts')
      .insert({
        company_id: companyId,
        channel_id: null,
        year,
        month,
        forecast_gross_cents: cents,
        created_by: user?.id ?? null,
      }))
  }

  if (error) return { error: error.message }
  revalidatePath('/forecast')
  return { success: true }
}

