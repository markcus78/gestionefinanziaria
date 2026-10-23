-- Stime con un importo per ogni mese dell'anno (Marco, 23/10/2026): utenze, personale e F24
-- cambiano con le stagioni. {"1": centesimi, …, "12": centesimi}, solo i mesi impostati; un mese
-- assente vale monthly_cents (l'importo base). Il profilo si ripete ogni anno.

ALTER TABLE treasury_estimates ADD COLUMN IF NOT EXISTS month_cents jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN treasury_estimates.month_cents IS 'Importo per mese dell''anno ({"1".."12": centesimi}); mese assente = monthly_cents';
