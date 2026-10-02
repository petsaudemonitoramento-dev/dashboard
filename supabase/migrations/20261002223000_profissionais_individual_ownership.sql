-- Profissionais V30 - isolamento individual por gestante
-- Ambiente alvo futuro: dashboard-v2. Esta migration deve ser validada em CI
-- antes de qualquer publicação remota.

begin;

-- ---------------------------------------------------------------------------
-- 1. Regra central de autorização: mesma UBS nunca basta.
-- ---------------------------------------------------------------------------

create or replace function security.usuario_pode_acessar_gestante_v30(
  p_gestante_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.pec_gestantes g
    join public.perfis p
      on p.id = (select auth.uid())
    where g.id = p_gestante_id
      and g.excluida_em is null
      and g.profissional_responsavel_id = p.id
      and g.ubs_id = p.ubs_id
      and p.perfil = 'equipe_ubs'::public.perfil_usuario
      and p.cadastro_completo = true
      and p.aprovacao_status = 'aprovado'
      and p.status = 'ativo'::public.status_usuario
      and p.ativo = true
      and p.perfil_excluido_em is null
  )
$$;

revoke all on function security.usuario_pode_acessar_gestante_v30(uuid)
from public, anon;

grant execute on function security.usuario_pode_acessar_gestante_v30(uuid)
to authenticated;

-- Mantém compatibilidade com policies e código legado que ainda chamam V18,
-- mas troca a semântica para ownership individual.
create or replace function security.usuario_pode_acessar_gestante_v18(
  p_gestante_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, security
as $$
  select security.usuario_pode_acessar_gestante_v30(p_gestante_id)
$$;

revoke all on function security.usuario_pode_acessar_gestante_v18(uuid)
from public, anon;

grant execute on function security.usuario_pode_acessar_gestante_v18(uuid)
to authenticated;

-- Helper interno para os fluxos server-side ainda baseados em conexão Postgres.
create or replace function private.exigir_gestante_responsavel_v30(
  p_usuario_id uuid,
  p_gestante_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_usuario_id is null or p_gestante_id is null then
    raise exception 'Acesso clínico inválido';
  end if;

  if auth.uid() is not null and auth.uid() <> p_usuario_id then
    raise exception 'Identidade autenticada incompatível';
  end if;

  if not exists (
    select 1
    from public.pec_gestantes g
    join public.perfis p on p.id = p_usuario_id
    where g.id = p_gestante_id
      and g.excluida_em is null
      and g.profissional_responsavel_id = p.id
      and g.ubs_id = p.ubs_id
      and p.perfil = 'equipe_ubs'::public.perfil_usuario
      and p.cadastro_completo = true
      and p.aprovacao_status = 'aprovado'
      and p.status = 'ativo'::public.status_usuario
      and p.ativo = true
      and p.perfil_excluido_em is null
  ) then
    raise exception 'Gestante não encontrada ou não vinculada ao profissional';
  end if;
end
$$;

revoke all on function private.exigir_gestante_responsavel_v30(uuid, uuid)
from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. RLS de gestantes: elimina autorização ampla por UBS.
-- ---------------------------------------------------------------------------

alter table public.pec_gestantes enable row level security;

drop policy if exists "usuarios veem gestantes da propria ubs"
  on public.pec_gestantes;
drop policy if exists "pec_gestantes_clinica_write"
  on public.pec_gestantes;
drop policy if exists "pec_gestantes_territorio_select"
  on public.pec_gestantes;
drop policy if exists "pec_gestantes_profissional_select_v30"
  on public.pec_gestantes;
drop policy if exists "pec_gestantes_profissional_insert_v30"
  on public.pec_gestantes;
drop policy if exists "pec_gestantes_profissional_update_v30"
  on public.pec_gestantes;
drop policy if exists "pec_gestantes_profissional_delete_v30"
  on public.pec_gestantes;

create policy "pec_gestantes_profissional_select_v30"
on public.pec_gestantes
for select
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(id)
);

create policy "pec_gestantes_profissional_insert_v30"
on public.pec_gestantes
for insert
to authenticated
with check (
  profissional_responsavel_id = (select auth.uid())
  and ubs_id = security.usuario_ubs_id()
  and exists (
    select 1
    from public.perfis p
    where p.id = (select auth.uid())
      and p.perfil = 'equipe_ubs'::public.perfil_usuario
      and p.cadastro_completo = true
      and p.aprovacao_status = 'aprovado'
      and p.status = 'ativo'::public.status_usuario
      and p.ativo = true
      and p.perfil_excluido_em is null
  )
);

create policy "pec_gestantes_profissional_update_v30"
on public.pec_gestantes
for update
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(id)
)
with check (
  profissional_responsavel_id = (select auth.uid())
  and ubs_id = security.usuario_ubs_id()
);

