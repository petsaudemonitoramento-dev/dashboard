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
    if tg_op = 'UPDATE' then
      -- Uma coluna ausente no arquivo novo representa "não informado",
      -- nunca ordem para apagar valor PEC anteriormente documentado.
      if new.microarea_id is null then new.microarea_id := old.microarea_id; end if;
      if new.idade_anos is null then new.idade_anos := old.idade_anos; end if;
      if new.ano_nascimento is null then new.ano_nascimento := old.ano_nascimento; end if;
      if new.sexo is null then new.sexo := old.sexo; end if;
      if new.identidade_genero is null then new.identidade_genero := old.identidade_genero; end if;
      if new.raca_cor is null then new.raca_cor := old.raca_cor; end if;
      if new.bolsa_familia is null then new.bolsa_familia := old.bolsa_familia; end if;
      if new.vigencia_bolsa_familia is null then new.vigencia_bolsa_familia := old.vigencia_bolsa_familia; end if;
      if new.risco_gestacional is null then new.risco_gestacional := old.risco_gestacional; end if;
      if new.dum is null then new.dum := old.dum; end if;
      if new.ig_dum_semanas is null then new.ig_dum_semanas := old.ig_dum_semanas; end if;
      if new.ig_dum_dias is null then new.ig_dum_dias := old.ig_dum_dias; end if;
      if new.dpp_dum is null then new.dpp_dum := old.dpp_dum; end if;
      if new.ig_ecografia_semanas is null then new.ig_ecografia_semanas := old.ig_ecografia_semanas; end if;
      if new.ig_ecografia_dias is null then new.ig_ecografia_dias := old.ig_ecografia_dias; end if;
      if new.dpp_ecografia is null then new.dpp_ecografia := old.dpp_ecografia; end if;
      if new.peso_kg is null then new.peso_kg := old.peso_kg; end if;
      if new.altura_cm is null then new.altura_cm := old.altura_cm; end if;
      if new.pressao_arterial is null then new.pressao_arterial := old.pressao_arterial; end if;
      if new.data_ultima_pressao is null then new.data_ultima_pressao := old.data_ultima_pressao; end if;
      if new.data_ultimo_peso_altura is null then new.data_ultimo_peso_altura := old.data_ultimo_peso_altura; end if;
      if new.atendimentos_pre_natal is null then new.atendimentos_pre_natal := old.atendimentos_pre_natal; end if;
      if new.atendimentos_ate_12_semanas is null then new.atendimentos_ate_12_semanas := old.atendimentos_ate_12_semanas; end if;
      if new.ultima_consulta_pre_natal is null then new.ultima_consulta_pre_natal := old.ultima_consulta_pre_natal; end if;
      if new.atendimentos_odontologicos is null then new.atendimentos_odontologicos := old.atendimentos_odontologicos; end if;
      if new.dtpa is null then new.dtpa := old.dtpa; end if;
      if new.medicoes_altura_uterina is null then new.medicoes_altura_uterina := old.medicoes_altura_uterina; end if;
      if new.medicoes_pressao is null then new.medicoes_pressao := old.medicoes_pressao; end if;
      if new.medicoes_peso_altura is null then new.medicoes_peso_altura := old.medicoes_peso_altura; end if;
      if new.exame_hiv_primeiro is null then new.exame_hiv_primeiro := old.exame_hiv_primeiro; end if;
      if new.exame_sifilis_primeiro is null then new.exame_sifilis_primeiro := old.exame_sifilis_primeiro; end if;
      if new.exame_hepatite_b_primeiro is null then new.exame_hepatite_b_primeiro := old.exame_hepatite_b_primeiro; end if;
      if new.exame_hepatite_c_primeiro is null then new.exame_hepatite_c_primeiro := old.exame_hepatite_c_primeiro; end if;
      if new.exame_hiv_terceiro is null then new.exame_hiv_terceiro := old.exame_hiv_terceiro; end if;
      if new.exame_sifilis_terceiro is null then new.exame_sifilis_terceiro := old.exame_sifilis_terceiro; end if;
      if new.visitas_pre_natal is null then new.visitas_pre_natal := old.visitas_pre_natal; end if;
      if new.visitas_puerperio is null then new.visitas_puerperio := old.visitas_puerperio; end if;
      if new.atendimentos_puerperio is null then new.atendimentos_puerperio := old.atendimentos_puerperio; end if;
      if new.ultima_consulta_puerperio is null then new.ultima_consulta_puerperio := old.ultima_consulta_puerperio; end if;
      if new.dias_ultimo_atendimento_medico is null then new.dias_ultimo_atendimento_medico := old.dias_ultimo_atendimento_medico; end if;
      if new.dias_ultimo_atendimento_enfermagem is null then new.dias_ultimo_atendimento_enfermagem := old.dias_ultimo_atendimento_enfermagem; end if;
      if new.dias_ultimo_atendimento_odontologico is null then new.dias_ultimo_atendimento_odontologico := old.dias_ultimo_atendimento_odontologico; end if;
      if new.dias_ultima_visita is null then new.dias_ultima_visita := old.dias_ultima_visita; end if;
      new.dados_extras :=
        coalesce(old.dados_extras, '{}'::jsonb) ||
        coalesce(new.dados_extras, '{}'::jsonb);
    end if;
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
  v_existentes_antes integer := 0;
  v_protegidos_antes integer := 0;
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

  -- Comparação sem revelar identidade: wrapper já vetou pacientes de outro profissional.
  select
    count(distinct g.id)::integer,
    count(distinct g.id) filter (
      where cardinality(coalesce(g.bloqueios_manuais, '{}'::text[])) > 0
    )::integer
  into v_existentes_antes, v_protegidos_antes
  from jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) item
  join private.identidades_gestantes i
    on i.identidade_hash = private.identidade_hash(
      coalesce(item->'canonical', '{}'::jsonb), p_ubs_id
    )
  join public.pec_gestantes g on g.id = i.gestante_id
  where g.profissional_responsavel_id = p_usuario_id;

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

  return v_resultado || jsonb_build_object(
    'pacientesExistentesAntes', coalesce(v_existentes_antes, 0),
    'fichasComCorrecoesManuaisAntes', coalesce(v_protegidos_antes, 0),
    'notaComparacao', 'Contagens de fichas identificadas antes da importação; falhas por linha podem alterar os totais efetivos.'
  );
end
$;

revoke all on function private.importar_pec_v30(
 uuid, uuid, text, text, integer, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role;

commit;
