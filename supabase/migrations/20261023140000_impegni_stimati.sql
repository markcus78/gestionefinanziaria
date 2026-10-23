-- Impegni stimati (Marco, 23/10/2026): «una stima è pur sempre un impegno». Un impegno di cui si
-- conosce la data ma non ancora l'importo preciso si segna «stimato». In Tesoreria conta come gli
-- altri impegni; quando l'importo è confermato si toglie il segno. Le stime che si ripetono ogni mese
-- restano in treasury_estimates (Impegni → Stimati).

ALTER TABLE payment_schedule ADD COLUMN IF NOT EXISTS is_estimated boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN payment_schedule.is_estimated IS 'Impegno con importo stimato (da confermare): conta in Tesoreria come gli altri';
