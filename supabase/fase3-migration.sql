-- ============================================================
-- FASE 3 — Incassi: migration
-- Eseguire nel Supabase SQL Editor
-- ============================================================

-- Payout schedule configurabile per canale/società
ALTER TABLE company_cash_channels
  ADD COLUMN IF NOT EXISTS payout_type TEXT CHECK (payout_type IN ('rolling_days', 'fixed_weekday')),
  ADD COLUMN IF NOT EXISTS payout_rolling_days INTEGER,
  ADD COLUMN IF NOT EXISTS payout_fixed_weekday INTEGER CHECK (payout_fixed_weekday BETWEEN 0 AND 6);

-- 0 = Lunedì, 1 = Martedì, 2 = Mercoledì, 3 = Giovedì,
-- 4 = Venerdì, 5 = Sabato, 6 = Domenica

-- Conteggio transazioni giornaliero (serve per commissioni fisse per-transazione)
ALTER TABLE daily_collections
  ADD COLUMN IF NOT EXISTS transaction_count INTEGER NOT NULL DEFAULT 1;
