import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { todayRome } from '@/lib/decadi'
import { loadTasks, loadSignals } from '@/lib/lavoro-load'
import OggiClient from './oggi-client'

export default async function OggiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = todayRome()
  const [tasks, signals, { data: allRules }, { data: companies }] = await Promise.all([
    loadTasks(supabase, today),
    loadSignals(supabase, today),
    supabase.from('daily_task_rules').select('id, title, freq, days, holiday, active, company_id, sort').order('sort'),
    supabase.from('companies').select('id, code'),
  ])
  const strip = (o: (typeof tasks.open)[number]) => ({
    ruleId: o.rule.id, title: o.rule.title, description: o.rule.description, href: o.rule.href,
    key: o.key, due: o.due, lateDays: o.lateDays, done: o.done, auto: !!o.rule.auto,
  })
  return (
    <OggiClient
      today={today}
      open={tasks.open.map(strip)}
      closed={tasks.closed.map(strip)}
      upcoming={tasks.upcoming.map(strip)}
      signals={signals}
      rules={(allRules ?? []).map(r => ({ ...r, days: r.days ?? [] }))}
      companyCodes={Object.fromEntries((companies ?? []).map(c => [c.id, c.code]))}
    />
  )
}
