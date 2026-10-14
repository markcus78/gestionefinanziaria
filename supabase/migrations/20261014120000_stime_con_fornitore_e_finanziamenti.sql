-- Tesoreria (regola di Marco, 14/10/2026): stime, impegni e richieste «collassano» nei dati
-- contabili quando si manifestano, senza doppia imputazione.
-- 1) Una stima può avere il suo fornitore: le fatture di quel fornitore la consumano mese per mese.
--    Le stime senza fornitore di tipo «fornitori» (altri fornitori) le consumano le fatture dei
--    fornitori che non hanno una stima propria.
-- 2) Due tipi di impegno che non passano mai dallo scadenzario: rate di finanziamenti
--    (banche, soci, altri) e tasse e tributi (cartelle, rateizzazioni). Si pagano per intero.

ALTER TABLE treasury_estimates
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES supplier_registry(id) ON DELETE SET NULL;
COMMENT ON COLUMN treasury_estimates.supplier_id IS 'Fornitore della stima: le sue fatture del mese consumano la stima (stima − arrivate, minimo zero)';

ALTER TABLE payment_schedule DROP CONSTRAINT IF EXISTS payment_schedule_commitment_type_check;
ALTER TABLE payment_schedule ADD CONSTRAINT payment_schedule_commitment_type_check
  CHECK (commitment_type = ANY (ARRAY['forecast', 'salary_item', 'collab_item', 'tax_item', 'manual', 'extra_item', 'piva_item', 'loan_item', 'tributi_item']));
