import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/sidebar'
import { SessionTracker } from '@/components/session-tracker'
import { loadTasks } from '@/lib/lavoro-load'
import { todayRome } from '@/lib/decadi'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [profileResult, countResult] = await Promise.all([
    supabase.from('user_profiles').select('role').eq('id', user.id).single(),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'aperta'),
  ])

  const isStrategic = profileResult.data?.role === 'strategic'
  // Attività da fare oggi (in rosso sul pulsante «Lavoro quotidiano»); se la lettura fallisce, niente numero
  const todoCount = await loadTasks(supabase, todayRome()).then(t => t.open.length).catch(() => undefined)
  const unreadCount = isStrategic ? (countResult.count ?? 0) : undefined

  const cookieStore = await cookies()
  const hasSessionCookie = cookieStore.has('wt_session')

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      <Sidebar unreadCount={unreadCount} isStrategic={isStrategic} todoCount={todoCount} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      {!hasSessionCookie && <SessionTracker />}
    </div>
  )
}
