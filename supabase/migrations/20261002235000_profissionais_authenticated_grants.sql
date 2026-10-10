-- Profissionais V30.3 - grants explícitos para o papel authenticated
begin;

revoke all on public.pec_gestantes from anon;
grant select, insert, update, delete
on public.pec_gestantes
to authenticated;

revoke all on public.importacoes_pec_resumo from anon;
grant select, insert, update, delete
on public.importacoes_pec_resumo
to authenticated;

commit;
