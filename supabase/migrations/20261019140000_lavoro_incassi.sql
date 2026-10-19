-- Lavoro quotidiano, incassi (Marco, 19/10/2026): una voce per società che si chiude da sola quando
-- gli incassi del giorno sono registrati; gli affitti di Aries alle decadi. La voce generica del 15/10
-- («alla data di arrivo in banca») è superata: la data di arrivo la calcola il sistema.
ALTER TABLE daily_task_rules DROP CONSTRAINT IF EXISTS daily_task_rules_auto_check;
ALTER TABLE daily_task_rules ADD CONSTRAINT daily_task_rules_auto_check
  CHECK (auto IN ('import', 'saldi', 'paghe', 'collaboratori', 'f24', 'incassi'));

UPDATE daily_task_rules SET active = false
WHERE title = 'Registra gli incassi arrivati in banca' AND company_id IS NULL;

INSERT INTO daily_task_rules (title, description, href, freq, days, company_id, holiday, superseded, auto, start_date, sort)
SELECT v.title, v.description, v.href, v.freq, v.days, co.id, v.holiday, v.superseded, v.auto, DATE '2026-10-19', v.sort
FROM (VALUES
  ('Registra gli incassi di Appiae',
   'Menu Incassi → APPIAE: una riga per giorno di vendita e per canale (Alma, POS, TSPay, bonifico, Stripe, contanti); il lunedì anche sabato e domenica. Si scrive il giorno della vendita: il giorno di arrivo in banca lo calcola il sistema.',
   '/operations?company=APPIAE', 'giornaliera', '{}'::int[], 'APPIAE', 'dopo', false, 'incassi', 30),
  ('Registra gli incassi di Hangar',
   'Menu Incassi → HANGAR: POS e contanti del bar, una riga per giorno di vendita; il lunedì anche sabato e domenica. I contanti contano perché si versano in banca.',
   '/operations?company=HANGAR', 'giornaliera', '{}'::int[], 'HANGAR', 'dopo', false, 'incassi', 31),
  ('Registra i bonifici degli affitti (Aries)',
   'Menu Incassi → ARIES → Bonifico: gli affitti arrivati sul conto di Aries (per conto di Wellness Town) dall''ultima volta, con la data in cui sono arrivati.',
   '/operations?company=ARIES', 'mensile', '{1,11,21}'::int[], 'ARIES', 'dopo', true, 'incassi', 32)
) AS v(title, description, href, freq, days, code, holiday, superseded, auto, sort)
JOIN companies co ON co.code = v.code
WHERE NOT EXISTS (SELECT 1 FROM daily_task_rules r WHERE r.title = v.title);

UPDATE daily_task_rules
SET description = 'Segna come pagati impegni (Impegni), personale (Staff) e fatture (Pagamenti), con la data vera. Anche le fatture pagate in contanti (Hangar).'
WHERE title = 'Registra i pagamenti fatti';

UPDATE daily_task_rules
SET description = 'In Stime: importi ancora giusti (bollette, personale, F24), pro forma registrate. Incassi stimati: bar di Hangar e affitti su Aries (dai contratti attivi).'
WHERE title = 'Controlla le stime del mese';
