-- Tesoreria a decadi di gruppo (Pezzo 1).
--
-- La tesoreria lavora per decadi (1-10, 11-20, 21-fine mese) e per blocchi:
-- APPIAE, HANGAR, WT_ARIES (Aries paga le bollette di WT, quindi sono una cassa sola).
--
--   bank_accounts.balance_date       data a cui si riferisce il saldo (scelta, non now())
--   bank_accounts.credit_line_cents  fido del conto
--   companies.treasury_block         blocco di tesoreria della società
--   companies.backlog_before         partite contabili con data precedente = arretrato (stock),
--                                    fuori dal cruscotto; NULL = nessun taglio
--   supplier_registry.exclude_from_treasury  fornitore escluso (es. GIMS, Nuova Garofoli)
--   treasury_estimates               uscite e incassi stimati al mese, divisi per decade
--   treasury_estimate_overrides      correzione di una quota (es. "già pagata" = 0)
--   treasury_settings                soglia minima di gruppo
--   coffa_*                          previsione incassi spinta ogni giorno da Coffa

ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS balance_date DATE,
  ADD COLUMN IF NOT EXISTS credit_line_cents BIGINT NOT NULL DEFAULT 0;

UPDATE bank_accounts SET balance_date = (balance_updated_at AT TIME ZONE 'Europe/Rome')::date
WHERE balance_date IS NULL AND balance_updated_at IS NOT NULL;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS treasury_block TEXT CHECK (treasury_block IN ('APPIAE','HANGAR','WT_ARIES')),
  ADD COLUMN IF NOT EXISTS backlog_before DATE;

UPDATE companies SET treasury_block = CASE code
  WHEN 'APPIAE' THEN 'APPIAE' WHEN 'HANGAR' THEN 'HANGAR' ELSE 'WT_ARIES' END
WHERE treasury_block IS NULL;

UPDATE companies SET backlog_before = DATE '2026-01-01'
WHERE code IN ('WT','ARIES','HANGAR') AND backlog_before IS NULL;

ALTER TABLE supplier_registry
  ADD COLUMN IF NOT EXISTS exclude_from_treasury BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── Stime ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS treasury_estimates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  label         TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('incasso','muro','automatico','fornitori')),
  category      TEXT NOT NULL,
  monthly_cents BIGINT NOT NULL DEFAULT 0 CHECK (monthly_cents >= 0),
  pct_d1        NUMERIC(5,2) NOT NULL,
  pct_d2        NUMERIC(5,2) NOT NULL,
  pct_d3        NUMERIC(5,2) NOT NULL,
  replaced_by   TEXT[] NOT NULL DEFAULT '{}',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  notes         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (pct_d1 >= 0 AND pct_d2 >= 0 AND pct_d3 >= 0 AND pct_d1 + pct_d2 + pct_d3 BETWEEN 99.9 AND 100.1)
);

CREATE TABLE IF NOT EXISTS treasury_estimate_overrides (
  estimate_id  UUID NOT NULL REFERENCES treasury_estimates(id) ON DELETE CASCADE,
  month        TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  idx          SMALLINT NOT NULL CHECK (idx BETWEEN 1 AND 3),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  note         TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (estimate_id, month, idx)
);

