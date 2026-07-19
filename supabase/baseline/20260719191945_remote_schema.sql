


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "analytics";


ALTER SCHEMA "analytics" OWNER TO "postgres";


COMMENT ON SCHEMA "analytics" IS 'Views agregadas e sem identificadores diretos destinadas aos dashboards do Metabase.';



CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'Schema operacional principal do sistema Cuidado na Gestação na APS.';



CREATE SCHEMA IF NOT EXISTS "security";


ALTER SCHEMA "security" OWNER TO "postgres";


CREATE TYPE "public"."nivel_risco_gestacional" AS ENUM (
    'habitual',
    'intermediario',
    'alto',
    'nao_classificado'
);


ALTER TYPE "public"."nivel_risco_gestacional" OWNER TO "postgres";


CREATE TYPE "public"."perfil_usuario" AS ENUM (
    'administrador',
    'gestao_municipal',
    'equipe_ubs',
    'acs',
    'aluno',
    'profissional_ubs'
);


ALTER TYPE "public"."perfil_usuario" OWNER TO "postgres";


CREATE TYPE "public"."status_exame" AS ENUM (
    'solicitado',
    'agendado',
    'realizado',
    'resultado_disponivel',
    'pendente',
    'atrasado',
    'nao_realizado',
    'cancelado'
);


ALTER TYPE "public"."status_exame" OWNER TO "postgres";


CREATE TYPE "public"."status_gestacao" AS ENUM (
    'em_acompanhamento',
    'parto_realizado',
    'abortamento',
    'interrompida',
    'transferida',
    'encerrada'
);


ALTER TYPE "public"."status_gestacao" OWNER TO "postgres";


CREATE TYPE "public"."status_gestante" AS ENUM (
    'ativa',
    'puerpera',
    'encerrada',
    'transferida',
    'obito',
    'inativa'
);


ALTER TYPE "public"."status_gestante" OWNER TO "postgres";


CREATE TYPE "public"."status_usuario" AS ENUM (
    'pendente',
    'ativo',
    'bloqueado',
    'inativo'
);


ALTER TYPE "public"."status_usuario" OWNER TO "postgres";


CREATE TYPE "public"."status_visita" AS ENUM (
    'planejada',
    'agendada',
    'realizada',
    'nao_encontrada',
    'recusada',
    'cancelada'
);


ALTER TYPE "public"."status_visita" OWNER TO "postgres";


CREATE TYPE "public"."tipo_atendimento" AS ENUM (
    'consulta_pre_natal',
    'consulta_puerperio',
    'acolhimento',
    'odontologico',
    'vacinacao',
    'procedimento',
    'outro'
);


ALTER TYPE "public"."tipo_atendimento" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."clean_text"("p_value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select nullif(
    btrim(
      case
        when p_value is null then ''
        when btrim(p_value) in ('', '-', 'NULL', 'null', 'N/A') then ''
        else p_value
      end
    ),
    ''
  )
$$;


