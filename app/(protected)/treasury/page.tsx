import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Landmark } from 'lucide-react'
import TreasuryClient from './treasury-client'
import { loadTreasury, BLOCKS } from '@/lib/treasury-load'

export default async function TreasuryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const {
    today, blocks, group, windows, creditors, allCompanies, allAccounts, snapshot, coffaFresh, noticesRaw, requestsRaw,
  } = await loadTreasury(supabase)
  const view = (sp.block && BLOCKS.some(b => b.code === sp.block)) ? sp.block : 'GRUPPO'
  const shown = view === 'GRUPPO' ? group : blocks.find(b => b.code === view)!
  const blockOfCompany = new Map(allCompanies.map(c => [c.id, c.treasury_block as string | null]))
  const creditorsShown = view === 'GRUPPO' ? creditors : creditors.filter(c => blockOfCompany.get(c.companyId) === view)
  const accountsShown = view === 'GRUPPO'
    ? allAccounts
    : allAccounts.filter(a => allCompanies.some(c => c.id === a.company_id && c.treasury_block === view))

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="flex items-center gap-3 mb-6">
        <Landmark className="w-5 h-5 text-blue-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Tesoreria a decadi</h1>
      </div>

      <TreasuryClient
        view={view}
        blocks={BLOCKS}
        result={shown}
        window={windows[view]}
        notices={(noticesRaw ?? []).map(n => ({ key: n.supplier_key, notified: n.notified, notifiedAt: n.notified_at }))}
        subBlocks={view === 'GRUPPO' ? blocks : []}
        subWindows={view === 'GRUPPO' ? blocks.map(b => windows[b.code]) : []}
        creditors={creditorsShown}
        accounts={accountsShown}
        companies={allCompanies.map(c => ({ id: c.id, code: c.code }))}
        today={today}
        coffa={snapshot ? { date: snapshot.snapshot_date, fresh: !!coffaFresh } : null}
        requests={(requestsRaw ?? [])
          .filter(r => view === 'GRUPPO' || blockOfCompany.get(r.company_id) === view)
          .map(r => ({ companyId: r.company_id, label: `${r.supplier_name} – ${r.description}`, cents: r.amount_cents, date: r.expected_date }))}
      />
    </div>
  )
}
