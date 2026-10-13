-- MAE APS: protege alteracoes clinicas manuais e faz reimportacao PEC idempotente.
-- Nenhuma alteracao ocorre em banco remoto; migration para validacao efemera.
begin;

create or replace function private.refinar_bloqueios_manuais_pec_v31()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_locked text[];
  v_changed text[];
begin
  if current_setting('app.origem_atualizacao', true) is distinct from 'manual' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Cadastro manual novo: bloquear apenas valores informados de fato.
    select coalesce(array_agg(e.key), '{}'::text[]) into v_changed
    from jsonb_each(to_jsonb(new)) e
    where e.key = any(coalesce(new.bloqueios_manuais, '{}'::text[]))
      and e.value <> 'null'::jsonb;
    v_locked := v_changed;
  else
    -- Edicao manual de ficha pre-preenchida: nao bloquear os campos inalterados.
    select coalesce(array_agg(e.key), '{}'::text[]) into v_changed
    from jsonb_each(to_jsonb(new)) e
    where e.key = any(coalesce(new.bloqueios_manuais, '{}'::text[]))
      and e.value is distinct from to_jsonb(old)->e.key;
    v_locked := coalesce(old.bloqueios_manuais, '{}'::text[]) || v_changed;
  end if;

  select coalesce(array_agg(distinct item), '{}'::text[])
  into new.bloqueios_manuais
  from unnest(coalesce(v_locked, '{}'::text[])) item;
  return new;
end
$$;

revoke all on function private.refinar_bloqueios_manuais_pec_v31()
from public, anon, authenticated, service_role;

drop trigger if exists trg_refinar_bloqueios_manuais_pec_v31 on public.pec_gestantes;
create trigger trg_refinar_bloqueios_manuais_pec_v31
before insert or update on public.pec_gestantes
for each row execute function private.refinar_bloqueios_manuais_pec_v31();

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
  v_cached public.importacoes_pec_resumo%rowtype;
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

  -- Serializa lotes identicos do mesmo usuario e UBS; evita duplicacao concorrente.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_ubs_id::text || ':' || p_usuario_id::text || ':' || p_arquivo_sha256, 0
    )
  );

  select r.*
    into v_cached
  from public.importacoes_pec_resumo r
  where r.ubs_id = p_ubs_id
    and r.usuario_id = p_usuario_id
    and r.arquivo_sha256 = p_arquivo_sha256
    and r.status = 'concluida'
    and r.total_erros = 0
  order by r.concluido_em desc nulls last
  limit 1;

  if found then
    return jsonb_build_object(
      'importacao_id', v_cached.id,
      'total', v_cached.total_linhas,
      'processadas', v_cached.total_processadas,
      'erros', v_cached.total_erros,
      'jaImportado', true
    );
  end if;

  -- Cada chamada inicia com sua origem correta, independente de contexto anterior.
  perform set_config('app.origem_atualizacao', 'pec', true);

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

revoke all on function private.importar_pec_v30(
 uuid, uuid, text, text, integer, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role;

commit;
