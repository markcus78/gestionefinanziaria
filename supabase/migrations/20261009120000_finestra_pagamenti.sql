-- Tesoreria a decadi, Pezzo 2: la percentuale della finestra e gli avvisi ai fornitori.
--
--   treasury_window_pct  la % decisa per una decade (una sola per tutto il gruppo);
--                        senza riga vale la % suggerita dal calcolo
--   supplier_notices     fornitori avvisati del pagamento a quote (un avviso per fornitore,
--                        chiave = nome normalizzato, comune alle quattro società)

CREATE TABLE IF NOT EXISTS treasury_window_pct (
  month      TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  idx        SMALLINT NOT NULL CHECK (idx BETWEEN 1 AND 3),
  pct        NUMERIC(5,2) NOT NULL CHECK (pct BETWEEN 0 AND 100),
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (month, idx)
);

CREATE TABLE IF NOT EXISTS supplier_notices (
  supplier_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  notified     BOOLEAN NOT NULL DEFAULT FALSE,
  notified_at  DATE,
  notified_by  UUID REFERENCES auth.users(id),
  note         TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE treasury_window_pct ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_notices ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['treasury_window_pct','supplier_notices'] LOOP
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
