-- La copia di sicurezza del 07/09 stava in public senza RLS: leggibile con la chiave anon.
-- Resta nel database (rete di sicurezza della migrazione payment_transactions), ma solo per il service role.
ALTER TABLE public.payment_schedule_backup_20260907 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_schedule_backup_20260907 FROM anon, authenticated;