ALTER FUNCTION "private"."clean_text"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."complementar_acao_acs_v21"("p_usuario_id" "uuid", "p_visita_id" "uuid", "p_dados" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private'
    AS $$
declare
  v_antes jsonb;
  v_depois jsonb;
  v_gestante_id uuid;
  v_data date;
begin
  select to_jsonb(v.*), v.gestante_id
  into v_antes, v_gestante_id
  from public.visitas_acs_v21 v
  where v.id = p_visita_id
    and v.acs_id = p_usuario_id
    and v.removido_em is null
  for update;

  if not found then
    raise exception 'Registro não encontrado ou sem autorização';
  end if;

  v_data := coalesce(
    private.normalizar_data_cadastro_v21(p_dados->>'data'),
    current_date
  );

  if v_data > current_date or v_data < current_date - 365 then
    raise exception 'Data da ação fora do período permitido';
  end if;

  update public.visitas_acs_v21
  set
    data_acao = v_data,
    motivo_falta = nullif(btrim(p_dados->>'motivo'), ''),
    orientacoes = coalesce(
      array(
        select jsonb_array_elements_text(
          coalesce(p_dados->'orientacoes', '[]'::jsonb)
        )
      ),
      '{}'::text[]
    ),
    sinais_alerta = coalesce(
      (p_dados->>'sinaisAlerta')::boolean,
      false
    ),
    observacao = nullif(left(btrim(p_dados->>'observacao'), 240), ''),
    atualizado_em = now()
  where id = p_visita_id
  returning jsonb_build_object(
    'id', id,
    'data_acao', data_acao,
    'compareceu', compareceu,
    'motivo_falta', motivo_falta,
    'orientacoes', orientacoes,
    'sinais_alerta', sinais_alerta,
    'observacao', observacao,
    'atualizado_em', atualizado_em
  )
  into v_depois;

  insert into private.auditoria_visitas_acs_v21 (
    visita_id,
    acs_id,
    gestante_hash,
    acao,
    antes,
    depois
  )
  values (
    p_visita_id,
    p_usuario_id,
    private.hash_gestante_auditoria_v19(v_gestante_id),
    'complementar',
    v_antes,
    v_depois
  );

  return jsonb_build_object('ok', true);
end
$$;


ALTER FUNCTION "private"."complementar_acao_acs_v21"("p_usuario_id" "uuid", "p_visita_id" "uuid", "p_dados" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."criar_cadastro_minimo_risco_v17"("p_usuario_id" "uuid", "p_payload" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'extensions'
    AS $$
declare
  v_ubs_origem uuid;
  v_nome text := private.clean_text(p_payload->>'nome');
  v_nascimento date := private.parse_date(p_payload->>'dataNascimento');
  v_hash text;
  v_id uuid;
  v_codigo text;
  v_dum date := private.parse_date(p_payload->>'dum');
  v_ig_sem integer := private.parse_int(p_payload->>'igSemanas');
  v_ig_dias integer := coalesce(private.parse_int(p_payload->>'igDias'), 0);
  v_idade integer;
begin
  select p.ubs_id into v_ubs_origem
  from public.perfis p
  where p.id = p_usuario_id and p.ativo = true and p.status = 'ativo'
  limit 1;

  if v_ubs_origem is null then raise exception 'Profissional sem UBS vinculada'; end if;
  if v_nome is null or v_nascimento is null then raise exception 'Nome e data de nascimento são obrigatórios'; end if;

  v_hash := private.identidade_hash(
    jsonb_build_object('nome', v_nome, 'data_nascimento', to_char(v_nascimento,'YYYY-MM-DD'), 'cpf', '', 'cns', ''),
    v_ubs_origem
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
$$;


ALTER FUNCTION "private"."criar_cadastro_minimo_risco_v17"("p_usuario_id" "uuid", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."definir_profissional_responsavel_v18"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private'
    AS $$
declare
  v_profissional uuid;
begin
  if tg_op = 'UPDATE' and old.profissional_responsavel_id is not null then
    new.profissional_responsavel_id := old.profissional_responsavel_id;
    return new;
  end if;

  if new.profissional_responsavel_id is not null then
    return new;
  end if;

  v_profissional := new.atualizado_manualmente_por;

  if v_profissional is null then
    select idg.atualizado_manualmente_por
    into v_profissional
    from private.identidades_gestantes idg
    where idg.gestante_id = new.id
    limit 1;
  end if;

  if v_profissional is null and new.importacao_id is not null then
    select r.usuario_id
    into v_profissional
    from public.importacoes_pec_resumo r
    where r.id = new.importacao_id
    limit 1;
  end if;

  new.profissional_responsavel_id := v_profissional;
  return new;
end
$$;


ALTER FUNCTION "private"."definir_profissional_responsavel_v18"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."descriptografar_jsonb"("p_valor" "bytea") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'private', 'extensions'
    AS $$
declare
  v_texto text;
begin
  if p_valor is null then
    return '{}'::jsonb;
  end if;

  v_texto := extensions.pgp_sym_decrypt(
    p_valor,
    private.pii_key()
  );

  return coalesce(v_texto::jsonb, '{}'::jsonb);
exception
  when others then
    return '{}'::jsonb;
end
$$;


ALTER FUNCTION "private"."descriptografar_jsonb"("p_valor" "bytea") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."descriptografar_texto"("p_valor" "bytea") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'private', 'extensions'
    AS $$
begin
  if p_valor is null then
    return null;
  end if;

  return extensions.pgp_sym_decrypt(
    p_valor,
    private.pii_key()
  );
exception
  when others then
    return null;
end
$$;


ALTER FUNCTION "private"."descriptografar_texto"("p_valor" "bytea") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."esvaziar_lixeira_v19"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private'
    AS $$
declare
  v_item record;
  v_total integer := 0;
begin
  for v_item in
    select
      g.id,
      g.ubs_id,
      g.exclusao_motivo,
      g.excluida_em,
      g.exclusao_definitiva_prevista_em
    from public.pec_gestantes g
    where g.excluida_em is not null
      and coalesce(
        g.exclusao_definitiva_prevista_em,
        g.excluida_em + interval '10 days'
      ) <= now()
    for update skip locked
  loop
    insert into private.auditoria_exclusoes_gestantes (
      gestante_hash,
      usuario_id,
      ubs_id,
      acao,
      motivo,
      metadados
    )
    values (
      private.hash_gestante_auditoria_v19(v_item.id),
      null,
      v_item.ubs_id,
      'expiracao_automatica',
      v_item.exclusao_motivo,
      jsonb_build_object(
        'excluida_em', v_item.excluida_em,
        'prazo_final', v_item.exclusao_definitiva_prevista_em
      )
    );

    delete from private.identidades_gestantes
    where gestante_id = v_item.id;

    delete from public.pec_gestantes
    where id = v_item.id;

    v_total := v_total + 1;
  end loop;

  return v_total;
end
$$;


ALTER FUNCTION "private"."esvaziar_lixeira_v19"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."excluir_gestante_definitivamente_v19"("p_usuario_id" "uuid", "p_gestante_id" "uuid", "p_confirmado" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private'
    AS $$
declare
  v_gestante public.pec_gestantes%rowtype;
  v_hash text;
begin
  if not coalesce(p_confirmado, false) then
    raise exception 'Confirmação da exclusão definitiva ausente';
  end if;

  if not private.usuario_pode_operar_lixeira_v20(
    p_usuario_id,
    p_gestante_id
  ) then
    raise exception 'Somente quem enviou a gestante para a lixeira pode excluí-la definitivamente';
  end if;

  select * into v_gestante
  from public.pec_gestantes
  where id = p_gestante_id
  for update;

  if not found then
    raise exception 'Gestante não encontrada';
  end if;

  v_hash := private.hash_gestante_auditoria_v19(p_gestante_id);

  insert into private.auditoria_exclusoes_gestantes (
    gestante_hash,
    usuario_id,
    ubs_id,
    acao,
    motivo,
    metadados
  )
  values (
    v_hash,
    p_usuario_id,
    v_gestante.ubs_id,
    'excluir_definitivamente',
    v_gestante.exclusao_motivo,
    jsonb_build_object(
      'excluida_em', v_gestante.excluida_em,
      'exclusao_antecipada', true,
      'regra', 'lixeira_pessoal_v20'
    )
  );

  delete from private.identidades_gestantes
  where gestante_id = p_gestante_id;

  delete from public.pec_gestantes
  where id = p_gestante_id;

  return jsonb_build_object('ok', true, 'deletedPermanently', true);
end
$$;


ALTER FUNCTION "private"."excluir_gestante_definitivamente_v19"("p_usuario_id" "uuid", "p_gestante_id" "uuid", "p_confirmado" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."hash_gestante_auditoria_v19"("p_gestante_id" "uuid") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'private', 'extensions'
    AS $$
  select encode(
    extensions.hmac(
      p_gestante_id::text,
      private.pii_key(),
      'sha256'
    ),
    'hex'
  )
$$;


ALTER FUNCTION "private"."hash_gestante_auditoria_v19"("p_gestante_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."identidade_hash"("p_canonical" "jsonb", "p_ubs_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'private', 'extensions'
    AS $$
declare
  v_cpf text := regexp_replace(
    coalesce(p_canonical->>'cpf', ''),
    '\D',
    '',
    'g'
  );
  v_cns text := regexp_replace(
    coalesce(p_canonical->>'cns', ''),
    '\D',
    '',
    'g'
  );
  v_nome text := private.normalizar_nome(
    p_canonical->>'nome'
  );
  v_nascimento text := coalesce(
    p_canonical->>'data_nascimento',
    ''
  );
  v_base text;
begin
  if v_cpf <> '' then
    v_base := concat_ws('|', p_ubs_id::text, 'cpf', v_cpf);
  elsif v_cns <> '' then
    v_base := concat_ws('|', p_ubs_id::text, 'cns', v_cns);
  elsif v_nome <> '' and v_nascimento <> '' then
    v_base := concat_ws(
      '|',
      p_ubs_id::text,
      'nome_nascimento',
      v_nome,
      v_nascimento
    );
  else
    raise exception 'Linha sem identificador suficiente';
  end if;

  return encode(
    extensions.hmac(
      v_base,
      private.pii_key(),
      'sha256'
    ),
    'hex'
  );
end
$$;


ALTER FUNCTION "private"."identidade_hash"("p_canonical" "jsonb", "p_ubs_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."importar_pec"("p_ubs_id" "uuid", "p_usuario_id" "uuid", "p_arquivo_nome" "text", "p_arquivo_sha256" "text", "p_linha_cabecalho" integer, "p_mapeamento" "jsonb", "p_linhas" "jsonb", "p_avisos" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'extensions'
    AS $$
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
      v_hash := private.identidade_hash(v_canonical, p_ubs_id);
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
$$;


ALTER FUNCTION "private"."importar_pec"("p_ubs_id" "uuid", "p_usuario_id" "uuid", "p_arquivo_nome" "text", "p_arquivo_sha256" "text", "p_linha_cabecalho" integer, "p_mapeamento" "jsonb", "p_linhas" "jsonb", "p_avisos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."listar_gestantes_autorizadas"("p_usuario_id" "uuid", "p_exibir_identidade" boolean DEFAULT false) RETURNS TABLE("gestante_id" "uuid", "codigo" "text", "nome_visual" "text", "ubs_nome" "text", "microarea_codigo" "text", "idade_anos" integer, "risco_gestacional" "text", "ig_semanas" integer, "ig_dias" integer, "dpp" "date", "atendimentos_pre_natal" integer, "atendimentos_ate_12_semanas" integer, "ultima_consulta_pre_natal" "date", "atendimentos_odontologicos" integer, "dtpa" "text", "pressao_arterial" "text", "peso_kg" numeric, "altura_cm" numeric, "visitas_pre_natal" integer, "dias_ultima_visita" integer, "exame_hiv_primeiro" "text", "exame_sifilis_primeiro" "text", "exame_hepatite_b_primeiro" "text", "exame_hepatite_c_primeiro" "text", "exame_hiv_terceiro" "text", "exame_sifilis_terceiro" "text", "observacao" "text", "atualizado_em" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'extensions'
    AS $$
declare
  v_perfil text;
  v_ubs_id uuid;
  v_ativo boolean;
  v_pode_ver_identidade boolean := false;
  v_total integer := 0;
begin
  select
    p.perfil::text,
    p.ubs_id,
    p.ativo and p.status = 'ativo'
  into
    v_perfil,
    v_ubs_id,
    v_ativo
  from public.perfis p
  where p.id = p_usuario_id
  limit 1;

  if not found or not coalesce(v_ativo, false) then
    raise exception 'Usuário inativo ou sem perfil autorizado';
  end if;

  v_pode_ver_identidade := v_perfil in (
    'administrador',
    'profissional_ubs',
    'equipe_ubs'
  );

  if v_perfil <> 'administrador' and v_ubs_id is null then
    raise exception 'Usuário sem UBS vinculada';
  end if;

  if p_exibir_identidade and v_pode_ver_identidade then
    select count(*)::integer
    into v_total
    from public.pec_gestantes g
    where
      v_perfil = 'administrador'
      or g.ubs_id = v_ubs_id;

    insert into private.acessos_identidade_gestantes (
      usuario_id,
      ubs_id,
      perfil,
      finalidade,
      total_registros
    )
    values (
      p_usuario_id,
      v_ubs_id,
      v_perfil,
      'visualizacao_operacional_da_lista',
      v_total
    );
  end if;

  return query
  select
    g.id as gestante_id,
    g.codigo,
    case
      when p_exibir_identidade and v_pode_ver_identidade then
        coalesce(
          nullif(private.descriptografar_texto(i.nome_enc), ''),
          'Nome não disponível'
        )
      else
        'Gestante ' || g.codigo
    end as nome_visual,
    u.nome as ubs_nome,
    m.codigo as microarea_codigo,
    g.idade_anos,
    g.risco_gestacional,
    coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas) as ig_semanas,
    coalesce(g.ig_dum_dias, g.ig_ecografia_dias) as ig_dias,
    coalesce(g.dpp_dum, g.dpp_ecografia) as dpp,
    g.atendimentos_pre_natal,
    g.atendimentos_ate_12_semanas,
    g.ultima_consulta_pre_natal,
    g.atendimentos_odontologicos,
    g.dtpa,
    g.pressao_arterial,
    g.peso_kg,
    g.altura_cm,
    g.visitas_pre_natal,
    g.dias_ultima_visita,
    g.exame_hiv_primeiro,
    g.exame_sifilis_primeiro,
    g.exame_hepatite_b_primeiro,
    g.exame_hepatite_c_primeiro,
    g.exame_hiv_terceiro,
    g.exame_sifilis_terceiro,
    coalesce(
      nullif(g.dados_extras ->> 'Cenário clínico de teste', ''),
      nullif(g.dados_extras ->> 'Cenario clinico de teste', ''),
      nullif(g.dados_extras ->> 'Observações', ''),
      nullif(g.dados_extras ->> 'Observacao', '')
    ) as observacao,
    g.atualizado_em
  from public.pec_gestantes g
  join public.ubs u
    on u.id = g.ubs_id
  left join public.microareas m
    on m.id = g.microarea_id
  left join private.identidades_gestantes i
    on i.gestante_id = g.id
  where
    v_perfil = 'administrador'
    or g.ubs_id = v_ubs_id
  order by
    case
      when lower(coalesce(g.risco_gestacional, '')) like '%alto%' then 1
      when lower(coalesce(g.risco_gestacional, '')) like '%inter%' then 2
      when lower(coalesce(g.risco_gestacional, '')) like '%habit%' then 3
      else 4
    end,
    g.atualizado_em desc;
end
$$;


ALTER FUNCTION "private"."listar_gestantes_autorizadas"("p_usuario_id" "uuid", "p_exibir_identidade" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."listar_gestantes_autorizadas_v16"("p_usuario_id" "uuid", "p_exibir_identidade" boolean DEFAULT false) RETURNS TABLE("gestante_id" "uuid", "codigo" "text", "nome_visual" "text", "ubs_nome" "text", "microarea_codigo" "text", "idade_anos" integer, "risco_gestacional" "text", "ig_semanas" integer, "ig_dias" integer, "dpp" "date", "atendimentos_pre_natal" integer, "atendimentos_ate_12_semanas" integer, "ultima_consulta_pre_natal" "date", "atendimentos_odontologicos" integer, "dtpa" "text", "pressao_arterial" "text", "peso_kg" numeric, "altura_cm" numeric, "visitas_pre_natal" integer, "dias_ultima_visita" integer, "exame_hiv_primeiro" "text", "exame_sifilis_primeiro" "text", "exame_hepatite_b_primeiro" "text", "exame_hepatite_c_primeiro" "text", "exame_hiv_terceiro" "text", "exame_sifilis_terceiro" "text", "observacao" "text", "alta_ativa" boolean, "alta_data" "date", "alta_motivo" "text", "pendencias_count" integer, "atualizado_em" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'extensions'
    AS $$
declare
  v_perfil text;
  v_ubs_id uuid;
  v_ativo boolean;
  v_pode_ver_identidade boolean := false;
  v_total integer := 0;
begin
  perform private.esvaziar_lixeira_v19();

  select
    p.perfil::text,
    p.ubs_id,
    p.ativo and p.status = 'ativo'
  into
    v_perfil,
    v_ubs_id,
    v_ativo
  from public.perfis p
  where p.id = p_usuario_id
  limit 1;

  if not found or not coalesce(v_ativo, false) then
    raise exception 'Usuário inativo ou sem perfil autorizado';
  end if;

  v_pode_ver_identidade := v_perfil in (
    'administrador',
    'profissional_ubs',
    'equipe_ubs'
  );

  if v_perfil <> 'administrador' and v_ubs_id is null then
    raise exception 'Usuário sem UBS vinculada';
  end if;

  if p_exibir_identidade and v_pode_ver_identidade then
    select count(*)::integer
    into v_total
    from public.pec_gestantes g
    where g.excluida_em is null
      and (
        v_perfil = 'administrador'
        or (
          g.ubs_id = v_ubs_id
          and g.profissional_responsavel_id = p_usuario_id
        )
      );

    insert into private.acessos_identidade_gestantes (
      usuario_id,
      ubs_id,
      perfil,
      finalidade,
      total_registros
    )
    values (
      p_usuario_id,
      v_ubs_id,
      v_perfil,
      'visualizacao_operacional_das_gestantes_proprias_v18',
      v_total
    );
  end if;

  return query
  select
    g.id,
    g.codigo,
    case
      when p_exibir_identidade and v_pode_ver_identidade then
        coalesce(
          nullif(private.descriptografar_texto(i.nome_enc), ''),
          'Nome não disponível'
        )
      else
        'Gestante ' || g.codigo
    end,
    u.nome,
    m.codigo,
    g.idade_anos,
    g.risco_gestacional,
    coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas),
    coalesce(g.ig_dum_dias, g.ig_ecografia_dias),
    coalesce(g.dpp_dum, g.dpp_ecografia),
    g.atendimentos_pre_natal,
    g.atendimentos_ate_12_semanas,
    g.ultima_consulta_pre_natal,
    g.atendimentos_odontologicos,
    g.dtpa,
    g.pressao_arterial,
    g.peso_kg,
    g.altura_cm,
    g.visitas_pre_natal,
    g.dias_ultima_visita,
    g.exame_hiv_primeiro,
    g.exame_sifilis_primeiro,
    g.exame_hepatite_b_primeiro,
    g.exame_hepatite_c_primeiro,
    g.exame_hiv_terceiro,
    g.exame_sifilis_terceiro,
    coalesce(
      nullif(g.dados_extras ->> 'Cenário clínico de teste', ''),
      nullif(g.dados_extras ->> 'Cenario clinico de teste', ''),
      nullif(g.dados_extras ->> 'Observações', ''),
      nullif(g.dados_extras ->> 'Observacao', '')
    ),
    g.alta_ativa,
    g.alta_data,
    g.alta_motivo,
    (
      select count(*)::integer
      from public.config_exames_pre_natal ce
      where ce.ativo = true
        and ce.trimestre <= case
          when coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) <= 13 then 1
          when coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) <= 27 then 2
          else 3
        end
        and not exists (
          select 1
          from public.gestante_exames ge
          where ge.gestante_id = g.id
            and ge.codigo = ce.codigo
            and ge.status in ('realizado', 'nao_se_aplica')
        )
    ),
    g.atualizado_em
  from public.pec_gestantes g
  join public.ubs u on u.id = g.ubs_id
  left join public.microareas m on m.id = g.microarea_id
  left join private.identidades_gestantes i on i.gestante_id = g.id
  where g.excluida_em is null
    and (
      v_perfil = 'administrador'
      or (
        g.ubs_id = v_ubs_id
        and g.profissional_responsavel_id = p_usuario_id
      )
    )
  order by
    g.alta_ativa asc,
    case
      when lower(coalesce(g.risco_gestacional, '')) like '%alto%' then 1
      when lower(coalesce(g.risco_gestacional, '')) like '%inter%'
        or lower(coalesce(g.risco_gestacional, '')) like '%médio%'
        or lower(coalesce(g.risco_gestacional, '')) like '%medio%' then 2
      when lower(coalesce(g.risco_gestacional, '')) like '%habit%' then 3
      else 4
    end,
    g.atualizado_em desc;
end
$$;


ALTER FUNCTION "private"."listar_gestantes_autorizadas_v16"("p_usuario_id" "uuid", "p_exibir_identidade" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."listar_lixeira_gestantes_v19"("p_usuario_id" "uuid", "p_exibir_identidade" boolean DEFAULT true) RETURNS TABLE("gestante_id" "uuid", "codigo" "text", "nome_visual" "text", "ubs_nome" "text", "microarea_codigo" "text", "excluida_em" timestamp with time zone, "excluir_em" timestamp with time zone, "exclusao_motivo" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'extensions'
    AS $$
declare
  v_perfil text;
  v_ubs_id uuid;
  v_ativo boolean;
  v_pode_ver_identidade boolean := false;
  v_total integer := 0;
begin
  perform private.esvaziar_lixeira_v19();

  select
    p.perfil::text,
    p.ubs_id,
    (
      p.ativo
      and p.status = 'ativo'
      and p.cadastro_completo
      and p.aprovacao_status = 'aprovado'
      and p.perfil_excluido_em is null
    )
  into v_perfil, v_ubs_id, v_ativo
  from public.perfis p
  where p.id = p_usuario_id
  limit 1;

  if not found or not coalesce(v_ativo, false) then
    raise exception 'Usuário inativo ou sem perfil autorizado';
  end if;

  v_pode_ver_identidade := v_perfil in (
    'administrador',
    'profissional_ubs',
    'equipe_ubs'
  );

  select count(*)::integer into v_total
  from public.pec_gestantes g
  where g.excluida_em is not null
    and g.excluida_por = p_usuario_id;

  if p_exibir_identidade and v_pode_ver_identidade and v_total > 0 then
    insert into private.acessos_identidade_gestantes (
      usuario_id,
      ubs_id,
      perfil,
      finalidade,
      total_registros
    ) values (
      p_usuario_id,
      v_ubs_id,
      v_perfil,
      'visualizacao_lixeira_pessoal_v20',
      v_total
    );
  end if;

  return query
  select
    g.id,
    g.codigo,
    case
      when p_exibir_identidade and v_pode_ver_identidade then
        coalesce(
          nullif(private.descriptografar_texto(i.nome_enc), ''),
          'Nome não disponível'
        )
      else
        'Gestante ' || g.codigo
    end,
    u.nome,
    m.codigo,
    g.excluida_em,
    coalesce(
      g.exclusao_definitiva_prevista_em,
      g.excluida_em + interval '10 days'
    ),
    g.exclusao_motivo
  from public.pec_gestantes g
  join public.ubs u on u.id = g.ubs_id
  left join public.microareas m on m.id = g.microarea_id
  left join private.identidades_gestantes i on i.gestante_id = g.id
  where g.excluida_em is not null
    and g.excluida_por = p_usuario_id
  order by coalesce(
    g.exclusao_definitiva_prevista_em,
    g.excluida_em + interval '10 days'
  ) asc;
end
$$;


ALTER FUNCTION "private"."listar_lixeira_gestantes_v19"("p_usuario_id" "uuid", "p_exibir_identidade" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."mover_gestante_lixeira_v19"("p_usuario_id" "uuid", "p_gestante_id" "uuid", "p_motivo" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private'
    AS $$
declare
  v_gestante public.pec_gestantes%rowtype;
  v_excluir_em timestamptz;
begin
  if not private.usuario_pode_gerenciar_gestante_v19(
    p_usuario_id,
    p_gestante_id
  ) then
    raise exception 'Usuário sem autorização para excluir esta gestante';
  end if;

  select * into v_gestante
  from public.pec_gestantes
  where id = p_gestante_id
  for update;

  if v_gestante.excluida_em is not null then
    return jsonb_build_object(
      'ok', true,
      'alreadyInTrash', true,
      'purgeAt', v_gestante.exclusao_definitiva_prevista_em
    );
  end if;

  v_excluir_em := now() + interval '10 days';

  update public.pec_gestantes
  set
    excluida_em = now(),
    excluida_por = p_usuario_id,
    exclusao_motivo = nullif(btrim(p_motivo), ''),
    exclusao_definitiva_prevista_em = v_excluir_em,
    atualizado_em = now()
  where id = p_gestante_id;

  insert into private.auditoria_exclusoes_gestantes (
    gestante_hash,
    usuario_id,
    ubs_id,
    acao,
    motivo,
    metadados
  )
  values (
    private.hash_gestante_auditoria_v19(p_gestante_id),
    p_usuario_id,
    v_gestante.ubs_id,
    'mover_lixeira',
    nullif(btrim(p_motivo), ''),
    jsonb_build_object('exclusao_definitiva_prevista_em', v_excluir_em)
  );

  return jsonb_build_object(
    'ok', true,
    'purgeAt', v_excluir_em
  );
end
$$;


ALTER FUNCTION "private"."mover_gestante_lixeira_v19"("p_usuario_id" "uuid", "p_gestante_id" "uuid", "p_motivo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."normalizar_data_cadastro_v21"("p_valor" "text") RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $_$
declare
  v text := btrim(coalesce(p_valor, ''));
begin
  if v ~ '^\d{2}/\d{2}/\d{4}$' then
    return to_date(v, 'DD/MM/YYYY');
  end if;

  if v ~ '^\d{4}-\d{2}-\d{2}$' then
    return v::date;
  end if;

  return null;
exception
  when others then
    return null;
end
$_$;


ALTER FUNCTION "private"."normalizar_data_cadastro_v21"("p_valor" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."normalizar_nome"("p_texto" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $$
  select lower(
    regexp_replace(
      translate(
        coalesce(p_texto, ''),
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
      ),
      '\s+',
      ' ',
      'g'
    )
  )
$$;


ALTER FUNCTION "private"."normalizar_nome"("p_texto" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."obter_gestante_clinica"("p_usuario_id" "uuid", "p_gestante_id" "uuid", "p_exibir_identidade" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'extensions'
    AS $$
declare
  v_perfil text;
  v_ubs_usuario uuid;
  v_ubs_gestante uuid;
  v_pode_identidade boolean;
  v_identidade jsonb;
  v_telefones jsonb;
  v_endereco jsonb;
  v_resultado jsonb;
begin
  select p.perfil::text, p.ubs_id
  into v_perfil, v_ubs_usuario
  from public.perfis p
  where p.id = p_usuario_id
    and p.ativo = true
    and p.status = 'ativo'
  limit 1;

  if not found then
    raise exception 'Usuário sem perfil ativo';
  end if;

  select g.ubs_id
  into v_ubs_gestante
  from public.pec_gestantes g
  where g.id = p_gestante_id;

  if not found then
    raise exception 'Gestante não encontrada';
  end if;

  if v_perfil <> 'administrador' and v_ubs_gestante <> v_ubs_usuario then
    raise exception 'Usuário sem autorização para esta gestante';
  end if;

  v_pode_identidade :=
    p_exibir_identidade
    and v_perfil in ('administrador', 'profissional_ubs', 'equipe_ubs');

  select
    case
      when v_pode_identidade then
        jsonb_build_object(
          'nome', coalesce(private.descriptografar_texto(i.nome_enc), ''),
          'dataNascimento', coalesce(private.descriptografar_texto(i.data_nascimento_enc), ''),
          'cpf', coalesce(private.descriptografar_texto(i.cpf_enc), ''),
          'cns', coalesce(private.descriptografar_texto(i.cns_enc), '')
        )
      else
        jsonb_build_object(
          'nome', 'Gestante ' || g.codigo,
          'dataNascimento', '',
          'cpf', '',
          'cns', ''
        )
    end,
    case
      when v_pode_identidade then private.descriptografar_jsonb(i.telefones_enc)
      else '{}'::jsonb
    end,
    case
      when v_pode_identidade then private.descriptografar_jsonb(i.endereco_enc)
      else '{}'::jsonb
    end
  into v_identidade, v_telefones, v_endereco
  from public.pec_gestantes g
  left join private.identidades_gestantes i
    on i.gestante_id = g.id
  where g.id = p_gestante_id;

  select jsonb_build_object(
    'id', g.id,
    'codigo', g.codigo,
    'ubsId', g.ubs_id,
    'ubsNome', u.nome,
    'microareaId', g.microarea_id,
    'microareaCodigo', m.codigo,
    'identificacao', v_identidade
      || jsonb_build_object(
        'telefoneCelular', coalesce(v_telefones->>'celular', ''),
        'telefoneResidencial', coalesce(v_telefones->>'residencial', ''),
        'telefoneContato', coalesce(v_telefones->>'contato', ''),
        'rua', coalesce(v_endereco->>'rua', ''),
        'numero', coalesce(v_endereco->>'numero', ''),
        'complemento', coalesce(v_endereco->>'complemento', ''),
        'bairro', coalesce(v_endereco->>'bairro', ''),
        'municipio', coalesce(v_endereco->>'municipio', ''),
        'uf', coalesce(v_endereco->>'uf', ''),
        'cep', coalesce(v_endereco->>'cep', ''),
        'sexo', coalesce(g.sexo, ''),
        'identidadeGenero', coalesce(g.identidade_genero, ''),
        'racaCor', coalesce(g.raca_cor, ''),
        'bolsaFamilia', g.bolsa_familia,
        'vigenciaBolsaFamilia', g.vigencia_bolsa_familia
      ),
    'gestacao', jsonb_build_object(
      'situacao', g.situacao_acompanhamento,
      'inicioPreNatal', g.inicio_pre_natal,
      'dum', g.dum,
      'dpp', coalesce(g.dpp_dum, g.dpp_ecografia),
      'igSemanas', coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas),
      'igDias', g.ig_dum_dias,
      'igEcografiaSemanas', g.ig_ecografia_semanas,
      'igEcografiaDias', g.ig_ecografia_dias,
      'dppEcografia', g.dpp_ecografia,
      'dataParto', g.data_parto,
      'tipoParto', coalesce(g.tipo_parto, ''),
      'pesoKg', g.peso_kg,
      'alturaCm', g.altura_cm,
      'pressaoArterial', coalesce(g.pressao_arterial, ''),
      'dataUltimaPressao', g.data_ultima_pressao,
      'dataUltimoPesoAltura', g.data_ultimo_peso_altura,
      'riscoGestacional', coalesce(g.risco_gestacional, '')
    ),
    'acompanhamento', jsonb_build_object(
      'atendimentosPreNatal', g.atendimentos_pre_natal,
      'atendimentosAte12Semanas', g.atendimentos_ate_12_semanas,
      'ultimaConsultaPreNatal', g.ultima_consulta_pre_natal,
      'atendimentosOdontologicos', g.atendimentos_odontologicos,
      'medicoesAlturaUterina', g.medicoes_altura_uterina,
      'medicoesPressao', g.medicoes_pressao,
      'medicoesPesoAltura', g.medicoes_peso_altura,
      'visitasPreNatal', g.visitas_pre_natal,
      'visitasPuerperio', g.visitas_puerperio,
      'atendimentosPuerperio', g.atendimentos_puerperio,
      'ultimaConsultaPuerperio', g.ultima_consulta_puerperio,
      'diasUltimoAtendimentoMedico', g.dias_ultimo_atendimento_medico,
      'diasUltimoAtendimentoEnfermagem', g.dias_ultimo_atendimento_enfermagem,
      'diasUltimoAtendimentoOdontologico', g.dias_ultimo_atendimento_odontologico,
      'diasUltimaVisita', g.dias_ultima_visita
    ),
    'consultas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'data', c.data_atendimento,
          'tipo', c.tipo_atendimento,
          'observacao', coalesce(c.observacao, ''),
          'origem', c.origem
        )
        order by c.data_atendimento
      )
      from public.gestante_consultas c
      where c.gestante_id = g.id
    ), '[]'::jsonb),
    'exames', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'codigo', e.codigo,
          'nome', e.nome,
          'trimestre', e.trimestre,
          'status', e.status,
          'dataSolicitacao', e.data_solicitacao,
          'dataRealizacao', e.data_realizacao,
          'resultado', coalesce(e.resultado_resumido, ''),
          'observacao', coalesce(e.observacao, ''),
          'origem', e.origem
        )
        order by e.trimestre, e.nome
      )
      from public.gestante_exames e
      where e.gestante_id = g.id
    ), '[]'::jsonb),
    'vacinas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', v.id,
          'codigo', v.codigo,
          'nome', v.nome,
          'status', v.status,
          'dose', v.dose,
          'dataAplicacao', v.data_aplicacao,
          'lote', coalesce(v.lote, ''),
          'unidadeAplicadora', coalesce(v.unidade_aplicadora, ''),
          'observacao', coalesce(v.observacao, ''),
          'origem', v.origem
        )
        order by v.nome
      )
      from public.gestante_vacinas v
      where v.gestante_id = g.id
    ), '[]'::jsonb),
    'alta', jsonb_build_object(
      'ativa', g.alta_ativa,
      'data', g.alta_data,
      'motivo', coalesce(g.alta_motivo, ''),
      'situacaoFinal', coalesce(g.alta_situacao_final, ''),
      'observacao', coalesce(g.alta_observacao, '')
    ),
    'origemCadastro', g.cadastro_origem,
    'bloqueiosManuais', to_jsonb(g.bloqueios_manuais),
    'atualizadoEm', g.atualizado_em
  )
  into v_resultado
  from public.pec_gestantes g
  join public.ubs u on u.id = g.ubs_id
  left join public.microareas m on m.id = g.microarea_id
  where g.id = p_gestante_id;

  if v_pode_identidade then
    insert into private.acessos_identidade_gestantes (
      usuario_id, ubs_id, perfil, finalidade, total_registros
    )
    values (
      p_usuario_id,
      v_ubs_gestante,
      v_perfil,
      'edicao_cadastro_clinico',
      1
    );
  end if;

  return v_resultado;
end
$$;


ALTER FUNCTION "private"."obter_gestante_clinica"("p_usuario_id" "uuid", "p_gestante_id" "uuid", "p_exibir_identidade" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."obter_indicadores_v18"("p_usuario_id" "uuid", "p_escopo" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private'
    AS $$
declare
  v_perfil text;
  v_ubs_id uuid;
  v_ubs_nome text;
  v_nome_profissional text;
  v_escopo text := lower(coalesce(p_escopo, 'profissional'));
  v_resultado jsonb;
begin
  perform private.esvaziar_lixeira_v19();

  select
    p.perfil::text,
    p.ubs_id,
    u.nome,
    p.nome_completo
  into
    v_perfil,
    v_ubs_id,
    v_ubs_nome,
    v_nome_profissional
  from public.perfis p
  left join public.ubs u on u.id = p.ubs_id
  where p.id = p_usuario_id
    and p.ativo = true
    and p.status = 'ativo'
  limit 1;

  if not found then
    raise exception 'Usuário sem perfil ativo';
  end if;

  if v_escopo not in ('ubs', 'profissional') then
    raise exception 'Escopo de indicadores inválido';
  end if;

  if v_perfil <> 'administrador' and v_ubs_id is null then
    raise exception 'Usuário sem UBS vinculada';
  end if;

  with base as (
    select
      g.*,
      m.codigo as microarea_codigo,
      coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas) as ig_semanas,
      case
        when coalesce(g.atendimentos_ate_12_semanas, 0) > 0 then 'precoce'
        when g.inicio_pre_natal is not null and g.dum is not null
          and g.inicio_pre_natal <= g.dum + 84 then 'precoce'
        when g.inicio_pre_natal is not null and g.dum is not null
          and g.inicio_pre_natal > g.dum + 84 then 'tardia'
        else 'sem_dados'
      end as captacao
    from public.pec_gestantes g
    left join public.microareas m on m.id = g.microarea_id
    where g.excluida_em is null
      and (
        v_perfil = 'administrador'
        or g.ubs_id = v_ubs_id
      )
      and (
        v_escopo = 'ubs'
        or g.profissional_responsavel_id = p_usuario_id
      )
  ),
  ativas as (
    select *
    from base
    where coalesce(alta_ativa, false) = false
  ),
  resumo as (
    select
      count(*)::integer as total,
      count(*) filter (where not alta_ativa)::integer as ativas,
      count(*) filter (where alta_ativa)::integer as altas,
      count(*) filter (
        where lower(coalesce(risco_gestacional, '')) like '%alto%'
      )::integer as alto_risco,
      count(*) filter (
        where lower(coalesce(risco_gestacional, '')) like '%inter%'
           or lower(coalesce(risco_gestacional, '')) like '%médio%'
           or lower(coalesce(risco_gestacional, '')) like '%medio%'
      )::integer as medio_risco,
      count(*) filter (
        where lower(coalesce(risco_gestacional, '')) like '%habit%'
           or lower(coalesce(risco_gestacional, '')) like '%baixo%'
      )::integer as habitual,
      count(*) filter (where captacao = 'precoce')::integer as captacao_precoce,
      count(*) filter (where captacao = 'tardia')::integer as captacao_tardia,
      count(*) filter (where captacao = 'sem_dados')::integer as captacao_sem_dados,
      count(*) filter (
        where ultima_consulta_pre_natal is null
           or ultima_consulta_pre_natal < current_date - 35
      )::integer as acompanhamento_atrasado
    from base
  ),
  consulta_categorias as (
    select *
    from (
      values
        ('Crítico (0–3)', (select count(*)::integer from ativas where coalesce(atendimentos_pre_natal, 0) <= 3), 1),
        ('Intermediário (4–6)', (select count(*)::integer from ativas where coalesce(atendimentos_pre_natal, 0) between 4 and 6), 2),
        ('Meta (7+)', (select count(*)::integer from ativas where coalesce(atendimentos_pre_natal, 0) >= 7), 3)
    ) as v(rotulo, quantidade, ordem)
  ),
  risco_categorias as (
    select *
    from (
      values
        ('Alto risco', (select count(*)::integer from ativas where lower(coalesce(risco_gestacional, '')) like '%alto%'), 1),
        ('Médio risco', (select count(*)::integer from ativas where lower(coalesce(risco_gestacional, '')) like '%inter%' or lower(coalesce(risco_gestacional, '')) like '%médio%' or lower(coalesce(risco_gestacional, '')) like '%medio%'), 2),
        ('Risco habitual', (select count(*)::integer from ativas where lower(coalesce(risco_gestacional, '')) like '%habit%' or lower(coalesce(risco_gestacional, '')) like '%baixo%'), 3),
        ('Não classificado', (select count(*)::integer from ativas where coalesce(btrim(risco_gestacional), '') = ''), 4)
    ) as v(rotulo, quantidade, ordem)
  ),
  trimestres as (
    select *
    from (
      values
        ('1º trimestre', (select count(*)::integer from ativas where coalesce(ig_semanas, 0) between 1 and 13), 1),
        ('2º trimestre', (select count(*)::integer from ativas where coalesce(ig_semanas, 0) between 14 and 27), 2),
        ('3º trimestre', (select count(*)::integer from ativas where coalesce(ig_semanas, 0) >= 28), 3),
        ('IG não informada', (select count(*)::integer from ativas where ig_semanas is null or ig_semanas = 0), 4)
    ) as v(rotulo, quantidade, ordem)
  ),
  microareas_brutas as (
    select
      coalesce(nullif(microarea_codigo, ''), 'Não informada') as rotulo,
      count(*)::integer as quantidade
    from ativas
    group by coalesce(nullif(microarea_codigo, ''), 'Não informada')
  ),
  microareas_privadas as (
    select
      case
        when v_escopo = 'ubs' and quantidade < 5
          then 'Outras microáreas (agrupadas)'
        else rotulo
      end as rotulo,
      sum(quantidade)::integer as quantidade
    from microareas_brutas
    group by 1
  ),
  ultima_classificacao as (
    select distinct on (c.gestante_id)
      c.id,
      c.gestante_id
    from public.classificacoes_risco_gestacional c
    join ativas a on a.id = c.gestante_id
    where c.status = 'finalizada'
    order by c.gestante_id, c.realizada_em desc
  ),
  fatores as (
    select
      i.fator_titulo as rotulo,
      count(*)::integer as quantidade
    from ultima_classificacao uc
    join public.classificacao_risco_itens i
      on i.classificacao_id = uc.id
    where i.fator_codigo <> 'g2_imc'
    group by i.fator_titulo
    order by count(*) desc, i.fator_titulo
    limit 8
  ),
  exames_pendentes as (
    select count(*)::integer as quantidade
    from ativas a
    join public.config_exames_pre_natal ce
      on ce.ativo = true
     and ce.trimestre <= case
       when coalesce(a.ig_semanas, 0) <= 13 then 1
       when coalesce(a.ig_semanas, 0) <= 27 then 2
       else 3
     end
    where not exists (
      select 1
      from public.gestante_exames ge
      where ge.gestante_id = a.id
        and ge.codigo = ce.codigo
        and ge.status in ('realizado', 'nao_se_aplica')
    )
  ),
  dtpa_pendente as (
    select count(*)::integer as quantidade
    from ativas a
    where coalesce(a.ig_semanas, 0) >= 20
      and not exists (
        select 1
        from public.gestante_vacinas gv
        where gv.gestante_id = a.id
          and gv.codigo = 'dtpa'
          and gv.status = 'realizada'
      )
  )
  select jsonb_build_object(
    'escopo', v_escopo,
    'titulo', case
      when v_escopo = 'ubs' then coalesce(v_ubs_nome, 'Todas as UBS')
      else 'Gestantes de ' || coalesce(v_nome_profissional, 'profissional')
    end,
    'atualizadoEm', now(),
    'resumo', jsonb_build_object(
      'total', r.total,
      'ativas', r.ativas,
      'altas', r.altas,
      'altoRisco', r.alto_risco,
      'medioRisco', r.medio_risco,
      'habitual', r.habitual,
      'captacaoPrecoce', r.captacao_precoce,
      'captacaoTardia', r.captacao_tardia,
      'captacaoSemDados', r.captacao_sem_dados,
      'acompanhamentoAtrasado', r.acompanhamento_atrasado,
      'examesPendentes', ep.quantidade,
      'dtpaPendente', dp.quantidade
    ),
    'captacao', jsonb_build_array(
      jsonb_build_object('rotulo', 'Precoce (≤12 sem)', 'quantidade', r.captacao_precoce),
      jsonb_build_object('rotulo', 'Tardia (>12 sem)', 'quantidade', r.captacao_tardia),
      jsonb_build_object('rotulo', 'Sem dados', 'quantidade', r.captacao_sem_dados)
    ),
    'consultas', coalesce((
      select jsonb_agg(jsonb_build_object('rotulo', rotulo, 'quantidade', quantidade) order by ordem)
      from consulta_categorias
    ), '[]'::jsonb),
    'riscos', coalesce((
      select jsonb_agg(jsonb_build_object('rotulo', rotulo, 'quantidade', quantidade) order by ordem)
      from risco_categorias
    ), '[]'::jsonb),
    'trimestres', coalesce((
      select jsonb_agg(jsonb_build_object('rotulo', rotulo, 'quantidade', quantidade) order by ordem)
      from trimestres
    ), '[]'::jsonb),
    'microareas', coalesce((
      select jsonb_agg(jsonb_build_object('rotulo', rotulo, 'quantidade', quantidade) order by quantidade desc, rotulo)
      from microareas_privadas
    ), '[]'::jsonb),
    'fatoresRisco', coalesce((
      select jsonb_agg(jsonb_build_object('rotulo', rotulo, 'quantidade', quantidade) order by quantidade desc, rotulo)
      from fatores
    ), '[]'::jsonb),
    'avisos', jsonb_build_array(
      jsonb_build_object('tipo', 'alto_risco', 'rotulo', 'Gestantes em alto risco', 'quantidade', r.alto_risco),
      jsonb_build_object('tipo', 'atraso', 'rotulo', 'Acompanhamento possivelmente atrasado', 'quantidade', r.acompanhamento_atrasado),
      jsonb_build_object('tipo', 'exames', 'rotulo', 'Exames previstos ainda pendentes', 'quantidade', ep.quantidade),
      jsonb_build_object('tipo', 'vacina', 'rotulo', 'dTpa pendente entre gestantes elegíveis', 'quantidade', dp.quantidade)
    )
  )
  into v_resultado
  from resumo r
  cross join exames_pendentes ep
  cross join dtpa_pendente dp;

  return coalesce(v_resultado, '{}'::jsonb);
end
$$;


ALTER FUNCTION "private"."obter_indicadores_v18"("p_usuario_id" "uuid", "p_escopo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."obter_indicadores_v21"("p_usuario_id" "uuid", "p_escopo" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private'
    AS $$
declare
  v_perfil text;
  v_ubs_id uuid;
  v_escopo text := lower(coalesce(p_escopo, 'ubs'));
  v_dados jsonb;
  v_microareas jsonb;
begin
  select p.perfil::text, p.ubs_id
  into v_perfil, v_ubs_id
  from public.perfis p
  where p.id = p_usuario_id
    and p.cadastro_completo = true
    and p.aprovacao_status = 'aprovado'
    and p.status = 'ativo'
    and p.ativo = true
    and p.perfil_excluido_em is null
  limit 1;

  if not found then
    raise exception 'Perfil não aprovado';
  end if;

  if v_perfil = 'aluno' then
    v_escopo := 'ubs';
  end if;

  v_dados := private.obter_indicadores_v18(p_usuario_id, v_escopo);

  if v_perfil = 'aluno' then
    v_dados := jsonb_set(
      jsonb_set(
        v_dados,
        '{microareas}',
        '[]'::jsonb,
        true
      ),
      '{fatoresRisco}',
      '[]'::jsonb,
      true
    );
    v_dados := jsonb_set(
      v_dados,
      '{titulo}',
      to_jsonb('Indicadores gerais não sensíveis'::text),
      true
    );
  elsif v_perfil = 'administrador' and v_escopo = 'ubs' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rotulo', x.rotulo,
          'quantidade', x.quantidade
        )
        order by x.quantidade desc, x.rotulo
      ),
      '[]'::jsonb
    )
    into v_microareas
    from (
      select
        coalesce(nullif(m.codigo, ''), 'Não informada') as rotulo,
        count(*)::integer as quantidade
      from public.pec_gestantes g
      left join public.microareas m on m.id = g.microarea_id
      where g.excluida_em is null
        and coalesce(g.alta_ativa, false) = false
        and (v_ubs_id is null or g.ubs_id = v_ubs_id)
      group by coalesce(nullif(m.codigo, ''), 'Não informada')
    ) x;

    v_dados := jsonb_set(
      v_dados,
      '{microareas}',
      v_microareas,
      true
    );
  end if;

  return v_dados;
end
$$;


ALTER FUNCTION "private"."obter_indicadores_v21"("p_usuario_id" "uuid", "p_escopo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."obter_inicio_v20"("p_usuario_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private'
    AS $$
declare
  v_perfil text;
  v_ubs_id uuid;
  v_ubs_nome text;
  v_nome text;
  v_resultado jsonb;
begin
  select
    p.perfil::text,
    p.ubs_id,
    u.nome,
    p.nome_completo
  into
    v_perfil,
    v_ubs_id,
    v_ubs_nome,
    v_nome
  from public.perfis p
  left join public.ubs u on u.id = p.ubs_id
  where p.id = p_usuario_id
    and p.cadastro_completo = true
    and p.aprovacao_status = 'aprovado'
    and p.status = 'ativo'
    and p.ativo = true
    and p.perfil_excluido_em is null
  limit 1;

  if not found then
    raise exception 'Perfil não aprovado';
  end if;

  with base as (
    select g.*
    from public.pec_gestantes g
    where g.excluida_em is null
      and (
        (
          v_perfil = 'administrador'
          and (v_ubs_id is null or g.ubs_id = v_ubs_id)
        )
        or (
          v_perfil <> 'administrador'
          and g.ubs_id = v_ubs_id
          and g.profissional_responsavel_id = p_usuario_id
        )
      )
  ),
  metricas as (
    select jsonb_build_object(
      'ativas', count(*) filter (where coalesce(alta_ativa, false) = false),
      'altoRisco', count(*) filter (
        where coalesce(alta_ativa, false) = false
          and lower(coalesce(risco_gestacional, '')) like '%alto%'
      ),
      'novasMes', count(*) filter (
        where criado_em >= date_trunc('month', current_date)
      ),
      'partosAltas', count(*) filter (
        where coalesce(alta_ativa, false) = true
          or data_parto is not null
      )
    ) as dados
    from base
  ),
  avisos as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'titulo', a.titulo,
          'mensagem', a.mensagem,
          'tipo', a.tipo,
          'publicadoEm', a.publicado_em,
          'ubsId', a.ubs_id,
          'ubsNome', u.nome
        )
        order by a.publicado_em desc
      ),
      '[]'::jsonb
    ) as dados
    from (
      select *
      from public.avisos_ubs a
      where a.removido_em is null
        and (a.expira_em is null or a.expira_em > now())
        and (
          a.ubs_id is null
          or a.ubs_id = v_ubs_id
          or (v_perfil = 'administrador' and v_ubs_id is null)
        )
      order by a.publicado_em desc
      limit 30
    ) a
    left join public.ubs u on u.id = a.ubs_id
  ),
  aniversarios as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'nome', x.nome_completo,
          'dia', x.dia,
          'ubsNome', x.ubs_nome,
          'hoje', x.dia = extract(day from current_date)::integer
        )
        order by x.dia, x.nome_completo
      ),
      '[]'::jsonb
    ) as dados
    from (
      select
        p.nome_completo,
        extract(day from p.data_nascimento)::integer as dia,
        u.nome as ubs_nome
      from public.perfis p
      left join public.ubs u on u.id = p.ubs_id
      where p.data_nascimento is not null
        and extract(month from p.data_nascimento)
          = extract(month from current_date)
        and p.cadastro_completo = true
        and p.aprovacao_status = 'aprovado'
        and p.status = 'ativo'
        and p.ativo = true
        and p.perfil_excluido_em is null
        and (
          (v_ubs_id is not null and p.ubs_id = v_ubs_id)
          or (v_perfil = 'administrador' and v_ubs_id is null)
        )
      order by extract(day from p.data_nascimento), p.nome_completo
      limit 100
    ) x
  )
  select jsonb_build_object(
    'nome', v_nome,
    'perfil', v_perfil,
    'ubsId', v_ubs_id,
    'ubsNome', v_ubs_nome,
    'escopo', case
      when v_perfil = 'administrador' then 'UBS / gestão'
      else 'Minhas gestantes'
    end,
    'metricas', metricas.dados,
    'avisos', avisos.dados,
    'aniversariantes', aniversarios.dados
  )
  into v_resultado
  from metricas, avisos, aniversarios;

  return v_resultado;