create policy "pec_gestantes_profissional_delete_v30"
on public.pec_gestantes
for delete
to authenticated
using (
  security.usuario_pode_acessar_gestante_v30(id)
);

-- ---------------------------------------------------------------------------
-- 3. Importações: cada lote pertence ao profissional que importou.
-- ---------------------------------------------------------------------------

alter table public.importacoes_pec_resumo enable row level security;

drop policy if exists "usuarios veem importacoes da propria ubs"
  on public.importacoes_pec_resumo;
drop policy if exists "importacoes_pec_resumo_equipe_select"
  on public.importacoes_pec_resumo;
drop policy if exists "importacoes_pec_resumo_equipe_write"
  on public.importacoes_pec_resumo;
drop policy if exists "importacoes_pec_resumo_profissional_select_v30"
  on public.importacoes_pec_resumo;
drop policy if exists "importacoes_pec_resumo_profissional_write_v30"
  on public.importacoes_pec_resumo;

create policy "importacoes_pec_resumo_profissional_select_v30"
on public.importacoes_pec_resumo
for select
to authenticated
using (
  usuario_id = (select auth.uid())
);

create policy "importacoes_pec_resumo_profissional_write_v30"
on public.importacoes_pec_resumo
for all
to authenticated
using (
  usuario_id = (select auth.uid())
)
with check (
  usuario_id = (select auth.uid())
  and ubs_id = security.usuario_ubs_id()
);

-- ---------------------------------------------------------------------------
-- 4. Wrappers seguros para o legado SECURITY DEFINER.
-- ---------------------------------------------------------------------------

