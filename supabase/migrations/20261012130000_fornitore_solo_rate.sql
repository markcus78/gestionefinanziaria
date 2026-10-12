-- Tesoreria: fornitore «solo rate» (regola di Marco, 12/10/2026, Acea ATO 2).
-- Le bollette si lasciano scadere e poi vengono rateizzate: contano solo le rate (documenti
-- divisi in più scadenze), nel muro e per intero; le fatture a scadenza unica non si contano.

ALTER TABLE supplier_registry ADD COLUMN IF NOT EXISTS treasury_installments_only BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN supplier_registry.treasury_installments_only IS 'Tesoreria: contano solo le rate (documenti divisi in più scadenze), nel muro e per intero; le fatture a scadenza unica si lasciano scadere per essere rateizzate (es. Acea ATO 2)';
UPDATE supplier_registry SET treasury_installments_only = TRUE WHERE supplier_name = 'ACEA ATO 2 S.p.a.';
