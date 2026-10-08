-- Profissionais V30.9 - avisos administrativos somente por RPC auditada
begin;

revoke insert, update, delete
on table public.avisos_ubs
from authenticated;

drop policy if exists "avisos_admin_all"
  on public.avisos_ubs;

drop policy if exists "avisos_gestao_municipal_write"
  on public.avisos_ubs;

commit;
