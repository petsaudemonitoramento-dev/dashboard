-- Pós-homologação V30 - remove índice duplicado de perfis.ubs_id
begin;

drop index if exists public.perfis_ubs_id_idx;

commit;
