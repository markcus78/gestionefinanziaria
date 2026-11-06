-- Fornitore «in coda» (regola di Marco, 06/11/2026): le bollette si pagano in ritardo di qualche mese,
-- un mese di bollette per mese, diviso nelle tre decadi; le nuove aspettano il loro turno.
ALTER TABLE supplier_registry ADD COLUMN IF NOT EXISTS treasury_monthly_queue BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN supplier_registry.treasury_monthly_queue IS 'Tesoreria: un mese di bollette per mese (la più vecchia aperta), in parti uguali sulle tre decadi; il turno non viene mai prima della scadenza vera (es. Forini luce e gas)';
UPDATE supplier_registry SET treasury_monthly_queue = TRUE WHERE id = '85d1da38-1d52-407e-a0a9-02321c1b7cca';
