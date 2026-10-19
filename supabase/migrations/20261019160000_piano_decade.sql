-- Piano della decade (Marco, 19/10/2026). Il 6, il 16 e il 26 (primo giorno lavorativo da lì in poi),
-- dopo l'import dello scadenzario e i saldi, Marco e Orianna in call decidono la decade successiva:
-- muro, automatiche e arretrato si pagano tutti (restano «vivi», letti dal cruscotto); si decidono
-- i fornitori, uno per uno, con l'importo e l'ordine di priorità, e le provviste fra società.
-- Il piano congela solo queste decisioni. Orianna poi paga entro la decade, per priorità.
--  · decade_plans            un piano per decade (bozza → approvato)
--  · decade_plan_suppliers   fornitore per fornitore: importo deciso e priorità
--  · intercompany_transfers  provviste fra società (Appiae → Hangar, Appiae → Aries per WT, e ritorno)

CREATE TABLE IF NOT EXISTS decade_plans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month        TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  idx          INT NOT NULL CHECK (idx IN (1, 2, 3)),
  status       TEXT NOT NULL DEFAULT 'bozza' CHECK (status IN ('bozza', 'approvato')),
  approved_by  TEXT,
  approved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (month, idx)
);

CREATE TABLE IF NOT EXISTS decade_plan_suppliers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        UUID NOT NULL REFERENCES decade_plans(id) ON DELETE CASCADE,
  company_id     UUID NOT NULL REFERENCES companies(id),
  supplier_key   TEXT NOT NULL,          -- 'S:<supplier_id>' oppure 'N:<nome normalizzato>' (come l'arretrato)
  supplier_name  TEXT NOT NULL,
  planned_cents  BIGINT NOT NULL DEFAULT 0 CHECK (planned_cents >= 0),
  priority       INT NOT NULL DEFAULT 100,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, company_id, supplier_key)
);

CREATE TABLE IF NOT EXISTS intercompany_transfers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_month       TEXT,
  plan_idx         INT,
  from_company_id  UUID NOT NULL REFERENCES companies(id),
  to_company_id    UUID NOT NULL REFERENCES companies(id),
  amount_cents     BIGINT NOT NULL CHECK (amount_cents > 0),
  due_date         DATE NOT NULL,
  paid_date        DATE,
  paid_by          TEXT,
  notes            TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_company_id <> to_company_id)
);

ALTER TABLE decade_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE decade_plan_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE intercompany_transfers ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['decade_plans', 'decade_plan_suppliers', 'intercompany_transfers'] LOOP
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

-- Lavoro quotidiano: import e saldi passano dal 1/11/21 al 6/16/26, prima della call; anche gli
-- affitti di Aries, così sono registrati quando si pianifica. Due voci nuove: la pianificazione
-- (si chiude da sola quando il piano della decade dopo è approvato) e i pagamenti della decade.
ALTER TABLE daily_task_rules DROP CONSTRAINT IF EXISTS daily_task_rules_auto_check;
ALTER TABLE daily_task_rules ADD CONSTRAINT daily_task_rules_auto_check
  CHECK (auto IN ('import', 'saldi', 'paghe', 'collaboratori', 'f24', 'incassi', 'piano'));

-- start_date al 20/10: niente arretrati finti per il 16/10, che col calendario vecchio non c'era
UPDATE daily_task_rules SET days = '{6,16,26}', start_date = DATE '2026-10-20'
WHERE active AND auto IN ('import', 'saldi') AND days = '{1,11,21}';
UPDATE daily_task_rules SET days = '{6,16,26}'
WHERE active AND auto = 'incassi' AND freq = 'mensile' AND days = '{1,11,21}';

INSERT INTO daily_task_rules (title, description, href, freq, days, company_id, holiday, superseded, auto, start_date, sort)
SELECT * FROM (VALUES
  ('Pagamenti della decade',
   'In Pagamenti della decade: paga per priorità (muro, automatiche, arretrato, poi i fornitori nell''ordine deciso) e segna «Pagato» con la data vera. Le provviste fra società con «Fatta».',
   '/piano', 'giornaliera', '{}'::int[], NULL::uuid, 'dopo', false, NULL, DATE '2026-10-19', 15),
  ('Pianificazione della decade (call con Marco, 10:00)',
   'Prima: import dello scadenzario delle 4 società e saldi delle banche. In call: fornitori da pagare (importo e priorità) e provviste. A fine call «Approva il piano».',
   '/piano', 'mensile', '{6,16,26}'::int[], NULL::uuid, 'dopo', false, 'piano', DATE '2026-10-19', 35)
) AS v(title, description, href, freq, days, company_id, holiday, superseded, auto, start_date, sort)
WHERE NOT EXISTS (SELECT 1 FROM daily_task_rules r WHERE r.title = v.title);

-- Fatture di ogni fornitore fissate all'approvazione: si paga solo su quelle (mai sull'arretrato o sui
-- RID futuri) e si riconoscono quelle che l'import chiude senza un pagamento registrato
ALTER TABLE decade_plan_suppliers ADD COLUMN IF NOT EXISTS row_ids UUID[] NOT NULL DEFAULT '{}';
