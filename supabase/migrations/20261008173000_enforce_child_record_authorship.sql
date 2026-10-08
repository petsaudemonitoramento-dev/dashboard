-- Profissionais V30.11 - integridade de autoria nas tabelas clínicas filhas
begin;

drop policy if exists "gestante_consultas_profissional_insert_v30"
  on public.gestante_consultas;
drop policy if exists "gestante_consultas_profissional_update_v30"
  on public.gestante_consultas;

create policy "gestante_consultas_profissional_insert_v30"
on public.gestante_consultas
for insert
to authenticated
with check (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
  and profissional_id = (select auth.uid())
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
  and profissional_id = (select auth.uid())
);

drop policy if exists "gestante_exames_profissional_insert_v30"
  on public.gestante_exames;
drop policy if exists "gestante_exames_profissional_update_v30"
  on public.gestante_exames;

create policy "gestante_exames_profissional_insert_v30"
on public.gestante_exames
for insert
to authenticated
with check (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
  and profissional_id = (select auth.uid())
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
  and profissional_id = (select auth.uid())
);

drop policy if exists "gestante_vacinas_profissional_insert_v30"
  on public.gestante_vacinas;
drop policy if exists "gestante_vacinas_profissional_update_v30"
  on public.gestante_vacinas;

create policy "gestante_vacinas_profissional_insert_v30"
on public.gestante_vacinas
for insert
to authenticated
with check (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
  and profissional_id = (select auth.uid())
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
  and profissional_id = (select auth.uid())
);

drop policy if exists "gestante_altas_profissional_insert_v30"
  on public.gestante_altas;
drop policy if exists "gestante_altas_profissional_update_v30"
  on public.gestante_altas;

create policy "gestante_altas_profissional_insert_v30"
on public.gestante_altas
for insert
to authenticated
with check (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
  and profissional_id = (select auth.uid())
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
  and profissional_id = (select auth.uid())
);

drop policy if exists "classificacoes_risco_profissional_insert_v30"
  on public.classificacoes_risco_gestacional;
drop policy if exists "classificacoes_risco_profissional_update_v30"
  on public.classificacoes_risco_gestacional;

create policy "classificacoes_risco_profissional_insert_v30"
on public.classificacoes_risco_gestacional
for insert
to authenticated
with check (
  security.usuario_pode_acessar_gestante_v30(gestante_id)
  and profissional_id = (select auth.uid())
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
  and profissional_id = (select auth.uid())
);

commit;
