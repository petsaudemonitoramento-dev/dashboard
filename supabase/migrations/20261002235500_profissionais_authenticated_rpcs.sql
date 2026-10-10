-- Profissionais V30.4 - RPCs autenticadas para remover bypass clínico do app
begin;

create or replace function public.profissionais_listar_gestantes_v30(
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
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sessão inválida';
  end if;

  return query
  select *
  from private.listar_gestantes_profissional_v30(
    v_user_id,
    p_exibir_identidade
  );
end
$$;

create or replace function public.profissionais_obter_gestante_clinica_v30(
  p_gestante_id uuid,
  p_exibir_identidade boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sessão inválida';
  end if;

  return private.obter_gestante_clinica_v30(
    v_user_id,
    p_gestante_id,
    p_exibir_identidade
  );
end
$$;

create or replace function public.profissionais_salvar_gestante_clinica_v30(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sessão inválida';
  end if;

  return private.salvar_gestante_clinica_v30(
    v_user_id,
    p_payload
  );
end
$$;

create or replace function public.profissionais_salvar_classificacao_risco_v30(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sessão inválida';
  end if;

  return private.salvar_classificacao_risco_v30(
    v_user_id,
    p_payload
  );
end
$$;

create or replace function public.profissionais_obter_relatorio_classificacao_v30(
  p_classificacao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sessão inválida';
  end if;

  return private.obter_relatorio_classificacao_v30(
    v_user_id,
    p_classificacao_id
  );
end
$$;

create or replace function public.profissionais_importar_pec_v30(
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
  v_user_id uuid := auth.uid();
  v_ubs_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida';
  end if;

  select p.ubs_id
  into v_ubs_id
  from public.perfis p
  where p.id = v_user_id
    and p.perfil = 'equipe_ubs'::public.perfil_usuario
    and p.cadastro_completo = true
    and p.aprovacao_status = 'aprovado'
    and p.status = 'ativo'::public.status_usuario
    and p.ativo = true
    and p.perfil_excluido_em is null
  limit 1;

  if v_ubs_id is null then
    raise exception 'Profissional sem UBS autorizada';
  end if;

  return private.importar_pec_v30(
    v_ubs_id,
    v_user_id,
    p_arquivo_nome,
    p_arquivo_sha256,
    p_linha_cabecalho,
    p_mapeamento,
    p_linhas,
    p_avisos
  );
end
$$;

revoke all on function public.profissionais_listar_gestantes_v30(boolean)
from public, anon;
revoke all on function public.profissionais_obter_gestante_clinica_v30(uuid, boolean)
from public, anon;
revoke all on function public.profissionais_salvar_gestante_clinica_v30(jsonb)
from public, anon;
revoke all on function public.profissionais_salvar_classificacao_risco_v30(jsonb)
from public, anon;
revoke all on function public.profissionais_obter_relatorio_classificacao_v30(uuid)
from public, anon;
revoke all on function public.profissionais_importar_pec_v30(text, text, integer, jsonb, jsonb, jsonb)
from public, anon;

grant execute on function public.profissionais_listar_gestantes_v30(boolean)
to authenticated;
grant execute on function public.profissionais_obter_gestante_clinica_v30(uuid, boolean)
to authenticated;
grant execute on function public.profissionais_salvar_gestante_clinica_v30(jsonb)
to authenticated;
grant execute on function public.profissionais_salvar_classificacao_risco_v30(jsonb)
to authenticated;
grant execute on function public.profissionais_obter_relatorio_classificacao_v30(uuid)
to authenticated;
grant execute on function public.profissionais_importar_pec_v30(text, text, integer, jsonb, jsonb, jsonb)
to authenticated;

commit;