create or replace function private.salvar_gestante_clinica_v30(
  p_usuario_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_gestante_id uuid;
  v_resultado jsonb;
  v_ubs_id uuid;
begin
  select p.ubs_id
  into v_ubs_id
  from public.perfis p
  where p.id = p_usuario_id
    and p.perfil = 'equipe_ubs'::public.perfil_usuario
    and p.cadastro_completo = true
    and p.aprovacao_status = 'aprovado'
    and p.status = 'ativo'::public.status_usuario
    and p.ativo = true
    and p.perfil_excluido_em is null
  limit 1;

  if v_ubs_id is null then
    raise exception 'Profissional não autorizado para cadastro clínico';
  end if;

  v_gestante_id := nullif(p_payload->>'id', '')::uuid;

  if v_gestante_id is not null then
    perform private.exigir_gestante_responsavel_v30(
      p_usuario_id,
      v_gestante_id
    );
  elsif nullif(p_payload->>'ubsId', '') is not null
    and (p_payload->>'ubsId')::uuid <> v_ubs_id
  then
    raise exception 'UBS do cadastro incompatível com o profissional';
  end if;

  v_resultado := private.salvar_gestante_clinica(
    p_usuario_id,
    p_payload
  );

  v_gestante_id := nullif(v_resultado->>'id', '')::uuid;

  if v_gestante_id is null then
    raise exception 'Cadastro clínico não retornou a gestante';
  end if;

  -- Registros novos do fluxo legado já recebem owner pelo trigger V18.
  -- A atualização abaixo somente cobre legado sem owner e nunca transfere
  -- uma gestante que já pertença a outro profissional.
  update public.pec_gestantes g
  set profissional_responsavel_id = p_usuario_id
  where g.id = v_gestante_id
    and g.ubs_id = v_ubs_id
    and g.profissional_responsavel_id is null;

  perform private.exigir_gestante_responsavel_v30(
    p_usuario_id,
    v_gestante_id
  );

  return v_resultado;
end
$$;

create or replace function private.obter_gestante_clinica_v30(
  p_usuario_id uuid,
  p_gestante_id uuid,
  p_exibir_identidade boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  perform private.exigir_gestante_responsavel_v30(
    p_usuario_id,
    p_gestante_id
  );

  return private.obter_gestante_clinica(
    p_usuario_id,
    p_gestante_id,
    p_exibir_identidade
  );
end
$$;

create or replace function private.salvar_classificacao_risco_v30(
  p_usuario_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_gestante_id uuid;
  v_resultado jsonb;
begin
  v_gestante_id := nullif(p_payload->>'gestanteId', '')::uuid;

  if v_gestante_id is not null then
    perform private.exigir_gestante_responsavel_v30(
      p_usuario_id,
      v_gestante_id
    );
  end if;

  v_resultado := private.salvar_classificacao_risco_v17(
    p_usuario_id,
    p_payload
  );

  v_gestante_id := nullif(v_resultado->>'gestanteId', '')::uuid;

  if v_gestante_id is null then
    raise exception 'Classificação não retornou a gestante';
  end if;

  perform private.exigir_gestante_responsavel_v30(
    p_usuario_id,
    v_gestante_id
  );

  return v_resultado;
end
$$;

create or replace function private.obter_relatorio_classificacao_v30(
  p_usuario_id uuid,
  p_classificacao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_gestante_id uuid;
begin
  select c.gestante_id
  into v_gestante_id
  from public.classificacoes_risco_gestacional c
  where c.id = p_classificacao_id;

  if v_gestante_id is null then
    raise exception 'Classificação não encontrada';
  end if;

  perform private.exigir_gestante_responsavel_v30(
    p_usuario_id,
    v_gestante_id
  );

  return private.obter_relatorio_classificacao_v17(
    p_usuario_id,
    p_classificacao_id
  );
end
$$;

create or replace function private.listar_gestantes_profissional_v30(
  p_usuario_id uuid,
  p_exibir_identidade boolean default true
)
returns table (
  gestante_id uuid,
  codigo text,
  nome_visual text,
  ubs_nome text,
  microarea_codigo text,
  idade_anos integer,
  risco_gestacional text,
  ig_semanas integer,
  ig_dias integer,
  dpp date,
  atendimentos_pre_natal integer,
  atendimentos_ate_12_semanas integer,
  ultima_consulta_pre_natal date,
  atendimentos_odontologicos integer,
  dtpa text,
  pressao_arterial text,
  peso_kg numeric,
  altura_cm numeric,
  visitas_pre_natal integer,
  dias_ultima_visita integer,
  exame_hiv_primeiro text,
  exame_sifilis_primeiro text,
  exame_hepatite_b_primeiro text,
  exame_hepatite_c_primeiro text,
  exame_hiv_terceiro text,
  exame_sifilis_terceiro text,
  observacao text,
  alta_ativa boolean,
  alta_data date,
  alta_motivo text,
  pendencias_count integer,
  atualizado_em timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not exists (
    select 1
    from public.perfis p
    where p.id = p_usuario_id
      and p.perfil = 'equipe_ubs'::public.perfil_usuario
      and p.cadastro_completo = true
      and p.aprovacao_status = 'aprovado'
      and p.status = 'ativo'::public.status_usuario
      and p.ativo = true
      and p.perfil_excluido_em is null
  ) then
    raise exception 'Profissional sem autorização clínica';
  end if;

  return query
  select l.*
  from private.listar_gestantes_autorizadas_v16(
    p_usuario_id,
    p_exibir_identidade
  ) l
  join public.pec_gestantes g
    on g.id = l.gestante_id
  where g.profissional_responsavel_id = p_usuario_id
    and g.excluida_em is null;
end
$$;

create or replace function private.importar_pec_v30(
  p_ubs_id uuid,
  p_usuario_id uuid,
  p_arquivo_nome text,
  p_arquivo_sha256 text,
  p_linha_cabecalho integer,
  p_mapeamento jsonb,
  p_linhas jsonb,
  p_avisos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_resultado jsonb;
  v_importacao_id uuid;
begin
  if not exists (
    select 1
    from public.perfis p
    where p.id = p_usuario_id
      and p.ubs_id = p_ubs_id
      and p.perfil = 'equipe_ubs'::public.perfil_usuario
      and p.cadastro_completo = true
      and p.aprovacao_status = 'aprovado'
      and p.status = 'ativo'::public.status_usuario
      and p.ativo = true
      and p.perfil_excluido_em is null
  ) then
    raise exception 'Profissional sem autorização para importar nesta UBS';
  end if;

  -- Uma importação nunca pode atualizar silenciosamente uma gestante
  -- já pertencente a outro profissional.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) item
    join private.identidades_gestantes i
      on i.identidade_hash = private.identidade_hash(
        coalesce(item->'canonical', '{}'::jsonb),
        p_ubs_id
      )
    join public.pec_gestantes g
      on g.id = i.gestante_id
    where g.profissional_responsavel_id is distinct from p_usuario_id
  ) then
    raise exception 'Importação contém gestante já vinculada a outro profissional';
  end if;

  v_resultado := private.importar_pec(
    p_ubs_id,
    p_usuario_id,
    p_arquivo_nome,
    p_arquivo_sha256,
    p_linha_cabecalho,
    p_mapeamento,
    p_linhas,
    p_avisos
  );

  v_importacao_id := nullif(v_resultado->>'importacao_id', '')::uuid;

  if v_importacao_id is null then
    raise exception 'Importação não retornou identificador';
  end if;

  if exists (
    select 1
    from public.pec_gestantes g
    where g.importacao_id = v_importacao_id
      and g.profissional_responsavel_id is distinct from p_usuario_id
  ) then
    raise exception 'Falha no isolamento de ownership da importação';
  end if;

  return v_resultado;
end
$$;

-- Os wrappers privados são invocados apenas pelo backend controlado.
revoke all on function private.salvar_gestante_clinica_v30(uuid, jsonb)
from public, anon, authenticated, service_role;
revoke all on function private.obter_gestante_clinica_v30(uuid, uuid, boolean)
from public, anon, authenticated, service_role;
revoke all on function private.salvar_classificacao_risco_v30(uuid, jsonb)
from public, anon, authenticated, service_role;
revoke all on function private.obter_relatorio_classificacao_v30(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.listar_gestantes_profissional_v30(uuid, boolean)
from public, anon, authenticated, service_role;
revoke all on function private.importar_pec_v30(uuid, uuid, text, text, integer, jsonb, jsonb, jsonb)
from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Drift V29.1: defesa em profundidade sem depender de ele existir no CI.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('private.auditoria_acompanhamentos_visitas_v29_1') is not null then
    execute 'alter table private.auditoria_acompanhamentos_visitas_v29_1 enable row level security';
    execute 'revoke all on private.auditoria_acompanhamentos_visitas_v29_1 from anon, authenticated';
  end if;

  if to_regclass('public.acompanhamentos_visitas_equipe_v29_1') is not null then
    execute 'alter table public.acompanhamentos_visitas_equipe_v29_1 enable row level security';
    execute 'alter table public.acompanhamentos_visitas_equipe_v29_1 force row level security';
    execute 'revoke all on public.acompanhamentos_visitas_equipe_v29_1 from anon, authenticated';
  end if;
end
$$;

commit;