CREATE TABLE IF NOT EXISTS treasury_settings (
  id                    BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  group_threshold_cents BIGINT NOT NULL DEFAULT 500000,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO treasury_settings (id) VALUES (TRUE) ON CONFLICT DO NOTHING;

ALTER TABLE treasury_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_estimate_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['treasury_estimates','treasury_estimate_overrides','treasury_settings'] LOOP
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

-- Stime iniziali: medie dei libri giornale mar-ago 2026 e decisioni di Marco (08/10/2026).
-- Personale APPIAE 45.000 €: diviso come lo storico (dipendenti 25%, collaboratori e P.IVA 75%).
INSERT INTO treasury_estimates (company_id, label, kind, category, monthly_cents, pct_d1, pct_d2, pct_d3, replaced_by, notes)
SELECT c.id, v.label, v.kind, v.category, v.cents, v.d1, v.d2, v.d3, v.repl, v.notes
FROM (VALUES
  ('APPIAE','Dipendenti','muro','personale',1120000,0,100,0,ARRAY['salary_item','extra_item'],'quota dei 45.000 € di personale decisi da Marco il 30/09'),
  ('APPIAE','Collaboratori e P.IVA','muro','collaboratori',3380000,0,100,0,ARRAY['collab_item','piva_item'],'quota dei 45.000 € di personale decisi da Marco il 30/09'),
  ('APPIAE','F24','muro','f24',1000000,0,100,0,ARRAY['tax_item'],'Marco 30/09: 10.000 € al mese'),
  ('APPIAE','Commissioni e spese bancarie','automatico','banca',118400,33.34,33.33,33.33,ARRAY[]::text[],'media mar-ago 2026'),
  ('APPIAE','Spese in contanti non registrate','automatico','contanti',45000,33.34,33.33,33.33,ARRAY[]::text[],'crescita media della cassa contabile mar-ago 2026'),
  ('APPIAE','Nuove fatture fornitori (stima)','fornitori','nuove_fatture',4369600,33.34,33.33,33.33,ARRAY[]::text[],'fatture registrate in media al mese mar-ago 2026'),
  ('APPIAE','Incassi abbonamenti (Coffa)','incasso','coffa',10248600,36.1,28.7,35.2,ARRAY[]::text[],'riserva se Coffa non invia; i pesi dividono la previsione mensile di Coffa'),
  ('WT','Utenze: luce, acqua, gas, telefono','muro','utenze',3189800,33.34,33.33,33.33,ARRAY[]::text[],'bollette di WT pagate da Aries e Appiae, media mar-ago 2026'),
  ('WT','Personale','muro','personale',117700,0,100,0,ARRAY['salary_item','extra_item'],'media mar-ago 2026'),
  ('WT','F24','muro','f24',18200,0,100,0,ARRAY['tax_item'],'media mar-ago 2026'),
  ('WT','Rate e piani (Centrica, ruoli, mutuo Aries)','automatico','rate',213500,0,0,100,ARRAY[]::text[],'media mar-ago 2026'),
  ('WT','Spese in contanti non registrate','automatico','contanti',220000,33.34,33.33,33.33,ARRAY[]::text[],'crescita media della cassa contabile mar-ago 2026'),
  ('WT','Nuove fatture fornitori (stima)','fornitori','nuove_fatture',416100,33.34,33.33,33.33,ARRAY[]::text[],'WT 3.278 + Aries 883, media mar-ago 2026'),
  ('WT','Affitti degli spazi (incassati da Aries)','incasso','affitti',511200,33.34,33.33,33.33,ARRAY[]::text[],'media mar-ago 2026'),
  ('HANGAR','Personale','muro','personale',344400,0,100,0,ARRAY['salary_item','extra_item'],'media mar-ago 2026'),
  ('HANGAR','F24','muro','f24',66800,0,100,0,ARRAY['tax_item'],'media mar-ago 2026'),
  ('HANGAR','Rate e spese bancarie','automatico','rate',235100,33.34,33.33,33.33,ARRAY[]::text[],'media mar-ago 2026'),
  ('HANGAR','Spese in contanti non registrate','automatico','contanti',250000,33.34,33.33,33.33,ARRAY[]::text[],'crescita media della cassa contabile mar-ago 2026'),
  ('HANGAR','Nuove fatture fornitori bar (stima)','fornitori','nuove_fatture',1430800,33.34,33.33,33.33,ARRAY[]::text[],'media mar-ago 2026'),
  ('HANGAR','Incassi bar','incasso','bar',1400000,33.34,33.33,33.33,ARRAY[]::text[],'ipotesi di Marco, 08/10/2026')
) AS v(code,label,kind,category,cents,d1,d2,d3,repl,notes)
JOIN companies c ON c.code = v.code
WHERE NOT EXISTS (SELECT 1 FROM treasury_estimates);

-- ─── Ponte Coffa ────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.bridge_tokens (
  name         TEXT PRIMARY KEY,
  token_sha256 TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coffa_snapshots (
  snapshot_date  DATE PRIMARY KEY,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  giorni_incasso INTEGER,
  payload        JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS coffa_cash_days (
  snapshot_date      DATE NOT NULL REFERENCES coffa_snapshots(snapshot_date) ON DELETE CASCADE,
  day                DATE NOT NULL,
  incassato_cents    BIGINT NOT NULL DEFAULT 0,
  da_incassare_cents BIGINT NOT NULL DEFAULT 0,
  da_arrivare_cents  BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (snapshot_date, day)
);
CREATE TABLE IF NOT EXISTS coffa_cash_months (
  snapshot_date DATE NOT NULL REFERENCES coffa_snapshots(snapshot_date) ON DELETE CASCADE,
  month         DATE NOT NULL,
  atteso_cents  BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (snapshot_date, month)
);

ALTER TABLE coffa_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE coffa_cash_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE coffa_cash_months ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_all" ON coffa_snapshots;
CREATE POLICY "read_all" ON coffa_snapshots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "read_all" ON coffa_cash_days;
CREATE POLICY "read_all" ON coffa_cash_days FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "read_all" ON coffa_cash_months;
CREATE POLICY "read_all" ON coffa_cash_months FOR SELECT TO authenticated USING (true);

-- Payload atteso:
-- { "snapshot_date": "2026-10-08", "giorni_incasso": 5,
--   "giorni": [{"giorno":"2026-10-09","incassato":0,"daIncassare":120.5,"daArrivare":300}, ...],
--   "mesi":   [{"mese":"2026-11","atteso":102486}, ...] }   importi in euro
CREATE OR REPLACE FUNCTION public.ricevi_tesoreria_coffa(p_token TEXT, p_payload JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash  TEXT;
  v_date  DATE;
  v_days  INTEGER;
BEGIN
  SELECT token_sha256 INTO v_hash FROM private.bridge_tokens WHERE name = 'coffa';
  IF v_hash IS NULL OR encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex') <> v_hash THEN
    RAISE EXCEPTION 'token non valido' USING ERRCODE = '28000';
  END IF;

  v_date := (p_payload->>'snapshot_date')::date;
  IF v_date IS NULL THEN RAISE EXCEPTION 'snapshot_date mancante'; END IF;
  IF jsonb_array_length(coalesce(p_payload->'giorni','[]'::jsonb)) > 400 THEN
    RAISE EXCEPTION 'troppi giorni';
  END IF;

  DELETE FROM coffa_snapshots WHERE snapshot_date = v_date;
  INSERT INTO coffa_snapshots (snapshot_date, giorni_incasso, payload)
  VALUES (v_date, (p_payload->>'giorni_incasso')::int, p_payload);

  INSERT INTO coffa_cash_days (snapshot_date, day, incassato_cents, da_incassare_cents, da_arrivare_cents)
  SELECT v_date, (g->>'giorno')::date,
         greatest(0, round(coalesce((g->>'incassato')::numeric,0) * 100))::bigint,
         greatest(0, round(coalesce((g->>'daIncassare')::numeric,0) * 100))::bigint,
         greatest(0, round(coalesce((g->>'daArrivare')::numeric,0) * 100))::bigint
  FROM jsonb_array_elements(coalesce(p_payload->'giorni','[]'::jsonb)) g;
  GET DIAGNOSTICS v_days = ROW_COUNT;

  INSERT INTO coffa_cash_months (snapshot_date, month, atteso_cents)
  SELECT v_date, ((m->>'mese') || '-01')::date,
         greatest(0, round(coalesce((m->>'atteso')::numeric,0) * 100))::bigint
  FROM jsonb_array_elements(coalesce(p_payload->'mesi','[]'::jsonb)) m;

  DELETE FROM coffa_snapshots WHERE snapshot_date < v_date - 60;
  RETURN v_days;
END $$;

REVOKE ALL ON FUNCTION public.ricevi_tesoreria_coffa(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ricevi_tesoreria_coffa(TEXT, JSONB) TO anon;
