-- Uscite che non passano dallo scadenzario (Marco, 23/10/2026): oltre a rate di finanziamento e
-- tasse e tributi, due tipi di impegno nuovi che si pagano per intero (muro):
-- insurance_item  = assicurazioni (premi con quietanza della compagnia, senza fattura)
-- membership_item = tesseramenti e affiliazioni (servono per il regime fiscale sportivo)

ALTER TABLE payment_schedule DROP CONSTRAINT IF EXISTS payment_schedule_commitment_type_check;
ALTER TABLE payment_schedule ADD CONSTRAINT payment_schedule_commitment_type_check
  CHECK (commitment_type = ANY (ARRAY['forecast', 'salary_item', 'collab_item', 'tax_item', 'manual', 'extra_item', 'piva_item', 'loan_item', 'tributi_item', 'insurance_item', 'membership_item']));
