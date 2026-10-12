-- Tesoreria: un fornitore si può trattare come personale (regola di Marco, 12/10/2026).
-- Le sue fatture vanno nel muro e si pagano per intero, anche se scadute; non entrano
-- nella percentuale ai fornitori. Prima applicazione: CASALI MARCO (Hangar e Appiae).

ALTER TABLE supplier_registry ADD COLUMN IF NOT EXISTS treasury_as_staff BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN supplier_registry.treasury_as_staff IS 'Tesoreria: le fatture di questo fornitore si trattano come personale (muro, pagate per intero), es. Casali Marco';
UPDATE supplier_registry SET treasury_as_staff = TRUE WHERE supplier_name = 'CASALI MARCO';
