-- Richieste di spesa (regola di Marco, 14/10/2026): il quarto livello delle uscite, accanto a
-- scadenze reali, impegni e stime. Una richiesta non entra nella cassa: il cruscotto la mostra a
-- parte («se approvate»). Approvata, diventa un impegno (payment_schedule, entry_type commitment)
-- legato al suo fornitore; poi l'impegno collassa nella fattura quando arriva dallo scadenzario.
-- Tabella a sé, e non uno stato di payment_schedule: le pagine che leggono «tutto tranne pagato e
-- annullato» conterebbero le richieste come uscite vere.

CREATE TABLE IF NOT EXISTS spend_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  supplier_id     UUID REFERENCES supplier_registry(id) ON DELETE SET NULL,
  supplier_name   TEXT NOT NULL,
  description     TEXT NOT NULL,
  amount_cents    BIGINT NOT NULL CHECK (amount_cents > 0),
  expected_date   DATE NOT NULL,
  requested_by    TEXT,                       -- chi chiede (nome libero: dipendente, reparto…)
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'in_attesa' CHECK (status IN ('in_attesa', 'approvata', 'respinta')),
  decided_by      TEXT,                       -- email di chi ha deciso
  decided_at      TIMESTAMPTZ,
  decision_note   TEXT,
  commitment_id   UUID REFERENCES payment_schedule(id) ON DELETE SET NULL,
  created_by      UUID DEFAULT auth.uid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spend_requests_status_idx ON spend_requests (status, expected_date);

ALTER TABLE spend_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_all" ON spend_requests;
CREATE POLICY "read_all" ON spend_requests FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "write_ops" ON spend_requests;
CREATE POLICY "write_ops" ON spend_requests FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('strategic','operational'));
DROP POLICY IF EXISTS "update_ops" ON spend_requests;
CREATE POLICY "update_ops" ON spend_requests FOR UPDATE TO authenticated USING (get_user_role() IN ('strategic','operational'));
DROP POLICY IF EXISTS "delete_strategic" ON spend_requests;
CREATE POLICY "delete_strategic" ON spend_requests FOR DELETE TO authenticated USING (get_user_role() = 'strategic');
