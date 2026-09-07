-- Storico movimenti di pagamento (acconto / saldo) per ogni riga dello scadenzario.
--
-- Prima di questa migrazione il pagamento parziale riscriveva amount_cents con il
-- residuo, distruggendo l'importo totale originale e lasciando la scheda Staff a
-- mostrare l'ultimo saldo al posto dello stipendio.
--
-- Nuovo invariante:
--   amount_cents      = importo totale originale, mai modificato dai pagamenti
--   paid_amount_cents = SUM(payment_transactions.amount_cents)
--   residuo           = ABS(amount_cents) - COALESCE(paid_amount_cents, 0)

CREATE TABLE IF NOT EXISTS payment_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_schedule_id UUID NOT NULL REFERENCES payment_schedule(id) ON DELETE CASCADE,
  paid_date           DATE,
  amount_cents        BIGINT NOT NULL CHECK (amount_cents > 0),
  note                TEXT,
  is_reconstructed    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_schedule ON payment_transactions(payment_schedule_id);

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_all" ON payment_transactions;
CREATE POLICY "read_all" ON payment_transactions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "write_ops" ON payment_transactions;
CREATE POLICY "write_ops" ON payment_transactions FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('strategic','operational'));
DROP POLICY IF EXISTS "update_ops" ON payment_transactions;
CREATE POLICY "update_ops" ON payment_transactions FOR UPDATE TO authenticated USING (get_user_role() IN ('strategic','operational'));
DROP POLICY IF EXISTS "delete_ops" ON payment_transactions;
CREATE POLICY "delete_ops" ON payment_transactions FOR DELETE TO authenticated USING (get_user_role() IN ('strategic','operational'));

-- ─── BACKFILL STORICO ───────────────────────────────────────────────────────
-- Eseguito una sola volta: se la tabella contiene già movimenti si esce.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM payment_transactions) THEN
    RAISE NOTICE 'payment_transactions già popolata: backfill saltato';
    RETURN;
  END IF;

  -- Snapshot degli importi pre-migrazione: rete di sicurezza sui dati finanziari reali.
  CREATE TABLE IF NOT EXISTS payment_schedule_backup_20260907 AS
  SELECT id, amount_cents, amount_in_cents, amount_out_cents, paid_amount_cents, paid_date, status
  FROM payment_schedule;

  -- A) Righe 'partial': amount_cents contiene il residuo, il totale va ricomposto.
  INSERT INTO payment_transactions (payment_schedule_id, paid_date, amount_cents, note, is_reconstructed)
  SELECT id, paid_date, paid_amount_cents, 'Ricostruito da storico', TRUE
  FROM payment_schedule
  WHERE status = 'partial' AND COALESCE(paid_amount_cents, 0) > 0;

  UPDATE payment_schedule SET
    amount_cents     = CASE WHEN flow_type = 'out' THEN -(ABS(amount_cents) + paid_amount_cents)
                            ELSE ABS(amount_cents) + paid_amount_cents END,
    amount_out_cents = CASE WHEN flow_type = 'out' THEN ABS(amount_cents) + paid_amount_cents ELSE 0 END,
    amount_in_cents  = CASE WHEN flow_type = 'in'  THEN ABS(amount_cents) + paid_amount_cents ELSE 0 END
  WHERE status = 'partial' AND COALESCE(paid_amount_cents, 0) > 0;

  -- B) Righe 'paid' passate da un parziale: paid_amount_cents è il totale reale,
  --    amount_cents è il residuo saldato per ultimo. Si ricostruiscono due movimenti.
  --    La data dell'acconto non esiste nel database e non viene inventata.
  INSERT INTO payment_transactions (payment_schedule_id, paid_date, amount_cents, note, is_reconstructed)
  SELECT id, NULL, paid_amount_cents - ABS(amount_cents), 'Acconto — data non registrata', TRUE
  FROM payment_schedule
  WHERE status = 'paid' AND paid_amount_cents > ABS(amount_cents);

  INSERT INTO payment_transactions (payment_schedule_id, paid_date, amount_cents, note, is_reconstructed)
  SELECT id, paid_date, ABS(amount_cents), 'Saldo', TRUE
  FROM payment_schedule
  WHERE status = 'paid' AND paid_amount_cents > ABS(amount_cents);

  UPDATE payment_schedule SET
    amount_cents     = CASE WHEN flow_type = 'out' THEN -paid_amount_cents ELSE paid_amount_cents END,
    amount_out_cents = CASE WHEN flow_type = 'out' THEN paid_amount_cents ELSE 0 END,
    amount_in_cents  = CASE WHEN flow_type = 'in'  THEN paid_amount_cents ELSE 0 END
  WHERE status = 'paid' AND paid_amount_cents > ABS(amount_cents);

  -- C) Tutte le altre righe 'paid': amount_cents è già il totale, un solo movimento.
  INSERT INTO payment_transactions (payment_schedule_id, paid_date, amount_cents, note, is_reconstructed)
  SELECT ps.id, ps.paid_date, COALESCE(NULLIF(ps.paid_amount_cents, 0), ABS(ps.amount_cents)),
         'Ricostruito da storico', TRUE
  FROM payment_schedule ps
  WHERE ps.status = 'paid'
    AND COALESCE(NULLIF(ps.paid_amount_cents, 0), ABS(ps.amount_cents)) > 0
    AND NOT EXISTS (SELECT 1 FROM payment_transactions t WHERE t.payment_schedule_id = ps.id);

  UPDATE payment_schedule SET paid_amount_cents = ABS(amount_cents)
  WHERE status = 'paid' AND COALESCE(paid_amount_cents, 0) = 0 AND amount_cents <> 0;
END $$;
