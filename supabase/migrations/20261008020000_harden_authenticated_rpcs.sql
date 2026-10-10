-- Profissionais V30.7 - hardening de RPCs autenticadas contra bypass do app
begin;

create or replace function private.exigir_rate_limit_usuario_v30(
  p_scope text,
  p_usuario_id uuid,
  p_limit integer,
  p_window_seconds integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_material text;
  v_actor_hash text;
begin
  if p_usuario_id is null
     or auth.uid() is null
     or auth.uid() <> p_usuario_id
  then
    raise exception 'Sessão inválida';
  end if;

  v_material := p_scope || ':' || p_usuario_id::text;
  v_actor_hash :=
    md5('a:' || v_material) ||
    md5('b:' || v_material);

  if not private.consumir_rate_limit_v30(
    p_scope,
    v_actor_hash,
    p_limit,
    p_window_seconds
  ) then
    raise exception 'Limite temporário de operações atingido';
  end if;
end
$$;

revoke all on function private.exigir_rate_limit_usuario_v30(
  text, uuid, integer, integer
)
from public, anon, authenticated, service_role;

create or replace function private.exigir_payload_clinico_rpc_v30(
  p_payload jsonb
)
returns void
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_uuid_pattern constant text :=
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or pg_column_size(p_payload) > 1048576
  then
    raise exception 'Payload clínico inválido ou acima do limite';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_payload) as k(key)
    where key <> all (array[
      'id',
      'ubsId',
      'microareaId',
      'identificacao',
      'gestacao',
      'acompanhamento',
      'consultas',
      'exames',
      'vacinas',
      'alta'
    ]::text[])
  ) then
    raise exception 'Payload clínico contém campos não permitidos';
  end if;

  if p_payload ? 'id'
     and nullif(p_payload->>'id', '') is not null
     and (p_payload->>'id') !~ v_uuid_pattern
  then
    raise exception 'Identificador clínico inválido';
  end if;

  if p_payload ? 'ubsId'
     and nullif(p_payload->>'ubsId', '') is not null
     and (p_payload->>'ubsId') !~ v_uuid_pattern
  then
    raise exception 'UBS inválida';
  end if;

  if p_payload ? 'microareaId'
     and nullif(p_payload->>'microareaId', '') is not null
     and (p_payload->>'microareaId') !~ v_uuid_pattern
  then
    raise exception 'Microárea inválida';
  end if;

  if p_payload ? 'identificacao'
     and jsonb_typeof(p_payload->'identificacao') <> 'object'
  then
    raise exception 'Identificação clínica inválida';
  end if;

  if p_payload ? 'gestacao'
     and jsonb_typeof(p_payload->'gestacao') <> 'object'
  then
    raise exception 'Dados gestacionais inválidos';
  end if;

  if p_payload ? 'acompanhamento'
     and jsonb_typeof(p_payload->'acompanhamento') <> 'object'
  then
    raise exception 'Acompanhamento clínico inválido';
  end if;

  if p_payload ? 'alta'
     and jsonb_typeof(p_payload->'alta') <> 'object'
  then
    raise exception 'Dados de alta inválidos';
  end if;

  if p_payload ? 'consultas' then
    if jsonb_typeof(p_payload->'consultas') <> 'array'
       or jsonb_array_length(p_payload->'consultas') > 300
    then
      raise exception 'Consultas excedem o limite permitido';
    end if;
  end if;

  if p_payload ? 'exames' then
    if jsonb_typeof(p_payload->'exames') <> 'array'
       or jsonb_array_length(p_payload->'exames') > 300
    then
      raise exception 'Exames excedem o limite permitido';
    end if;
  end if;

  if p_payload ? 'vacinas' then
    if jsonb_typeof(p_payload->'vacinas') <> 'array'
       or jsonb_array_length(p_payload->'vacinas') > 100
    then
      raise exception 'Vacinas excedem o limite permitido';
    end if;
  end if;
end
$$;

revoke all on function private.exigir_payload_clinico_rpc_v30(jsonb)
from public, anon, authenticated, service_role;

