-- Lavoro quotidiano (Marco, 15/10/2026): una pagina in cima al menu che dice a Orianna, giorno per
-- giorno, cosa fare e cosa non torna. Tre tabelle:
--  · daily_task_rules   il calendario delle attività (date dei caricamenti), modificabile dalla pagina
--  · daily_task_done    le attività segnate come fatte, una per regola e per data prevista (period_key)
--  · signal_dismissals  le segnalazioni marcate «visto, è giusto così»: ricompaiono se cambia la chiave

CREATE TABLE IF NOT EXISTS daily_task_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  description   TEXT,
  href          TEXT,                                   -- pagina dove si fa
  freq          TEXT NOT NULL CHECK (freq IN ('giornaliera', 'mensile')),
  days          INT[] NOT NULL DEFAULT '{}',            -- giorni del mese (mensile)
  company_id    UUID REFERENCES companies(id),
  holiday       TEXT NOT NULL DEFAULT 'dopo' CHECK (holiday IN ('prima', 'dopo')),  -- giorno non lavorativo: si anticipa o si posticipa
  superseded    BOOLEAN NOT NULL DEFAULT false,         -- la volta successiva sostituisce quella saltata (es. import scadenzario)
  auto          TEXT CHECK (auto IN ('import', 'saldi', 'paghe', 'collaboratori', 'f24')),  -- il sistema vede da solo che è fatta
  start_date    DATE NOT NULL DEFAULT '2026-10-15',     -- nessuna attività prima di questa data
  sort          INT NOT NULL DEFAULT 100,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_task_done (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id     UUID NOT NULL REFERENCES daily_task_rules(id) ON DELETE CASCADE,
  period_key  DATE NOT NULL,                            -- data prevista (prima dello spostamento per festivi)
  done_by     TEXT,
  done_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rule_id, period_key)
);

CREATE TABLE IF NOT EXISTS signal_dismissals (
  key           TEXT PRIMARY KEY,
  dismissed_by  TEXT,
  dismissed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE daily_task_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_task_done ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_all" ON daily_task_rules;
CREATE POLICY "read_all" ON daily_task_rules FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "write_ops" ON daily_task_rules;
CREATE POLICY "write_ops" ON daily_task_rules FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('strategic','operational'));
DROP POLICY IF EXISTS "update_ops" ON daily_task_rules;
CREATE POLICY "update_ops" ON daily_task_rules FOR UPDATE TO authenticated USING (get_user_role() IN ('strategic','operational'));
DROP POLICY IF EXISTS "delete_strategic" ON daily_task_rules;
CREATE POLICY "delete_strategic" ON daily_task_rules FOR DELETE TO authenticated USING (get_user_role() = 'strategic');

DROP POLICY IF EXISTS "read_all" ON daily_task_done;
CREATE POLICY "read_all" ON daily_task_done FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "write_ops" ON daily_task_done;
CREATE POLICY "write_ops" ON daily_task_done FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('strategic','operational'));
DROP POLICY IF EXISTS "delete_ops" ON daily_task_done;
CREATE POLICY "delete_ops" ON daily_task_done FOR DELETE TO authenticated USING (get_user_role() IN ('strategic','operational'));

DROP POLICY IF EXISTS "read_all" ON signal_dismissals;
CREATE POLICY "read_all" ON signal_dismissals FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "write_ops" ON signal_dismissals;
CREATE POLICY "write_ops" ON signal_dismissals FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('strategic','operational'));
DROP POLICY IF EXISTS "delete_ops" ON signal_dismissals;
CREATE POLICY "delete_ops" ON signal_dismissals FOR DELETE TO authenticated USING (get_user_role() IN ('strategic','operational'));

