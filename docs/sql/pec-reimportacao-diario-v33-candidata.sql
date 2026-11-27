-- Candidate patch for a new migration. Validate on a separate database before applying.
-- Reuses the current encrypted identity and owner-scoped authorization model.
CREATE OR REPLACE FUNCTION private.resolver_identidade_diario_v33(
  p_canonical jsonb, p_ubs_id uuid, p_usuario_id uuid
) RETURNS text
LANGUAGE plpgsql
SET search_path TO pg_catalog, public, private, extensions
AS $$
DECLARE
  v_hash text := private.identidade_hash(p_canonical, p_ubs_id);
  v_key text := private.pii_key();
  v_cpf text := regexp_replace(coalesce(p_canonical->>'cpf',''), '\D','','g');
  v_cns text := regexp_replace(coalesce(p_canonical->>'cns',''), '\D','','g');
  v_nome text := lower(btrim(extensions.unaccent(coalesce(p_canonical->>'nome',''))));
  v_nasc date := private.parse_date(p_canonical->>'data_nascimento');
  v_candidate record;
  v_found text;
  v_count int := 0;
  v_same_cpf boolean;
  v_same_cns boolean;
  v_same_name_date boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.perfis p
    WHERE p.id=p_usuario_id AND p.ubs_id=p_ubs_id
      AND p.perfil='equipe_ubs' AND p.ativo AND p.status='ativo'
      AND p.cadastro_completo AND p.aprovacao_status='aprovado'
      AND p.perfil_excluido_em IS NULL
  ) THEN
    RAISE EXCEPTION 'Profissional sem autorização para conciliar a ficha';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_usuario_id THEN
    RAISE EXCEPTION 'Identidade autenticada incompatível';
  END IF;
  -- One lock per professional: serializes differing files and manual creations.
  PERFORM pg_advisory_xact_lock(hashtextextended('gestario-diario:'||p_usuario_id::text,0));
  FOR v_candidate IN
    SELECT i.identidade_hash AS h, g.excluida_em AS deleted_at,
      regexp_replace(coalesce(extensions.pgp_sym_decrypt(i.cpf_enc,v_key),''),'\D','','g') AS cpf,
      regexp_replace(coalesce(extensions.pgp_sym_decrypt(i.cns_enc,v_key),''),'\D','','g') AS cns,
      lower(btrim(extensions.unaccent(coalesce(extensions.pgp_sym_decrypt(i.nome_enc,v_key),'')))) AS nome,
      private.parse_date(extensions.pgp_sym_decrypt(i.data_nascimento_enc,v_key)) AS nasc
    FROM public.pec_gestantes g
    JOIN private.identidades_gestantes i ON i.gestante_id=g.id
    WHERE g.profissional_responsavel_id=p_usuario_id AND g.ubs_id=p_ubs_id
  LOOP
    v_same_cpf := v_cpf<>'' AND v_candidate.cpf=v_cpf;
    v_same_cns := v_cns<>'' AND v_candidate.cns=v_cns;
    v_same_name_date := v_nome<>'' AND v_nasc IS NOT NULL AND v_candidate.nome=v_nome AND v_candidate.nasc=v_nasc;
    IF v_candidate.h=v_hash OR v_same_cpf OR v_same_cns OR v_same_name_date THEN
      IF (v_cpf<>'' AND v_candidate.cpf<>'' AND v_cpf<>v_candidate.cpf)
        OR (v_cns<>'' AND v_candidate.cns<>'' AND v_cns<>v_candidate.cns) THEN
        RAISE EXCEPTION 'Identificadores divergentes; revise a ficha existente antes de importar';
      END IF;
      -- Name + date alone must not merge a record with identifiers
      -- if neither identifier agrees (including incomplete identifiers).
      IF v_candidate.h<>v_hash AND NOT v_same_cpf AND NOT v_same_cns
         AND (v_cpf<>'' OR v_cns<>'' OR v_candidate.cpf<>'' OR v_candidate.cns<>'') THEN
        RAISE EXCEPTION 'Possível ficha existente com identificadores incompletos; revise antes de importar';
      END IF;
      IF v_candidate.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Ficha encontrada na lixeira; restaure-a antes de importar';
      END IF;
      v_count := v_count+1;
      v_found := v_candidate.h;
    END IF;
  END LOOP;
  IF v_count>1 THEN
    RAISE EXCEPTION 'Mais de uma ficha corresponde aos identificadores; revisão necessária';
  END IF;
  IF EXISTS (
    SELECT 1 FROM private.identidades_gestantes i
    LEFT JOIN public.pec_gestantes g ON g.id=i.gestante_id
    WHERE i.identidade_hash=coalesce(v_found,v_hash)
      AND (g.profissional_responsavel_id IS DISTINCT FROM p_usuario_id
           OR g.ubs_id IS DISTINCT FROM p_ubs_id)
  ) THEN
    RAISE EXCEPTION 'Identidade incompatível com o diário profissional';
  END IF;
  RETURN coalesce(v_found,v_hash);
