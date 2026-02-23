-- ============================================================
-- GESTIONE FINANZIARIA GRUPPO WELLNESS TOWN
-- Database Setup — eseguire nel Supabase SQL Editor
-- ============================================================

-- ─── TABELLE ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  minimum_cash_threshold_cents BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('strategic', 'operational', 'supervisor')),
  company_id UUID REFERENCES companies(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  iban TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  current_balance_cents BIGINT DEFAULT 0,
  balance_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cash_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  default_commission_pct NUMERIC(5,4) DEFAULT 0,
  default_commission_fixed_cents INTEGER DEFAULT 0,
  avg_settlement_days INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_cash_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  channel_id UUID NOT NULL REFERENCES cash_channels(id),
  is_enabled BOOLEAN DEFAULT TRUE,
  custom_commission_pct NUMERIC(5,4),
  custom_commission_fixed_cents INTEGER,
  custom_settlement_days INTEGER,
  bank_account_id UUID REFERENCES bank_accounts(id),
  UNIQUE(company_id, channel_id)
);

CREATE TABLE IF NOT EXISTS collection_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  channel_id UUID REFERENCES cash_channels(id),
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('monthly_first_10', 'daily', 'daily_with_settlement')),
  description TEXT,
  UNIQUE(company_id, channel_id)
);

CREATE TABLE IF NOT EXISTS monthly_revenue_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  channel_id UUID REFERENCES cash_channels(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  forecast_gross_cents BIGINT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, channel_id, year, month)
);

CREATE TABLE IF NOT EXISTS daily_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  channel_id UUID NOT NULL REFERENCES cash_channels(id),
  collection_date DATE NOT NULL,
  gross_amount_cents BIGINT NOT NULL,
  commission_cents BIGINT NOT NULL DEFAULT 0,
  net_amount_cents BIGINT NOT NULL,
  settlement_expected_date DATE,
  is_settled BOOLEAN DEFAULT FALSE,
  settled_date DATE,
  stripe_payment_intent_id TEXT UNIQUE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  supplier_name TEXT NOT NULL,
  supplier_code TEXT,
  category TEXT CHECK (category IN (
    'utenze', 'stipendi', 'fornitori_bar', 'affitti', 'tributi_f24',
    'professionisti', 'leasing_noleggio', 'manutenzione', 'forniture',
    'assicurazioni', 'intercompany', 'altro'
  )),
  is_critical BOOLEAN DEFAULT FALSE,
  default_priority INTEGER CHECK (default_priority BETWEEN 1 AND 10),
  accepts_postponement BOOLEAN,
  postponement_notes TEXT,
  bank_iban TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, supplier_code)
);

CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  imported_by UUID REFERENCES auth.users(id),
  file_name TEXT,
  rows_imported INTEGER,
  rows_updated INTEGER,
  rows_new INTEGER,
  status TEXT DEFAULT 'completed'
);

CREATE TABLE IF NOT EXISTS payment_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  import_batch_id UUID REFERENCES import_batches(id),
  supplier_name TEXT,
  supplier_code TEXT,
  account_code TEXT,
  account_description TEXT,
  document_type TEXT,
  document_number TEXT,
  document_date DATE,
  due_date DATE NOT NULL,
  payment_method TEXT,
  bank_description TEXT,
  amount_cents BIGINT NOT NULL,
  amount_in_cents BIGINT DEFAULT 0,
  amount_out_cents BIGINT DEFAULT 0,
  flow_type TEXT NOT NULL CHECK (flow_type IN ('in', 'out')),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('accounting', 'commitment')),
  is_intercompany BOOLEAN DEFAULT FALSE,
  counterpart_company_id UUID REFERENCES companies(id),
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'scheduled', 'paid', 'postponed', 'disputed', 'cancelled'
  )),
  paid_date DATE,
  paid_amount_cents BIGINT,
  postponed_to DATE,
  postpone_notes TEXT,
  priority_score NUMERIC(5,2),
  priority_override INTEGER CHECK (priority_override BETWEEN 1 AND 10),
  supplier_id UUID REFERENCES supplier_registry(id),
  dedup_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_schedule_dedup ON payment_schedule(dedup_key);

CREATE TABLE IF NOT EXISTS expense_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  category TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  forecast_cents BIGINT NOT NULL,
  source TEXT DEFAULT 'manual' CHECK (source IN ('calculated', 'manual')),
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, category, year, month)
);

CREATE TABLE IF NOT EXISTS intercompany_nettings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  netting_date DATE NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  total_compensated_cents BIGINT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── FUNZIONI & TRIGGER ─────────────────────────────────────

-- Calcolo dedup_key per payment_schedule (trigger evita problemi di immutabilità)
CREATE OR REPLACE FUNCTION compute_dedup_key()
RETURNS TRIGGER AS $$
BEGIN
  NEW.dedup_key := NEW.company_id::TEXT || '|' ||
                   COALESCE(NEW.supplier_code, '') || '|' ||
                   COALESCE(NEW.document_number, '') || '|' ||
                   to_char(NEW.due_date, 'YYYY-MM-DD') || '|' ||
                   NEW.amount_cents::TEXT;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_dedup_key ON payment_schedule;