create or replace function private.exigir_payload_risco_rpc_v30(
  p_payload jsonb
)
returns void
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_uuid_pattern constant text :=
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or pg_column_size(p_payload) > 262144
  then
    raise exception 'Payload de risco inválido ou acima do limite';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_payload) as k(key)
    where key <> all (array[
      'gestanteId',
      'cadastroMinimo',
      'trimestre',
      'pesoKg',
      'alturaCm',
      'ubsAtendimentoId',
      'ubsAtendimentoExterna',
      'observacao',
      'itens'
    ]::text[])
  ) then
    raise exception 'Payload de risco contém campos não permitidos';
  end if;

  if p_payload ? 'gestanteId'
     and nullif(p_payload->>'gestanteId', '') is not null
     and (p_payload->>'gestanteId') !~ v_uuid_pattern
  then
    raise exception 'Gestante inválida';
  end if;

  if p_payload ? 'ubsAtendimentoId'
     and nullif(p_payload->>'ubsAtendimentoId', '') is not null
     and (p_payload->>'ubsAtendimentoId') !~ v_uuid_pattern
  then
    raise exception 'UBS de atendimento inválida';
  end if;

  if p_payload ? 'cadastroMinimo'
     and p_payload->'cadastroMinimo' <> 'null'::jsonb
     and jsonb_typeof(p_payload->'cadastroMinimo') <> 'object'
  then
    raise exception 'Cadastro mínimo inválido';
  end if;

  if p_payload ? 'itens' then
    if jsonb_typeof(p_payload->'itens') <> 'array'
       or jsonb_array_length(p_payload->'itens') > 150
    then
      raise exception 'Itens de risco excedem o limite permitido';
    end if;
  end if;
end
$$;

revoke all on function private.exigir_payload_risco_rpc_v30(jsonb)
from public, anon, authenticated, service_role;

create or replace function private.exigir_payload_pec_rpc_v30(
  p_arquivo_nome text,
  p_arquivo_sha256 text,
  p_linha_cabecalho integer,
  p_mapeamento jsonb,
  p_linhas jsonb,
  p_avisos jsonb
)
returns void
language plpgsql
set search_path = pg_catalog
as $$
begin
  if p_arquivo_nome is null
     or char_length(p_arquivo_nome) not between 1 and 180
     or lower(p_arquivo_nome) !~ '\\.csv$'
     or position('/' in p_arquivo_nome) > 0
     or position(chr(92) in p_arquivo_nome) > 0
     or p_arquivo_nome ~ '[[:cntrl:]]'
  then
    raise exception 'Nome de arquivo PEC inválido';
  end if;

  if p_arquivo_sha256 is null
     or p_arquivo_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Hash do arquivo PEC inválido';
  end if;

  if p_linha_cabecalho is null
     or p_linha_cabecalho not between 1 and 100
  then
    raise exception 'Linha de cabeçalho PEC inválida';
  end if;

  if p_mapeamento is null
     or jsonb_typeof(p_mapeamento) <> 'object'
     or pg_column_size(p_mapeamento) > 262144
  then
    raise exception 'Mapeamento PEC inválido';
  end if;

  if p_linhas is null
     or jsonb_typeof(p_linhas) <> 'array'
     or jsonb_array_length(p_linhas) < 1
     or jsonb_array_length(p_linhas) > 10000
     or pg_column_size(p_linhas) > 20971520
  then
    raise exception 'Linhas PEC inválidas ou acima do limite';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_linhas) as item(value)
    where jsonb_typeof(value) <> 'object'
       or pg_column_size(value) > 131072
       or exists (
         select 1
         from jsonb_object_keys(value) as k(key)
         where key <> all (array[
           'linha',
           'raw',
           'canonical',
           'extras'
         ]::text[])
       )
       or jsonb_typeof(value->'canonical') <> 'object'
       or (
         value ? 'raw'
         and jsonb_typeof(value->'raw') <> 'object'
       )
       or (
         value ? 'extras'
         and jsonb_typeof(value->'extras') <> 'object'
       )
  ) then
    raise exception 'Estrutura de linha PEC inválida';
  end if;

  if p_avisos is null
     or jsonb_typeof(p_avisos) <> 'array'
     or jsonb_array_length(p_avisos) > 100
     or pg_column_size(p_avisos) > 262144
  then
    raise exception 'Avisos PEC inválidos';
  end if;
end
$$;