end
$$;


ALTER FUNCTION "private"."obter_inicio_v20"("p_usuario_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."obter_inicio_v21"("p_usuario_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private'
    AS $$
declare
  v_perfil text;
  v_ubs_id uuid;
  v_microarea_id uuid;
  v_ubs_nome text;
  v_microarea_codigo text;
  v_nome text;
  v_resultado jsonb;
begin
  select
    p.perfil::text,
    p.ubs_id,
    p.microarea_id,
    u.nome,
    m.codigo,
    p.nome_completo
  into
    v_perfil,
    v_ubs_id,
    v_microarea_id,
    v_ubs_nome,
    v_microarea_codigo,
    v_nome
  from public.perfis p
  left join public.ubs u on u.id = p.ubs_id
  left join public.microareas m on m.id = p.microarea_id
  where p.id = p_usuario_id
    and p.cadastro_completo = true
    and p.aprovacao_status = 'aprovado'
    and p.status = 'ativo'
    and p.ativo = true
    and p.perfil_excluido_em is null
  limit 1;

  if not found then
    raise exception 'Perfil não aprovado';
  end if;

  with base as (
    select g.*
    from public.pec_gestantes g
    where g.excluida_em is null
      and (
        (
          v_perfil = 'administrador'
          and (v_ubs_id is null or g.ubs_id = v_ubs_id)
        )
        or (
          v_perfil in ('profissional_ubs', 'equipe_ubs')
          and g.ubs_id = v_ubs_id
          and g.profissional_responsavel_id = p_usuario_id
        )
        or (
          v_perfil = 'acs'
          and g.ubs_id = v_ubs_id
          and g.microarea_id = v_microarea_id
        )
        or (
          v_perfil = 'aluno'
          and g.ubs_id = v_ubs_id
        )
      )
  ),
  metricas as (
    select jsonb_build_object(
      'ativas', count(*) filter (where coalesce(alta_ativa, false) = false),
      'altoRisco', count(*) filter (
        where coalesce(alta_ativa, false) = false
          and lower(coalesce(risco_gestacional, '')) like '%alto%'
      ),
      'novasMes', count(*) filter (
        where criado_em >= date_trunc('month', current_date)
      ),
      'partosAltas', count(*) filter (
        where coalesce(alta_ativa, false) = true
          or data_parto is not null
      )
    ) as dados
    from base
  ),
  avisos as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'titulo', a.titulo,
          'mensagem', a.mensagem,
          'tipo', a.tipo,
          'publico', a.publico,
          'publicadoEm', a.publicado_em,
          'ubsId', a.ubs_id,
          'ubsNome', u.nome
        )
        order by a.publicado_em desc
      ),
      '[]'::jsonb
    ) as dados
    from (
      select *
      from public.avisos_ubs a
      where a.removido_em is null
        and (a.expira_em is null or a.expira_em > now())
        and (
          a.ubs_id is null
          or a.ubs_id = v_ubs_id
          or (v_perfil = 'administrador' and v_ubs_id is null)
        )
        and (
          v_perfil = 'administrador'
          or (v_perfil = 'aluno' and a.publico = 'todos')
          or (
            v_perfil in ('profissional_ubs', 'equipe_ubs')
            and a.publico in ('todos', 'profissionais')
          )
          or (
            v_perfil = 'acs'
            and a.publico in ('todos', 'acs')
          )
        )
      order by a.publicado_em desc
      limit 30
    ) a
    left join public.ubs u on u.id = a.ubs_id
  ),
  aniversarios as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'nome', x.nome_completo,
          'dia', x.dia,
          'ubsNome', x.ubs_nome,
          'hoje', x.dia = extract(day from current_date)::integer
        )
        order by x.dia, x.nome_completo
      ),
      '[]'::jsonb
    ) as dados
    from (
      select
        p.nome_completo,
        extract(day from p.data_nascimento)::integer as dia,
        u.nome as ubs_nome
      from public.perfis p
      left join public.ubs u on u.id = p.ubs_id
      where p.data_nascimento is not null
        and extract(month from p.data_nascimento)
          = extract(month from current_date)
        and p.cadastro_completo = true
        and p.aprovacao_status = 'aprovado'
        and p.status = 'ativo'
        and p.ativo = true
        and p.perfil_excluido_em is null
        and (
          (v_ubs_id is not null and p.ubs_id = v_ubs_id)
          or (v_perfil = 'administrador' and v_ubs_id is null)
        )
      order by extract(day from p.data_nascimento), p.nome_completo
      limit 100
    ) x
  )
  select jsonb_build_object(
    'nome', v_nome,
    'perfil', v_perfil,
    'ubsId', v_ubs_id,
    'ubsNome', v_ubs_nome,
    'microareaId', v_microarea_id,
    'microareaCodigo', v_microarea_codigo,
    'escopo', case
      when v_perfil = 'administrador' then 'UBS / gestão'
      when v_perfil = 'acs' then 'Território da microárea'
      when v_perfil = 'aluno' then 'Resumo agregado da UBS'
      else 'Minhas gestantes'
    end,
    'metricas', metricas.dados,
    'avisos', avisos.dados,
    'aniversariantes', aniversarios.dados
  )
  into v_resultado
  from metricas, avisos, aniversarios;

  return v_resultado;
end
$$;


ALTER FUNCTION "private"."obter_inicio_v21"("p_usuario_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."obter_painel_acs_v21"("p_usuario_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private'
    AS $$
declare
  v_nome text;
  v_ubs_id uuid;
  v_ubs_nome text;
  v_microarea_id uuid;
  v_microarea_codigo text;
  v_total integer;
  v_resultado jsonb;
begin
  select
    p.nome_completo,
    p.ubs_id,
    u.nome,
    p.microarea_id,
    m.codigo
  into
    v_nome,
    v_ubs_id,
    v_ubs_nome,
    v_microarea_id,
    v_microarea_codigo
  from public.perfis p
  join public.ubs u on u.id = p.ubs_id
  join public.microareas m on m.id = p.microarea_id
  where p.id = p_usuario_id
    and p.perfil::text = 'acs'
    and p.cadastro_completo = true
    and p.aprovacao_status = 'aprovado'
    and p.status = 'ativo'
    and p.ativo = true
    and p.perfil_excluido_em is null
  limit 1;

  if not found then
    raise exception 'ACS sem UBS e microárea aprovadas';
  end if;

  select count(*)::integer
  into v_total
  from public.pec_gestantes g
  where g.ubs_id = v_ubs_id
    and g.microarea_id = v_microarea_id
    and g.excluida_em is null
    and coalesce(g.alta_ativa, false) = false;

  if v_total > 0 then
    insert into private.acessos_identidade_gestantes (
      usuario_id,
      ubs_id,
      perfil,
      finalidade,
      total_registros
    )
    values (
      p_usuario_id,
      v_ubs_id,
      'acs',
      'painel_territorial_acs_v21',
      v_total
    );
  end if;

  with ultimas as (
    select distinct on (v.gestante_id)
      v.gestante_id,
      v.id as visita_id,
      v.acs_id as visita_acs_id,
      v.data_acao,
      v.compareceu,
      v.sinais_alerta,
      v.atualizado_em
    from public.visitas_acs_v21 v
    where v.removido_em is null
      and v.ubs_id = v_ubs_id
      and v.microarea_id = v_microarea_id
    order by
      v.gestante_id,
      v.data_acao desc,
      v.criado_em desc
  ),
  gestantes as (
    select
      g.id,
      g.codigo,
      coalesce(
        nullif(private.descriptografar_texto(i.nome_enc), ''),
        'Nome não disponível'
      ) as nome,
      g.risco_gestacional,
      coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas) as ig_semanas,
      coalesce(g.dpp_dum, g.dpp_ecografia) as dpp,
      g.inicio_pre_natal,
      g.data_parto,
      case
        when u.visita_acs_id = p_usuario_id then u.visita_id
        else null
      end as visita_id,
      u.data_acao as ultima_visita,
      u.compareceu as ultima_compareceu,
      u.sinais_alerta as ultimo_alerta,
      case
        when u.data_acao is null then 9999
        else greatest(current_date - u.data_acao, 0)
      end as dias_sem_visita,
      (
        g.data_parto is not null
        and g.data_parto between current_date - 42 and current_date
        and (
          u.data_acao is null
          or u.data_acao < g.data_parto
        )
      ) as puerperio_sem_visita,
      (
        u.data_acao is null
        or u.data_acao <= current_date - 30
      ) as sem_visita_30d,
      (
        lower(coalesce(g.risco_gestacional, '')) like '%alto%'
      ) as alto_risco
    from public.pec_gestantes g
    left join private.identidades_gestantes i
      on i.gestante_id = g.id
    left join ultimas u
      on u.gestante_id = g.id
    where g.ubs_id = v_ubs_id
      and g.microarea_id = v_microarea_id
      and g.excluida_em is null
      and coalesce(g.alta_ativa, false) = false
  ),
  gestantes_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'codigo', g.codigo,
          'nome', g.nome,
          'risco', g.risco_gestacional,
          'igSemanas', g.ig_semanas,
          'dpp', g.dpp,
          'inicioPreNatal', g.inicio_pre_natal,
          'dataParto', g.data_parto,
          'visitaId', g.visita_id,
          'ultimaVisita', g.ultima_visita,
          'diasSemVisita', g.dias_sem_visita,
          'ultimaCompareceu', g.ultima_compareceu,
          'ultimoAlerta', g.ultimo_alerta,
          'puerperioSemVisita', g.puerperio_sem_visita,
          'semVisita30d', g.sem_visita_30d,
          'altoRisco', g.alto_risco,
          'prioridade', case
            when g.puerperio_sem_visita then 1
            when g.alto_risco then 2
            when g.sem_visita_30d then 3
            when g.inicio_pre_natal is null then 4
            else 5
          end,
          'alertas', jsonb_strip_nulls(
            jsonb_build_object(
              'puerperio', case when g.puerperio_sem_visita then 'Puerpério sem visita' end,
              'risco', case when g.alto_risco then 'Alto risco' end,
              'visita', case when g.sem_visita_30d then 'Sem visita há 30 dias ou mais' end,
              'inicioPn', case when g.inicio_pre_natal is null then 'Início do pré-natal não informado' end
            )
          )
        )
        order by
          case
            when g.puerperio_sem_visita then 1
            when g.alto_risco then 2
            when g.sem_visita_30d then 3
            when g.inicio_pre_natal is null then 4
            else 5
          end,
          g.nome
      ),
      '[]'::jsonb
    ) as dados
    from gestantes g
  ),
  metricas as (
    select jsonb_build_object(
      'gestantesTerritorio', count(*),
      'visitadas30Dias', count(*) filter (
        where ultima_visita >= current_date - 30
      ),
      'pendentes30Dias', count(*) filter (
        where sem_visita_30d
      ),
      'altoRisco', count(*) filter (
        where alto_risco
      ),
      'puerperioSemVisita', count(*) filter (
        where puerperio_sem_visita
      )
    ) as dados
    from gestantes
  ),
  acoes30 as (
    select jsonb_build_object(
      'visitas', count(*) filter (where compareceu),
      'buscasAtivas', count(*) filter (where not compareceu),
      'sinaisAlerta', count(*) filter (where sinais_alerta)
    ) as dados
    from public.visitas_acs_v21
    where ubs_id = v_ubs_id
      and microarea_id = v_microarea_id
      and removido_em is null
      and data_acao >= current_date - 30
  )
  select jsonb_build_object(
    'nome', v_nome,
    'ubsId', v_ubs_id,
    'ubsNome', v_ubs_nome,
    'microareaId', v_microarea_id,
    'microareaCodigo', v_microarea_codigo,
    'atualizadoEm', now(),
    'metricas', metricas.dados || acoes30.dados,
    'gestantes', gestantes_json.dados
  )
  into v_resultado
  from metricas, acoes30, gestantes_json;

  return v_resultado;
end
$$;