CREATE TRIGGER set_dedup_key
  BEFORE INSERT OR UPDATE ON payment_schedule
  FOR EACH ROW EXECUTE FUNCTION compute_dedup_key();

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_supplier_registry_updated_at ON supplier_registry;
CREATE TRIGGER update_supplier_registry_updated_at
  BEFORE UPDATE ON supplier_registry
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_schedule_updated_at ON payment_schedule;
CREATE TRIGGER update_payment_schedule_updated_at
  BEFORE UPDATE ON payment_schedule
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- NOTA: i profili utente vanno inseriti manualmente in user_profiles
-- dopo aver creato gli utenti in Supabase Auth (Authentication → Users).
-- Esempio:
--   INSERT INTO user_profiles (id, email, role)
--   SELECT id, email,
--     CASE
--       WHEN email = 'marco@...'   THEN 'strategic'
--       WHEN email = 'orianna@...' THEN 'operational'
--       WHEN email = 'maurizio@...' THEN 'supervisor'
--     END
--   FROM auth.users
--   WHERE email IN ('marco@...', 'orianna@...', 'maurizio@...');

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_cash_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_revenue_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE intercompany_nettings ENABLE ROW LEVEL SECURITY;

-- SELECT: tutti gli autenticati
CREATE POLICY "read_all" ON companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_all" ON user_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_all" ON bank_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_all" ON cash_channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_all" ON company_cash_channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_all" ON collection_patterns FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_all" ON monthly_revenue_forecasts FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_all" ON daily_collections FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_all" ON supplier_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_all" ON import_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_all" ON payment_schedule FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_all" ON expense_forecasts FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_all" ON intercompany_nettings FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE: strategic + operational
CREATE POLICY "write_ops" ON companies FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('strategic','operational'));
CREATE POLICY "update_ops" ON companies FOR UPDATE TO authenticated USING (get_user_role() IN ('strategic','operational'));
CREATE POLICY "write_ops" ON bank_accounts FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('strategic','operational'));
CREATE POLICY "update_ops" ON bank_accounts FOR UPDATE TO authenticated USING (get_user_role() IN ('strategic','operational'));
CREATE POLICY "write_ops" ON cash_channels FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('strategic','operational'));
CREATE POLICY "update_ops" ON cash_channels FOR UPDATE TO authenticated USING (get_user_role() IN ('strategic','operational'));
CREATE POLICY "write_ops" ON company_cash_channels FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('strategic','operational'));
CREATE POLICY "update_ops" ON company_cash_channels FOR UPDATE TO authenticated USING (get_user_role() IN ('strategic','operational'));
CREATE POLICY "write_ops" ON collection_patterns FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('strategic','operational'));
CREATE POLICY "update_ops" ON collection_patterns FOR UPDATE TO authenticated USING (get_user_role() IN ('strategic','operational'));
CREATE POLICY "write_ops" ON monthly_revenue_forecasts FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('strategic','operational'));
CREATE POLICY "update_ops" ON monthly_revenue_forecasts FOR UPDATE TO authenticated USING (get_user_role() IN ('strategic','operational'));
CREATE POLICY "write_ops" ON daily_collections FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('strategic','operational'));
CREATE POLICY "update_ops" ON daily_collections FOR UPDATE TO authenticated USING (get_user_role() IN ('strategic','operational'));
CREATE POLICY "write_ops" ON supplier_registry FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('strategic','operational'));
CREATE POLICY "update_ops" ON supplier_registry FOR UPDATE TO authenticated USING (get_user_role() IN ('strategic','operational'));
CREATE POLICY "write_ops" ON import_batches FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('strategic','operational'));
CREATE POLICY "update_ops" ON import_batches FOR UPDATE TO authenticated USING (get_user_role() IN ('strategic','operational'));
CREATE POLICY "write_ops" ON payment_schedule FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('strategic','operational'));
CREATE POLICY "update_ops" ON payment_schedule FOR UPDATE TO authenticated USING (get_user_role() IN ('strategic','operational'));
CREATE POLICY "write_ops" ON expense_forecasts FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('strategic','operational'));
CREATE POLICY "update_ops" ON expense_forecasts FOR UPDATE TO authenticated USING (get_user_role() IN ('strategic','operational'));
CREATE POLICY "write_ops" ON intercompany_nettings FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('strategic','operational'));

