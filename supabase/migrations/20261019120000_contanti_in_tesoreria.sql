-- Contanti che contano in Tesoreria (regola di Marco, 19/10/2026): i contanti di Hangar si
-- versano in banca quando se ne accumulano un po', quindi sono cassa che arriverà; quelli di
-- Appiae restano in cassa per le spese piccole e non contano (regola del 14/10).
-- Vale solo per il canale Contanti: per gli altri canali l'incasso conta sempre.
alter table public.company_cash_channels
  add column if not exists cash_counts_in_treasury boolean not null default false;

update public.company_cash_channels cc
set cash_counts_in_treasury = true
from public.companies co, public.cash_channels ch
where co.id = cc.company_id and ch.id = cc.channel_id
  and co.name = 'Hangar 55' and ch.name = 'Contanti';