END;
$$;
REVOKE ALL ON FUNCTION private.resolver_identidade_diario_v33(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.importar_pec(p_ubs_id uuid, p_usuario_id uuid, p_arquivo_nome text, p_arquivo_sha256 text, p_linha_cabecalho integer, p_mapeamento jsonb, p_linhas jsonb, p_avisos jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'extensions'
AS $function$
declare
  v_importacao_id uuid;
  v_item jsonb;
  v_canonical jsonb;
  v_extras jsonb;
  v_raw_id bigint;
  v_linha integer;
  v_hash text;
  v_gestante_id uuid;
  v_codigo text;
  v_microarea_id uuid;
  v_key text := private.pii_key();
  v_processadas integer := 0;
  v_erros integer := 0;
  v_data_nascimento date;
  v_idade integer;
begin
  if not exists (
    select 1
    from public.perfis p
    where p.id = p_usuario_id
      and p.ativo = true
      and p.status = 'ativo'
      and (
        p.perfil = 'administrador'
        or p.ubs_id = p_ubs_id
      )
  ) then
    raise exception 'Usuário sem autorização para importar nesta UBS';
  end if;

  insert into public.importacoes_pec_resumo (
    ubs_id,
    usuario_id,
    arquivo_nome,
    arquivo_sha256,
    linha_cabecalho,
    total_linhas,
    mapeamento,
    avisos
  )
  values (
    p_ubs_id,
    p_usuario_id,
    p_arquivo_nome,
    p_arquivo_sha256,
    p_linha_cabecalho,
    jsonb_array_length(p_linhas),
    coalesce(p_mapeamento, '{}'::jsonb),
    coalesce(p_avisos, '[]'::jsonb)
  )
  returning id into v_importacao_id;

  for v_item in
    select value
    from jsonb_array_elements(p_linhas)
  loop
    v_linha := coalesce((v_item->>'linha')::integer, 0);
    v_canonical := coalesce(v_item->'canonical', '{}'::jsonb);
    v_extras := coalesce(v_item->'extras', '{}'::jsonb);

    insert into private.importacao_pec_linhas_raw (
      importacao_id,
      numero_linha,
      dados_raw
    )
    values (
      v_importacao_id,
      v_linha,
      coalesce(v_item->'raw', '{}'::jsonb)
    )
    returning id into v_raw_id;

    begin
      v_hash := private.resolver_identidade_diario_v33(v_canonical, p_ubs_id, p_usuario_id);
      v_data_nascimento := private.parse_date(v_canonical->>'data_nascimento');

      v_idade := private.parse_int(v_canonical->>'idade_texto');
      if v_idade is null and v_data_nascimento is not null then
        v_idade := extract(year from age(current_date, v_data_nascimento))::integer;
      end if;

      select ig.gestante_id
      into v_gestante_id
      from private.identidades_gestantes ig
      where ig.identidade_hash = v_hash;

      if v_gestante_id is null then
        v_gestante_id := gen_random_uuid();
      end if;

      v_codigo := 'GST-' || upper(substr(replace(v_gestante_id::text, '-', ''), 1, 8));

      insert into private.identidades_gestantes (
        gestante_id,
        identidade_hash,
        ubs_id,
        nome_enc,
        data_nascimento_enc,
        cpf_enc,
        cns_enc,
        telefones_enc,
        endereco_enc,
        atualizado_em
      )
      values (
        v_gestante_id,
        v_hash,
        p_ubs_id,
        pgp_sym_encrypt(coalesce(v_canonical->>'nome', ''), v_key, 'cipher-algo=aes256'),
        pgp_sym_encrypt(coalesce(v_canonical->>'data_nascimento', ''), v_key, 'cipher-algo=aes256'),
        pgp_sym_encrypt(coalesce(v_canonical->>'cpf', ''), v_key, 'cipher-algo=aes256'),
        pgp_sym_encrypt(coalesce(v_canonical->>'cns', ''), v_key, 'cipher-algo=aes256'),
        pgp_sym_encrypt(
          jsonb_build_object(
            'celular', v_canonical->>'telefone_celular',
            'residencial', v_canonical->>'telefone_residencial',
            'contato', v_canonical->>'telefone_contato'
          )::text,
          v_key,
          'cipher-algo=aes256'
        ),
        pgp_sym_encrypt(
          jsonb_build_object(
            'rua', v_canonical->>'rua',
            'numero', v_canonical->>'numero',
            'complemento', v_canonical->>'complemento',
            'bairro', v_canonical->>'bairro',
            'municipio', v_canonical->>'municipio',
            'uf', v_canonical->>'uf',
            'cep', v_canonical->>'cep'
          )::text,
          v_key,
          'cipher-algo=aes256'
        ),
        now()
      )
      on conflict (identidade_hash)
      do update set
        ubs_id = excluded.ubs_id,
        nome_enc = excluded.nome_enc,
        data_nascimento_enc = excluded.data_nascimento_enc,
        cpf_enc = excluded.cpf_enc,
        cns_enc = excluded.cns_enc,
        telefones_enc = excluded.telefones_enc,
        endereco_enc = excluded.endereco_enc,
        atualizado_em = now()
      returning gestante_id into v_gestante_id;

      select m.id
      into v_microarea_id
      from public.microareas m
      where m.ubs_id = p_ubs_id
        and regexp_replace(coalesce(m.codigo, ''), '\D', '', 'g')
          = regexp_replace(coalesce(v_canonical->>'microarea', ''), '\D', '', 'g')
      limit 1;

      insert into public.pec_gestantes (
        id,
        codigo,
        ubs_id,
        microarea_id,
        idade_anos,
        ano_nascimento,
        sexo,
        identidade_genero,
        raca_cor,
        bolsa_familia,
        vigencia_bolsa_familia,
        risco_gestacional,
        dum,
        ig_dum_semanas,
        ig_dum_dias,
        dpp_dum,
        ig_ecografia_semanas,
        ig_ecografia_dias,
        dpp_ecografia,
        peso_kg,
        altura_cm,
        pressao_arterial,
        data_ultima_pressao,
        data_ultimo_peso_altura,
        atendimentos_pre_natal,
        atendimentos_ate_12_semanas,
        ultima_consulta_pre_natal,
        atendimentos_odontologicos,
        dtpa,
        medicoes_altura_uterina,
        medicoes_pressao,
        medicoes_peso_altura,
        exame_hiv_primeiro,
        exame_sifilis_primeiro,
        exame_hepatite_b_primeiro,
        exame_hepatite_c_primeiro,
        exame_hiv_terceiro,
        exame_sifilis_terceiro,
        visitas_pre_natal,
        visitas_puerperio,
        atendimentos_puerperio,
        ultima_consulta_puerperio,
        dias_ultimo_atendimento_medico,
        dias_ultimo_atendimento_enfermagem,
        dias_ultimo_atendimento_odontologico,
        dias_ultima_visita,
        dados_extras,
        importacao_id,
        atualizado_em
      )
      values (
        v_gestante_id,
        v_codigo,
        p_ubs_id,
        v_microarea_id,
        v_idade,
        case when v_data_nascimento is null then null else extract(year from v_data_nascimento)::integer end,
        private.clean_text(v_canonical->>'sexo'),
        private.clean_text(v_canonical->>'identidade_genero'),
        private.clean_text(v_canonical->>'raca_cor'),
        case
          when lower(coalesce(v_canonical->>'bolsa_familia', '')) in ('sim', 'true', '1') then true
          when lower(coalesce(v_canonical->>'bolsa_familia', '')) in ('nao', 'não', 'false', '0') then false
          else null
        end,
        private.parse_date(v_canonical->>'vigencia_bolsa_familia'),
        private.clean_text(v_canonical->>'risco_gestacional'),
        private.parse_date(v_canonical->>'dum'),
        private.parse_int(v_canonical->>'ig_dum_semanas'),
        private.parse_int(v_canonical->>'ig_dum_dias'),
        private.parse_date(v_canonical->>'dpp_dum'),
        private.parse_int(v_canonical->>'ig_ecografia_semanas'),
        private.parse_int(v_canonical->>'ig_ecografia_dias'),
        private.parse_date(v_canonical->>'dpp_ecografia'),
        private.parse_numeric(v_canonical->>'peso_kg'),
        private.parse_numeric(v_canonical->>'altura_cm'),
        private.clean_text(v_canonical->>'pressao_arterial'),
        private.parse_date(v_canonical->>'data_ultima_pressao'),
        private.parse_date(v_canonical->>'data_ultimo_peso_altura'),
        private.parse_int(v_canonical->>'atendimentos_pre_natal'),
        private.parse_int(v_canonical->>'atendimentos_ate_12_semanas'),
        private.parse_date(v_canonical->>'ultima_consulta_pre_natal'),
        private.parse_int(v_canonical->>'atendimentos_odontologicos'),
        private.clean_text(v_canonical->>'dtpa'),
        private.parse_int(v_canonical->>'medicoes_altura_uterina'),
        private.parse_int(v_canonical->>'medicoes_pressao'),
        private.parse_int(v_canonical->>'medicoes_peso_altura'),
        private.clean_text(v_canonical->>'exame_hiv_primeiro'),
        private.clean_text(v_canonical->>'exame_sifilis_primeiro'),
        private.clean_text(v_canonical->>'exame_hepatite_b_primeiro'),
        private.clean_text(v_canonical->>'exame_hepatite_c_primeiro'),
        private.clean_text(v_canonical->>'exame_hiv_terceiro'),
        private.clean_text(v_canonical->>'exame_sifilis_terceiro'),
        private.parse_int(v_canonical->>'visitas_pre_natal'),
        private.parse_int(v_canonical->>'visitas_puerperio'),
        private.parse_int(v_canonical->>'atendimentos_puerperio'),
        private.parse_date(v_canonical->>'ultima_consulta_puerperio'),
        private.parse_int(v_canonical->>'dias_ultimo_atendimento_medico'),
        private.parse_int(v_canonical->>'dias_ultimo_atendimento_enfermagem'),
        private.parse_int(v_canonical->>'dias_ultimo_atendimento_odontologico'),
        private.parse_int(v_canonical->>'dias_ultima_visita'),
        v_extras,
        v_importacao_id,
        now()
      )
      on conflict (id)
      do update set
        codigo = excluded.codigo,
        ubs_id = excluded.ubs_id,
        microarea_id = excluded.microarea_id,
        idade_anos = excluded.idade_anos,
        ano_nascimento = excluded.ano_nascimento,
        sexo = excluded.sexo,
        identidade_genero = excluded.identidade_genero,
        raca_cor = excluded.raca_cor,
        bolsa_familia = excluded.bolsa_familia,
        vigencia_bolsa_familia = excluded.vigencia_bolsa_familia,
        risco_gestacional = excluded.risco_gestacional,
        dum = excluded.dum,
        ig_dum_semanas = excluded.ig_dum_semanas,
        ig_dum_dias = excluded.ig_dum_dias,
        dpp_dum = excluded.dpp_dum,
        ig_ecografia_semanas = excluded.ig_ecografia_semanas,
        ig_ecografia_dias = excluded.ig_ecografia_dias,
        dpp_ecografia = excluded.dpp_ecografia,
        peso_kg = excluded.peso_kg,
        altura_cm = excluded.altura_cm,
        pressao_arterial = excluded.pressao_arterial,
        data_ultima_pressao = excluded.data_ultima_pressao,
        data_ultimo_peso_altura = excluded.data_ultimo_peso_altura,
        atendimentos_pre_natal = excluded.atendimentos_pre_natal,
        atendimentos_ate_12_semanas = excluded.atendimentos_ate_12_semanas,
        ultima_consulta_pre_natal = excluded.ultima_consulta_pre_natal,
        atendimentos_odontologicos = excluded.atendimentos_odontologicos,
        dtpa = excluded.dtpa,
        medicoes_altura_uterina = excluded.medicoes_altura_uterina,
        medicoes_pressao = excluded.medicoes_pressao,
        medicoes_peso_altura = excluded.medicoes_peso_altura,
        exame_hiv_primeiro = excluded.exame_hiv_primeiro,
        exame_sifilis_primeiro = excluded.exame_sifilis_primeiro,
        exame_hepatite_b_primeiro = excluded.exame_hepatite_b_primeiro,
        exame_hepatite_c_primeiro = excluded.exame_hepatite_c_primeiro,
        exame_hiv_terceiro = excluded.exame_hiv_terceiro,
        exame_sifilis_terceiro = excluded.exame_sifilis_terceiro,
        visitas_pre_natal = excluded.visitas_pre_natal,
        visitas_puerperio = excluded.visitas_puerperio,
        atendimentos_puerperio = excluded.atendimentos_puerperio,
        ultima_consulta_puerperio = excluded.ultima_consulta_puerperio,
        dias_ultimo_atendimento_medico = excluded.dias_ultimo_atendimento_medico,
        dias_ultimo_atendimento_enfermagem = excluded.dias_ultimo_atendimento_enfermagem,
        dias_ultimo_atendimento_odontologico = excluded.dias_ultimo_atendimento_odontologico,
        dias_ultima_visita = excluded.dias_ultima_visita,
        dados_extras = excluded.dados_extras,
        importacao_id = excluded.importacao_id,
        atualizado_em = now();

      delete from private.importacao_pec_linhas_raw
      where id = v_raw_id;

      v_processadas := v_processadas + 1;
    exception
      when others then
        delete from private.importacao_pec_linhas_raw
        where id = v_raw_id;

        insert into private.importacao_pec_erros (
          importacao_id,
          numero_linha,
          codigo_erro,
          mensagem
        )
        values (
          v_importacao_id,
          v_linha,
          sqlstate,
          left(sqlerrm, 1000)
        );

        v_erros := v_erros + 1;
    end;
  end loop;

  update public.importacoes_pec_resumo
  set
    total_processadas = v_processadas,
    total_erros = v_erros,
    status = case
      when v_erros = 0 then 'concluida'
      when v_processadas > 0 then 'concluida_com_erros'
      else 'falhou'
    end,
    concluido_em = now()
  where id = v_importacao_id;

  return jsonb_build_object(
    'importacao_id', v_importacao_id,
    'total', jsonb_array_length(p_linhas),
    'processadas', v_processadas,
    'erros', v_erros
  );
end
$function$;

CREATE OR REPLACE FUNCTION private.importar_pec_v30(p_ubs_id uuid, p_usuario_id uuid, p_arquivo_nome text, p_arquivo_sha256 text, p_linha_cabecalho integer, p_mapeamento jsonb, p_linhas jsonb, p_avisos jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
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

  -- Serializa todas as importações do mesmo diário, não apenas hashes iguais.
  perform pg_advisory_xact_lock(hashtextextended('gestario-diario:'||p_usuario_id::text,0));

  -- Uma importação nunca pode atualizar silenciosamente uma gestante
  -- já pertencente a outro profissional.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) item
    join private.identidades_gestantes i
      on i.identidade_hash = private.resolver_identidade_diario_v33(coalesce(item->'canonical', '{}'::jsonb), p_ubs_id, p_usuario_id)
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
    on i.identidade_hash = private.resolver_identidade_diario_v33(coalesce(item->'canonical', '{}'::jsonb), p_ubs_id, p_usuario_id)
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
$function$;

CREATE OR REPLACE FUNCTION private.salvar_gestante_clinica(p_usuario_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'extensions'
AS $function$
declare
  v_perfil text;
  v_ubs_usuario uuid;
  v_ubs_id uuid;
  v_gestante_id uuid;
  v_existente boolean := false;
  v_codigo text;
  v_nome text;
  v_nascimento_text text;
  v_nascimento date;
  v_hash text;
  v_key text := private.pii_key();
  v_microarea_id uuid;
  v_antes jsonb;
  v_depois jsonb;
  v_item jsonb;
  v_alta_anterior boolean := false;
  v_alta_nova boolean := false;
  v_campos_manuais text[] := array[
    'microarea_id',
    'idade_anos',
    'sexo',
    'identidade_genero',
    'raca_cor',
    'bolsa_familia',
    'vigencia_bolsa_familia',
    'inicio_pre_natal',
    'dum',
    'dpp_dum',
    'ig_dum_semanas',
    'ig_dum_dias',
    'ig_ecografia_semanas',
    'ig_ecografia_dias',
    'dpp_ecografia',
    'peso_kg',
    'altura_cm',
    'pressao_arterial',
    'data_ultima_pressao',
    'data_ultimo_peso_altura',
    'atendimentos_pre_natal',
    'atendimentos_ate_12_semanas',
    'ultima_consulta_pre_natal',
    'atendimentos_odontologicos',
    'medicoes_altura_uterina',
    'medicoes_pressao',
    'medicoes_peso_altura',
    'visitas_pre_natal',
    'visitas_puerperio',
    'atendimentos_puerperio',
    'ultima_consulta_puerperio',
    'situacao_acompanhamento',
    'data_parto',
    'tipo_parto',
    'risco_gestacional'
  ];
begin
  perform private.exigir_usuario_v1(p_usuario_id, array['administrador','equipe_ubs']::text[]);
  select p.perfil::text, p.ubs_id
  into v_perfil, v_ubs_usuario
  from public.perfis p
  where p.id = p_usuario_id
    and p.ativo = true
    and p.status = 'ativo'
    and p.perfil::text in ('administrador', 'equipe_ubs')
  limit 1;

  if not found then
    raise exception 'Usuário sem autorização para cadastro clínico';
  end if;

  v_gestante_id := nullif(p_payload->>'id', '')::uuid;
  v_nome := btrim(coalesce(p_payload #>> '{identificacao,nome}', ''));
  v_nascimento_text := btrim(coalesce(p_payload #>> '{identificacao,dataNascimento}', ''));
  v_nascimento := private.parse_date(v_nascimento_text);

  if v_nome = '' then
    raise exception 'O nome da gestante é obrigatório';
  end if;

  if v_nascimento is null then
    raise exception 'A data de nascimento é obrigatória';
  end if;

  if v_gestante_id is not null then
    select g.ubs_id, g.codigo, g.alta_ativa
    into v_ubs_id, v_codigo, v_alta_anterior
    from public.pec_gestantes g
    where g.id = v_gestante_id;

    if not found then
      raise exception 'Gestante não encontrada';
    end if;

    if v_perfil <> 'administrador' and v_ubs_id <> v_ubs_usuario then
      raise exception 'Usuário sem autorização para editar esta gestante';
    end if;

    v_existente := true;
  else
    v_ubs_id := case
      when v_perfil = 'administrador'
        and nullif(p_payload->>'ubsId', '') is not null
      then (p_payload->>'ubsId')::uuid
      else v_ubs_usuario
    end;

    if v_ubs_id is null then
      raise exception 'Usuário sem UBS vinculada';
    end if;

    v_hash := private.resolver_identidade_diario_v33(
      jsonb_build_object(
        'nome', v_nome,
        'data_nascimento', to_char(v_nascimento, 'DD/MM/YYYY'),
        'cpf', coalesce(p_payload #>> '{identificacao,cpf}', ''),
        'cns', coalesce(p_payload #>> '{identificacao,cns}', '')
      ),
      v_ubs_id,
      p_usuario_id
    );

    select i.gestante_id
    into v_gestante_id
    from private.identidades_gestantes i
    where i.identidade_hash = v_hash
    limit 1;

    if v_gestante_id is not null then
      raise exception 'GESTANTE_DUPLICADA:%', v_gestante_id;
    end if;

    v_gestante_id := gen_random_uuid();
    v_codigo := 'GST-' || upper(substr(replace(v_gestante_id::text, '-', ''), 1, 8));
  end if;

  v_microarea_id := nullif(p_payload->>'microareaId', '')::uuid;

  if v_microarea_id is not null and not exists (
    select 1
    from public.microareas m
    where m.id = v_microarea_id
      and m.ubs_id = v_ubs_id
  ) then
    raise exception 'Microárea inválida para a UBS';
  end if;

  if v_existente then
    select to_jsonb(g)
    into v_antes
    from public.pec_gestantes g
    where g.id = v_gestante_id;
  end if;

  perform set_config('app.origem_atualizacao', 'manual', true);

  insert into private.identidades_gestantes (
    gestante_id,
    identidade_hash,
    ubs_id,
    nome_enc,
    data_nascimento_enc,
    cpf_enc,
    cns_enc,
    telefones_enc,
    endereco_enc,
    bloqueios_manuais,
    atualizado_manualmente_em,
    atualizado_manualmente_por,
    atualizado_em
  )
  values (
    v_gestante_id,
    coalesce(
      v_hash,
      private.identidade_hash(
        jsonb_build_object(
          'nome', v_nome,
          'data_nascimento', to_char(v_nascimento, 'DD/MM/YYYY'),
          'cpf', coalesce(p_payload #>> '{identificacao,cpf}', ''),
          'cns', coalesce(p_payload #>> '{identificacao,cns}', '')
        ),
        v_ubs_id
      )
    ),
    v_ubs_id,
    extensions.pgp_sym_encrypt(v_nome, v_key, 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt(to_char(v_nascimento, 'DD/MM/YYYY'), v_key, 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt(coalesce(p_payload #>> '{identificacao,cpf}', ''), v_key, 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt(coalesce(p_payload #>> '{identificacao,cns}', ''), v_key, 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt(
      jsonb_build_object(
        'celular', coalesce(p_payload #>> '{identificacao,telefoneCelular}', ''),
        'residencial', coalesce(p_payload #>> '{identificacao,telefoneResidencial}', ''),
        'contato', coalesce(p_payload #>> '{identificacao,telefoneContato}', '')
      )::text,
      v_key,
      'cipher-algo=aes256'
    ),
    extensions.pgp_sym_encrypt(
      jsonb_build_object(
        'rua', coalesce(p_payload #>> '{identificacao,rua}', ''),
        'numero', coalesce(p_payload #>> '{identificacao,numero}', ''),
        'complemento', coalesce(p_payload #>> '{identificacao,complemento}', ''),
        'bairro', coalesce(p_payload #>> '{identificacao,bairro}', ''),
        'municipio', coalesce(p_payload #>> '{identificacao,municipio}', ''),
        'uf', coalesce(p_payload #>> '{identificacao,uf}', ''),
        'cep', coalesce(p_payload #>> '{identificacao,cep}', '')
      )::text,
      v_key,
      'cipher-algo=aes256'
    ),
    array[
      'nome',
      'data_nascimento',
      'cpf',
      'cns',
      'telefones',
      'endereco'
    ],
    now(),
    p_usuario_id,
    now()
  )
  on conflict (gestante_id)
  do update set
    identidade_hash = private.identidades_gestantes.identidade_hash,
    ubs_id = excluded.ubs_id,
    nome_enc = excluded.nome_enc,
    data_nascimento_enc = excluded.data_nascimento_enc,
    cpf_enc = excluded.cpf_enc,
    cns_enc = excluded.cns_enc,
    telefones_enc = excluded.telefones_enc,
    endereco_enc = excluded.endereco_enc,
    bloqueios_manuais = (
      select array_agg(distinct item)
      from unnest(
        coalesce(
          private.identidades_gestantes.bloqueios_manuais,
          '{}'::text[]
        )
        || excluded.bloqueios_manuais
      ) item
    ),
    atualizado_manualmente_em = now(),
    atualizado_manualmente_por = p_usuario_id,
    atualizado_em = now();

  v_alta_nova := coalesce((p_payload #>> '{alta,ativa}')::boolean, false);

  insert into public.pec_gestantes (
    id,
    codigo,
    ubs_id,
    microarea_id,
    idade_anos,
    ano_nascimento,
    sexo,
    identidade_genero,
    raca_cor,
    bolsa_familia,
    vigencia_bolsa_familia,
    inicio_pre_natal,
    situacao_acompanhamento,
    dum,
    ig_dum_semanas,
    ig_dum_dias,
    dpp_dum,
    ig_ecografia_semanas,
    ig_ecografia_dias,
    dpp_ecografia,
    data_parto,
    tipo_parto,
    peso_kg,
    altura_cm,
    pressao_arterial,
    data_ultima_pressao,
    data_ultimo_peso_altura,
    risco_gestacional,
    atendimentos_pre_natal,
    atendimentos_ate_12_semanas,
    ultima_consulta_pre_natal,
    atendimentos_odontologicos,
    medicoes_altura_uterina,
    medicoes_pressao,
    medicoes_peso_altura,
    visitas_pre_natal,
    visitas_puerperio,
    atendimentos_puerperio,
    ultima_consulta_puerperio,
    dias_ultimo_atendimento_medico,
    dias_ultimo_atendimento_enfermagem,
    dias_ultimo_atendimento_odontologico,
    dias_ultima_visita,
    alta_ativa,
    alta_data,
    alta_motivo,
    alta_situacao_final,
    alta_observacao,
    cadastro_origem,
    fontes_campos,
    bloqueios_manuais,
    atualizado_manualmente_em,
    atualizado_manualmente_por,
    atualizado_em
  )
  values (
    v_gestante_id,
    v_codigo,
    v_ubs_id,
    v_microarea_id,
    extract(year from age(current_date, v_nascimento))::integer,
    extract(year from v_nascimento)::integer,
    private.clean_text(p_payload #>> '{identificacao,sexo}'),
    private.clean_text(p_payload #>> '{identificacao,identidadeGenero}'),
    private.clean_text(p_payload #>> '{identificacao,racaCor}'),
    case
      when p_payload #>> '{identificacao,bolsaFamilia}' is null then null
      else (p_payload #>> '{identificacao,bolsaFamilia}')::boolean
    end,
    private.parse_date(p_payload #>> '{identificacao,vigenciaBolsaFamilia}'),
    private.parse_date(p_payload #>> '{gestacao,inicioPreNatal}'),
    case
      when v_alta_nova then 'alta'
      else coalesce(nullif(p_payload #>> '{gestacao,situacao}', ''), 'gestacao_em_curso')
    end,
    private.parse_date(p_payload #>> '{gestacao,dum}'),
    private.parse_int(p_payload #>> '{gestacao,igSemanas}'),
    private.parse_int(p_payload #>> '{gestacao,igDias}'),
    private.parse_date(p_payload #>> '{gestacao,dpp}'),
    private.parse_int(p_payload #>> '{gestacao,igEcografiaSemanas}'),
    private.parse_int(p_payload #>> '{gestacao,igEcografiaDias}'),
    private.parse_date(p_payload #>> '{gestacao,dppEcografia}'),
    private.parse_date(p_payload #>> '{gestacao,dataParto}'),
    private.clean_text(p_payload #>> '{gestacao,tipoParto}'),
    private.parse_numeric(p_payload #>> '{gestacao,pesoKg}'),
    private.parse_numeric(p_payload #>> '{gestacao,alturaCm}'),
    private.clean_text(p_payload #>> '{gestacao,pressaoArterial}'),
    private.parse_date(p_payload #>> '{gestacao,dataUltimaPressao}'),
    private.parse_date(p_payload #>> '{gestacao,dataUltimoPesoAltura}'),
    private.clean_text(p_payload #>> '{gestacao,riscoGestacional}'),
    private.parse_int(p_payload #>> '{acompanhamento,atendimentosPreNatal}'),
    private.parse_int(p_payload #>> '{acompanhamento,atendimentosAte12Semanas}'),
    private.parse_date(p_payload #>> '{acompanhamento,ultimaConsultaPreNatal}'),
    private.parse_int(p_payload #>> '{acompanhamento,atendimentosOdontologicos}'),
    private.parse_int(p_payload #>> '{acompanhamento,medicoesAlturaUterina}'),
    private.parse_int(p_payload #>> '{acompanhamento,medicoesPressao}'),
    private.parse_int(p_payload #>> '{acompanhamento,medicoesPesoAltura}'),
    private.parse_int(p_payload #>> '{acompanhamento,visitasPreNatal}'),
    private.parse_int(p_payload #>> '{acompanhamento,visitasPuerperio}'),
    private.parse_int(p_payload #>> '{acompanhamento,atendimentosPuerperio}'),
    private.parse_date(p_payload #>> '{acompanhamento,ultimaConsultaPuerperio}'),
    private.parse_int(p_payload #>> '{acompanhamento,diasUltimoAtendimentoMedico}'),
    private.parse_int(p_payload #>> '{acompanhamento,diasUltimoAtendimentoEnfermagem}'),
    private.parse_int(p_payload #>> '{acompanhamento,diasUltimoAtendimentoOdontologico}'),
    private.parse_int(p_payload #>> '{acompanhamento,diasUltimaVisita}'),
    v_alta_nova,
    private.parse_date(p_payload #>> '{alta,data}'),
    private.clean_text(p_payload #>> '{alta,motivo}'),
    private.clean_text(p_payload #>> '{alta,situacaoFinal}'),
    private.clean_text(p_payload #>> '{alta,observacao}'),
    case when v_existente then 'pec_complementado' else 'manual' end,
    jsonb_build_object(
      'ultima_atualizacao_manual', now(),
      'profissional_id', p_usuario_id
    ),
    v_campos_manuais,
    now(),
    p_usuario_id,
    now()
  )
  on conflict (id)
  do update set
    microarea_id = excluded.microarea_id,
    idade_anos = excluded.idade_anos,
    ano_nascimento = excluded.ano_nascimento,
    sexo = excluded.sexo,
    identidade_genero = excluded.identidade_genero,
    raca_cor = excluded.raca_cor,
    bolsa_familia = excluded.bolsa_familia,
    vigencia_bolsa_familia = excluded.vigencia_bolsa_familia,
    inicio_pre_natal = excluded.inicio_pre_natal,
    situacao_acompanhamento = excluded.situacao_acompanhamento,
    dum = excluded.dum,
    ig_dum_semanas = excluded.ig_dum_semanas,
    ig_dum_dias = excluded.ig_dum_dias,
    dpp_dum = excluded.dpp_dum,
    ig_ecografia_semanas = excluded.ig_ecografia_semanas,
    ig_ecografia_dias = excluded.ig_ecografia_dias,
    dpp_ecografia = excluded.dpp_ecografia,
    data_parto = excluded.data_parto,
    tipo_parto = excluded.tipo_parto,
    peso_kg = excluded.peso_kg,
    altura_cm = excluded.altura_cm,
    pressao_arterial = excluded.pressao_arterial,
    data_ultima_pressao = excluded.data_ultima_pressao,
    data_ultimo_peso_altura = excluded.data_ultimo_peso_altura,
    risco_gestacional = excluded.risco_gestacional,
    atendimentos_pre_natal = excluded.atendimentos_pre_natal,
    atendimentos_ate_12_semanas = excluded.atendimentos_ate_12_semanas,
    ultima_consulta_pre_natal = excluded.ultima_consulta_pre_natal,
    atendimentos_odontologicos = excluded.atendimentos_odontologicos,
    medicoes_altura_uterina = excluded.medicoes_altura_uterina,
    medicoes_pressao = excluded.medicoes_pressao,
    medicoes_peso_altura = excluded.medicoes_peso_altura,
    visitas_pre_natal = excluded.visitas_pre_natal,
    visitas_puerperio = excluded.visitas_puerperio,
    atendimentos_puerperio = excluded.atendimentos_puerperio,
    ultima_consulta_puerperio = excluded.ultima_consulta_puerperio,
    dias_ultimo_atendimento_medico = excluded.dias_ultimo_atendimento_medico,
    dias_ultimo_atendimento_enfermagem = excluded.dias_ultimo_atendimento_enfermagem,
    dias_ultimo_atendimento_odontologico = excluded.dias_ultimo_atendimento_odontologico,
    dias_ultima_visita = excluded.dias_ultima_visita,
    alta_ativa = excluded.alta_ativa,
    alta_data = excluded.alta_data,
    alta_motivo = excluded.alta_motivo,
    alta_situacao_final = excluded.alta_situacao_final,
    alta_observacao = excluded.alta_observacao,
    cadastro_origem = excluded.cadastro_origem,
    fontes_campos = coalesce(public.pec_gestantes.fontes_campos, '{}'::jsonb)
      || excluded.fontes_campos,
    bloqueios_manuais = (
      select array_agg(distinct item)
      from unnest(
        coalesce(public.pec_gestantes.bloqueios_manuais, '{}'::text[])
        || excluded.bloqueios_manuais
      ) item
    ),
    atualizado_manualmente_em = now(),
    atualizado_manualmente_por = p_usuario_id,
    atualizado_em = now();

  delete from public.gestante_consultas
  where gestante_id = v_gestante_id
    and origem = 'manual';

  for v_item in
    select value
    from jsonb_array_elements(
      coalesce(p_payload->'consultas', '[]'::jsonb)
    )
  loop
    if private.parse_date(v_item->>'data') is not null then
      insert into public.gestante_consultas (
        gestante_id,
        data_atendimento,
        tipo_atendimento,
        observacao,
        origem,
        profissional_id
      )
      values (
        v_gestante_id,
        private.parse_date(v_item->>'data'),
        coalesce(nullif(v_item->>'tipo', ''), 'pre_natal'),
        private.clean_text(v_item->>'observacao'),
        'manual',
        p_usuario_id
      );
    end if;
  end loop;

  for v_item in
    select value
    from jsonb_array_elements(
      coalesce(p_payload->'exames', '[]'::jsonb)
    )
  loop
    insert into public.gestante_exames (
      gestante_id,
      codigo,
      nome,
      trimestre,
      status,
      data_solicitacao,
      data_realizacao,
      resultado_resumido,
      observacao,
      origem,
      profissional_id,
      atualizado_em
    )
    values (
      v_gestante_id,
      v_item->>'codigo',
      v_item->>'nome',
      coalesce((v_item->>'trimestre')::smallint, 1),
      coalesce(nullif(v_item->>'status', ''), 'nao_informado'),
      private.parse_date(v_item->>'dataSolicitacao'),
      private.parse_date(v_item->>'dataRealizacao'),
      private.clean_text(v_item->>'resultado'),
      private.clean_text(v_item->>'observacao'),
      'manual',
      p_usuario_id,
      now()
    )
    on conflict (gestante_id, codigo, trimestre)
    do update set
      nome = excluded.nome,
      status = excluded.status,
      data_solicitacao = excluded.data_solicitacao,
      data_realizacao = excluded.data_realizacao,
      resultado_resumido = excluded.resultado_resumido,
      observacao = excluded.observacao,
      origem = 'manual',
      profissional_id = p_usuario_id,
      atualizado_em = now();
  end loop;

  for v_item in
    select value
    from jsonb_array_elements(
      coalesce(p_payload->'vacinas', '[]'::jsonb)
    )
  loop
    insert into public.gestante_vacinas (
      gestante_id,
      codigo,
      nome,
      status,
      dose,
      data_aplicacao,
      lote,
      unidade_aplicadora,
      observacao,
      origem,
      profissional_id,
      atualizado_em
    )
    values (
      v_gestante_id,
      v_item->>'codigo',
      v_item->>'nome',
      coalesce(nullif(v_item->>'status', ''), 'nao_informado'),
      coalesce(nullif(v_item->>'dose', ''), 'dose_unica'),
      private.parse_date(v_item->>'dataAplicacao'),
      private.clean_text(v_item->>'lote'),
      private.clean_text(v_item->>'unidadeAplicadora'),
      private.clean_text(v_item->>'observacao'),
      'manual',
      p_usuario_id,
      now()
    )
    on conflict (gestante_id, codigo, dose)
    do update set
      nome = excluded.nome,
      status = excluded.status,
      data_aplicacao = excluded.data_aplicacao,
      lote = excluded.lote,
      unidade_aplicadora = excluded.unidade_aplicadora,
      observacao = excluded.observacao,
      origem = 'manual',
      profissional_id = p_usuario_id,
      atualizado_em = now();
  end loop;

  -- Atualiza os campos-resumo já usados pelos cards e indicadores.
  update public.pec_gestantes g
  set
    atendimentos_pre_natal = coalesce((
      select count(*)::integer
      from public.gestante_consultas c
      where c.gestante_id = v_gestante_id
        and c.tipo_atendimento in ('pre_natal', 'rotina')
    ), g.atendimentos_pre_natal),
    ultima_consulta_pre_natal = coalesce((
      select max(c.data_atendimento)
      from public.gestante_consultas c
      where c.gestante_id = v_gestante_id
        and c.tipo_atendimento in ('pre_natal', 'rotina')
    ), g.ultima_consulta_pre_natal),
    exame_hiv_primeiro = coalesce((
      select e.status
      from public.gestante_exames e
      where e.gestante_id = v_gestante_id
        and e.codigo = 'hiv_t1'
      limit 1
    ), g.exame_hiv_primeiro),
    exame_sifilis_primeiro = coalesce((
      select e.status
      from public.gestante_exames e
      where e.gestante_id = v_gestante_id
        and e.codigo = 'sifilis_t1'
      limit 1
    ), g.exame_sifilis_primeiro),
    exame_hepatite_b_primeiro = coalesce((
      select e.status
      from public.gestante_exames e
      where e.gestante_id = v_gestante_id
        and e.codigo = 'hepatite_b_t1'
      limit 1
    ), g.exame_hepatite_b_primeiro),
    exame_hepatite_c_primeiro = coalesce((
      select e.status
      from public.gestante_exames e
      where e.gestante_id = v_gestante_id
        and e.codigo = 'hepatite_c_t1'
      limit 1
    ), g.exame_hepatite_c_primeiro),
    exame_hiv_terceiro = coalesce((
      select e.status
      from public.gestante_exames e
      where e.gestante_id = v_gestante_id
        and e.codigo = 'hiv_t3'
      limit 1
    ), g.exame_hiv_terceiro),
    exame_sifilis_terceiro = coalesce((
      select e.status
      from public.gestante_exames e
      where e.gestante_id = v_gestante_id
        and e.codigo = 'sifilis_t3'
      limit 1
    ), g.exame_sifilis_terceiro),
    dtpa = coalesce((
      select v.status
      from public.gestante_vacinas v
      where v.gestante_id = v_gestante_id
        and v.codigo = 'dtpa'
      limit 1
    ), g.dtpa),
    atualizado_em = now()
  where g.id = v_gestante_id;

  if v_alta_nova and not v_alta_anterior then
    insert into public.gestante_altas (
      gestante_id,
      data_alta,
      motivo,
      situacao_final,
      observacao,
      ubs_id,
      profissional_id
    )
    values (
      v_gestante_id,
      coalesce(
        private.parse_date(p_payload #>> '{alta,data}'),
        current_date
      ),
      coalesce(
        nullif(p_payload #>> '{alta,motivo}', ''),
        'Alta registrada'
      ),
      private.clean_text(p_payload #>> '{alta,situacaoFinal}'),
      private.clean_text(p_payload #>> '{alta,observacao}'),
      v_ubs_id,
      p_usuario_id
    );
  end if;

  select to_jsonb(g)
  into v_depois
  from public.pec_gestantes g
  where g.id = v_gestante_id;

  insert into private.historico_clinico_gestantes (
    gestante_id,
    usuario_id,
    ubs_id,
    acao,
    origem,
    antes,
    depois
  )
  values (
    v_gestante_id,
    p_usuario_id,
    v_ubs_id,
    case when v_existente then 'atualizacao_clinica' else 'cadastro_manual' end,
    'manual',
    v_antes,
    v_depois
  );

  return jsonb_build_object(
    'id', v_gestante_id,
    'codigo', v_codigo,
    'acao', case when v_existente then 'atualizada' else 'cadastrada' end
  );
end
$function$;

CREATE OR REPLACE FUNCTION private.criar_cadastro_minimo_risco_v17(p_usuario_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'extensions'
AS $function$
declare
  v_ubs_origem uuid;
  v_nome text := private.clean_text(p_payload->>'nome');
  v_perfil text;
  v_nascimento date := private.parse_date(p_payload->>'dataNascimento');
  v_hash text;
  v_id uuid;
  v_codigo text;
  v_dum date := private.parse_date(p_payload->>'dum');
  v_ig_sem integer := private.parse_int(p_payload->>'igSemanas');
  v_ig_dias integer := coalesce(private.parse_int(p_payload->>'igDias'), 0);
  v_idade integer;
begin
  perform private.exigir_usuario_v1(p_usuario_id, array['administrador','equipe_ubs']::text[]);
  select p.perfil::text, p.ubs_id into v_perfil, v_ubs_origem
  from public.perfis p
  where p.id = p_usuario_id and p.ativo = true and p.status = 'ativo'
  limit 1;

  if v_perfil = 'administrador' then
    v_ubs_origem := coalesce(
      nullif(p_payload->>'ubsId', '')::uuid,
      v_ubs_origem
    );
  end if;
  if v_ubs_origem is null
     or not exists (
       select 1 from public.ubs u
       where u.id = v_ubs_origem and u.ativa = true
     )
  then
    raise exception 'UBS ativa obrigatória para o cadastro mínimo';
  end if;
  if v_nome is null or v_nascimento is null then raise exception 'Nome e data de nascimento são obrigatórios'; end if;

  v_hash := private.resolver_identidade_diario_v33(
    jsonb_build_object('nome', v_nome, 'data_nascimento', to_char(v_nascimento,'YYYY-MM-DD'), 'cpf', '', 'cns', ''),
    v_ubs_origem,
    p_usuario_id
  );

  select gestante_id into v_id
  from private.identidades_gestantes
  where identidade_hash = v_hash
  limit 1;

  if v_id is not null then return v_id; end if;

  v_id := gen_random_uuid();
  v_codigo := 'GST-' || upper(substr(replace(v_id::text,'-',''),1,8));
  v_idade := extract(year from age(current_date, v_nascimento))::integer;

  if v_dum is null and v_ig_sem is not null then
    v_dum := current_date - ((v_ig_sem * 7) + v_ig_dias);
  end if;
  if v_dum is not null then
    v_ig_sem := greatest(0, floor((current_date - v_dum) / 7.0)::integer);
    v_ig_dias := greatest(0, (current_date - v_dum) % 7);
  end if;

  perform set_config('app.origem_atualizacao', 'manual', true);

  insert into private.identidades_gestantes (
    gestante_id, identidade_hash, ubs_id, nome_enc, data_nascimento_enc,
    cpf_enc, cns_enc, telefones_enc, endereco_enc, bloqueios_manuais,
    atualizado_manualmente_em, atualizado_manualmente_por
  ) values (
    v_id, v_hash, v_ubs_origem,
    extensions.pgp_sym_encrypt(v_nome, private.pii_key(), 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt(to_char(v_nascimento,'YYYY-MM-DD'), private.pii_key(), 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt('', private.pii_key(), 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt('', private.pii_key(), 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt('{}', private.pii_key(), 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt('{}', private.pii_key(), 'cipher-algo=aes256'),
    array['nome','data_nascimento'], now(), p_usuario_id
  );

  insert into public.pec_gestantes (
    id, codigo, ubs_id, idade_anos, ano_nascimento, dum,
    ig_dum_semanas, ig_dum_dias, dpp_dum, peso_kg, altura_cm,
    cadastro_origem, fontes_campos, bloqueios_manuais, dados_extras,
    atualizado_em
  ) values (
    v_id, v_codigo, v_ubs_origem, v_idade, extract(year from v_nascimento)::integer,
    v_dum, v_ig_sem, v_ig_dias,
    case when v_dum is null then null else v_dum + 280 end,
    private.parse_numeric(p_payload->>'pesoKg'), private.parse_numeric(p_payload->>'alturaCm'),
    'cadastro_minimo_risco',
    jsonb_build_object('cadastro_minimo','manual'),
    array['idade_anos','dum','ig_dum_semanas','ig_dum_dias','dpp_dum','peso_kg','altura_cm'],
    jsonb_build_object('cadastro_minimo_pendente', true), now()
  );

  return v_id;
end
$function$;
