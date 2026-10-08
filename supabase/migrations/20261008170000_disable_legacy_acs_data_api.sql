-- Profissionais V30.10 - remove superfície legada ACS da Data API
begin;

alter table public.visitas_acs_v21 enable row level security;

revoke all
on table public.visitas_acs_v21
from public, anon, authenticated;

drop policy if exists "visitas_acs_territorio_select"
  on public.visitas_acs_v21;

drop policy if exists "visitas_acs_proprio_write"
  on public.visitas_acs_v21;

commit;