revoke all on function private.exigir_payload_pec_rpc_v30(
  text, text, integer, jsonb, jsonb, jsonb
)
from public, anon, authenticated, service_role;

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

  perform private.exigir_rate_limit_usuario_v30(
    'rpc-clinical-save',
    v_user_id,
    120,
    300
  );

  perform private.exigir_payload_clinico_rpc_v30(p_payload);

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

  perform private.exigir_rate_limit_usuario_v30(
    'rpc-risk-save',
    v_user_id,
    60,
    300
  );

  perform private.exigir_payload_risco_rpc_v30(p_payload);

  return private.salvar_classificacao_risco_v30(
    v_user_id,
    p_payload
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

  perform private.exigir_rate_limit_usuario_v30(
    'rpc-pec-import',
    v_user_id,
    10,
    900
  );

  perform private.exigir_payload_pec_rpc_v30(
    p_arquivo_nome,
    p_arquivo_sha256,
    p_linha_cabecalho,
    p_mapeamento,
    p_linhas,
    coalesce(p_avisos, '[]'::jsonb)
  );

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
    coalesce(p_avisos, '[]'::jsonb)
  );
end
$$;

create or replace function public.profissionais_mover_gestante_lixeira_v30(
  p_gestante_id uuid
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

  perform private.exigir_rate_limit_usuario_v30(
    'rpc-clinical-trash',
    v_user_id,
    30,
    300
  );

  perform private.exigir_gestante_responsavel_v30(
    v_user_id,
    p_gestante_id
  );

  return private.mover_gestante_lixeira_v19(
    v_user_id,
    p_gestante_id,
    'Exclusão solicitada pela profissional'
  );
end
$$;

create or replace function public.profissionais_restaurar_gestante_v30(
  p_gestante_id uuid
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

  perform private.exigir_rate_limit_usuario_v30(
    'rpc-clinical-trash',
    v_user_id,
    30,
    300
  );

  perform private.exigir_gestante_responsavel_incluindo_lixeira_v30(
    v_user_id,
    p_gestante_id
  );

  if not exists (
    select 1
    from public.pec_gestantes g
    where g.id = p_gestante_id
      and g.excluida_em is not null
  ) then
    raise exception 'Gestante não está na lixeira';
  end if;

  return private.restaurar_gestante_v19(
    v_user_id,
    p_gestante_id
  );
end
$$;

create or replace function public.profissionais_excluir_gestante_definitivamente_v30(
  p_gestante_id uuid,
  p_confirmed boolean
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

  perform private.exigir_rate_limit_usuario_v30(
    'rpc-clinical-trash',
    v_user_id,
    30,
    300
  );

  if p_confirmed is distinct from true then
    raise exception 'Confirmação obrigatória';
  end if;

  perform private.exigir_gestante_responsavel_incluindo_lixeira_v30(
    v_user_id,
    p_gestante_id
  );

  if not exists (
    select 1
    from public.pec_gestantes g
    where g.id = p_gestante_id
      and g.excluida_em is not null
  ) then
    raise exception 'Exclusão definitiva exige passagem pela lixeira';
  end if;

  return private.excluir_gestante_definitivamente_v19(
    v_user_id,
    p_gestante_id,
    true
  );
end
$$;

revoke all on function public.profissionais_salvar_gestante_clinica_v30(jsonb)
from public, anon;
revoke all on function public.profissionais_salvar_classificacao_risco_v30(jsonb)
from public, anon;
revoke all on function public.profissionais_importar_pec_v30(
  text, text, integer, jsonb, jsonb, jsonb
)
from public, anon;
revoke all on function public.profissionais_mover_gestante_lixeira_v30(uuid)
from public, anon;
revoke all on function public.profissionais_restaurar_gestante_v30(uuid)
from public, anon;
revoke all on function public.profissionais_excluir_gestante_definitivamente_v30(uuid, boolean)
from public, anon;

grant execute on function public.profissionais_salvar_gestante_clinica_v30(jsonb)
to authenticated;
grant execute on function public.profissionais_salvar_classificacao_risco_v30(jsonb)
to authenticated;
grant execute on function public.profissionais_importar_pec_v30(
  text, text, integer, jsonb, jsonb, jsonb
)
to authenticated;
grant execute on function public.profissionais_mover_gestante_lixeira_v30(uuid)
to authenticated;
grant execute on function public.profissionais_restaurar_gestante_v30(uuid)
to authenticated;
grant execute on function public.profissionais_excluir_gestante_definitivamente_v30(uuid, boolean)
to authenticated;

commit;