-- DELETE: solo strategic
CREATE POLICY "delete_strategic" ON companies FOR DELETE TO authenticated USING (get_user_role() = 'strategic');
CREATE POLICY "delete_strategic" ON bank_accounts FOR DELETE TO authenticated USING (get_user_role() = 'strategic');
CREATE POLICY "delete_strategic" ON cash_channels FOR DELETE TO authenticated USING (get_user_role() = 'strategic');
CREATE POLICY "delete_strategic" ON company_cash_channels FOR DELETE TO authenticated USING (get_user_role() = 'strategic');
CREATE POLICY "delete_strategic" ON collection_patterns FOR DELETE TO authenticated USING (get_user_role() = 'strategic');
CREATE POLICY "delete_strategic" ON monthly_revenue_forecasts FOR DELETE TO authenticated USING (get_user_role() = 'strategic');
CREATE POLICY "delete_strategic" ON daily_collections FOR DELETE TO authenticated USING (get_user_role() = 'strategic');
CREATE POLICY "delete_strategic" ON supplier_registry FOR DELETE TO authenticated USING (get_user_role() = 'strategic');
CREATE POLICY "delete_strategic" ON import_batches FOR DELETE TO authenticated USING (get_user_role() = 'strategic');
CREATE POLICY "delete_strategic" ON payment_schedule FOR DELETE TO authenticated USING (get_user_role() = 'strategic');
CREATE POLICY "delete_strategic" ON expense_forecasts FOR DELETE TO authenticated USING (get_user_role() = 'strategic');
CREATE POLICY "delete_strategic" ON intercompany_nettings FOR DELETE TO authenticated USING (get_user_role() = 'strategic');

-- user_profiles: gestione speciale
CREATE POLICY "write_strategic" ON user_profiles FOR INSERT TO authenticated WITH CHECK (get_user_role() = 'strategic');
CREATE POLICY "update_strategic" ON user_profiles FOR UPDATE TO authenticated USING (get_user_role() = 'strategic');
CREATE POLICY "delete_strategic" ON user_profiles FOR DELETE TO authenticated USING (get_user_role() = 'strategic');

-- ─── SEED DATA ───────────────────────────────────────────────

INSERT INTO companies (code, name, legal_name, is_active, minimum_cash_threshold_cents) VALUES
  ('WT',     'Wellness Town',       'WELLNESS TOWN S.a.S di Aries Global Services S.r.l.', true, 1000000),
  ('APPIAE', 'Appiae Sport',        'APPIAE SPORT S.R.L.',                                  true,  500000),
  ('HANGAR', 'Hangar 55',           'HANGAR 55 SRL',                                        true,  300000),
  ('ARIES',  'Aries Global Service','ARIES GLOBAL SERVICE S.R.L.',                          true,  500000)
ON CONFLICT (code) DO NOTHING;

INSERT INTO cash_channels (name, default_commission_pct, default_commission_fixed_cents, avg_settlement_days) VALUES
  ('Stripe',   0.0149, 25, 2),
  ('SumUp',    0.0169,  0, 1),
  ('AlmaPay',  0.0100,  0, 3),
  ('POS',      0.0100,  0, 1),
  ('Satispay', 0.0100,  0, 1),
  ('PayPal',   0.0349,  0, 1),
  ('Contanti', 0.0000,  0, 0),
  ('Bonifico', 0.0000,  0, 0),
  ('Assegno',  0.0000,  0, 1)
ON CONFLICT (name) DO NOTHING;

-- Pattern di incasso default per società
INSERT INTO collection_patterns (company_id, channel_id, pattern_type, description)
SELECT c.id, NULL, 'monthly_first_10', 'Incasso concentrato nei primi 10 giorni del mese'
FROM companies c WHERE c.code IN ('WT', 'HANGAR', 'ARIES')
ON CONFLICT (company_id, channel_id) DO NOTHING;

INSERT INTO collection_patterns (company_id, channel_id, pattern_type, description)
SELECT c.id, NULL, 'daily_with_settlement', 'Abbonamenti: incasso giornaliero con settlement provider'
FROM companies c WHERE c.code = 'APPIAE'
ON CONFLICT (company_id, channel_id) DO NOTHING;

-- Hangar Bar/Bistro: incasso giornaliero via POS/Contanti/SumUp
INSERT INTO collection_patterns (company_id, channel_id, pattern_type, description)
SELECT c.id, ch.id, 'daily', 'Bar/Bistro Hangar: incasso giornaliero'
FROM companies c, cash_channels ch
WHERE c.code = 'HANGAR' AND ch.name IN ('POS', 'Contanti', 'SumUp')
ON CONFLICT (company_id, channel_id) DO NOTHING;

-- APPIAE abbonamenti digitali: con settlement
INSERT INTO collection_patterns (company_id, channel_id, pattern_type, description)
SELECT c.id, ch.id, 'daily_with_settlement', 'APPIAE abbonamenti: settlement provider'
FROM companies c, cash_channels ch
WHERE c.code = 'APPIAE' AND ch.name IN ('Stripe', 'AlmaPay', 'SumUp', 'Satispay')
ON CONFLICT (company_id, channel_id) DO NOTHING;
