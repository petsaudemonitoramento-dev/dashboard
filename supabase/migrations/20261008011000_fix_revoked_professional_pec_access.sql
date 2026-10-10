-- Profissionais V30.5 - revogação imediata de acesso a lotes PEC
begin;

create or replace function security.usuario_profissional_ativo_v30()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.perfis p
    where p.id = (select auth.uid())
      and p.perfil = 'equipe_ubs'::public.perfil_usuario
      and p.status = 'ativo'::public.status_usuario
      and p.ativo = true
      and p.cadastro_completo = true
      and p.aprovacao_status = 'aprovado'
      and p.perfil_excluido_em is null
  )
$$;

revoke all on function security.usuario_profissional_ativo_v30()
from public, anon;

grant execute on function security.usuario_profissional_ativo_v30()
to authenticated;

alter table public.importacoes_pec_resumo enable row level security;

drop policy if exists "importacoes_pec_resumo_profissional_select_v30"
  on public.importacoes_pec_resumo;
drop policy if exists "importacoes_pec_resumo_profissional_write_v30"
  on public.importacoes_pec_resumo;
drop policy if exists "importacoes_pec_resumo_profissional_insert_v30_5"
  on public.importacoes_pec_resumo;
drop policy if exists "importacoes_pec_resumo_profissional_update_v30_5"
  on public.importacoes_pec_resumo;
drop policy if exists "importacoes_pec_resumo_profissional_delete_v30_5"
  on public.importacoes_pec_resumo;

create policy "importacoes_pec_resumo_profissional_select_v30_5"
on public.importacoes_pec_resumo
for select
to authenticated
using (
  usuario_id = (select auth.uid())
  and security.usuario_profissional_ativo_v30()
);

create policy "importacoes_pec_resumo_profissional_insert_v30_5"
on public.importacoes_pec_resumo
for insert
to authenticated
with check (
  usuario_id = (select auth.uid())
  and ubs_id = security.usuario_ubs_id()
  and security.usuario_profissional_ativo_v30()
);

create policy "importacoes_pec_resumo_profissional_update_v30_5"
on public.importacoes_pec_resumo
for update
to authenticated
using (
  usuario_id = (select auth.uid())
  and security.usuario_profissional_ativo_v30()
)
with check (
  usuario_id = (select auth.uid())
  and ubs_id = security.usuario_ubs_id()
  and security.usuario_profissional_ativo_v30()
);

create policy "importacoes_pec_resumo_profissional_delete_v30_5"
on public.importacoes_pec_resumo
for delete
to authenticated
using (
  usuario_id = (select auth.uid())
  and security.usuario_profissional_ativo_v30()
);

commit;
