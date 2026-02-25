import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/sidebar'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [profileResult, countResult] = await Promise.all([
    supabase.from('user_profiles').select('role').eq('id', user.id).single(),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('is_read', false),
  ])

  const isStrategic = profileResult.data?.role === 'strategic'
  const unreadCount = isStrategic ? (countResult.count ?? 0) : undefined

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      <Sidebar unreadCount={unreadCount} isStrategic={isStrategic} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
