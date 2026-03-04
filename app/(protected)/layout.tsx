import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/sidebar'
import { SessionTracker } from '@/components/session-tracker'

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
  const unreadCount = isStrategic ? (countResult.count ?? 0) : undefined

  const cookieStore = await cookies()
  const hasSessionCookie = cookieStore.has('wt_session')

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      <Sidebar unreadCount={unreadCount} isStrategic={isStrategic} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      {!hasSessionCookie && <SessionTracker />}
    </div>
  )
}