ALTER FUNCTION "private"."obter_painel_acs_v21"("p_usuario_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."obter_relatorio_classificacao_v17"("p_usuario_id" "uuid", "p_classificacao_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'extensions'
    AS $$
declare
  v_perfil text; v_ubs_usuario uuid; v_gestante_ubs uuid; v_result jsonb;
begin
  select p.perfil::text,p.ubs_id into v_perfil,v_ubs_usuario
  from public.perfis p where p.id=p_usuario_id and p.ativo=true and p.status='ativo' limit 1;
  if not found then raise exception 'Usuário sem perfil ativo'; end if;

  select g.ubs_id into v_gestante_ubs
  from public.classificacoes_risco_gestacional c join public.pec_gestantes g on g.id=c.gestante_id
  where c.id=p_classificacao_id;
  if not found then raise exception 'Classificação não encontrada'; end if;
  if v_perfil<>'administrador' and v_gestante_ubs<>v_ubs_usuario then raise exception 'Sem autorização para este relatório'; end if;

  select jsonb_build_object(
    'id',c.id,'codigo',g.codigo,
    'gestanteNome',coalesce(nullif(private.descriptografar_texto(i.nome_enc),''),'Gestante '||g.codigo),
    'dataNascimento',private.descriptografar_texto(i.data_nascimento_enc),
    'trimestre',c.trimestre,'pesoKg',c.peso_kg,'alturaCm',c.altura_cm,'imc',c.imc,
    'faixaImc',c.faixa_imc,'score',c.score_total,'classificacao',c.classificacao,
    'conduta',c.conduta_sugerida,'observacao',c.observacao,
    'profissionalNome',c.profissional_nome_snapshot,'perfilProfissional',c.perfil_snapshot,
    'ubsOrigemNome',c.ubs_origem_nome_snapshot,'ubsAtendimentoNome',c.ubs_atendimento_nome_snapshot,
    'realizadaEm',c.realizada_em,'instrumentoVersao',c.instrumento_versao,
    'itens',coalesce((select jsonb_agg(jsonb_build_object(
      'grupoTitulo',ri.grupo_titulo,'fatorTitulo',ri.fator_titulo,'pontos',ri.pontos,'origem',ri.origem
    ) order by case ri.grupo when 'g1' then 1 when 'g2' then 2 when 'g3' then 3 when 'g4' then 4 else 5 end,ri.pontos desc,ri.fator_titulo)
      from public.classificacao_risco_itens ri where ri.classificacao_id=c.id),'[]'::jsonb)
  ) into v_result
  from public.classificacoes_risco_gestacional c
  join public.pec_gestantes g on g.id=c.gestante_id
  left join private.identidades_gestantes i on i.gestante_id=g.id
  where c.id=p_classificacao_id;

  insert into private.acessos_identidade_gestantes(usuario_id,ubs_id,perfil,finalidade,total_registros)
  values(p_usuario_id,v_gestante_ubs,v_perfil,'geracao_pdf_classificacao_risco',1);
  return v_result;
end
$$;


ALTER FUNCTION "private"."obter_relatorio_classificacao_v17"("p_usuario_id" "uuid", "p_classificacao_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."parse_date"("p_value" "text") RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
declare
  v text := private.clean_text(p_value);
begin
  if v is null then
    return null;
  end if;

  if v ~ '^\d{2}/\d{2}/\d{4}$' then
    return to_date(v, 'DD/MM/YYYY');
  elsif v ~ '^\d{4}-\d{2}-\d{2}$' then
    return v::date;
  elsif v ~ '^\d{4}-\d{2}-\d{2}T' then
    return v::timestamptz::date;
  end if;

  return null;
exception
  when others then
    return null;
end
$_$;


ALTER FUNCTION "private"."parse_date"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."parse_int"("p_value" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when private.clean_text(p_value) is null then null
    else nullif((regexp_match(private.clean_text(p_value), '-?\d+'))[1], '')::integer
  end
$$;


ALTER FUNCTION "private"."parse_int"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."parse_numeric"("p_value" "text") RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
declare
  v text := private.clean_text(p_value);
begin
  if v is null then
    return null;
  end if;

  v := replace(v, ' ', '');
  if v ~ '^\d{1,3}(\.\d{3})*,\d+$' then
    v := replace(replace(v, '.', ''), ',', '.');
  elsif v ~ '^\d+,\d+$' then
    v := replace(v, ',', '.');
  end if;

  return regexp_replace(v, '[^0-9\.-]', '', 'g')::numeric;
exception
  when others then
    return null;
end
$_$;


ALTER FUNCTION "private"."parse_numeric"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."pii_key"() RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'vault'
    AS $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'pec_pii_key'
  limit 1
$$;


ALTER FUNCTION "private"."pii_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."proteger_campos_manuais_pec"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private'
    AS $$
declare
  v_origem text := current_setting('app.origem_atualizacao', true);
begin
  if v_origem = 'manual' then
    return new;
  end if;

  if 'microarea_id' = any(old.bloqueios_manuais) then new.microarea_id := old.microarea_id; end if;
  if 'idade_anos' = any(old.bloqueios_manuais) then new.idade_anos := old.idade_anos; end if;
  if 'sexo' = any(old.bloqueios_manuais) then new.sexo := old.sexo; end if;
  if 'identidade_genero' = any(old.bloqueios_manuais) then new.identidade_genero := old.identidade_genero; end if;
  if 'raca_cor' = any(old.bloqueios_manuais) then new.raca_cor := old.raca_cor; end if;
  if 'bolsa_familia' = any(old.bloqueios_manuais) then new.bolsa_familia := old.bolsa_familia; end if;
  if 'vigencia_bolsa_familia' = any(old.bloqueios_manuais) then new.vigencia_bolsa_familia := old.vigencia_bolsa_familia; end if;
  if 'inicio_pre_natal' = any(old.bloqueios_manuais) then new.inicio_pre_natal := old.inicio_pre_natal; end if;
  if 'dum' = any(old.bloqueios_manuais) then new.dum := old.dum; end if;
  if 'dpp_dum' = any(old.bloqueios_manuais) then new.dpp_dum := old.dpp_dum; end if;
  if 'ig_dum_semanas' = any(old.bloqueios_manuais) then new.ig_dum_semanas := old.ig_dum_semanas; end if;
  if 'ig_dum_dias' = any(old.bloqueios_manuais) then new.ig_dum_dias := old.ig_dum_dias; end if;
  if 'ig_ecografia_semanas' = any(old.bloqueios_manuais) then new.ig_ecografia_semanas := old.ig_ecografia_semanas; end if;
  if 'ig_ecografia_dias' = any(old.bloqueios_manuais) then new.ig_ecografia_dias := old.ig_ecografia_dias; end if;
  if 'dpp_ecografia' = any(old.bloqueios_manuais) then new.dpp_ecografia := old.dpp_ecografia; end if;
  if 'peso_kg' = any(old.bloqueios_manuais) then new.peso_kg := old.peso_kg; end if;
  if 'altura_cm' = any(old.bloqueios_manuais) then new.altura_cm := old.altura_cm; end if;
  if 'pressao_arterial' = any(old.bloqueios_manuais) then new.pressao_arterial := old.pressao_arterial; end if;
  if 'data_ultima_pressao' = any(old.bloqueios_manuais) then new.data_ultima_pressao := old.data_ultima_pressao; end if;
  if 'data_ultimo_peso_altura' = any(old.bloqueios_manuais) then new.data_ultimo_peso_altura := old.data_ultimo_peso_altura; end if;
  if 'atendimentos_pre_natal' = any(old.bloqueios_manuais) then new.atendimentos_pre_natal := old.atendimentos_pre_natal; end if;
  if 'atendimentos_ate_12_semanas' = any(old.bloqueios_manuais) then new.atendimentos_ate_12_semanas := old.atendimentos_ate_12_semanas; end if;
  if 'ultima_consulta_pre_natal' = any(old.bloqueios_manuais) then new.ultima_consulta_pre_natal := old.ultima_consulta_pre_natal; end if;
  if 'atendimentos_odontologicos' = any(old.bloqueios_manuais) then new.atendimentos_odontologicos := old.atendimentos_odontologicos; end if;
  if 'dtpa' = any(old.bloqueios_manuais) then new.dtpa := old.dtpa; end if;
  if 'medicoes_altura_uterina' = any(old.bloqueios_manuais) then new.medicoes_altura_uterina := old.medicoes_altura_uterina; end if;
  if 'medicoes_pressao' = any(old.bloqueios_manuais) then new.medicoes_pressao := old.medicoes_pressao; end if;
  if 'medicoes_peso_altura' = any(old.bloqueios_manuais) then new.medicoes_peso_altura := old.medicoes_peso_altura; end if;
  if 'visitas_pre_natal' = any(old.bloqueios_manuais) then new.visitas_pre_natal := old.visitas_pre_natal; end if;
  if 'visitas_puerperio' = any(old.bloqueios_manuais) then new.visitas_puerperio := old.visitas_puerperio; end if;
  if 'atendimentos_puerperio' = any(old.bloqueios_manuais) then new.atendimentos_puerperio := old.atendimentos_puerperio; end if;
  if 'ultima_consulta_puerperio' = any(old.bloqueios_manuais) then new.ultima_consulta_puerperio := old.ultima_consulta_puerperio; end if;
  if 'situacao_acompanhamento' = any(old.bloqueios_manuais) then new.situacao_acompanhamento := old.situacao_acompanhamento; end if;
  if 'data_parto' = any(old.bloqueios_manuais) then new.data_parto := old.data_parto; end if;
  if 'tipo_parto' = any(old.bloqueios_manuais) then new.tipo_parto := old.tipo_parto; end if;
  if 'risco_gestacional' = any(old.bloqueios_manuais) then new.risco_gestacional := old.risco_gestacional; end if;

  new.bloqueios_manuais := old.bloqueios_manuais;
  new.fontes_campos := old.fontes_campos;
  new.atualizado_manualmente_em := old.atualizado_manualmente_em;
  new.atualizado_manualmente_por := old.atualizado_manualmente_por;
  new.alta_ativa := old.alta_ativa;
  new.alta_data := old.alta_data;
  new.alta_motivo := old.alta_motivo;
  new.alta_situacao_final := old.alta_situacao_final;
  new.alta_observacao := old.alta_observacao;

  return new;
end
$$;


ALTER FUNCTION "private"."proteger_campos_manuais_pec"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."proteger_identidade_manual"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'private'
    AS $$
declare
  v_origem text := current_setting('app.origem_atualizacao', true);
begin
  if v_origem = 'manual' then
    return new;
  end if;

  if 'nome' = any(old.bloqueios_manuais) then
    new.nome_enc := old.nome_enc;
  end if;
  if 'data_nascimento' = any(old.bloqueios_manuais) then
    new.data_nascimento_enc := old.data_nascimento_enc;
  end if;
  if 'cpf' = any(old.bloqueios_manuais) then
    new.cpf_enc := old.cpf_enc;
  end if;
  if 'cns' = any(old.bloqueios_manuais) then
    new.cns_enc := old.cns_enc;
  end if;
  if 'telefones' = any(old.bloqueios_manuais) then
    new.telefones_enc := old.telefones_enc;
  end if;
  if 'endereco' = any(old.bloqueios_manuais) then
    new.endereco_enc := old.endereco_enc;
  end if;

  new.identidade_hash := old.identidade_hash;
  new.bloqueios_manuais := old.bloqueios_manuais;
  new.atualizado_manualmente_em := old.atualizado_manualmente_em;
  new.atualizado_manualmente_por := old.atualizado_manualmente_por;

  return new;
end
$$;


ALTER FUNCTION "private"."proteger_identidade_manual"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."registrar_acao_acs_v21"("p_usuario_id" "uuid", "p_gestante_id" "uuid", "p_tipo" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private'
    AS $$
declare
  v_ubs_id uuid;
  v_microarea_id uuid;
  v_visita_id uuid;
  v_compareceu boolean;
  v_motivo text;
begin
  if p_tipo not in ('visita', 'nao_encontrada') then
    raise exception 'Tipo de ação inválido';
  end if;

  select p.ubs_id, p.microarea_id
  into v_ubs_id, v_microarea_id
  from public.perfis p
  where p.id = p_usuario_id
    and p.perfil::text = 'acs'
    and p.cadastro_completo = true
    and p.aprovacao_status = 'aprovado'
    and p.status = 'ativo'
    and p.ativo = true
    and p.perfil_excluido_em is null
  limit 1;

  if not found or v_ubs_id is null or v_microarea_id is null then
    raise exception 'ACS sem território aprovado';
  end if;

  if not exists (
    select 1
    from public.pec_gestantes g
    where g.id = p_gestante_id
      and g.ubs_id = v_ubs_id
      and g.microarea_id = v_microarea_id
      and g.excluida_em is null
      and coalesce(g.alta_ativa, false) = false
  ) then
    raise exception 'Gestante fora do território autorizado';
  end if;

  v_compareceu := p_tipo = 'visita';
  v_motivo := case
    when p_tipo = 'nao_encontrada' then 'Não encontrada no domicílio'
    else null
  end;

  insert into public.visitas_acs_v21 (
    gestante_id,
    acs_id,
    ubs_id,
    microarea_id,
    data_acao,
    compareceu,
    motivo_falta
  )
  values (
    p_gestante_id,
    p_usuario_id,
    v_ubs_id,
    v_microarea_id,
    current_date,
    v_compareceu,
    v_motivo
  )
  returning id into v_visita_id;

  insert into private.auditoria_visitas_acs_v21 (
    visita_id,
    acs_id,
    gestante_hash,
    acao,
    depois
  )
  values (
    v_visita_id,
    p_usuario_id,
    private.hash_gestante_auditoria_v19(p_gestante_id),
    p_tipo,
    jsonb_build_object(
      'data', current_date,
      'compareceu', v_compareceu,
      'motivo', v_motivo
    )
  );

  return jsonb_build_object(
    'ok', true,
    'visitaId', v_visita_id
  );
end
$$;


ALTER FUNCTION "private"."registrar_acao_acs_v21"("p_usuario_id" "uuid", "p_gestante_id" "uuid", "p_tipo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."restaurar_gestante_v19"("p_usuario_id" "uuid", "p_gestante_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private'
    AS $$
declare
  v_gestante public.pec_gestantes%rowtype;
begin
  if not private.usuario_pode_operar_lixeira_v20(
    p_usuario_id,
    p_gestante_id
  ) then
    raise exception 'Somente quem enviou a gestante para a lixeira pode restaurá-la';
  end if;

  select * into v_gestante
  from public.pec_gestantes
  where id = p_gestante_id
  for update;

  update public.pec_gestantes
  set
    excluida_em = null,
    excluida_por = null,
    exclusao_motivo = null,
    exclusao_definitiva_prevista_em = null,
    atualizado_em = now()
  where id = p_gestante_id;

  insert into private.auditoria_exclusoes_gestantes (
    gestante_hash,
    usuario_id,
    ubs_id,
    acao,
    metadados
  )
  values (
    private.hash_gestante_auditoria_v19(p_gestante_id),
    p_usuario_id,
    v_gestante.ubs_id,
    'restaurar',
    jsonb_build_object('restaurada_em', now(), 'regra', 'lixeira_pessoal_v20')
  );

  return jsonb_build_object('ok', true);
end
$$;


ALTER FUNCTION "private"."restaurar_gestante_v19"("p_usuario_id" "uuid", "p_gestante_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."salvar_classificacao_risco_v17"("p_usuario_id" "uuid", "p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'extensions'
    AS $$
declare
  v_perfil text;
  v_nome_prof text;
  v_ubs_origem uuid;
  v_ubs_origem_nome text;
  v_gestante_id uuid;
  v_gestante_ubs uuid;
  v_codigo text;
  v_ubs_atendimento uuid;
  v_ubs_atendimento_nome text;
  v_trimestre integer := coalesce(private.parse_int(p_payload->>'trimestre'),1);
  v_peso numeric := private.parse_numeric(p_payload->>'pesoKg');
  v_altura_cm numeric := private.parse_numeric(p_payload->>'alturaCm');
  v_altura_m numeric;
  v_imc numeric;
  v_faixa_imc text := 'Não calculado';
  v_pontos_imc integer := 0;
  v_pontos_g1 integer := 0;
  v_pontos_clinicos integer := 0;
  v_score integer;
  v_classificacao text;
  v_conduta text;
  v_id uuid;
  v_item jsonb;
  v_fator record;
begin
  select p.perfil::text, p.nome_completo, p.ubs_id, u.nome
  into v_perfil, v_nome_prof, v_ubs_origem, v_ubs_origem_nome
  from public.perfis p left join public.ubs u on u.id=p.ubs_id
  where p.id=p_usuario_id and p.ativo=true and p.status='ativo' limit 1;
  if not found or v_ubs_origem is null then raise exception 'Profissional sem perfil ativo e UBS vinculada'; end if;

  v_gestante_id := nullif(p_payload->>'gestanteId','')::uuid;
  if v_gestante_id is null then
    v_gestante_id := private.criar_cadastro_minimo_risco_v17(p_usuario_id, coalesce(p_payload->'cadastroMinimo','{}'::jsonb));
  end if;

  select g.ubs_id, g.codigo, coalesce(v_peso,g.peso_kg), coalesce(v_altura_cm,g.altura_cm)
  into v_gestante_ubs, v_codigo, v_peso, v_altura_cm
  from public.pec_gestantes g where g.id=v_gestante_id;
  if not found then raise exception 'Gestante não encontrada'; end if;
  if v_perfil <> 'administrador' and v_gestante_ubs <> v_ubs_origem then raise exception 'Sem autorização para esta gestante'; end if;

  v_ubs_atendimento := nullif(p_payload->>'ubsAtendimentoId','')::uuid;
  if v_ubs_atendimento is not null then
    select nome into v_ubs_atendimento_nome from public.ubs where id=v_ubs_atendimento and ativa=true;
  end if;
  v_ubs_atendimento_nome := coalesce(private.clean_text(p_payload->>'ubsAtendimentoExterna'), v_ubs_atendimento_nome, v_ubs_origem_nome);

  if v_peso is not null and v_altura_cm is not null and v_peso>0 and v_altura_cm>0 then
    v_altura_m := case when v_altura_cm>3 then v_altura_cm/100 else v_altura_cm end;
    v_imc := round(v_peso/(v_altura_m*v_altura_m),2);
    if v_imc < 18 then v_faixa_imc:='Baixo peso'; v_pontos_imc:=2;
    elsif v_imc <=24.9 then v_faixa_imc:='Eutrófica'; v_pontos_imc:=0;
    elsif v_imc <=29.9 then v_faixa_imc:='Sobrepeso'; v_pontos_imc:=1;
    elsif v_imc <=39.9 then v_faixa_imc:='Obesidade grau I/II'; v_pontos_imc:=5;
    else v_faixa_imc:='Obesidade grau III'; v_pontos_imc:=10; end if;
  end if;

  select
    coalesce(sum(f.pontos) filter(where f.grupo='g1'),0)::integer,
    coalesce(sum(f.pontos) filter(where f.grupo in('g3','g4','g5')),0)::integer
  into v_pontos_g1, v_pontos_clinicos
  from public.config_fatores_risco_gestacional f
  where f.ativo=true and f.versao='SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'
    and f.codigo in (
      select value->>'codigo' from jsonb_array_elements(coalesce(p_payload->'itens','[]'::jsonb))
    );

  v_score := v_pontos_g1 + v_pontos_imc + v_pontos_clinicos;
  if v_score >=10 then
    if v_pontos_clinicos=0 and coalesce(v_imc,0)<40 then
      v_classificacao:='Médio Risco';
      v_conduta:='A pontuação elevada decorre apenas de fatores individuais e/ou nutricionais. Manter acompanhamento na APS com atenção diferenciada e avaliação clínica profissional.';
    else
      v_classificacao:='Alto Risco';
      v_conduta:='Encaminhar ao pré-natal de alto risco, mantendo vínculo e acompanhamento compartilhado com a APS.';
    end if;
  elsif v_score>=5 then
    v_classificacao:='Médio Risco';
    v_conduta:='Realizar pré-natal na APS pelo médico intercalado com enfermeiro, com monitoramento pela Rede Cuidar conforme o instrumento.';
  else
    v_classificacao:='Risco Habitual';
    v_conduta:='Realizar acompanhamento de pré-natal na APS pelo enfermeiro intercalado com médico, conforme o instrumento.';
  end if;

  insert into public.classificacoes_risco_gestacional (
    gestante_id,instrumento_versao,trimestre,peso_kg,altura_cm,imc,faixa_imc,
    pontos_individuais,pontos_imc,pontos_clinicos,score_total,classificacao,
    conduta_sugerida,observacao,profissional_id,profissional_nome_snapshot,
    perfil_snapshot,ubs_origem_profissional_id,ubs_origem_nome_snapshot,
    ubs_atendimento_id,ubs_atendimento_nome_snapshot
  ) values (
    v_gestante_id,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024',greatest(1,least(3,v_trimestre)),v_peso,v_altura_cm,v_imc,v_faixa_imc,
    v_pontos_g1,v_pontos_imc,v_pontos_clinicos,v_score,v_classificacao,v_conduta,
    private.clean_text(p_payload->>'observacao'),p_usuario_id,v_nome_prof,v_perfil,
    v_ubs_origem,v_ubs_origem_nome,v_ubs_atendimento,v_ubs_atendimento_nome
  ) returning id into v_id;

  if v_imc is not null then
    insert into public.classificacao_risco_itens(classificacao_id,fator_codigo,grupo,grupo_titulo,fator_titulo,pontos,origem,detalhe_origem,automatico)
    values(v_id,'g2_imc','g2','Avaliação nutricional',v_faixa_imc,v_pontos_imc,'calculado',concat('IMC calculado: ',v_imc),true);
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'itens','[]'::jsonb)) loop
    select * into v_fator from public.config_fatores_risco_gestacional f
    where f.codigo=v_item->>'codigo' and f.ativo=true and f.versao='SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024';
    if found then
      insert into public.classificacao_risco_itens(
        classificacao_id,fator_codigo,grupo,grupo_titulo,fator_titulo,pontos,origem,detalhe_origem,automatico
      ) values (
        v_id,v_fator.codigo,v_fator.grupo,v_fator.grupo_titulo,v_fator.titulo,v_fator.pontos,
        coalesce(private.clean_text(v_item->>'origem'),'manual'),private.clean_text(v_item->>'detalheOrigem'),
        coalesce((v_item->>'automatico')::boolean,false)
      ) on conflict(classificacao_id,fator_codigo) do nothing;
    end if;
  end loop;

  perform set_config('app.origem_atualizacao','manual',true);
  update public.pec_gestantes
  set risco_gestacional=v_classificacao,
      peso_kg=coalesce(v_peso,peso_kg), altura_cm=coalesce(v_altura_cm,altura_cm),
      bloqueios_manuais=array(select distinct unnest(bloqueios_manuais || array['risco_gestacional','peso_kg','altura_cm'])),
      atualizado_em=now()
  where id=v_gestante_id;

  insert into private.historico_classificacoes_risco(classificacao_id,gestante_id,usuario_id,acao,payload)
  values(v_id,v_gestante_id,p_usuario_id,'classificacao_finalizada',p_payload);

  return jsonb_build_object(
    'classificacaoId',v_id,'gestanteId',v_gestante_id,'codigoGestante',v_codigo,
    'score',v_score,'imc',v_imc,'faixaImc',v_faixa_imc,'classificacao',v_classificacao,
    'conduta',v_conduta,'realizadaEm',now()
  );
end
$$;


ALTER FUNCTION "private"."salvar_classificacao_risco_v17"("p_usuario_id" "uuid", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."salvar_gestante_clinica"("p_usuario_id" "uuid", "p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'extensions'
    AS $$
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
  select p.perfil::text, p.ubs_id
  into v_perfil, v_ubs_usuario
  from public.perfis p
  where p.id = p_usuario_id
    and p.ativo = true
    and p.status = 'ativo'
    and p.perfil::text in ('administrador', 'profissional_ubs', 'equipe_ubs')
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

    v_hash := private.identidade_hash(
      jsonb_build_object(
        'nome', v_nome,
        'data_nascimento', to_char(v_nascimento, 'DD/MM/YYYY'),
        'cpf', coalesce(p_payload #>> '{identificacao,cpf}', ''),
        'cns', coalesce(p_payload #>> '{identificacao,cns}', '')
      ),
      v_ubs_id
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
$$;


ALTER FUNCTION "private"."salvar_gestante_clinica"("p_usuario_id" "uuid", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sincronizar_resumo_pec_v16"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'private'
    AS $$
begin
  insert into public.gestante_exames (
    gestante_id, codigo, nome, trimestre, status,
    resultado_resumido, origem, atualizado_em
  )
  values
    (new.id, 'hiv_t1', 'Anti-HIV', 1, private.status_pec_para_exame(new.exame_hiv_primeiro), new.exame_hiv_primeiro, 'pec', now()),
    (new.id, 'sifilis_t1', 'Teste rápido de triagem para sífilis e/ou VDRL/RPR', 1, private.status_pec_para_exame(new.exame_sifilis_primeiro), new.exame_sifilis_primeiro, 'pec', now()),
    (new.id, 'hepatite_b_t1', 'Sorologia para hepatite B (HBsAg)', 1, private.status_pec_para_exame(new.exame_hepatite_b_primeiro), new.exame_hepatite_b_primeiro, 'pec', now()),
    (new.id, 'hepatite_c_t1', 'Sorologia para hepatite C', 1, private.status_pec_para_exame(new.exame_hepatite_c_primeiro), new.exame_hepatite_c_primeiro, 'pec', now()),
    (new.id, 'hiv_t3', 'Anti-HIV', 3, private.status_pec_para_exame(new.exame_hiv_terceiro), new.exame_hiv_terceiro, 'pec', now()),
    (new.id, 'sifilis_t3', 'VDRL / teste para sífilis', 3, private.status_pec_para_exame(new.exame_sifilis_terceiro), new.exame_sifilis_terceiro, 'pec', now())
  on conflict (gestante_id, codigo, trimestre)
  do update set
    status = excluded.status,
    resultado_resumido = excluded.resultado_resumido,
    atualizado_em = now()
  where public.gestante_exames.origem <> 'manual';

  insert into public.gestante_vacinas (
    gestante_id, codigo, nome, status, dose,
    observacao, origem, atualizado_em
  )
  values (
    new.id,
    'dtpa',
    'dTpa',
    case
      when new.dtpa is null or btrim(new.dtpa) in ('', '-') then 'nao_informado'
      when lower(new.dtpa) like '%realiz%' then 'realizada'
      when lower(new.dtpa) like '%pend%' then 'pendente'
      else 'nao_informado'
    end,
    'dose_gestacao_atual',
    new.dtpa,
    'pec',
    now()
  )
  on conflict (gestante_id, codigo, dose)
  do update set
    status = excluded.status,
    observacao = excluded.observacao,
    atualizado_em = now()
  where public.gestante_vacinas.origem <> 'manual';

  return new;
end
$$;


ALTER FUNCTION "private"."sincronizar_resumo_pec_v16"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."status_pec_para_exame"("p_valor" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $$
  select case
    when p_valor is null or btrim(p_valor) in ('', '-') then 'nao_informado'
    when lower(p_valor) like '%realiz%' or lower(p_valor) like '%tratad%' then 'realizado'
    when lower(p_valor) like '%pend%' then 'pendente'
    when lower(p_valor) like '%nao_se_aplica%' or lower(p_valor) like '%não se aplica%' then 'nao_se_aplica'
    when lower(p_valor) like '%reagent%' or lower(p_valor) like '%alterad%' then 'resultado_alterado'
    else 'nao_informado'
  end
$$;


ALTER FUNCTION "private"."status_pec_para_exame"("p_valor" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."usuario_admin_v20"("p_usuario_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  select exists (
    select 1
    from public.perfis p
    where p.id = p_usuario_id
      and p.perfil::text = 'administrador'
      and p.cadastro_completo = true
      and p.aprovacao_status = 'aprovado'
      and p.status = 'ativo'
      and p.ativo = true
      and p.perfil_excluido_em is null
  )
$$;


ALTER FUNCTION "private"."usuario_admin_v20"("p_usuario_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."usuario_pode_gerenciar_gestante_v19"("p_usuario_id" "uuid", "p_gestante_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  select exists (
    select 1
    from public.pec_gestantes g
    join public.perfis p on p.id = p_usuario_id
    where g.id = p_gestante_id
      and p.ativo = true
      and p.status = 'ativo'
      and (
        p.perfil = 'administrador'
        or (
          g.ubs_id = p.ubs_id
          and g.profissional_responsavel_id = p.id
        )
      )
  )
$$;


ALTER FUNCTION "private"."usuario_pode_gerenciar_gestante_v19"("p_usuario_id" "uuid", "p_gestante_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."usuario_pode_operar_lixeira_v20"("p_usuario_id" "uuid", "p_gestante_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  select exists (
    select 1
    from public.pec_gestantes g
    join public.perfis p on p.id = p_usuario_id
    where g.id = p_gestante_id
      and g.excluida_em is not null
      and g.excluida_por = p_usuario_id
      and p.cadastro_completo = true
      and p.aprovacao_status = 'aprovado'
      and p.status = 'ativo'
      and p.ativo = true
      and p.perfil_excluido_em is null
  )
$$;


ALTER FUNCTION "private"."usuario_pode_operar_lixeira_v20"("p_usuario_id" "uuid", "p_gestante_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."perfis" (
    "id" "uuid" NOT NULL,
    "nome_completo" "text" NOT NULL,
    "email" "text" NOT NULL,
    "perfil" "public"."perfil_usuario" NOT NULL,
    "status" "public"."status_usuario" DEFAULT 'pendente'::"public"."status_usuario" NOT NULL,
    "ubs_id" "uuid",
    "microarea_id" "uuid",
    "matricula" "text",
    "cargo_funcao" "text",
    "primeiro_acesso" boolean DEFAULT true NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data_nascimento" "date",
    "cadastro_completo" boolean DEFAULT false NOT NULL,
    "aprovacao_status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "perfil_solicitado" "text",
    "ubs_solicitada_id" "uuid",
    "origem_cadastro" "text" DEFAULT 'administrador'::"text" NOT NULL,
    "solicitado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "aprovado_em" timestamp with time zone,
    "aprovado_por" "uuid",
    "perfil_excluido_em" timestamp with time zone,
    "perfil_excluido_por" "uuid",
    "ultimo_acesso_em" timestamp with time zone,
    CONSTRAINT "perfil_acs_exige_ubs_microarea" CHECK ((("perfil" <> 'acs'::"public"."perfil_usuario") OR (("ubs_id" IS NOT NULL) AND ("microarea_id" IS NOT NULL)))),
    CONSTRAINT "perfil_equipe_ubs_exige_ubs" CHECK ((("perfil" <> 'equipe_ubs'::"public"."perfil_usuario") OR ("ubs_id" IS NOT NULL))),
    CONSTRAINT "perfil_municipal_sem_microarea" CHECK ((("perfil" <> ALL (ARRAY['administrador'::"public"."perfil_usuario", 'gestao_municipal'::"public"."perfil_usuario"])) OR ("microarea_id" IS NULL))),
    CONSTRAINT "perfis_aprovacao_status_check" CHECK (("aprovacao_status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'rejeitado'::"text", 'desativado'::"text"]))),
    CONSTRAINT "perfis_email_normalizado" CHECK (("email" = "lower"(TRIM(BOTH FROM "email")))),
    CONSTRAINT "perfis_nome_minimo" CHECK (("char_length"(TRIM(BOTH FROM "nome_completo")) >= 3))
);


ALTER TABLE "public"."perfis" OWNER TO "postgres";


COMMENT ON TABLE "public"."perfis" IS 'Informações institucionais e permissões vinculadas aos usuários do Supabase Auth.';



COMMENT ON COLUMN "public"."perfis"."id" IS 'Mesmo UUID utilizado em auth.users.id.';



CREATE OR REPLACE FUNCTION "public"."atualizar_meus_dados"("p_nome_completo" "text", "p_cargo_funcao" "text" DEFAULT NULL::"text") RETURNS "public"."perfis"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_perfil public.perfis;
begin
    if auth.uid() is null then
        raise exception 'Usuário não autenticado.';
    end if;

    if char_length(trim(p_nome_completo)) < 3 then
        raise exception 'O nome deve possuir ao menos três caracteres.';
    end if;

    update public.perfis
    set
        nome_completo = trim(p_nome_completo),
        cargo_funcao = nullif(trim(p_cargo_funcao), '')
    where id = auth.uid()
    returning * into v_perfil;

    if v_perfil.id is null then
        raise exception 'Perfil não encontrado.';
    end if;

    return v_perfil;
end;
$$;


ALTER FUNCTION "public"."atualizar_meus_dados"("p_nome_completo" "text", "p_cargo_funcao" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."criar_perfil_novo_usuario"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
    v_nome text;
begin
    v_nome := coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'nome_completo'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
        'Usuário do sistema'
    );

    insert into public.perfis (
        id,
        nome_completo,
        email,
        perfil,
        status,
        primeiro_acesso,
        ativo
    )
    values (
        new.id,
        v_nome,
        lower(
            coalesce(
                new.email,
                new.id::text || '@sem-email.local'
            )
        ),
        'aluno',
        'pendente',
        true,
        true
    )
    on conflict (id) do nothing;

    return new;
end;
$$;


ALTER FUNCTION "public"."criar_perfil_novo_usuario"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."listar_microareas_da_ubs"("p_ubs_id" "uuid") RETURNS TABLE("id" "uuid", "codigo" "text", "nome" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
    select
        m.id,
        m.codigo,
        m.nome
    from public.microareas m
    where m.ubs_id = p_ubs_id
      and m.ativa = true
    order by
        m.codigo,
        m.nome;
$$;


ALTER FUNCTION "public"."listar_microareas_da_ubs"("p_ubs_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."meu_perfil"() RETURNS "public"."perfil_usuario"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    select p.perfil
    from public.perfis p
    where p.id = auth.uid()
      and p.ativo = true
      and p.status = 'ativo'
    limit 1;
$$;


ALTER FUNCTION "public"."meu_perfil"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."minha_microarea_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    select p.microarea_id
    from public.perfis p
    where p.id = auth.uid()
      and p.ativo = true
      and p.status = 'ativo'
    limit 1;
$$;


ALTER FUNCTION "public"."minha_microarea_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."minha_ubs_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    select p.ubs_id
    from public.perfis p
    where p.id = auth.uid()
      and p.ativo = true
      and p.status = 'ativo'
    limit 1;
$$;


ALTER FUNCTION "public"."minha_ubs_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pode_editar_gestacao"("p_gestacao_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    select exists (
        select 1
        from public.gestacoes ge
        where ge.id = p_gestacao_id
          and public.pode_editar_gestante(
              ge.gestante_id
          )
    );
$$;


ALTER FUNCTION "public"."pode_editar_gestacao"("p_gestacao_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pode_editar_gestante"("p_gestante_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    select exists (
        select 1
        from public.gestantes g
        join public.perfis p
          on p.id = auth.uid()
        where g.id = p_gestante_id
          and p.ativo = true
          and p.status = 'ativo'
          and (
                p.perfil = 'administrador'

                or (
                    p.perfil = 'equipe_ubs'
                    and p.ubs_id is not null
                    and g.ubs_id = p.ubs_id
                )
          )
    );
$$;


ALTER FUNCTION "public"."pode_editar_gestante"("p_gestante_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pode_registrar_visita"("p_gestacao_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    select exists (
        select 1
        from public.gestacoes ge
        join public.gestantes g
          on g.id = ge.gestante_id
        join public.perfis p
          on p.id = auth.uid()
        where ge.id = p_gestacao_id
          and p.ativo = true
          and p.status = 'ativo'
          and (
                p.perfil = 'administrador'

                or (
                    p.perfil = 'equipe_ubs'
                    and p.ubs_id is not null
                    and g.ubs_id = p.ubs_id
                )

                or (
                    p.perfil = 'acs'
                    and p.microarea_id is not null
                    and g.microarea_id = p.microarea_id
                )
          )
    );
$$;


ALTER FUNCTION "public"."pode_registrar_visita"("p_gestacao_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pode_visualizar_gestacao"("p_gestacao_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    select exists (
        select 1
        from public.gestacoes ge
        where ge.id = p_gestacao_id
          and public.pode_visualizar_gestante(
              ge.gestante_id
          )
    );
$$;


ALTER FUNCTION "public"."pode_visualizar_gestacao"("p_gestacao_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pode_visualizar_gestante"("p_gestante_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    select exists (
        select 1
        from public.gestantes g
        join public.perfis p
          on p.id = auth.uid()
        where g.id = p_gestante_id
          and p.ativo = true
          and p.status = 'ativo'
          and (
                p.perfil in (
                    'administrador',
                    'gestao_municipal'
                )

                or (
                    p.perfil = 'equipe_ubs'
                    and p.ubs_id is not null
                    and g.ubs_id = p.ubs_id
                )

                or (
                    p.perfil = 'acs'
                    and p.microarea_id is not null
                    and g.microarea_id = p.microarea_id
                )
          )
    );
$$;


ALTER FUNCTION "public"."pode_visualizar_gestante"("p_gestante_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sincronizar_risco_atual"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
    update public.gestacoes
    set risco_atual = new.nivel
    where id = new.gestacao_id;

    return new;
end;
$$;


ALTER FUNCTION "public"."sincronizar_risco_atual"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."usuario_eh_administrador"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    select exists (
        select 1
        from public.perfis p
        where p.id = auth.uid()
          and p.perfil = 'administrador'
          and p.ativo = true
          and p.status = 'ativo'
    );
$$;


ALTER FUNCTION "public"."usuario_eh_administrador"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."usuario_eh_gestao"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    select exists (
        select 1
        from public.perfis p
        where p.id = auth.uid()
          and p.perfil in ('administrador', 'gestao_municipal')
          and p.ativo = true
          and p.status = 'ativo'
    );
$$;


ALTER FUNCTION "public"."usuario_eh_gestao"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."usuario_esta_ativo"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    select exists (
        select 1
        from public.perfis p
        where p.id = auth.uid()
          and p.ativo = true
          and p.status = 'ativo'
    );
$$;


ALTER FUNCTION "public"."usuario_esta_ativo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validar_contexto_perfil"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
    v_ubs_microarea uuid;
begin
    if new.microarea_id is not null then
        select m.ubs_id
        into v_ubs_microarea
        from public.microareas m
        where m.id = new.microarea_id;

        if v_ubs_microarea is null then
            raise exception
                'A microárea informada não existe.';
        end if;

        if new.ubs_id is null then
            raise exception
                'Uma microárea não pode ser atribuída sem uma UBS.';
        end if;

        if v_ubs_microarea <> new.ubs_id then
            raise exception
                'A microárea selecionada não pertence à UBS informada.';
        end if;
    end if;

    if new.perfil = 'acs'
       and (
           new.ubs_id is null
           or new.microarea_id is null
       )
    then
        raise exception
            'O perfil ACS exige UBS e microárea.';
    end if;

    if new.perfil = 'equipe_ubs'
       and new.ubs_id is null
    then
        raise exception
            'O perfil Equipe UBS exige uma UBS.';
    end if;

    return new;
end;
$$;


ALTER FUNCTION "public"."validar_contexto_perfil"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validar_territorio_gestante"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
    v_ubs_microarea uuid;
begin
    if new.microarea_id is null then
        return new;
    end if;

    select m.ubs_id
    into v_ubs_microarea
    from public.microareas m
    where m.id = new.microarea_id;

    if v_ubs_microarea is null then
        raise exception
            'A microárea informada não existe.';
    end if;

    if v_ubs_microarea <> new.ubs_id then
        raise exception
            'A microárea da gestante não pertence à UBS selecionada.';
    end if;

    return new;
end;
$$;


ALTER FUNCTION "public"."validar_territorio_gestante"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "security"."usuario_eh_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  select exists (
    select 1
    from public.perfis p
    where p.id = auth.uid()
      and p.perfil::text = 'administrador'
      and p.cadastro_completo = true
      and p.aprovacao_status = 'aprovado'
      and p.status = 'ativo'
      and p.ativo = true
      and p.perfil_excluido_em is null
  )
$$;


ALTER FUNCTION "security"."usuario_eh_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "security"."usuario_pode_acessar_gestante_v18"("p_gestante_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  select exists (
    select 1
    from public.pec_gestantes g
    join public.perfis p on p.id = auth.uid()
    where g.id = p_gestante_id
      and g.excluida_em is null
      and p.ativo = true
      and p.status = 'ativo'
      and (
        p.perfil = 'administrador'
        or (
          g.ubs_id = p.ubs_id
          and g.profissional_responsavel_id = p.id
        )
      )
  )
$$;


ALTER FUNCTION "security"."usuario_pode_acessar_gestante_v18"("p_gestante_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "security"."usuario_ubs_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  select p.ubs_id
  from public.perfis p
  where p.id = auth.uid()
    and p.cadastro_completo = true
    and p.aprovacao_status = 'aprovado'
    and p.status = 'ativo'
    and p.ativo = true
    and p.perfil_excluido_em is null
  limit 1
$$;


ALTER FUNCTION "security"."usuario_ubs_id"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exames" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gestacao_id" "uuid" NOT NULL,
    "nome_exame" "text" NOT NULL,
    "codigo_exame" "text",
    "trimestre_recomendado" integer,
    "data_solicitacao" "date",
    "data_agendamento" "date",
    "data_realizacao" "date",
    "data_resultado" "date",
    "status" "public"."status_exame" DEFAULT 'solicitado'::"public"."status_exame" NOT NULL,
    "resultado_resumido" "text",
    "resultado_alterado" boolean,
    "exige_acompanhamento" boolean DEFAULT false NOT NULL,
    "solicitado_por" "uuid",
    "registrado_por" "uuid",
    "observacoes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exame_datas_validas" CHECK ((("data_solicitacao" IS NULL) OR ("data_realizacao" IS NULL) OR ("data_realizacao" >= "data_solicitacao"))),
    CONSTRAINT "exame_nome_minimo" CHECK (("char_length"(TRIM(BOTH FROM "nome_exame")) >= 2)),
    CONSTRAINT "exame_trimestre_valido" CHECK ((("trimestre_recomendado" IS NULL) OR (("trimestre_recomendado" >= 1) AND ("trimestre_recomendado" <= 3))))
);


ALTER TABLE "public"."exames" OWNER TO "postgres";


COMMENT ON TABLE "public"."exames" IS 'Exames solicitados e realizados durante a gestação.';



CREATE TABLE IF NOT EXISTS "public"."gestacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gestante_id" "uuid" NOT NULL,
    "numero_gestacao" integer DEFAULT 1 NOT NULL,
    "dum" "date",
    "dpp" "date",
    "data_inicio_pre_natal" "date",
    "idade_gestacional_inicial_semanas" integer,
    "idade_gestacional_inicial_dias" integer,
    "gestacoes_anteriores" integer DEFAULT 0 NOT NULL,
    "partos_anteriores" integer DEFAULT 0 NOT NULL,
    "abortamentos_anteriores" integer DEFAULT 0 NOT NULL,
    "risco_atual" "public"."nivel_risco_gestacional" DEFAULT 'nao_classificado'::"public"."nivel_risco_gestacional" NOT NULL,
    "status" "public"."status_gestacao" DEFAULT 'em_acompanhamento'::"public"."status_gestacao" NOT NULL,
    "data_parto" "date",
    "tipo_parto" "text",
    "local_parto" "text",
    "data_encerramento" "date",
    "motivo_encerramento" "text",
    "observacoes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gestacao_dpp_posterior_dum" CHECK ((("dum" IS NULL) OR ("dpp" IS NULL) OR ("dpp" > "dum"))),
    CONSTRAINT "gestacao_historico_valido" CHECK ((("gestacoes_anteriores" >= 0) AND ("partos_anteriores" >= 0) AND ("abortamentos_anteriores" >= 0))),
    CONSTRAINT "gestacao_idade_dias_valida" CHECK ((("idade_gestacional_inicial_dias" IS NULL) OR (("idade_gestacional_inicial_dias" >= 0) AND ("idade_gestacional_inicial_dias" <= 6)))),
    CONSTRAINT "gestacao_idade_semanas_valida" CHECK ((("idade_gestacional_inicial_semanas" IS NULL) OR (("idade_gestacional_inicial_semanas" >= 0) AND ("idade_gestacional_inicial_semanas" <= 45)))),
    CONSTRAINT "gestacao_numero_positivo" CHECK (("numero_gestacao" >= 1)),
    CONSTRAINT "gestacao_parto_posterior_dum" CHECK ((("dum" IS NULL) OR ("data_parto" IS NULL) OR ("data_parto" > "dum")))
);


ALTER TABLE "public"."gestacoes" OWNER TO "postgres";


COMMENT ON TABLE "public"."gestacoes" IS 'Registra cada gestação vinculada a uma gestante.';



CREATE TABLE IF NOT EXISTS "public"."gestantes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo_local" "text" NOT NULL,
    "nome_completo" "text" NOT NULL,
    "nome_social" "text",
    "data_nascimento" "date" NOT NULL,
    "telefone" "text",
    "telefone_alternativo" "text",
    "endereco" "text",
    "bairro" "text",
    "cep" "text",
    "ubs_id" "uuid" NOT NULL,
    "microarea_id" "uuid",
    "prontuario_pec" "text",
    "numero_sus" "text",
    "status" "public"."status_gestante" DEFAULT 'ativa'::"public"."status_gestante" NOT NULL,
    "observacoes_cadastrais" "text",
    "cadastrada_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gestante_cep_formato" CHECK ((("cep" IS NULL) OR ("replace"("cep", '-'::"text", ''::"text") ~ '^[0-9]{8}$'::"text"))),
    CONSTRAINT "gestante_data_nascimento_valida" CHECK ((("data_nascimento" >= '1900-01-01'::"date") AND ("data_nascimento" <= CURRENT_DATE))),
    CONSTRAINT "gestante_nome_minimo" CHECK (("char_length"(TRIM(BOTH FROM "nome_completo")) >= 3)),
    CONSTRAINT "gestante_numero_sus_formato" CHECK ((("numero_sus" IS NULL) OR ("replace"("numero_sus", ' '::"text", ''::"text") ~ '^[0-9]{15}$'::"text")))
);


ALTER TABLE "public"."gestantes" OWNER TO "postgres";


COMMENT ON TABLE "public"."gestantes" IS 'Cadastro principal das gestantes acompanhadas pelo sistema.';



COMMENT ON COLUMN "public"."gestantes"."codigo_local" IS 'Identificador interno utilizado pelo sistema, sem uso de CPF.';



COMMENT ON COLUMN "public"."gestantes"."numero_sus" IS 'Cartão Nacional de Saúde, quando estritamente necessário e autorizado.';



CREATE TABLE IF NOT EXISTS "public"."ubs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "nome_abreviado" "text",
    "codigo_interno" "text",
    "cnes" "text",
    "municipio" "text" DEFAULT 'Campina Grande'::"text" NOT NULL,
    "uf" character(2) DEFAULT 'PB'::"bpchar" NOT NULL,
    "endereco" "text",
    "bairro" "text",
    "telefone" "text",
    "ativa" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ubs_cnes_formato" CHECK ((("cnes" IS NULL) OR ("cnes" ~ '^[0-9]{7}$'::"text"))),
    CONSTRAINT "ubs_nome_minimo" CHECK (("char_length"(TRIM(BOTH FROM "nome")) >= 3)),
    CONSTRAINT "ubs_uf_formato" CHECK (("uf" ~ '^[A-Z]{2}$'::"text"))
);


ALTER TABLE "public"."ubs" OWNER TO "postgres";


COMMENT ON TABLE "public"."ubs" IS 'Unidades Básicas de Saúde participantes do sistema.';



COMMENT ON COLUMN "public"."ubs"."cnes" IS 'Código de sete dígitos do Cadastro Nacional de Estabelecimentos de Saúde.';



CREATE OR REPLACE VIEW "analytics"."v_alertas_exames" WITH ("security_barrier"='true') AS
 SELECT "g"."ubs_id",
    "u"."nome" AS "ubs_nome",
    "count"(*) FILTER (WHERE ("e"."status" = 'pendente'::"public"."status_exame")) AS "exames_pendentes",
    "count"(*) FILTER (WHERE ("e"."status" = 'atrasado'::"public"."status_exame")) AS "exames_atrasados",
    "count"(*) FILTER (WHERE (("e"."status" = ANY (ARRAY['pendente'::"public"."status_exame", 'atrasado'::"public"."status_exame"])) AND ("e"."exige_acompanhamento" = true))) AS "exames_prioritarios",
    "count"(*) FILTER (WHERE ("e"."resultado_alterado" = true)) AS "resultados_alterados"
   FROM ((("public"."exames" "e"
     JOIN "public"."gestacoes" "ge" ON (("ge"."id" = "e"."gestacao_id")))
     JOIN "public"."gestantes" "g" ON (("g"."id" = "ge"."gestante_id")))
     JOIN "public"."ubs" "u" ON (("u"."id" = "g"."ubs_id")))
  WHERE ("ge"."status" = 'em_acompanhamento'::"public"."status_gestacao")
  GROUP BY "g"."ubs_id", "u"."nome";


ALTER VIEW "analytics"."v_alertas_exames" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."microareas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ubs_id" "uuid" NOT NULL,
    "codigo" "text" NOT NULL,
    "nome" "text",
    "descricao" "text",
    "ativa" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "microarea_codigo_nao_vazio" CHECK (("char_length"(TRIM(BOTH FROM "codigo")) >= 1))
);


ALTER TABLE "public"."microareas" OWNER TO "postgres";


COMMENT ON TABLE "public"."microareas" IS 'Microáreas territoriais vinculadas às Unidades Básicas de Saúde.';



CREATE OR REPLACE VIEW "analytics"."v_gestacoes_base" WITH ("security_barrier"='true') AS
 SELECT "ge"."id" AS "gestacao_id",
    "g"."ubs_id",
    "u"."nome" AS "ubs_nome",
    "g"."microarea_id",
    "m"."codigo" AS "microarea_codigo",
    "m"."nome" AS "microarea_nome",
    "g"."status" AS "status_gestante",
    "ge"."status" AS "status_gestacao",
    "ge"."risco_atual",
    "ge"."dum",
    "ge"."dpp",
    "ge"."data_inicio_pre_natal",
    "ge"."data_parto",
    "ge"."data_encerramento",
        CASE
            WHEN ("ge"."dum" IS NULL) THEN NULL::integer
            ELSE ("floor"((((CURRENT_DATE - "ge"."dum"))::numeric / (7)::numeric)))::integer
        END AS "idade_gestacional_semanas",
        CASE
            WHEN ("ge"."dum" IS NULL) THEN 'não informado'::"text"
            WHEN (CURRENT_DATE < "ge"."dum") THEN 'data inconsistente'::"text"
            WHEN ((CURRENT_DATE - "ge"."dum") <= 97) THEN '1º trimestre'::"text"
            WHEN ((CURRENT_DATE - "ge"."dum") <= 195) THEN '2º trimestre'::"text"
            ELSE '3º trimestre'::"text"
        END AS "trimestre_atual",
        CASE
            WHEN (("ge"."data_inicio_pre_natal" IS NULL) OR ("ge"."dum" IS NULL)) THEN NULL::integer
            ELSE ("floor"(((("ge"."data_inicio_pre_natal" - "ge"."dum"))::numeric / (7)::numeric)))::integer
        END AS "semana_inicio_pre_natal",
        CASE
            WHEN (("ge"."data_inicio_pre_natal" IS NULL) OR ("ge"."dum" IS NULL)) THEN 'não informado'::"text"
            WHEN (("ge"."data_inicio_pre_natal" - "ge"."dum") <= 84) THEN 'até 12 semanas'::"text"
            ELSE 'após 12 semanas'::"text"
        END AS "classificacao_inicio_pre_natal",
    "ge"."created_at",
    "ge"."updated_at"
   FROM ((("public"."gestacoes" "ge"
     JOIN "public"."gestantes" "g" ON (("g"."id" = "ge"."gestante_id")))
     JOIN "public"."ubs" "u" ON (("u"."id" = "g"."ubs_id")))
     LEFT JOIN "public"."microareas" "m" ON (("m"."id" = "g"."microarea_id")));


ALTER VIEW "analytics"."v_gestacoes_base" OWNER TO "postgres";


COMMENT ON VIEW "analytics"."v_gestacoes_base" IS 'Base pseudonimizada das gestações utilizada exclusivamente para indicadores agregados.';



CREATE OR REPLACE VIEW "analytics"."v_alertas_por_ubs" WITH ("security_barrier"='true') AS
 SELECT "b"."ubs_id",
    "b"."ubs_nome",
    "count"(*) FILTER (WHERE (("b"."status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao") AND ("b"."risco_atual" = 'alto'::"public"."nivel_risco_gestacional"))) AS "gestantes_alto_risco",
    "count"(*) FILTER (WHERE (("b"."status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao") AND ("b"."risco_atual" = 'nao_classificado'::"public"."nivel_risco_gestacional"))) AS "risco_nao_classificado",
    "count"(*) FILTER (WHERE (("b"."status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao") AND ("b"."classificacao_inicio_pre_natal" = 'após 12 semanas'::"text"))) AS "inicio_pre_natal_tardio",
    "count"(*) FILTER (WHERE (("b"."status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao") AND ("b"."dpp" < CURRENT_DATE))) AS "dpp_vencida_sem_encerramento",
    "count"(*) FILTER (WHERE (("b"."status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao") AND (("b"."dpp" >= CURRENT_DATE) AND ("b"."dpp" <= (CURRENT_DATE + '30 days'::interval))))) AS "partos_previstos_30_dias",
    COALESCE("max"("a"."exames_pendentes"), (0)::bigint) AS "exames_pendentes",
    COALESCE("max"("a"."exames_atrasados"), (0)::bigint) AS "exames_atrasados",
    COALESCE("max"("a"."resultados_alterados"), (0)::bigint) AS "resultados_alterados"
   FROM ("analytics"."v_gestacoes_base" "b"
     LEFT JOIN "analytics"."v_alertas_exames" "a" ON (("a"."ubs_id" = "b"."ubs_id")))
  GROUP BY "b"."ubs_id", "b"."ubs_nome";


ALTER VIEW "analytics"."v_alertas_por_ubs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."atendimentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gestacao_id" "uuid" NOT NULL,
    "tipo" "public"."tipo_atendimento" NOT NULL,
    "data_atendimento" timestamp with time zone NOT NULL,
    "profissional_id" "uuid",
    "ubs_id" "uuid" NOT NULL,
    "peso_kg" numeric(5,2),
    "altura_m" numeric(3,2),
    "pressao_sistolica" integer,
    "pressao_diastolica" integer,
    "idade_gestacional_semanas" integer,
    "idade_gestacional_dias" integer,
    "altura_uterina_cm" numeric(4,1),
    "batimentos_cardiacos_fetais" integer,
    "conduta" "text",
    "observacoes" "text",
    "retorno_previsto" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "atendimento_altura_valida" CHECK ((("altura_m" IS NULL) OR (("altura_m" >= 0.80) AND ("altura_m" <= 2.50)))),
    CONSTRAINT "atendimento_ig_dias_valida" CHECK ((("idade_gestacional_dias" IS NULL) OR (("idade_gestacional_dias" >= 0) AND ("idade_gestacional_dias" <= 6)))),
    CONSTRAINT "atendimento_ig_semanas_valida" CHECK ((("idade_gestacional_semanas" IS NULL) OR (("idade_gestacional_semanas" >= 0) AND ("idade_gestacional_semanas" <= 45)))),
    CONSTRAINT "atendimento_peso_valido" CHECK ((("peso_kg" IS NULL) OR (("peso_kg" >= (20)::numeric) AND ("peso_kg" <= (300)::numeric)))),
    CONSTRAINT "atendimento_pressao_valida" CHECK (((("pressao_sistolica" IS NULL) AND ("pressao_diastolica" IS NULL)) OR ((("pressao_sistolica" >= 50) AND ("pressao_sistolica" <= 300)) AND (("pressao_diastolica" >= 30) AND ("pressao_diastolica" <= 200)) AND ("pressao_sistolica" > "pressao_diastolica"))))
);


ALTER TABLE "public"."atendimentos" OWNER TO "postgres";


COMMENT ON TABLE "public"."atendimentos" IS 'Consultas, acolhimentos e demais atendimentos vinculados à gestação.';



CREATE OR REPLACE VIEW "analytics"."v_atendimentos_mensais" WITH ("security_barrier"='true') AS
 SELECT "a"."ubs_id",
    "u"."nome" AS "ubs_nome",
    ("date_trunc"('month'::"text", "a"."data_atendimento"))::"date" AS "mes_referencia",
    "a"."tipo",
    "count"(*) AS "quantidade_atendimentos",
    "count"(DISTINCT "a"."gestacao_id") AS "gestacoes_atendidas"
   FROM ("public"."atendimentos" "a"
     JOIN "public"."ubs" "u" ON (("u"."id" = "a"."ubs_id")))
  GROUP BY "a"."ubs_id", "u"."nome", ("date_trunc"('month'::"text", "a"."data_atendimento")), "a"."tipo";


ALTER VIEW "analytics"."v_atendimentos_mensais" OWNER TO "postgres";


CREATE OR REPLACE VIEW "analytics"."v_distribuicao_risco" WITH ("security_barrier"='true') AS
 SELECT "ubs_id",
    "ubs_nome",
    "risco_atual" AS "nivel_risco",
    "count"(*) AS "quantidade",
    "round"(((100.0 * ("count"(*))::numeric) / NULLIF("sum"("count"(*)) OVER (PARTITION BY "ubs_id"), (0)::numeric)), 2) AS "percentual_na_ubs"
   FROM "analytics"."v_gestacoes_base"
  WHERE ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao")
  GROUP BY "ubs_id", "ubs_nome", "risco_atual";


ALTER VIEW "analytics"."v_distribuicao_risco" OWNER TO "postgres";


CREATE OR REPLACE VIEW "analytics"."v_distribuicao_trimestre" WITH ("security_barrier"='true') AS
 SELECT "ubs_id",
    "ubs_nome",
    "trimestre_atual",
    "count"(*) AS "quantidade"
   FROM "analytics"."v_gestacoes_base"
  WHERE ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao")
  GROUP BY "ubs_id", "ubs_nome", "trimestre_atual";


ALTER VIEW "analytics"."v_distribuicao_trimestre" OWNER TO "postgres";


CREATE OR REPLACE VIEW "analytics"."v_evolucao_mensal" WITH ("security_barrier"='true') AS
 SELECT "ubs_id",
    "ubs_nome",
    ("date_trunc"('month'::"text", "created_at"))::"date" AS "mes_referencia",
    "count"(*) AS "gestacoes_cadastradas",
    "count"(*) FILTER (WHERE ("risco_atual" = 'alto'::"public"."nivel_risco_gestacional")) AS "alto_risco",
    "count"(*) FILTER (WHERE ("risco_atual" = 'intermediario'::"public"."nivel_risco_gestacional")) AS "risco_intermediario",
    "count"(*) FILTER (WHERE ("risco_atual" = 'habitual'::"public"."nivel_risco_gestacional")) AS "risco_habitual"
   FROM "analytics"."v_gestacoes_base"
  GROUP BY "ubs_id", "ubs_nome", ("date_trunc"('month'::"text", "created_at"));


ALTER VIEW "analytics"."v_evolucao_mensal" OWNER TO "postgres";


CREATE OR REPLACE VIEW "analytics"."v_exames_por_status" WITH ("security_barrier"='true') AS
 SELECT "g"."ubs_id",
    "u"."nome" AS "ubs_nome",
    "e"."nome_exame",
    "e"."status",
    "count"(*) AS "quantidade",
    "count"(*) FILTER (WHERE ("e"."resultado_alterado" = true)) AS "resultados_alterados",
    "count"(*) FILTER (WHERE ("e"."exige_acompanhamento" = true)) AS "exigem_acompanhamento"
   FROM ((("public"."exames" "e"
     JOIN "public"."gestacoes" "ge" ON (("ge"."id" = "e"."gestacao_id")))
     JOIN "public"."gestantes" "g" ON (("g"."id" = "ge"."gestante_id")))
     JOIN "public"."ubs" "u" ON (("u"."id" = "g"."ubs_id")))
  GROUP BY "g"."ubs_id", "u"."nome", "e"."nome_exame", "e"."status";


ALTER VIEW "analytics"."v_exames_por_status" OWNER TO "postgres";


CREATE OR REPLACE VIEW "analytics"."v_indicadores_por_microarea" WITH ("security_barrier"='true') AS
 SELECT "ubs_id",
    "ubs_nome",
    "microarea_id",
    COALESCE("microarea_codigo", 'não informada'::"text") AS "microarea_codigo",
    COALESCE("microarea_nome", 'Não informada'::"text") AS "microarea_nome",
    "count"(*) FILTER (WHERE ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao")) AS "gestacoes_ativas",
    "count"(*) FILTER (WHERE (("risco_atual" = 'alto'::"public"."nivel_risco_gestacional") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "alto_risco",
    "count"(*) FILTER (WHERE (("risco_atual" = 'intermediario'::"public"."nivel_risco_gestacional") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "risco_intermediario",
    "count"(*) FILTER (WHERE (("classificacao_inicio_pre_natal" = 'após 12 semanas'::"text") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "inicio_tardio",
    "count"(*) FILTER (WHERE ((("dpp" >= CURRENT_DATE) AND ("dpp" <= (CURRENT_DATE + '30 days'::interval))) AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "partos_previstos_30_dias"
   FROM "analytics"."v_gestacoes_base"
  GROUP BY "ubs_id", "ubs_nome", "microarea_id", "microarea_codigo", "microarea_nome";


ALTER VIEW "analytics"."v_indicadores_por_microarea" OWNER TO "postgres";


CREATE OR REPLACE VIEW "analytics"."v_indicadores_por_ubs" WITH ("security_barrier"='true') AS
 SELECT "ubs_id",
    "ubs_nome",
    "count"(*) FILTER (WHERE ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao")) AS "gestacoes_ativas",
    "count"(*) FILTER (WHERE (("status_gestante" = 'puerpera'::"public"."status_gestante") OR ("status_gestacao" = 'parto_realizado'::"public"."status_gestacao"))) AS "puerperas",
    "count"(*) FILTER (WHERE (("risco_atual" = 'habitual'::"public"."nivel_risco_gestacional") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "risco_habitual",
    "count"(*) FILTER (WHERE (("risco_atual" = 'intermediario'::"public"."nivel_risco_gestacional") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "risco_intermediario",
    "count"(*) FILTER (WHERE (("risco_atual" = 'alto'::"public"."nivel_risco_gestacional") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "alto_risco",
    "count"(*) FILTER (WHERE (("risco_atual" = 'nao_classificado'::"public"."nivel_risco_gestacional") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "risco_nao_classificado",
    "count"(*) FILTER (WHERE (("trimestre_atual" = '1º trimestre'::"text") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "primeiro_trimestre",
    "count"(*) FILTER (WHERE (("trimestre_atual" = '2º trimestre'::"text") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "segundo_trimestre",
    "count"(*) FILTER (WHERE (("trimestre_atual" = '3º trimestre'::"text") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "terceiro_trimestre",
    "count"(*) FILTER (WHERE (("classificacao_inicio_pre_natal" = 'até 12 semanas'::"text") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "inicio_adequado",
    "count"(*) FILTER (WHERE (("classificacao_inicio_pre_natal" = 'após 12 semanas'::"text") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "inicio_tardio",
    "round"(((100.0 * ("count"(*) FILTER (WHERE (("classificacao_inicio_pre_natal" = 'até 12 semanas'::"text") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))))::numeric) / (NULLIF("count"(*) FILTER (WHERE (("classificacao_inicio_pre_natal" = ANY (ARRAY['até 12 semanas'::"text", 'após 12 semanas'::"text"])) AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))), 0))::numeric), 2) AS "percentual_inicio_adequado"
   FROM "analytics"."v_gestacoes_base"
  GROUP BY "ubs_id", "ubs_nome";


ALTER VIEW "analytics"."v_indicadores_por_ubs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "analytics"."v_resumo_geral" WITH ("security_barrier"='true') AS
 SELECT "count"(*) FILTER (WHERE ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao")) AS "gestacoes_ativas",
    "count"(*) FILTER (WHERE (("status_gestante" = 'puerpera'::"public"."status_gestante") OR ("status_gestacao" = 'parto_realizado'::"public"."status_gestacao"))) AS "puerperas",
    "count"(*) FILTER (WHERE (("risco_atual" = 'habitual'::"public"."nivel_risco_gestacional") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "risco_habitual",
    "count"(*) FILTER (WHERE (("risco_atual" = 'intermediario'::"public"."nivel_risco_gestacional") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "risco_intermediario",
    "count"(*) FILTER (WHERE (("risco_atual" = 'alto'::"public"."nivel_risco_gestacional") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "alto_risco",
    "count"(*) FILTER (WHERE (("risco_atual" = 'nao_classificado'::"public"."nivel_risco_gestacional") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "risco_nao_classificado",
    "count"(*) FILTER (WHERE (("classificacao_inicio_pre_natal" = 'até 12 semanas'::"text") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "inicio_pre_natal_adequado",
    "count"(*) FILTER (WHERE (("classificacao_inicio_pre_natal" = 'após 12 semanas'::"text") AND ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao"))) AS "inicio_pre_natal_tardio",
    "count"(DISTINCT "ubs_id") FILTER (WHERE ("status_gestacao" = 'em_acompanhamento'::"public"."status_gestacao")) AS "ubs_com_gestantes_ativas",
    "now"() AS "atualizado_em"
   FROM "analytics"."v_gestacoes_base";


ALTER VIEW "analytics"."v_resumo_geral" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visitas_domiciliares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gestacao_id" "uuid" NOT NULL,
    "acs_id" "uuid",
    "microarea_id" "uuid",
    "data_planejada" "date",
    "data_realizada" timestamp with time zone,
    "status" "public"."status_visita" DEFAULT 'planejada'::"public"."status_visita" NOT NULL,
    "motivo_visita" "text",
    "gestante_localizada" boolean,
    "orientacoes_realizadas" "text",
    "necessidades_identificadas" "text",
    "encaminhamentos" "text",
    "nova_visita_necessaria" boolean DEFAULT false NOT NULL,
    "proxima_visita_prevista" "date",
    "observacoes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "visita_realizada_exige_data" CHECK ((("status" <> 'realizada'::"public"."status_visita") OR ("data_realizada" IS NOT NULL)))
);


ALTER TABLE "public"."visitas_domiciliares" OWNER TO "postgres";


COMMENT ON TABLE "public"."visitas_domiciliares" IS 'Visitas domiciliares planejadas e realizadas por ACS ou equipe responsável.';



CREATE OR REPLACE VIEW "analytics"."v_visitas_mensais" WITH ("security_barrier"='true') AS
 SELECT "g"."ubs_id",
    "u"."nome" AS "ubs_nome",
    ("date_trunc"('month'::"text", COALESCE("vd"."data_realizada", ("vd"."data_planejada")::timestamp with time zone, "vd"."created_at")))::"date" AS "mes_referencia",
    "count"(*) AS "total_visitas",
    "count"(*) FILTER (WHERE ("vd"."status" = 'realizada'::"public"."status_visita")) AS "visitas_realizadas",
    "count"(*) FILTER (WHERE ("vd"."status" = 'planejada'::"public"."status_visita")) AS "visitas_planejadas",
    "count"(*) FILTER (WHERE ("vd"."status" = 'nao_encontrada'::"public"."status_visita")) AS "gestantes_nao_encontradas",
    "count"(*) FILTER (WHERE ("vd"."status" = 'recusada'::"public"."status_visita")) AS "visitas_recusadas",
    "count"(*) FILTER (WHERE ("vd"."nova_visita_necessaria" = true)) AS "novas_visitas_necessarias"
   FROM ((("public"."visitas_domiciliares" "vd"
     JOIN "public"."gestacoes" "ge" ON (("ge"."id" = "vd"."gestacao_id")))
     JOIN "public"."gestantes" "g" ON (("g"."id" = "ge"."gestante_id")))
     JOIN "public"."ubs" "u" ON (("u"."id" = "g"."ubs_id")))
  GROUP BY "g"."ubs_id", "u"."nome", ("date_trunc"('month'::"text", COALESCE("vd"."data_realizada", ("vd"."data_planejada")::timestamp with time zone, "vd"."created_at")));


ALTER VIEW "analytics"."v_visitas_mensais" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classificacao_risco_itens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "classificacao_id" "uuid" NOT NULL,
    "fator_codigo" "text" NOT NULL,
    "grupo" "text" NOT NULL,
    "grupo_titulo" "text" NOT NULL,
    "fator_titulo" "text" NOT NULL,
    "pontos" integer NOT NULL,
    "origem" "text" DEFAULT 'manual'::"text" NOT NULL,
    "detalhe_origem" "text",
    "automatico" boolean DEFAULT false NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."classificacao_risco_itens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classificacoes_risco_gestacional" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gestante_id" "uuid" NOT NULL,
    "instrumento_versao" "text" NOT NULL,
    "trimestre" smallint NOT NULL,
    "peso_kg" numeric(8,2),
    "altura_cm" numeric(8,2),
    "imc" numeric(8,2),
    "faixa_imc" "text" NOT NULL,
    "pontos_individuais" integer DEFAULT 0 NOT NULL,
    "pontos_imc" integer DEFAULT 0 NOT NULL,
    "pontos_clinicos" integer DEFAULT 0 NOT NULL,
    "score_total" integer DEFAULT 0 NOT NULL,
    "classificacao" "text" NOT NULL,
    "conduta_sugerida" "text" NOT NULL,
    "observacao" "text",
    "profissional_id" "uuid" NOT NULL,
    "profissional_nome_snapshot" "text" NOT NULL,
    "perfil_snapshot" "text" NOT NULL,
    "ubs_origem_profissional_id" "uuid",
    "ubs_origem_nome_snapshot" "text" NOT NULL,
    "ubs_atendimento_id" "uuid",
    "ubs_atendimento_nome_snapshot" "text" NOT NULL,
    "realizada_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'finalizada'::"text" NOT NULL,
    CONSTRAINT "classificacoes_risco_gestacional_status_check" CHECK (("status" = ANY (ARRAY['finalizada'::"text", 'cancelada'::"text"]))),
    CONSTRAINT "classificacoes_risco_gestacional_trimestre_check" CHECK ((("trimestre" >= 1) AND ("trimestre" <= 3)))
);


ALTER TABLE "public"."classificacoes_risco_gestacional" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pec_gestantes" (
    "id" "uuid" NOT NULL,
    "codigo" "text" NOT NULL,
    "ubs_id" "uuid" NOT NULL,
    "microarea_id" "uuid",
    "idade_anos" integer,
    "ano_nascimento" integer,
    "sexo" "text",
    "identidade_genero" "text",
    "raca_cor" "text",
    "bolsa_familia" boolean,
    "vigencia_bolsa_familia" "date",
    "risco_gestacional" "text",
    "dum" "date",
    "ig_dum_semanas" integer,
    "ig_dum_dias" integer,
    "dpp_dum" "date",
    "ig_ecografia_semanas" integer,
    "ig_ecografia_dias" integer,
    "dpp_ecografia" "date",
    "peso_kg" numeric(7,2),
    "altura_cm" numeric(7,2),
    "pressao_arterial" "text",
    "data_ultima_pressao" "date",
    "data_ultimo_peso_altura" "date",
    "atendimentos_pre_natal" integer,
    "atendimentos_ate_12_semanas" integer,
    "ultima_consulta_pre_natal" "date",
    "atendimentos_odontologicos" integer,
    "dtpa" "text",
    "medicoes_altura_uterina" integer,
    "medicoes_pressao" integer,
    "medicoes_peso_altura" integer,
    "exame_hiv_primeiro" "text",
    "exame_sifilis_primeiro" "text",
    "exame_hepatite_b_primeiro" "text",
    "exame_hepatite_c_primeiro" "text",
    "exame_hiv_terceiro" "text",
    "exame_sifilis_terceiro" "text",
    "visitas_pre_natal" integer,
    "visitas_puerperio" integer,
    "atendimentos_puerperio" integer,
    "ultima_consulta_puerperio" "date",
    "dias_ultimo_atendimento_medico" integer,
    "dias_ultimo_atendimento_enfermagem" integer,
    "dias_ultimo_atendimento_odontologico" integer,
    "dias_ultima_visita" integer,
    "dados_extras" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "importacao_id" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inicio_pre_natal" "date",
    "situacao_acompanhamento" "text" DEFAULT 'gestacao_em_curso'::"text" NOT NULL,
    "data_parto" "date",
    "tipo_parto" "text",
    "alta_ativa" boolean DEFAULT false NOT NULL,
    "alta_data" "date",
    "alta_motivo" "text",
    "alta_situacao_final" "text",
    "alta_observacao" "text",
    "cadastro_origem" "text" DEFAULT 'pec'::"text" NOT NULL,
    "fontes_campos" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "bloqueios_manuais" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "atualizado_manualmente_em" timestamp with time zone,
    "atualizado_manualmente_por" "uuid",
    "profissional_responsavel_id" "uuid",
    "excluida_em" timestamp with time zone,
    "excluida_por" "uuid",
    "exclusao_motivo" "text",
    "exclusao_definitiva_prevista_em" timestamp with time zone,
    CONSTRAINT "pec_gestantes_situacao_acompanhamento_check" CHECK (("situacao_acompanhamento" = ANY (ARRAY['gestacao_em_curso'::"text", 'puerperio'::"text", 'alta'::"text"])))
);


ALTER TABLE "public"."pec_gestantes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "analytics"."vw_fatores_risco_v18" AS
 WITH "ultima_classificacao" AS (
         SELECT DISTINCT ON ("c"."gestante_id") "c"."id",
            "c"."gestante_id",
            "c"."classificacao",
            "c"."realizada_em"
           FROM "public"."classificacoes_risco_gestacional" "c"
          WHERE ("c"."status" = 'finalizada'::"text")
          ORDER BY "c"."gestante_id", "c"."realizada_em" DESC
        )
 SELECT "g"."ubs_id",
    "g"."profissional_responsavel_id",
    "uc"."classificacao",
    "i"."grupo",
    "i"."fator_titulo",
    "i"."pontos",
    "i"."automatico",
    "uc"."realizada_em"
   FROM (("ultima_classificacao" "uc"
     JOIN "public"."pec_gestantes" "g" ON (("g"."id" = "uc"."gestante_id")))
     JOIN "public"."classificacao_risco_itens" "i" ON (("i"."classificacao_id" = "uc"."id")))
  WHERE (("i"."fator_codigo" <> 'g2_imc'::"text") AND ("g"."excluida_em" IS NULL));


ALTER VIEW "analytics"."vw_fatores_risco_v18" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."config_exames_pre_natal" (
    "codigo" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "trimestre" smallint NOT NULL,
    "semana_inicio" smallint,
    "semana_fim" smallint,
    "condicao_aplicacao" "text",
    "ordem" integer DEFAULT 0 NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "versao_referencia" "text" DEFAULT 'Protocolo local informado pela equipe'::"text" NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "config_exames_pre_natal_trimestre_check" CHECK ((("trimestre" >= 1) AND ("trimestre" <= 3)))
);


ALTER TABLE "public"."config_exames_pre_natal" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gestante_exames" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gestante_id" "uuid" NOT NULL,
    "codigo" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "trimestre" smallint NOT NULL,
    "status" "text" DEFAULT 'nao_informado'::"text" NOT NULL,
    "data_solicitacao" "date",
    "data_realizacao" "date",
    "resultado_resumido" "text",
    "observacao" "text",
    "origem" "text" DEFAULT 'manual'::"text" NOT NULL,
    "profissional_id" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gestante_exames_origem_check" CHECK (("origem" = ANY (ARRAY['manual'::"text", 'pec'::"text", 'migracao'::"text"]))),
    CONSTRAINT "gestante_exames_status_check" CHECK (("status" = ANY (ARRAY['nao_informado'::"text", 'pendente'::"text", 'solicitado'::"text", 'realizado'::"text", 'resultado_alterado'::"text", 'nao_se_aplica'::"text"]))),
    CONSTRAINT "gestante_exames_trimestre_check" CHECK ((("trimestre" >= 1) AND ("trimestre" <= 3)))
);


ALTER TABLE "public"."gestante_exames" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gestante_vacinas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gestante_id" "uuid" NOT NULL,
    "codigo" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "status" "text" DEFAULT 'nao_informado'::"text" NOT NULL,
    "dose" "text" DEFAULT 'dose_unica'::"text" NOT NULL,
    "data_aplicacao" "date",
    "lote" "text",
    "unidade_aplicadora" "text",
    "observacao" "text",
    "origem" "text" DEFAULT 'manual'::"text" NOT NULL,
    "profissional_id" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gestante_vacinas_origem_check" CHECK (("origem" = ANY (ARRAY['manual'::"text", 'pec'::"text", 'migracao'::"text"]))),
    CONSTRAINT "gestante_vacinas_status_check" CHECK (("status" = ANY (ARRAY['nao_informado'::"text", 'pendente'::"text", 'agendada'::"text", 'realizada'::"text", 'nao_se_aplica'::"text"])))
);


ALTER TABLE "public"."gestante_vacinas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "analytics"."vw_indicadores_base_v18" AS
 SELECT "g"."ubs_id",
    "g"."profissional_responsavel_id",
    "m"."codigo" AS "microarea",
    (NOT COALESCE("g"."alta_ativa", false)) AS "ativa",
    COALESCE("g"."alta_ativa", false) AS "alta",
        CASE
            WHEN ("lower"(COALESCE("g"."risco_gestacional", ''::"text")) ~~ '%alto%'::"text") THEN 'Alto risco'::"text"
            WHEN (("lower"(COALESCE("g"."risco_gestacional", ''::"text")) ~~ '%inter%'::"text") OR ("lower"(COALESCE("g"."risco_gestacional", ''::"text")) ~~ '%médio%'::"text") OR ("lower"(COALESCE("g"."risco_gestacional", ''::"text")) ~~ '%medio%'::"text")) THEN 'Médio risco'::"text"
            WHEN (("lower"(COALESCE("g"."risco_gestacional", ''::"text")) ~~ '%habit%'::"text") OR ("lower"(COALESCE("g"."risco_gestacional", ''::"text")) ~~ '%baixo%'::"text")) THEN 'Risco habitual'::"text"
            ELSE 'Não classificado'::"text"
        END AS "risco_categoria",
        CASE
            WHEN (COALESCE("g"."atendimentos_ate_12_semanas", 0) > 0) THEN 'Precoce (≤12 sem)'::"text"
            WHEN (("g"."inicio_pre_natal" IS NOT NULL) AND ("g"."dum" IS NOT NULL) AND ("g"."inicio_pre_natal" <= ("g"."dum" + 84))) THEN 'Precoce (≤12 sem)'::"text"
            WHEN (("g"."inicio_pre_natal" IS NOT NULL) AND ("g"."dum" IS NOT NULL) AND ("g"."inicio_pre_natal" > ("g"."dum" + 84))) THEN 'Tardia (>12 sem)'::"text"
            ELSE 'Sem dados'::"text"
        END AS "captacao_categoria",
        CASE
            WHEN (COALESCE("g"."atendimentos_pre_natal", 0) <= 3) THEN 'Crítico (0–3)'::"text"
            WHEN ((COALESCE("g"."atendimentos_pre_natal", 0) >= 4) AND (COALESCE("g"."atendimentos_pre_natal", 0) <= 6)) THEN 'Intermediário (4–6)'::"text"
            ELSE 'Meta (7+)'::"text"
        END AS "consultas_categoria",
        CASE
            WHEN ((COALESCE("g"."ig_dum_semanas", "g"."ig_ecografia_semanas", 0) >= 1) AND (COALESCE("g"."ig_dum_semanas", "g"."ig_ecografia_semanas", 0) <= 13)) THEN '1º trimestre'::"text"
            WHEN ((COALESCE("g"."ig_dum_semanas", "g"."ig_ecografia_semanas", 0) >= 14) AND (COALESCE("g"."ig_dum_semanas", "g"."ig_ecografia_semanas", 0) <= 27)) THEN '2º trimestre'::"text"
            WHEN (COALESCE("g"."ig_dum_semanas", "g"."ig_ecografia_semanas", 0) >= 28) THEN '3º trimestre'::"text"
            ELSE 'IG não informada'::"text"
        END AS "trimestre",
    ("date_trunc"('month'::"text", (COALESCE("g"."dpp_dum", "g"."dpp_ecografia"))::timestamp with time zone))::"date" AS "mes_dpp",
    ( SELECT ("count"(*))::integer AS "count"
           FROM "public"."config_exames_pre_natal" "ce"
          WHERE (("ce"."ativo" = true) AND ("ce"."trimestre" <=
                CASE
                    WHEN (COALESCE("g"."ig_dum_semanas", "g"."ig_ecografia_semanas", 0) <= 13) THEN 1
                    WHEN (COALESCE("g"."ig_dum_semanas", "g"."ig_ecografia_semanas", 0) <= 27) THEN 2
                    ELSE 3
                END) AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."gestante_exames" "ge"
                  WHERE (("ge"."gestante_id" = "g"."id") AND ("ge"."codigo" = "ce"."codigo") AND ("ge"."status" = ANY (ARRAY['realizado'::"text", 'nao_se_aplica'::"text"])))))))) AS "exames_pendentes",
        CASE
            WHEN ((COALESCE("g"."ig_dum_semanas", "g"."ig_ecografia_semanas", 0) >= 20) AND (NOT (EXISTS ( SELECT 1
               FROM "public"."gestante_vacinas" "gv"
              WHERE (("gv"."gestante_id" = "g"."id") AND ("gv"."codigo" = 'dtpa'::"text") AND ("gv"."status" = 'realizada'::"text")))))) THEN true
            ELSE false
        END AS "dtpa_pendente",
    "g"."atualizado_em"
   FROM ("public"."pec_gestantes" "g"
     LEFT JOIN "public"."microareas" "m" ON (("m"."id" = "g"."microarea_id")))
  WHERE ("g"."excluida_em" IS NULL);


ALTER VIEW "analytics"."vw_indicadores_base_v18" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."acessos_identidade_gestantes" (
    "id" bigint NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "ubs_id" "uuid",
    "perfil" "text" NOT NULL,
    "finalidade" "text" DEFAULT 'assistencia_na_ubs'::"text" NOT NULL,
    "total_registros" integer DEFAULT 0 NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "private"."acessos_identidade_gestantes" OWNER TO "postgres";


ALTER TABLE "private"."acessos_identidade_gestantes" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "private"."acessos_identidade_gestantes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "private"."auditoria_avisos_v20" (
    "id" bigint NOT NULL,
    "aviso_id" "uuid",
    "usuario_id" "uuid",
    "acao" "text" NOT NULL,
    "metadados" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "private"."auditoria_avisos_v20" OWNER TO "postgres";


ALTER TABLE "private"."auditoria_avisos_v20" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "private"."auditoria_avisos_v20_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "private"."auditoria_exclusoes_gestantes" (
    "id" bigint NOT NULL,
    "gestante_hash" "text" NOT NULL,
    "usuario_id" "uuid",
    "ubs_id" "uuid",
    "acao" "text" NOT NULL,
    "motivo" "text",
    "metadados" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "auditoria_exclusoes_gestantes_acao_check" CHECK (("acao" = ANY (ARRAY['mover_lixeira'::"text", 'restaurar'::"text", 'excluir_definitivamente'::"text", 'expiracao_automatica'::"text"])))
);


ALTER TABLE "private"."auditoria_exclusoes_gestantes" OWNER TO "postgres";


ALTER TABLE "private"."auditoria_exclusoes_gestantes" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "private"."auditoria_exclusoes_gestantes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "private"."auditoria_perfis_v20" (
    "id" bigint NOT NULL,
    "administrador_id" "uuid",
    "perfil_alvo_id" "uuid",
    "acao" "text" NOT NULL,
    "antes" "jsonb",
    "depois" "jsonb",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "private"."auditoria_perfis_v20" OWNER TO "postgres";


ALTER TABLE "private"."auditoria_perfis_v20" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "private"."auditoria_perfis_v20_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "private"."auditoria_visitas_acs_v21" (
    "id" bigint NOT NULL,
    "visita_id" "uuid",
    "acs_id" "uuid",
    "gestante_hash" "text",
    "acao" "text" NOT NULL,
    "antes" "jsonb",
    "depois" "jsonb",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "private"."auditoria_visitas_acs_v21" OWNER TO "postgres";


ALTER TABLE "private"."auditoria_visitas_acs_v21" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "private"."auditoria_visitas_acs_v21_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "private"."historico_classificacoes_risco" (
    "id" bigint NOT NULL,
    "classificacao_id" "uuid" NOT NULL,
    "gestante_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "acao" "text" NOT NULL,
    "payload" "jsonb",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "private"."historico_classificacoes_risco" OWNER TO "postgres";


ALTER TABLE "private"."historico_classificacoes_risco" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "private"."historico_classificacoes_risco_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "private"."historico_clinico_gestantes" (
    "id" bigint NOT NULL,
    "gestante_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "ubs_id" "uuid",
    "acao" "text" NOT NULL,
    "origem" "text" DEFAULT 'manual'::"text" NOT NULL,
    "antes" "jsonb",
    "depois" "jsonb",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "private"."historico_clinico_gestantes" OWNER TO "postgres";


ALTER TABLE "private"."historico_clinico_gestantes" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "private"."historico_clinico_gestantes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "private"."identidades_gestantes" (
    "gestante_id" "uuid" NOT NULL,
    "identidade_hash" "text" NOT NULL,
    "ubs_id" "uuid" NOT NULL,
    "nome_enc" "bytea",
    "data_nascimento_enc" "bytea",
    "cpf_enc" "bytea",
    "cns_enc" "bytea",
    "telefones_enc" "bytea",
    "endereco_enc" "bytea",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bloqueios_manuais" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "atualizado_manualmente_em" timestamp with time zone,
    "atualizado_manualmente_por" "uuid"
);


ALTER TABLE "private"."identidades_gestantes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."importacao_pec_erros" (
    "id" bigint NOT NULL,
    "importacao_id" "uuid" NOT NULL,
    "numero_linha" integer NOT NULL,
    "codigo_erro" "text",
    "mensagem" "text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "private"."importacao_pec_erros" OWNER TO "postgres";


ALTER TABLE "private"."importacao_pec_erros" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "private"."importacao_pec_erros_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "private"."importacao_pec_linhas_raw" (
    "id" bigint NOT NULL,
    "importacao_id" "uuid" NOT NULL,
    "numero_linha" integer NOT NULL,
    "dados_raw" "jsonb" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "private"."importacao_pec_linhas_raw" OWNER TO "postgres";


ALTER TABLE "private"."importacao_pec_linhas_raw" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "private"."importacao_pec_linhas_raw_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."avisos_ubs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ubs_id" "uuid",
    "titulo" "text" NOT NULL,
    "mensagem" "text" NOT NULL,
    "tipo" "text" DEFAULT 'informativo'::"text" NOT NULL,
    "criado_por" "uuid" NOT NULL,
    "publicado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expira_em" timestamp with time zone,
    "removido_em" timestamp with time zone,
    "removido_por" "uuid",
    "publico" "text" DEFAULT 'todos'::"text" NOT NULL,
    CONSTRAINT "avisos_ubs_publico_v21_check" CHECK (("publico" = ANY (ARRAY['todos'::"text", 'profissionais'::"text", 'acs'::"text", 'gestao'::"text"]))),
    CONSTRAINT "avisos_ubs_tipo_check" CHECK (("tipo" = ANY (ARRAY['informativo'::"text", 'alerta'::"text", 'sucesso'::"text"])))
);


ALTER TABLE "public"."avisos_ubs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classificacoes_risco" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gestacao_id" "uuid" NOT NULL,
    "nivel" "public"."nivel_risco_gestacional" NOT NULL,
    "protocolo" "text",
    "versao_protocolo" "text",
    "fatores_identificados" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "justificativa" "text",
    "classificada_por" "uuid",
    "data_classificacao" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revisada" boolean DEFAULT false NOT NULL,
    "revisada_por" "uuid",
    "data_revisao" timestamp with time zone,
    "observacoes_revisao" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."classificacoes_risco" OWNER TO "postgres";


COMMENT ON TABLE "public"."classificacoes_risco" IS 'Histórico de classificações de risco gestacional e respectivas justificativas.';



CREATE TABLE IF NOT EXISTS "public"."config_fatores_risco_gestacional" (
    "codigo" "text" NOT NULL,
    "grupo" "text" NOT NULL,
    "grupo_titulo" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "pontos" integer NOT NULL,
    "grupo_ordem" integer NOT NULL,
    "ordem" integer NOT NULL,
    "versao" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "config_fatores_risco_gestacional_grupo_check" CHECK (("grupo" = ANY (ARRAY['g1'::"text", 'g3'::"text", 'g4'::"text", 'g5'::"text"]))),
    CONSTRAINT "config_fatores_risco_gestacional_pontos_check" CHECK (("pontos" >= 0))
);


ALTER TABLE "public"."config_fatores_risco_gestacional" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."config_vacinas_gestante" (
    "codigo" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "semana_inicio" smallint,
    "semana_fim" smallint,
    "condicao_aplicacao" "text",
    "ordem" integer DEFAULT 0 NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "versao_referencia" "text" DEFAULT 'Calendário Nacional de Vacinação 2026'::"text" NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."config_vacinas_gestante" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credenciais_temporarias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "login" "text" NOT NULL,
    "password_cipher" "bytea" NOT NULL,
    "deve_trocar_senha" boolean DEFAULT true NOT NULL,
    "ativa" boolean DEFAULT true NOT NULL,
    "expira_em" timestamp with time zone,
    "visualizada_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "credenciais_login_minimo" CHECK (("char_length"(TRIM(BOTH FROM "login")) >= 3))
);


ALTER TABLE "public"."credenciais_temporarias" OWNER TO "postgres";


COMMENT ON TABLE "public"."credenciais_temporarias" IS 'Credenciais provisórias destinadas exclusivamente a usuários de teste durante a construção do sistema.';



COMMENT ON COLUMN "public"."credenciais_temporarias"."password_cipher" IS 'Senha provisória criptografada. Nunca deve receber senha em texto aberto.';



CREATE TABLE IF NOT EXISTS "public"."gestante_altas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gestante_id" "uuid" NOT NULL,
    "data_alta" "date" NOT NULL,
    "motivo" "text" NOT NULL,
    "situacao_final" "text",
    "observacao" "text",
    "ubs_id" "uuid" NOT NULL,
    "profissional_id" "uuid" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gestante_altas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gestante_consultas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gestante_id" "uuid" NOT NULL,
    "data_atendimento" "date" NOT NULL,
    "tipo_atendimento" "text" DEFAULT 'pre_natal'::"text" NOT NULL,
    "observacao" "text",
    "origem" "text" DEFAULT 'manual'::"text" NOT NULL,
    "profissional_id" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gestante_consultas_origem_check" CHECK (("origem" = ANY (ARRAY['manual'::"text", 'pec'::"text", 'migracao'::"text"])))
);


ALTER TABLE "public"."gestante_consultas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."importacoes_pec_resumo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ubs_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "arquivo_nome" "text" NOT NULL,
    "arquivo_sha256" "text" NOT NULL,
    "linha_cabecalho" integer NOT NULL,
    "total_linhas" integer DEFAULT 0 NOT NULL,
    "total_processadas" integer DEFAULT 0 NOT NULL,
    "total_erros" integer DEFAULT 0 NOT NULL,
    "mapeamento" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "avisos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'processando'::"text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "concluido_em" timestamp with time zone,
    CONSTRAINT "importacoes_pec_resumo_status_check" CHECK (("status" = ANY (ARRAY['processando'::"text", 'concluida'::"text", 'concluida_com_erros'::"text", 'falhou'::"text"])))
);


ALTER TABLE "public"."importacoes_pec_resumo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visitas_acs_v21" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gestante_id" "uuid" NOT NULL,
    "acs_id" "uuid" NOT NULL,
    "ubs_id" "uuid" NOT NULL,
    "microarea_id" "uuid" NOT NULL,
    "data_acao" "date" DEFAULT CURRENT_DATE NOT NULL,
    "compareceu" boolean DEFAULT true NOT NULL,
    "motivo_falta" "text",
    "orientacoes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "sinais_alerta" boolean DEFAULT false NOT NULL,
    "observacao" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "removido_em" timestamp with time zone,
    "removido_por" "uuid"
);


ALTER TABLE "public"."visitas_acs_v21" OWNER TO "postgres";


ALTER TABLE ONLY "private"."acessos_identidade_gestantes"
    ADD CONSTRAINT "acessos_identidade_gestantes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."auditoria_avisos_v20"
    ADD CONSTRAINT "auditoria_avisos_v20_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."auditoria_exclusoes_gestantes"
    ADD CONSTRAINT "auditoria_exclusoes_gestantes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."auditoria_perfis_v20"
    ADD CONSTRAINT "auditoria_perfis_v20_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."auditoria_visitas_acs_v21"
    ADD CONSTRAINT "auditoria_visitas_acs_v21_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."historico_classificacoes_risco"
    ADD CONSTRAINT "historico_classificacoes_risco_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."historico_clinico_gestantes"
    ADD CONSTRAINT "historico_clinico_gestantes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."identidades_gestantes"
    ADD CONSTRAINT "identidades_gestantes_identidade_hash_key" UNIQUE ("identidade_hash");



ALTER TABLE ONLY "private"."identidades_gestantes"
    ADD CONSTRAINT "identidades_gestantes_pkey" PRIMARY KEY ("gestante_id");



ALTER TABLE ONLY "private"."importacao_pec_erros"
    ADD CONSTRAINT "importacao_pec_erros_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."importacao_pec_linhas_raw"
    ADD CONSTRAINT "importacao_pec_linhas_raw_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."atendimentos"
    ADD CONSTRAINT "atendimentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."avisos_ubs"
    ADD CONSTRAINT "avisos_ubs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classificacao_risco_itens"
    ADD CONSTRAINT "classificacao_risco_itens_classificacao_id_fator_codigo_key" UNIQUE ("classificacao_id", "fator_codigo");



ALTER TABLE ONLY "public"."classificacao_risco_itens"
    ADD CONSTRAINT "classificacao_risco_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classificacoes_risco_gestacional"
    ADD CONSTRAINT "classificacoes_risco_gestacional_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classificacoes_risco"
    ADD CONSTRAINT "classificacoes_risco_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."config_exames_pre_natal"
    ADD CONSTRAINT "config_exames_pre_natal_pkey" PRIMARY KEY ("codigo");



ALTER TABLE ONLY "public"."config_fatores_risco_gestacional"
    ADD CONSTRAINT "config_fatores_risco_gestacional_pkey" PRIMARY KEY ("codigo");



ALTER TABLE ONLY "public"."config_vacinas_gestante"
    ADD CONSTRAINT "config_vacinas_gestante_pkey" PRIMARY KEY ("codigo");



ALTER TABLE ONLY "public"."credenciais_temporarias"
    ADD CONSTRAINT "credenciais_login_unique" UNIQUE ("login");



ALTER TABLE ONLY "public"."credenciais_temporarias"
    ADD CONSTRAINT "credenciais_temporarias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exames"
    ADD CONSTRAINT "exames_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gestacoes"
    ADD CONSTRAINT "gestacao_numero_por_gestante_unique" UNIQUE ("gestante_id", "numero_gestacao");



ALTER TABLE ONLY "public"."gestacoes"
    ADD CONSTRAINT "gestacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gestante_altas"
    ADD CONSTRAINT "gestante_altas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gestante_consultas"
    ADD CONSTRAINT "gestante_consultas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gestante_exames"
    ADD CONSTRAINT "gestante_exames_gestante_id_codigo_trimestre_key" UNIQUE ("gestante_id", "codigo", "trimestre");



ALTER TABLE ONLY "public"."gestante_exames"
    ADD CONSTRAINT "gestante_exames_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gestante_vacinas"
    ADD CONSTRAINT "gestante_vacinas_gestante_id_codigo_dose_key" UNIQUE ("gestante_id", "codigo", "dose");



ALTER TABLE ONLY "public"."gestante_vacinas"
    ADD CONSTRAINT "gestante_vacinas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gestantes"
    ADD CONSTRAINT "gestantes_codigo_local_key" UNIQUE ("codigo_local");



ALTER TABLE ONLY "public"."gestantes"
    ADD CONSTRAINT "gestantes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."importacoes_pec_resumo"
    ADD CONSTRAINT "importacoes_pec_resumo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."microareas"
    ADD CONSTRAINT "microarea_codigo_por_ubs_unique" UNIQUE ("ubs_id", "codigo");



ALTER TABLE ONLY "public"."microareas"
    ADD CONSTRAINT "microareas_id_ubs_unique" UNIQUE ("id", "ubs_id");



ALTER TABLE ONLY "public"."microareas"
    ADD CONSTRAINT "microareas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pec_gestantes"
    ADD CONSTRAINT "pec_gestantes_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."pec_gestantes"
    ADD CONSTRAINT "pec_gestantes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ubs"
    ADD CONSTRAINT "ubs_cnes_key" UNIQUE ("cnes");



ALTER TABLE ONLY "public"."ubs"
    ADD CONSTRAINT "ubs_codigo_interno_key" UNIQUE ("codigo_interno");



ALTER TABLE ONLY "public"."ubs"
    ADD CONSTRAINT "ubs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visitas_acs_v21"
    ADD CONSTRAINT "visitas_acs_v21_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visitas_domiciliares"
    ADD CONSTRAINT "visitas_domiciliares_pkey" PRIMARY KEY ("id");



CREATE INDEX "avisos_ubs_validos_idx" ON "public"."avisos_ubs" USING "btree" ("ubs_id", "publicado_em" DESC) WHERE ("removido_em" IS NULL);



CREATE INDEX "classificacoes_risco_gestante_idx" ON "public"."classificacoes_risco_gestacional" USING "btree" ("gestante_id", "realizada_em" DESC);



CREATE INDEX "gestante_altas_gestante_idx" ON "public"."gestante_altas" USING "btree" ("gestante_id", "data_alta" DESC);



CREATE INDEX "gestante_consultas_gestante_data_idx" ON "public"."gestante_consultas" USING "btree" ("gestante_id", "data_atendimento" DESC);



CREATE INDEX "gestante_exames_gestante_idx" ON "public"."gestante_exames" USING "btree" ("gestante_id", "trimestre", "codigo");



CREATE INDEX "gestante_vacinas_gestante_idx" ON "public"."gestante_vacinas" USING "btree" ("gestante_id", "codigo");



CREATE INDEX "idx_atendimentos_data" ON "public"."atendimentos" USING "btree" ("data_atendimento" DESC);



CREATE INDEX "idx_atendimentos_gestacao" ON "public"."atendimentos" USING "btree" ("gestacao_id");



CREATE INDEX "idx_atendimentos_profissional" ON "public"."atendimentos" USING "btree" ("profissional_id");



CREATE INDEX "idx_atendimentos_ubs" ON "public"."atendimentos" USING "btree" ("ubs_id");



CREATE INDEX "idx_classificacoes_data" ON "public"."classificacoes_risco" USING "btree" ("data_classificacao" DESC);



CREATE INDEX "idx_classificacoes_gestacao" ON "public"."classificacoes_risco" USING "btree" ("gestacao_id");



CREATE INDEX "idx_classificacoes_nivel" ON "public"."classificacoes_risco" USING "btree" ("nivel");



CREATE INDEX "idx_credenciais_ativas" ON "public"."credenciais_temporarias" USING "btree" ("ativa");



CREATE INDEX "idx_credenciais_usuario" ON "public"."credenciais_temporarias" USING "btree" ("usuario_id");



CREATE INDEX "idx_exames_data_solicitacao" ON "public"."exames" USING "btree" ("data_solicitacao");



CREATE INDEX "idx_exames_gestacao" ON "public"."exames" USING "btree" ("gestacao_id");



CREATE INDEX "idx_exames_nome" ON "public"."exames" USING "btree" ("lower"("nome_exame"));



CREATE INDEX "idx_exames_status" ON "public"."exames" USING "btree" ("status");



CREATE INDEX "idx_gestacoes_dpp" ON "public"."gestacoes" USING "btree" ("dpp");



CREATE INDEX "idx_gestacoes_gestante" ON "public"."gestacoes" USING "btree" ("gestante_id");



CREATE INDEX "idx_gestacoes_risco" ON "public"."gestacoes" USING "btree" ("risco_atual");



CREATE INDEX "idx_gestacoes_status" ON "public"."gestacoes" USING "btree" ("status");



CREATE INDEX "idx_gestantes_microarea" ON "public"."gestantes" USING "btree" ("microarea_id");



CREATE INDEX "idx_gestantes_nome" ON "public"."gestantes" USING "btree" ("lower"("nome_completo"));



CREATE INDEX "idx_gestantes_prontuario_pec" ON "public"."gestantes" USING "btree" ("prontuario_pec") WHERE ("prontuario_pec" IS NOT NULL);



CREATE INDEX "idx_gestantes_status" ON "public"."gestantes" USING "btree" ("status");



CREATE INDEX "idx_gestantes_ubs" ON "public"."gestantes" USING "btree" ("ubs_id");



CREATE INDEX "idx_gestantes_ubs_microarea" ON "public"."gestantes" USING "btree" ("ubs_id", "microarea_id");



CREATE INDEX "idx_microareas_ativas" ON "public"."microareas" USING "btree" ("ativa");



CREATE INDEX "idx_microareas_ubs" ON "public"."microareas" USING "btree" ("ubs_id");



CREATE INDEX "idx_microareas_ubs_codigo" ON "public"."microareas" USING "btree" ("ubs_id", "codigo");



CREATE UNIQUE INDEX "idx_perfis_email_unique" ON "public"."perfis" USING "btree" ("lower"("email"));



CREATE INDEX "idx_perfis_microarea" ON "public"."perfis" USING "btree" ("microarea_id");



CREATE INDEX "idx_perfis_perfil" ON "public"."perfis" USING "btree" ("perfil");



CREATE INDEX "idx_perfis_status" ON "public"."perfis" USING "btree" ("status");



CREATE INDEX "idx_perfis_ubs" ON "public"."perfis" USING "btree" ("ubs_id");



CREATE INDEX "idx_perfis_ubs_microarea" ON "public"."perfis" USING "btree" ("ubs_id", "microarea_id");



CREATE INDEX "idx_perfis_ubs_perfil" ON "public"."perfis" USING "btree" ("ubs_id", "perfil");



CREATE INDEX "idx_ubs_ativa" ON "public"."ubs" USING "btree" ("ativa");



CREATE INDEX "idx_ubs_nome" ON "public"."ubs" USING "btree" ("nome");



CREATE UNIQUE INDEX "idx_ubs_nome_municipio_unique" ON "public"."ubs" USING "btree" ("lower"(TRIM(BOTH FROM "nome")), "lower"(TRIM(BOTH FROM "municipio")));



CREATE INDEX "idx_visitas_acs" ON "public"."visitas_domiciliares" USING "btree" ("acs_id");



CREATE INDEX "idx_visitas_data_planejada" ON "public"."visitas_domiciliares" USING "btree" ("data_planejada");



CREATE INDEX "idx_visitas_gestacao" ON "public"."visitas_domiciliares" USING "btree" ("gestacao_id");



CREATE INDEX "idx_visitas_microarea" ON "public"."visitas_domiciliares" USING "btree" ("microarea_id");



CREATE INDEX "idx_visitas_status" ON "public"."visitas_domiciliares" USING "btree" ("status");



CREATE INDEX "pec_gestantes_alta_idx" ON "public"."pec_gestantes" USING "btree" ("ubs_id", "alta_ativa");



CREATE INDEX "pec_gestantes_lixeira_idx" ON "public"."pec_gestantes" USING "btree" ("profissional_responsavel_id", "exclusao_definitiva_prevista_em") WHERE ("excluida_em" IS NOT NULL);



CREATE INDEX "pec_gestantes_microarea_idx" ON "public"."pec_gestantes" USING "btree" ("microarea_id");



CREATE INDEX "pec_gestantes_profissional_idx" ON "public"."pec_gestantes" USING "btree" ("profissional_responsavel_id", "alta_ativa", "atualizado_em" DESC);



CREATE INDEX "pec_gestantes_risco_idx" ON "public"."pec_gestantes" USING "btree" ("risco_gestacional");



CREATE INDEX "pec_gestantes_ubs_idx" ON "public"."pec_gestantes" USING "btree" ("ubs_id");



CREATE INDEX "perfis_aniversario_idx" ON "public"."perfis" USING "btree" (EXTRACT(month FROM "data_nascimento"), EXTRACT(day FROM "data_nascimento")) WHERE (("data_nascimento" IS NOT NULL) AND ("perfil_excluido_em" IS NULL));



CREATE INDEX "perfis_aprovacao_idx" ON "public"."perfis" USING "btree" ("aprovacao_status", "ubs_solicitada_id");



CREATE INDEX "perfis_microarea_v21_idx" ON "public"."perfis" USING "btree" ("ubs_id", "microarea_id") WHERE ("perfil_excluido_em" IS NULL);



CREATE INDEX "perfis_ubs_id_idx" ON "public"."perfis" USING "btree" ("ubs_id");



CREATE INDEX "visitas_acs_v21_gestante_idx" ON "public"."visitas_acs_v21" USING "btree" ("gestante_id", "data_acao" DESC, "criado_em" DESC) WHERE ("removido_em" IS NULL);



CREATE INDEX "visitas_acs_v21_territorio_idx" ON "public"."visitas_acs_v21" USING "btree" ("ubs_id", "microarea_id", "data_acao" DESC) WHERE ("removido_em" IS NULL);



CREATE OR REPLACE TRIGGER "trg_proteger_identidade_manual" BEFORE UPDATE ON "private"."identidades_gestantes" FOR EACH ROW EXECUTE FUNCTION "private"."proteger_identidade_manual"();



CREATE OR REPLACE TRIGGER "trg_atendimentos_updated_at" BEFORE UPDATE ON "public"."atendimentos" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_classificacoes_updated_at" BEFORE UPDATE ON "public"."classificacoes_risco" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_credenciais_updated_at" BEFORE UPDATE ON "public"."credenciais_temporarias" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_definir_profissional_responsavel_v18" BEFORE INSERT OR UPDATE ON "public"."pec_gestantes" FOR EACH ROW EXECUTE FUNCTION "private"."definir_profissional_responsavel_v18"();



CREATE OR REPLACE TRIGGER "trg_exames_updated_at" BEFORE UPDATE ON "public"."exames" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_gestacoes_updated_at" BEFORE UPDATE ON "public"."gestacoes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_gestantes_updated_at" BEFORE UPDATE ON "public"."gestantes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_microareas_updated_at" BEFORE UPDATE ON "public"."microareas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_perfis_updated_at" BEFORE UPDATE ON "public"."perfis" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_proteger_campos_manuais_pec" BEFORE UPDATE ON "public"."pec_gestantes" FOR EACH ROW EXECUTE FUNCTION "private"."proteger_campos_manuais_pec"();



CREATE OR REPLACE TRIGGER "trg_sincronizar_resumo_pec_v16" AFTER INSERT OR UPDATE OF "exame_hiv_primeiro", "exame_sifilis_primeiro", "exame_hepatite_b_primeiro", "exame_hepatite_c_primeiro", "exame_hiv_terceiro", "exame_sifilis_terceiro", "dtpa" ON "public"."pec_gestantes" FOR EACH ROW EXECUTE FUNCTION "private"."sincronizar_resumo_pec_v16"();



CREATE OR REPLACE TRIGGER "trg_sincronizar_risco_atual" AFTER INSERT OR UPDATE OF "nivel" ON "public"."classificacoes_risco" FOR EACH ROW EXECUTE FUNCTION "public"."sincronizar_risco_atual"();



CREATE OR REPLACE TRIGGER "trg_ubs_updated_at" BEFORE UPDATE ON "public"."ubs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_validar_contexto_perfil" BEFORE INSERT OR UPDATE OF "perfil", "ubs_id", "microarea_id" ON "public"."perfis" FOR EACH ROW EXECUTE FUNCTION "public"."validar_contexto_perfil"();



CREATE OR REPLACE TRIGGER "trg_validar_territorio_gestante" BEFORE INSERT OR UPDATE OF "ubs_id", "microarea_id" ON "public"."gestantes" FOR EACH ROW EXECUTE FUNCTION "public"."validar_territorio_gestante"();



CREATE OR REPLACE TRIGGER "trg_visitas_updated_at" BEFORE UPDATE ON "public"."visitas_domiciliares" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "private"."acessos_identidade_gestantes"
    ADD CONSTRAINT "acessos_identidade_gestantes_ubs_id_fkey" FOREIGN KEY ("ubs_id") REFERENCES "public"."ubs"("id");



ALTER TABLE ONLY "private"."acessos_identidade_gestantes"
    ADD CONSTRAINT "acessos_identidade_gestantes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "private"."auditoria_avisos_v20"
    ADD CONSTRAINT "auditoria_avisos_v20_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "private"."auditoria_exclusoes_gestantes"
    ADD CONSTRAINT "auditoria_exclusoes_gestantes_ubs_id_fkey" FOREIGN KEY ("ubs_id") REFERENCES "public"."ubs"("id");



ALTER TABLE ONLY "private"."auditoria_exclusoes_gestantes"
    ADD CONSTRAINT "auditoria_exclusoes_gestantes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "private"."auditoria_perfis_v20"
    ADD CONSTRAINT "auditoria_perfis_v20_administrador_id_fkey" FOREIGN KEY ("administrador_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "private"."auditoria_visitas_acs_v21"
    ADD CONSTRAINT "auditoria_visitas_acs_v21_acs_id_fkey" FOREIGN KEY ("acs_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "private"."historico_classificacoes_risco"
    ADD CONSTRAINT "historico_classificacoes_risco_classificacao_id_fkey" FOREIGN KEY ("classificacao_id") REFERENCES "public"."classificacoes_risco_gestacional"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."historico_classificacoes_risco"
    ADD CONSTRAINT "historico_classificacoes_risco_gestante_id_fkey" FOREIGN KEY ("gestante_id") REFERENCES "public"."pec_gestantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."historico_classificacoes_risco"
    ADD CONSTRAINT "historico_classificacoes_risco_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "private"."historico_clinico_gestantes"
    ADD CONSTRAINT "historico_clinico_gestantes_gestante_id_fkey" FOREIGN KEY ("gestante_id") REFERENCES "public"."pec_gestantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."historico_clinico_gestantes"
    ADD CONSTRAINT "historico_clinico_gestantes_ubs_id_fkey" FOREIGN KEY ("ubs_id") REFERENCES "public"."ubs"("id");



ALTER TABLE ONLY "private"."historico_clinico_gestantes"
    ADD CONSTRAINT "historico_clinico_gestantes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "private"."identidades_gestantes"
    ADD CONSTRAINT "identidades_gestantes_atualizado_manualmente_por_fkey" FOREIGN KEY ("atualizado_manualmente_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "private"."identidades_gestantes"
    ADD CONSTRAINT "identidades_gestantes_ubs_id_fkey" FOREIGN KEY ("ubs_id") REFERENCES "public"."ubs"("id");



ALTER TABLE ONLY "private"."importacao_pec_erros"
    ADD CONSTRAINT "importacao_pec_erros_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "public"."importacoes_pec_resumo"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."importacao_pec_linhas_raw"
    ADD CONSTRAINT "importacao_pec_linhas_raw_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "public"."importacoes_pec_resumo"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."atendimentos"
    ADD CONSTRAINT "atendimentos_gestacao_id_fkey" FOREIGN KEY ("gestacao_id") REFERENCES "public"."gestacoes"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."atendimentos"
    ADD CONSTRAINT "atendimentos_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "public"."perfis"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."atendimentos"
    ADD CONSTRAINT "atendimentos_ubs_id_fkey" FOREIGN KEY ("ubs_id") REFERENCES "public"."ubs"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."avisos_ubs"
    ADD CONSTRAINT "avisos_ubs_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."avisos_ubs"
    ADD CONSTRAINT "avisos_ubs_removido_por_fkey" FOREIGN KEY ("removido_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."avisos_ubs"
    ADD CONSTRAINT "avisos_ubs_ubs_id_fkey" FOREIGN KEY ("ubs_id") REFERENCES "public"."ubs"("id");



ALTER TABLE ONLY "public"."classificacao_risco_itens"
    ADD CONSTRAINT "classificacao_risco_itens_classificacao_id_fkey" FOREIGN KEY ("classificacao_id") REFERENCES "public"."classificacoes_risco_gestacional"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classificacoes_risco"
    ADD CONSTRAINT "classificacoes_risco_classificada_por_fkey" FOREIGN KEY ("classificada_por") REFERENCES "public"."perfis"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."classificacoes_risco"
    ADD CONSTRAINT "classificacoes_risco_gestacao_id_fkey" FOREIGN KEY ("gestacao_id") REFERENCES "public"."gestacoes"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."classificacoes_risco_gestacional"
    ADD CONSTRAINT "classificacoes_risco_gestaciona_ubs_origem_profissional_id_fkey" FOREIGN KEY ("ubs_origem_profissional_id") REFERENCES "public"."ubs"("id");



ALTER TABLE ONLY "public"."classificacoes_risco_gestacional"
    ADD CONSTRAINT "classificacoes_risco_gestacional_gestante_id_fkey" FOREIGN KEY ("gestante_id") REFERENCES "public"."pec_gestantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classificacoes_risco_gestacional"
    ADD CONSTRAINT "classificacoes_risco_gestacional_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."classificacoes_risco_gestacional"
    ADD CONSTRAINT "classificacoes_risco_gestacional_ubs_atendimento_id_fkey" FOREIGN KEY ("ubs_atendimento_id") REFERENCES "public"."ubs"("id");



ALTER TABLE ONLY "public"."classificacoes_risco"
    ADD CONSTRAINT "classificacoes_risco_revisada_por_fkey" FOREIGN KEY ("revisada_por") REFERENCES "public"."perfis"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credenciais_temporarias"
    ADD CONSTRAINT "credenciais_temporarias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exames"
    ADD CONSTRAINT "exames_gestacao_id_fkey" FOREIGN KEY ("gestacao_id") REFERENCES "public"."gestacoes"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."exames"
    ADD CONSTRAINT "exames_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "public"."perfis"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."exames"
    ADD CONSTRAINT "exames_solicitado_por_fkey" FOREIGN KEY ("solicitado_por") REFERENCES "public"."perfis"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gestacoes"
    ADD CONSTRAINT "gestacoes_gestante_id_fkey" FOREIGN KEY ("gestante_id") REFERENCES "public"."gestantes"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."gestante_altas"
    ADD CONSTRAINT "gestante_altas_gestante_id_fkey" FOREIGN KEY ("gestante_id") REFERENCES "public"."pec_gestantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gestante_altas"
    ADD CONSTRAINT "gestante_altas_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."gestante_altas"
    ADD CONSTRAINT "gestante_altas_ubs_id_fkey" FOREIGN KEY ("ubs_id") REFERENCES "public"."ubs"("id");



ALTER TABLE ONLY "public"."gestante_consultas"
    ADD CONSTRAINT "gestante_consultas_gestante_id_fkey" FOREIGN KEY ("gestante_id") REFERENCES "public"."pec_gestantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gestante_consultas"
    ADD CONSTRAINT "gestante_consultas_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."gestante_exames"
    ADD CONSTRAINT "gestante_exames_gestante_id_fkey" FOREIGN KEY ("gestante_id") REFERENCES "public"."pec_gestantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gestante_exames"
    ADD CONSTRAINT "gestante_exames_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."gestante_vacinas"
    ADD CONSTRAINT "gestante_vacinas_gestante_id_fkey" FOREIGN KEY ("gestante_id") REFERENCES "public"."pec_gestantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gestante_vacinas"
    ADD CONSTRAINT "gestante_vacinas_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."gestantes"
    ADD CONSTRAINT "gestantes_cadastrada_por_fkey" FOREIGN KEY ("cadastrada_por") REFERENCES "public"."perfis"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gestantes"
    ADD CONSTRAINT "gestantes_microarea_ubs_fkey" FOREIGN KEY ("microarea_id", "ubs_id") REFERENCES "public"."microareas"("id", "ubs_id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."gestantes"
    ADD CONSTRAINT "gestantes_ubs_id_fkey" FOREIGN KEY ("ubs_id") REFERENCES "public"."ubs"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."importacoes_pec_resumo"
    ADD CONSTRAINT "importacoes_pec_resumo_ubs_id_fkey" FOREIGN KEY ("ubs_id") REFERENCES "public"."ubs"("id");



ALTER TABLE ONLY "public"."importacoes_pec_resumo"
    ADD CONSTRAINT "importacoes_pec_resumo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."microareas"
    ADD CONSTRAINT "microareas_ubs_id_fkey" FOREIGN KEY ("ubs_id") REFERENCES "public"."ubs"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pec_gestantes"
    ADD CONSTRAINT "pec_gestantes_atualizado_manualmente_por_fkey" FOREIGN KEY ("atualizado_manualmente_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."pec_gestantes"
    ADD CONSTRAINT "pec_gestantes_excluida_por_fkey" FOREIGN KEY ("excluida_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."pec_gestantes"
    ADD CONSTRAINT "pec_gestantes_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "public"."importacoes_pec_resumo"("id");



ALTER TABLE ONLY "public"."pec_gestantes"
    ADD CONSTRAINT "pec_gestantes_microarea_id_fkey" FOREIGN KEY ("microarea_id") REFERENCES "public"."microareas"("id");



ALTER TABLE ONLY "public"."pec_gestantes"
    ADD CONSTRAINT "pec_gestantes_profissional_responsavel_id_fkey" FOREIGN KEY ("profissional_responsavel_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."pec_gestantes"
    ADD CONSTRAINT "pec_gestantes_ubs_id_fkey" FOREIGN KEY ("ubs_id") REFERENCES "public"."ubs"("id");



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_aprovado_por_fkey" FOREIGN KEY ("aprovado_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_microarea_ubs_fkey" FOREIGN KEY ("microarea_id", "ubs_id") REFERENCES "public"."microareas"("id", "ubs_id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_perfil_excluido_por_fkey" FOREIGN KEY ("perfil_excluido_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_ubs_id_fkey" FOREIGN KEY ("ubs_id") REFERENCES "public"."ubs"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_ubs_solicitada_id_fkey" FOREIGN KEY ("ubs_solicitada_id") REFERENCES "public"."ubs"("id");



ALTER TABLE ONLY "public"."visitas_acs_v21"
    ADD CONSTRAINT "visitas_acs_v21_acs_id_fkey" FOREIGN KEY ("acs_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."visitas_acs_v21"
    ADD CONSTRAINT "visitas_acs_v21_gestante_id_fkey" FOREIGN KEY ("gestante_id") REFERENCES "public"."pec_gestantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visitas_acs_v21"
    ADD CONSTRAINT "visitas_acs_v21_microarea_id_fkey" FOREIGN KEY ("microarea_id") REFERENCES "public"."microareas"("id");



ALTER TABLE ONLY "public"."visitas_acs_v21"
    ADD CONSTRAINT "visitas_acs_v21_removido_por_fkey" FOREIGN KEY ("removido_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."visitas_acs_v21"
    ADD CONSTRAINT "visitas_acs_v21_ubs_id_fkey" FOREIGN KEY ("ubs_id") REFERENCES "public"."ubs"("id");



ALTER TABLE ONLY "public"."visitas_domiciliares"
    ADD CONSTRAINT "visitas_domiciliares_acs_id_fkey" FOREIGN KEY ("acs_id") REFERENCES "public"."perfis"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."visitas_domiciliares"
    ADD CONSTRAINT "visitas_domiciliares_gestacao_id_fkey" FOREIGN KEY ("gestacao_id") REFERENCES "public"."gestacoes"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."visitas_domiciliares"
    ADD CONSTRAINT "visitas_domiciliares_microarea_id_fkey" FOREIGN KEY ("microarea_id") REFERENCES "public"."microareas"("id") ON UPDATE CASCADE ON DELETE SET NULL;



CREATE POLICY "administrador pode atualizar microareas" ON "public"."microareas" FOR UPDATE TO "authenticated" USING ("public"."usuario_eh_administrador"()) WITH CHECK ("public"."usuario_eh_administrador"());



CREATE POLICY "administrador pode atualizar perfis" ON "public"."perfis" FOR UPDATE TO "authenticated" USING ("public"."usuario_eh_administrador"()) WITH CHECK ("public"."usuario_eh_administrador"());



CREATE POLICY "administrador pode atualizar ubs" ON "public"."ubs" FOR UPDATE TO "authenticated" USING ("public"."usuario_eh_administrador"()) WITH CHECK ("public"."usuario_eh_administrador"());



CREATE POLICY "administrador pode consultar todos os perfis" ON "public"."perfis" FOR SELECT TO "authenticated" USING ("public"."usuario_eh_administrador"());



CREATE POLICY "administrador pode excluir atendimentos" ON "public"."atendimentos" FOR DELETE TO "authenticated" USING ("public"."usuario_eh_administrador"());



CREATE POLICY "administrador pode excluir classificacoes" ON "public"."classificacoes_risco" FOR DELETE TO "authenticated" USING ("public"."usuario_eh_administrador"());



CREATE POLICY "administrador pode excluir exames" ON "public"."exames" FOR DELETE TO "authenticated" USING ("public"."usuario_eh_administrador"());



CREATE POLICY "administrador pode excluir gestacoes" ON "public"."gestacoes" FOR DELETE TO "authenticated" USING ("public"."usuario_eh_administrador"());



CREATE POLICY "administrador pode excluir gestantes" ON "public"."gestantes" FOR DELETE TO "authenticated" USING ("public"."usuario_eh_administrador"());



CREATE POLICY "administrador pode excluir microareas" ON "public"."microareas" FOR DELETE TO "authenticated" USING ("public"."usuario_eh_administrador"());



CREATE POLICY "administrador pode excluir perfis" ON "public"."perfis" FOR DELETE TO "authenticated" USING ("public"."usuario_eh_administrador"());



CREATE POLICY "administrador pode excluir ubs" ON "public"."ubs" FOR DELETE TO "authenticated" USING ("public"."usuario_eh_administrador"());



CREATE POLICY "administrador pode excluir visitas" ON "public"."visitas_domiciliares" FOR DELETE TO "authenticated" USING ("public"."usuario_eh_administrador"());



CREATE POLICY "administrador pode inserir microareas" ON "public"."microareas" FOR INSERT TO "authenticated" WITH CHECK ("public"."usuario_eh_administrador"());



CREATE POLICY "administrador pode inserir perfis" ON "public"."perfis" FOR INSERT TO "authenticated" WITH CHECK ("public"."usuario_eh_administrador"());



CREATE POLICY "administrador pode inserir ubs" ON "public"."ubs" FOR INSERT TO "authenticated" WITH CHECK ("public"."usuario_eh_administrador"());



CREATE POLICY "altas das gestantes proprias" ON "public"."gestante_altas" FOR SELECT TO "authenticated" USING ("security"."usuario_pode_acessar_gestante_v18"("gestante_id"));



ALTER TABLE "public"."atendimentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "atualizar atendimentos autorizados" ON "public"."atendimentos" FOR UPDATE TO "authenticated" USING ("public"."pode_editar_gestacao"("gestacao_id")) WITH CHECK ("public"."pode_editar_gestacao"("gestacao_id"));



CREATE POLICY "atualizar classificacoes autorizadas" ON "public"."classificacoes_risco" FOR UPDATE TO "authenticated" USING ("public"."pode_editar_gestacao"("gestacao_id")) WITH CHECK ("public"."pode_editar_gestacao"("gestacao_id"));



CREATE POLICY "atualizar exames autorizados" ON "public"."exames" FOR UPDATE TO "authenticated" USING ("public"."pode_editar_gestacao"("gestacao_id")) WITH CHECK ("public"."pode_editar_gestacao"("gestacao_id"));



CREATE POLICY "atualizar gestacoes autorizadas" ON "public"."gestacoes" FOR UPDATE TO "authenticated" USING ("public"."pode_editar_gestacao"("id")) WITH CHECK ("public"."pode_editar_gestante"("gestante_id"));



CREATE POLICY "atualizar gestantes autorizadas" ON "public"."gestantes" FOR UPDATE TO "authenticated" USING ("public"."pode_editar_gestante"("id")) WITH CHECK ((("public"."meu_perfil"() = 'administrador'::"public"."perfil_usuario") OR (("public"."meu_perfil"() = 'equipe_ubs'::"public"."perfil_usuario") AND ("ubs_id" = "public"."minha_ubs_id"()))));



CREATE POLICY "atualizar visitas autorizadas" ON "public"."visitas_domiciliares" FOR UPDATE TO "authenticated" USING (("public"."pode_registrar_visita"("gestacao_id") AND (("public"."meu_perfil"() <> 'acs'::"public"."perfil_usuario") OR ("acs_id" = "auth"."uid"())))) WITH CHECK (("public"."pode_registrar_visita"("gestacao_id") AND (("public"."meu_perfil"() <> 'acs'::"public"."perfil_usuario") OR ("acs_id" = "auth"."uid"()))));



ALTER TABLE "public"."avisos_ubs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "catalogo exames autenticados" ON "public"."config_exames_pre_natal" FOR SELECT TO "authenticated" USING (("ativo" = true));



CREATE POLICY "catalogo risco autenticados" ON "public"."config_fatores_risco_gestacional" FOR SELECT TO "authenticated" USING (("ativo" = true));



CREATE POLICY "catalogo vacinas autenticados" ON "public"."config_vacinas_gestante" FOR SELECT TO "authenticated" USING (("ativo" = true));



ALTER TABLE "public"."classificacao_risco_itens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classificacoes das gestantes proprias" ON "public"."classificacoes_risco_gestacional" FOR SELECT TO "authenticated" USING ("security"."usuario_pode_acessar_gestante_v18"("gestante_id"));



ALTER TABLE "public"."classificacoes_risco" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classificacoes_risco_gestacional" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."config_exames_pre_natal" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."config_fatores_risco_gestacional" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."config_vacinas_gestante" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "consultas das gestantes proprias" ON "public"."gestante_consultas" FOR SELECT TO "authenticated" USING ("security"."usuario_pode_acessar_gestante_v18"("gestante_id"));



ALTER TABLE "public"."credenciais_temporarias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exames" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exames das gestantes proprias" ON "public"."gestante_exames" FOR SELECT TO "authenticated" USING ("security"."usuario_pode_acessar_gestante_v18"("gestante_id"));



ALTER TABLE "public"."gestacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gestante_altas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gestante_consultas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gestante_exames" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gestante_vacinas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gestantes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gestao pode consultar todas as microareas" ON "public"."microareas" FOR SELECT TO "authenticated" USING ("public"."usuario_eh_gestao"());



CREATE POLICY "gestao pode consultar todas as ubs" ON "public"."ubs" FOR SELECT TO "authenticated" USING ("public"."usuario_eh_gestao"());



ALTER TABLE "public"."importacoes_pec_resumo" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inserir atendimentos autorizados" ON "public"."atendimentos" FOR INSERT TO "authenticated" WITH CHECK ("public"."pode_editar_gestacao"("gestacao_id"));



CREATE POLICY "inserir classificacoes autorizadas" ON "public"."classificacoes_risco" FOR INSERT TO "authenticated" WITH CHECK ("public"."pode_editar_gestacao"("gestacao_id"));



CREATE POLICY "inserir exames autorizados" ON "public"."exames" FOR INSERT TO "authenticated" WITH CHECK ("public"."pode_editar_gestacao"("gestacao_id"));



CREATE POLICY "inserir gestacoes autorizadas" ON "public"."gestacoes" FOR INSERT TO "authenticated" WITH CHECK ("public"."pode_editar_gestante"("gestante_id"));



CREATE POLICY "inserir gestantes autorizadas" ON "public"."gestantes" FOR INSERT TO "authenticated" WITH CHECK ((("public"."meu_perfil"() = 'administrador'::"public"."perfil_usuario") OR (("public"."meu_perfil"() = 'equipe_ubs'::"public"."perfil_usuario") AND ("ubs_id" = "public"."minha_ubs_id"()))));



CREATE POLICY "inserir visitas autorizadas" ON "public"."visitas_domiciliares" FOR INSERT TO "authenticated" WITH CHECK (("public"."pode_registrar_visita"("gestacao_id") AND (("public"."meu_perfil"() <> 'acs'::"public"."perfil_usuario") OR ("acs_id" = "auth"."uid"()))));



CREATE POLICY "itens das classificacoes proprias" ON "public"."classificacao_risco_itens" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."classificacoes_risco_gestacional" "c"
  WHERE (("c"."id" = "classificacao_risco_itens"."classificacao_id") AND "security"."usuario_pode_acessar_gestante_v18"("c"."gestante_id")))));



ALTER TABLE "public"."microareas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pec_gestantes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."perfis" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ubs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "usuario consulta a propria ubs" ON "public"."ubs" FOR SELECT TO "authenticated" USING ((("id" = "security"."usuario_ubs_id"()) OR "security"."usuario_eh_admin"()));



CREATE POLICY "usuario consulta microareas da propria ubs" ON "public"."microareas" FOR SELECT TO "authenticated" USING ((("ubs_id" = "security"."usuario_ubs_id"()) OR "security"."usuario_eh_admin"()));



CREATE POLICY "usuario consulta o proprio perfil" ON "public"."perfis" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "security"."usuario_eh_admin"()));



CREATE POLICY "usuario pode consultar o proprio perfil" ON "public"."perfis" FOR SELECT TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "usuarios autenticados podem consultar microareas ativas" ON "public"."microareas" FOR SELECT TO "authenticated" USING (("ativa" = true));



CREATE POLICY "usuarios autenticados podem consultar ubs ativas" ON "public"."ubs" FOR SELECT TO "authenticated" USING (("ativa" = true));



CREATE POLICY "usuarios veem gestantes proprias" ON "public"."pec_gestantes" FOR SELECT TO "authenticated" USING ((("excluida_em" IS NULL) AND ("security"."usuario_eh_admin"() OR (("ubs_id" = "security"."usuario_ubs_id"()) AND ("profissional_responsavel_id" = "auth"."uid"())))));



CREATE POLICY "usuarios veem importacoes da propria ubs" ON "public"."importacoes_pec_resumo" FOR SELECT TO "authenticated" USING (("security"."usuario_eh_admin"() OR ("ubs_id" = "security"."usuario_ubs_id"())));



CREATE POLICY "vacinas das gestantes proprias" ON "public"."gestante_vacinas" FOR SELECT TO "authenticated" USING ("security"."usuario_pode_acessar_gestante_v18"("gestante_id"));



CREATE POLICY "visitantes podem consultar microareas ativas" ON "public"."microareas" FOR SELECT TO "anon" USING (("ativa" = true));



CREATE POLICY "visitantes podem consultar ubs ativas" ON "public"."ubs" FOR SELECT TO "anon" USING (("ativa" = true));



ALTER TABLE "public"."visitas_acs_v21" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."visitas_domiciliares" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "visualizar atendimentos autorizados" ON "public"."atendimentos" FOR SELECT TO "authenticated" USING ("public"."pode_visualizar_gestacao"("gestacao_id"));



CREATE POLICY "visualizar classificacoes autorizadas" ON "public"."classificacoes_risco" FOR SELECT TO "authenticated" USING ("public"."pode_visualizar_gestacao"("gestacao_id"));



CREATE POLICY "visualizar exames autorizados" ON "public"."exames" FOR SELECT TO "authenticated" USING ("public"."pode_visualizar_gestacao"("gestacao_id"));



CREATE POLICY "visualizar gestacoes autorizadas" ON "public"."gestacoes" FOR SELECT TO "authenticated" USING ("public"."pode_visualizar_gestante"("gestante_id"));



CREATE POLICY "visualizar gestantes autorizadas" ON "public"."gestantes" FOR SELECT TO "authenticated" USING ("public"."pode_visualizar_gestante"("id"));



CREATE POLICY "visualizar visitas autorizadas" ON "public"."visitas_domiciliares" FOR SELECT TO "authenticated" USING ("public"."pode_visualizar_gestacao"("gestacao_id"));



GRANT USAGE ON SCHEMA "analytics" TO "metabase_reader";
GRANT USAGE ON SCHEMA "analytics" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "private"."complementar_acao_acs_v21"("p_usuario_id" "uuid", "p_visita_id" "uuid", "p_dados" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."criar_cadastro_minimo_risco_v17"("p_usuario_id" "uuid", "p_payload" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."descriptografar_jsonb"("p_valor" "bytea") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."descriptografar_texto"("p_valor" "bytea") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."esvaziar_lixeira_v19"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."excluir_gestante_definitivamente_v19"("p_usuario_id" "uuid", "p_gestante_id" "uuid", "p_confirmado" boolean) FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."hash_gestante_auditoria_v19"("p_gestante_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."identidade_hash"("p_canonical" "jsonb", "p_ubs_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."importar_pec"("p_ubs_id" "uuid", "p_usuario_id" "uuid", "p_arquivo_nome" "text", "p_arquivo_sha256" "text", "p_linha_cabecalho" integer, "p_mapeamento" "jsonb", "p_linhas" "jsonb", "p_avisos" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."listar_gestantes_autorizadas"("p_usuario_id" "uuid", "p_exibir_identidade" boolean) FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."listar_gestantes_autorizadas_v16"("p_usuario_id" "uuid", "p_exibir_identidade" boolean) FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."listar_lixeira_gestantes_v19"("p_usuario_id" "uuid", "p_exibir_identidade" boolean) FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."mover_gestante_lixeira_v19"("p_usuario_id" "uuid", "p_gestante_id" "uuid", "p_motivo" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."normalizar_data_cadastro_v21"("p_valor" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."normalizar_nome"("p_texto" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."obter_gestante_clinica"("p_usuario_id" "uuid", "p_gestante_id" "uuid", "p_exibir_identidade" boolean) FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."obter_indicadores_v18"("p_usuario_id" "uuid", "p_escopo" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."obter_indicadores_v21"("p_usuario_id" "uuid", "p_escopo" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."obter_inicio_v20"("p_usuario_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."obter_inicio_v21"("p_usuario_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."obter_painel_acs_v21"("p_usuario_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."obter_relatorio_classificacao_v17"("p_usuario_id" "uuid", "p_classificacao_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."pii_key"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."registrar_acao_acs_v21"("p_usuario_id" "uuid", "p_gestante_id" "uuid", "p_tipo" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."restaurar_gestante_v19"("p_usuario_id" "uuid", "p_gestante_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."salvar_classificacao_risco_v17"("p_usuario_id" "uuid", "p_payload" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."salvar_gestante_clinica"("p_usuario_id" "uuid", "p_payload" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."usuario_admin_v20"("p_usuario_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."usuario_pode_gerenciar_gestante_v19"("p_usuario_id" "uuid", "p_gestante_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."usuario_pode_operar_lixeira_v20"("p_usuario_id" "uuid", "p_gestante_id" "uuid") FROM PUBLIC;



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."perfis" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."perfis" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."perfis" TO "service_role";



REVOKE ALL ON FUNCTION "public"."atualizar_meus_dados"("p_nome_completo" "text", "p_cargo_funcao" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."atualizar_meus_dados"("p_nome_completo" "text", "p_cargo_funcao" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."listar_microareas_da_ubs"("p_ubs_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."listar_microareas_da_ubs"("p_ubs_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."meu_perfil"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."meu_perfil"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."minha_microarea_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."minha_microarea_id"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."minha_ubs_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."minha_ubs_id"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."pode_editar_gestacao"("p_gestacao_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pode_editar_gestacao"("p_gestacao_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."pode_editar_gestante"("p_gestante_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pode_editar_gestante"("p_gestante_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."pode_registrar_visita"("p_gestacao_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pode_registrar_visita"("p_gestacao_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."pode_visualizar_gestacao"("p_gestacao_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pode_visualizar_gestacao"("p_gestacao_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."pode_visualizar_gestante"("p_gestante_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pode_visualizar_gestante"("p_gestante_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."usuario_eh_administrador"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."usuario_eh_administrador"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."usuario_eh_gestao"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."usuario_eh_gestao"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."usuario_esta_ativo"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."usuario_esta_ativo"() TO "authenticated";



GRANT ALL ON FUNCTION "security"."usuario_eh_admin"() TO "authenticated";



GRANT ALL ON FUNCTION "security"."usuario_pode_acessar_gestante_v18"("p_gestante_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "security"."usuario_ubs_id"() TO "authenticated";



GRANT ALL ON TABLE "public"."exames" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."exames" TO "service_role";



GRANT ALL ON TABLE "public"."gestacoes" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gestacoes" TO "service_role";



GRANT ALL ON TABLE "public"."gestantes" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gestantes" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."ubs" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."ubs" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."ubs" TO "service_role";



GRANT SELECT ON TABLE "analytics"."v_alertas_exames" TO "metabase_reader";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."microareas" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."microareas" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."microareas" TO "service_role";



GRANT SELECT ON TABLE "analytics"."v_gestacoes_base" TO "metabase_reader";



GRANT SELECT ON TABLE "analytics"."v_alertas_por_ubs" TO "metabase_reader";



GRANT ALL ON TABLE "public"."atendimentos" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."atendimentos" TO "service_role";



GRANT SELECT ON TABLE "analytics"."v_atendimentos_mensais" TO "metabase_reader";



GRANT SELECT ON TABLE "analytics"."v_distribuicao_risco" TO "metabase_reader";



GRANT SELECT ON TABLE "analytics"."v_distribuicao_trimestre" TO "metabase_reader";



GRANT SELECT ON TABLE "analytics"."v_evolucao_mensal" TO "metabase_reader";



GRANT SELECT ON TABLE "analytics"."v_exames_por_status" TO "metabase_reader";



GRANT SELECT ON TABLE "analytics"."v_indicadores_por_microarea" TO "metabase_reader";



GRANT SELECT ON TABLE "analytics"."v_indicadores_por_ubs" TO "metabase_reader";



GRANT SELECT ON TABLE "analytics"."v_resumo_geral" TO "metabase_reader";



GRANT ALL ON TABLE "public"."visitas_domiciliares" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."visitas_domiciliares" TO "service_role";



GRANT SELECT ON TABLE "analytics"."v_visitas_mensais" TO "metabase_reader";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."classificacao_risco_itens" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."classificacao_risco_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."classificacao_risco_itens" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."classificacoes_risco_gestacional" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."classificacoes_risco_gestacional" TO "authenticated";
GRANT ALL ON TABLE "public"."classificacoes_risco_gestacional" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pec_gestantes" TO "service_role";
GRANT SELECT ON TABLE "public"."pec_gestantes" TO "authenticated";



GRANT SELECT ON TABLE "analytics"."vw_fatores_risco_v18" TO "metabase_reader";
GRANT SELECT ON TABLE "analytics"."vw_fatores_risco_v18" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."config_exames_pre_natal" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."config_exames_pre_natal" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."config_exames_pre_natal" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gestante_exames" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gestante_exames" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gestante_exames" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gestante_vacinas" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gestante_vacinas" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gestante_vacinas" TO "service_role";



GRANT SELECT ON TABLE "analytics"."vw_indicadores_base_v18" TO "metabase_reader";
GRANT SELECT ON TABLE "analytics"."vw_indicadores_base_v18" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."avisos_ubs" TO "service_role";



GRANT ALL ON TABLE "public"."classificacoes_risco" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."classificacoes_risco" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."config_fatores_risco_gestacional" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."config_fatores_risco_gestacional" TO "authenticated";
GRANT ALL ON TABLE "public"."config_fatores_risco_gestacional" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."config_vacinas_gestante" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."config_vacinas_gestante" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."config_vacinas_gestante" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."credenciais_temporarias" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gestante_altas" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gestante_altas" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gestante_altas" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gestante_consultas" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gestante_consultas" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gestante_consultas" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."importacoes_pec_resumo" TO "service_role";
GRANT SELECT ON TABLE "public"."importacoes_pec_resumo" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."visitas_acs_v21" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "analytics" GRANT SELECT ON TABLES TO "metabase_reader";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";







