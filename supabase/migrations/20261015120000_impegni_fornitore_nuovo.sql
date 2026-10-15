-- Impegni di spesa (Marco, 15/10/2026): il fornitore è obbligatorio. Si sceglie fra quelli dello
-- scadenzario oppure si dichiara «fornitore nuovo» (non ha ancora fatture): resta da collegare.
alter table public.payment_schedule add column if not exists new_supplier boolean not null default false;