-- Calendario proposto il 15/10/2026, dallo storico dei caricamenti (si cambia dalla pagina)
INSERT INTO daily_task_rules (title, description, href, freq, days, company_id, holiday, superseded, auto, sort)
SELECT * FROM (VALUES
  ('Registra i pagamenti fatti', 'Segna come pagati impegni (Impegni), personale (Staff) e fatture (Pagamenti), con la data vera.', '/payments', 'giornaliera', '{}'::int[], NULL::uuid, 'dopo', false, NULL, 10),
  ('Inserisci le spese autorizzate oggi', 'Ogni spesa decisa (anche per email, anche con importo stimato) entra in Impegni lo stesso giorno, con il fornitore.', '/impegni', 'giornaliera', '{}', NULL, 'dopo', false, NULL, 20),
  ('Registra gli incassi arrivati in banca', 'Alma, POS e TSPay alla data di arrivo in banca; affitti con bonifico a mano.', '/operations', 'giornaliera', '{}', NULL, 'dopo', false, NULL, 30),
  ('Importa lo scadenzario di Appiae', 'In Spring: prima rigenera i flussi finanziari, poi esporta EFLUSSISCADENZARIO. Qui: Scadenzario → Importa XLS, controlla le righe sparite (pagate sì/no).', '/schedule/import', 'mensile', '{1,11,21}', '98f26386-3d81-4416-951b-99f0cf819f4a'::uuid, 'dopo', true, 'import', 40),
  ('Importa lo scadenzario di Hangar', 'In Spring: prima rigenera i flussi finanziari, poi esporta EFLUSSISCADENZARIO. Qui: Scadenzario → Importa XLS.', '/schedule/import', 'mensile', '{1,11,21}', 'b2d862c3-60dc-47ba-96be-ed421a908613'::uuid, 'dopo', true, 'import', 41),
  ('Importa lo scadenzario di Wellness Town', 'In Spring: prima rigenera i flussi finanziari, poi esporta EFLUSSISCADENZARIO. Qui: Scadenzario → Importa XLS.', '/schedule/import', 'mensile', '{1,11,21}', 'a28ffdc9-2323-4647-8c33-bc67a4345a5c'::uuid, 'dopo', true, 'import', 42),
  ('Importa lo scadenzario di Aries', 'In Spring: prima rigenera i flussi finanziari, poi esporta EFLUSSISCADENZARIO. Qui: Scadenzario → Importa XLS.', '/schedule/import', 'mensile', '{1,11,21}', 'f58219e0-fb84-4fa5-8636-7c490b8dcf6e'::uuid, 'dopo', true, 'import', 43),
  ('Aggiorna i saldi delle banche', 'Saldo e data del saldo di ogni conto, in Tesoreria.', '/treasury', 'mensile', '{1,11,21}', NULL, 'dopo', true, 'saldi', 50),
  ('Carica le paghe di Hangar', 'Staff → Dipendenti → Distinta netti.', '/staff', 'mensile', '{10}', 'b2d862c3-60dc-47ba-96be-ed421a908613'::uuid, 'prima', false, 'paghe', 60),
  ('Carica le paghe di Wellness Town', 'Staff → Dipendenti → Distinta netti.', '/staff', 'mensile', '{10}', 'a28ffdc9-2323-4647-8c33-bc67a4345a5c'::uuid, 'prima', false, 'paghe', 61),
  ('Carica le paghe di Appiae', 'Staff → Dipendenti → Distinta netti (ed Extra).', '/staff', 'mensile', '{15}', '98f26386-3d81-4416-951b-99f0cf819f4a'::uuid, 'prima', false, 'paghe', 62),
  ('Inserisci l''F24 di Appiae', 'Staff → F24: importo e data (scade il 16).', '/staff', 'mensile', '{15}', '98f26386-3d81-4416-951b-99f0cf819f4a'::uuid, 'prima', false, 'f24', 70),
  ('Inserisci l''F24 di Hangar', 'Staff → F24: importo e data (scade il 16).', '/staff', 'mensile', '{15}', 'b2d862c3-60dc-47ba-96be-ed421a908613'::uuid, 'prima', false, 'f24', 71),
  ('Inserisci l''F24 di Wellness Town', 'Staff → F24: importo e data (scade il 16).', '/staff', 'mensile', '{15}', 'a28ffdc9-2323-4647-8c33-bc67a4345a5c'::uuid, 'prima', false, 'f24', 72),
  ('Carica collaboratori e P.IVA di Appiae (Athletis)', 'Staff → Collaboratori → Istruttori: il sistema riconosce da solo gli istruttori a partita IVA.', '/staff', 'mensile', '{20}', '98f26386-3d81-4416-951b-99f0cf819f4a'::uuid, 'dopo', false, 'collaboratori', 80),
  ('Controlla le stime del mese', 'In Stime: importi ancora giusti (bollette, personale, F24), pro forma registrate.', '/stime', 'mensile', '{1}', NULL, 'dopo', true, NULL, 90)
) AS v(title, description, href, freq, days, company_id, holiday, superseded, auto, sort)
WHERE NOT EXISTS (SELECT 1 FROM daily_task_rules);
