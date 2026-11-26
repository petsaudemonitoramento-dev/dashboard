-- MAE APS | Agenda pessoal da profissional, sem compartilhamento entre equipes.
-- Minimização: não guarda notas livres, diagnóstico ou nome da gestante.
begin;

create table if not exists public.rotina_profissional_tarefas_v1 (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references public.perfis(id) on delete cascade,
  gestante_id uuid not null references public.pec_gestantes(id) on delete cascade,
  tipo text not null check (tipo in ('consulta','exame','contato','visita','revisao')),
  data_prevista date not null,
  status text not null default 'pendente'
    check (status in ('pendente','adiada','concluida')),
  concluida_em timestamptz,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  constraint tarefa_conclusao_consistente check (
    (status = 'concluida' and concluida_em is not null)
    or (status <> 'concluida' and concluida_em is null)
  )
);

create index if not exists idx_rotina_profissional_ativa_v1
  on public.rotina_profissional_tarefas_v1 (profissional_id, status, data_prevista)
  where status <> 'concluida';
create index if not exists idx_rotina_profissional_gestante_v1
  on public.rotina_profissional_tarefas_v1 (gestante_id, profissional_id);

alter table public.rotina_profissional_tarefas_v1 enable row level security;
alter table public.rotina_profissional_tarefas_v1 force row level security;

revoke all on public.rotina_profissional_tarefas_v1 from public, anon, authenticated;
grant select, insert, update, delete on public.rotina_profissional_tarefas_v1 to authenticated;

drop policy if exists rotina_profissional_select_v1 on public.rotina_profissional_tarefas_v1;
create policy rotina_profissional_select_v1
on public.rotina_profissional_tarefas_v1 for select to authenticated
using (
  profissional_id = (select auth.uid())
  and security.usuario_pode_acessar_gestante_v30(gestante_id)
);

drop policy if exists rotina_profissional_insert_v1 on public.rotina_profissional_tarefas_v1;
create policy rotina_profissional_insert_v1
on public.rotina_profissional_tarefas_v1 for insert to authenticated
with check (
  profissional_id = (select auth.uid())
  and security.usuario_pode_acessar_gestante_v30(gestante_id)
);

drop policy if exists rotina_profissional_update_v1 on public.rotina_profissional_tarefas_v1;
create policy rotina_profissional_update_v1
on public.rotina_profissional_tarefas_v1 for update to authenticated
using (
  profissional_id = (select auth.uid())
  and security.usuario_pode_acessar_gestante_v30(gestante_id)
)
with check (
  profissional_id = (select auth.uid())
  and security.usuario_pode_acessar_gestante_v30(gestante_id)
);

drop policy if exists rotina_profissional_delete_v1 on public.rotina_profissional_tarefas_v1;
create policy rotina_profissional_delete_v1
on public.rotina_profissional_tarefas_v1 for delete to authenticated
using (
  profissional_id = (select auth.uid())
  and security.usuario_pode_acessar_gestante_v30(gestante_id)
);

commit;
