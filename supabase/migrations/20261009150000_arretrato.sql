-- Tesoreria a decadi, Pezzo 3: il debito arretrato.
--
-- L'arretrato è quello che il cruscotto lascia fuori (scadute prima della data di taglio,
-- utenze e personale scaduti). Si raggruppa per creditore dentro la società; le righe
-- restano nello scadenzario, che è della contabilità: qui si salvano solo la decisione
-- e il piano delle quote.
--
--   backlog_items         una decisione per creditore e società
--                         chiave: 'S:<supplier_id>' oppure 'N:<nome normalizzato>'
--   backlog_installments  le quote per decade; quelle non pagate entrano nel cruscotto
--                         alla riga «Rientro arretrati», quelle pagate escono

CREATE TABLE IF NOT EXISTS backlog_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  creditor_key  TEXT NOT NULL,
  creditor_name TEXT NOT NULL,
  decision      TEXT NOT NULL DEFAULT 'da_decidere'
                CHECK (decision IN ('da_decidere','pagare','dilazionare','stralcio','non_si_paga')),
  agreed_cents  BIGINT CHECK (agreed_cents IS NULL OR agreed_cents >= 0),
  notes         TEXT,
  decided_by    UUID REFERENCES auth.users(id),
  decided_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, creditor_key)
);

CREATE TABLE IF NOT EXISTS backlog_installments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
  month        TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  idx          SMALLINT NOT NULL CHECK (idx BETWEEN 1 AND 3),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  paid_at      DATE,
  paid_by      UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS backlog_installments_item ON backlog_installments(item_id);

ALTER TABLE backlog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlog_installments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['backlog_items','backlog_installments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "read_all" ON %I', t);
    EXECUTE format('CREATE POLICY "read_all" ON %I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS "write_ops" ON %I', t);
    EXECUTE format('CREATE POLICY "write_ops" ON %I FOR INSERT TO authenticated WITH CHECK (get_user_role() IN (''strategic'',''operational''))', t);
    EXECUTE format('DROP POLICY IF EXISTS "update_ops" ON %I', t);
    EXECUTE format('CREATE POLICY "update_ops" ON %I FOR UPDATE TO authenticated USING (get_user_role() IN (''strategic'',''operational''))', t);
    EXECUTE format('DROP POLICY IF EXISTS "delete_ops" ON %I', t);
    EXECUTE format('CREATE POLICY "delete_ops" ON %I FOR DELETE TO authenticated USING (get_user_role() IN (''strategic'',''operational''))', t);
  END LOOP;
END $$;
