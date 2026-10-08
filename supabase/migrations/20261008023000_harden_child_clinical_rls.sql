-- Profissionais V30.6 - RLS explícito nas tabelas clínicas filhas
begin;

-- Tabelas cujo ownership é herdado diretamente da gestante.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'gestante_consultas',
    'gestante_exames',
    'gestante_vacinas',
    'gestante_altas',
    'classificacoes_risco_gestacional'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on public.%I from anon', v_table);
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated',
      v_table
    );
  end loop;
end
$$;

-- Remove as policies históricas cujo nome/semântica ainda remetia a
-- território/equipe. A autorização passa a depender diretamente do owner V30.
drop policy if exists "gestante_consultas_equipe_write"
  on public.gestante_consultas;
drop policy if exists "gestante_consultas_territorio_select"
  on public.gestante_consultas;

drop policy if exists "gestante_exames_equipe_write"
  on public.gestante_exames;
drop policy if exists "gestante_exames_territorio_select"
  on public.gestante_exames;

drop policy if exists "gestante_vacinas_equipe_write"
  on public.gestante_vacinas;
drop policy if exists "gestante_vacinas_territorio_select"
  on public.gestante_vacinas;

drop policy if exists "gestante_altas_equipe_write"
  on public.gestante_altas;
drop policy if exists "gestante_altas_territorio_select"
  on public.gestante_altas;

drop policy if exists "classificacoes_risco_equipe_write"
  on public.classificacoes_risco_gestacional;
drop policy if exists "classificacoes_risco_territorio_select"
  on public.classificacoes_risco_gestacional;

-- Consultas
create policy "gestante_consultas_profissional_select_v30"
on public.gestante_consultas
for select
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

create policy "gestante_consultas_profissional_insert_v30"
on public.gestante_consultas
for insert
to authenticated
with check (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

create policy "gestante_consultas_profissional_update_v30"
on public.gestante_consultas
for update
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
)
with check (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

create policy "gestante_consultas_profissional_delete_v30"
on public.gestante_consultas
for delete
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

-- Exames
create policy "gestante_exames_profissional_select_v30"
on public.gestante_exames
for select
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

create policy "gestante_exames_profissional_insert_v30"
on public.gestante_exames
for insert
to authenticated
with check (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

create policy "gestante_exames_profissional_update_v30"
on public.gestante_exames
for update
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
)
with check (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

create policy "gestante_exames_profissional_delete_v30"
on public.gestante_exames
for delete
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

-- Vacinas
create policy "gestante_vacinas_profissional_select_v30"
on public.gestante_vacinas
for select
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

create policy "gestante_vacinas_profissional_insert_v30"
on public.gestante_vacinas
for insert
to authenticated
with check (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

create policy "gestante_vacinas_profissional_update_v30"
on public.gestante_vacinas
for update
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
)
with check (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

create policy "gestante_vacinas_profissional_delete_v30"
on public.gestante_vacinas
for delete
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

-- Altas
create policy "gestante_altas_profissional_select_v30"
on public.gestante_altas
for select
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

create policy "gestante_altas_profissional_insert_v30"
on public.gestante_altas
for insert
to authenticated
with check (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

create policy "gestante_altas_profissional_update_v30"
on public.gestante_altas
for update
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
)
with check (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

create policy "gestante_altas_profissional_delete_v30"
on public.gestante_altas
for delete
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

-- Classificações
create policy "classificacoes_risco_profissional_select_v30"
on public.classificacoes_risco_gestacional
for select
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

create policy "classificacoes_risco_profissional_insert_v30"
on public.classificacoes_risco_gestacional
for insert
to authenticated
with check (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

create policy "classificacoes_risco_profissional_update_v30"
on public.classificacoes_risco_gestacional
for update
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
)
with check (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

create policy "classificacoes_risco_profissional_delete_v30"
on public.classificacoes_risco_gestacional
for delete
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
);

-- Itens de classificação herdam ownership através da classificação pai.
alter table public.classificacao_risco_itens enable row level security;
revoke all on public.classificacao_risco_itens from anon;
grant select, insert, update, delete
on public.classificacao_risco_itens
to authenticated;

drop policy if exists "classificacao_itens_equipe_write"
  on public.classificacao_risco_itens;
drop policy if exists "classificacao_itens_territorio_select"
  on public.classificacao_risco_itens;

create policy "classificacao_itens_profissional_select_v30"
on public.classificacao_risco_itens
for select
to authenticated
using (
  exists (
    select 1
    from public.classificacoes_risco_gestacional c
    where c.id = classificacao_id
      and security.usuario_pode_acessar_gestante_v30(c.gestante_id)
  )
);

create policy "classificacao_itens_profissional_insert_v30"
on public.classificacao_risco_itens
for insert
to authenticated
with check (
  exists (
    select 1
    from public.classificacoes_risco_gestacional c
    where c.id = classificacao_id
      and security.usuario_pode_acessar_gestante_v30(c.gestante_id)
  )
);

create policy "classificacao_itens_profissional_update_v30"
on public.classificacao_risco_itens
for update
to authenticated
using (
  exists (
    select 1
    from public.classificacoes_risco_gestacional c
    where c.id = classificacao_id
      and security.usuario_pode_acessar_gestante_v30(c.gestante_id)
  )
)
with check (
  exists (
    select 1
    from public.classificacoes_risco_gestacional c
    where c.id = classificacao_id
      and security.usuario_pode_acessar_gestante_v30(c.gestante_id)
  )
);

create policy "classificacao_itens_profissional_delete_v30"
on public.classificacao_risco_itens
for delete
to authenticated
using (
  exists (
    select 1
    from public.classificacoes_risco_gestacional c
    where c.id = classificacao_id
      and security.usuario_pode_acessar_gestante_v30(c.gestante_id)
  )
);

commit;
