import { redirect } from 'next/navigation'

// Dal 23/10/2026 (Marco) le stime delle uscite sono impegni stimati: stanno in Impegni → Stimati.
// Questa pagina resta per i link vecchi (Lavoro quotidiano, segnalibri).
export default function StimePage() {
  redirect('/impegni?tab=stimati')
}
