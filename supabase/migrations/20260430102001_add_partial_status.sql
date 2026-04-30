-- Aggiunge lo stato 'partial' alle scadenze, per gestire pagamenti parziali
-- senza creare una riga separata per il residuo.

ALTER TABLE payment_schedule DROP CONSTRAINT IF EXISTS payment_schedule_status_check;

ALTER TABLE payment_schedule ADD CONSTRAINT payment_schedule_status_check
  CHECK (status IN ('pending', 'scheduled', 'paid', 'partial', 'postponed', 'disputed', 'cancelled'));
