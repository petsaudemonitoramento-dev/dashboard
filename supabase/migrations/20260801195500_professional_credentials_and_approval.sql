-- Dashboard 2.0 - professional credentials and audited approval
-- Incremental migration. It must be reviewed and applied through the formal migration flow.
BEGIN;

DO $bootstrap$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Supabase Auth (auth.users) is required';
  END IF;

  IF to_regclass('public.perfis') IS NULL THEN
    RAISE EXCEPTION 'public.perfis is required';
  END IF;
END;
$bootstrap$;

CREATE TABLE "private"."credenciais_profissionais" (
  "id" uuid DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
  "usuario_id" uuid NOT NULL,
  "cargo_funcao" text NOT NULL,
  "conselho" text NOT NULL,
  "uf" character(2) NOT NULL,
  "numero_registro" text NOT NULL,
  "categoria" text NOT NULL,
  "situacao" text DEFAULT 'pendente'::text NOT NULL,
  "submetido_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "decidido_em" timestamp with time zone,
  "decidido_por" uuid,
  "fonte_verificacao" text,
  "motivo_controlado" text,
  CONSTRAINT "credenciais_profissionais_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credenciais_profissionais_usuario_key" UNIQUE ("usuario_id"),
  CONSTRAINT "credenciais_profissionais_registro_key"
    UNIQUE ("conselho", "uf", "numero_registro"),
  CONSTRAINT "credenciais_profissionais_cargo_check"
    CHECK ("cargo_funcao" IN ('medico', 'enfermeiro')),
  CONSTRAINT "credenciais_profissionais_conselho_check"
    CHECK ("conselho" IN ('CRM', 'COREN')),
  CONSTRAINT "credenciais_profissionais_categoria_check"
    CHECK ("categoria" IN ('MEDICO', 'ENFERMEIRO')),
  CONSTRAINT "credenciais_profissionais_situacao_check"
    CHECK ("situacao" IN ('pendente', 'validado', 'rejeitado', 'expirado')),
  CONSTRAINT "credenciais_profissionais_uf_check"
    CHECK (
      "uf" IN (
        'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
        'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
        'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
      )
    ),
  CONSTRAINT "credenciais_profissionais_numero_check"
    CHECK ("numero_registro" ~ '^[0-9]{3,15}$'),
  CONSTRAINT "credenciais_profissionais_vinculo_check"
    CHECK (
      ("cargo_funcao" = 'medico' AND "conselho" = 'CRM' AND "categoria" = 'MEDICO')
      OR
      ("cargo_funcao" = 'enfermeiro' AND "conselho" = 'COREN' AND "categoria" = 'ENFERMEIRO')
    ),
  CONSTRAINT "credenciais_profissionais_fonte_check"
    CHECK (
      "fonte_verificacao" IS NULL
      OR ("conselho" = 'CRM' AND "fonte_verificacao" = 'portal_cfm')
      OR ("conselho" = 'COREN' AND "fonte_verificacao" = 'consulta_cofen')
    ),
  CONSTRAINT "credenciais_profissionais_decisao_check"
    CHECK (
      ("situacao" = 'pendente'
        AND "decidido_em" IS NULL
        AND "decidido_por" IS NULL
        AND "fonte_verificacao" IS NULL
        AND "motivo_controlado" IS NULL)
      OR
      ("situacao" = 'validado'
        AND "decidido_em" IS NOT NULL
        AND "decidido_por" IS NOT NULL
        AND "fonte_verificacao" IS NOT NULL
        AND "motivo_controlado" IS NULL)
      OR
      ("situacao" IN ('rejeitado', 'expirado')
        AND "decidido_em" IS NOT NULL
        AND "decidido_por" IS NOT NULL
        AND "fonte_verificacao" IS NOT NULL
        AND "motivo_controlado" IS NOT NULL)
    ),
  CONSTRAINT "credenciais_profissionais_motivo_check"
    CHECK (
      "motivo_controlado" IS NULL
      OR (
        char_length("motivo_controlado") BETWEEN 3 AND 500
        AND "motivo_controlado" !~ '[0-9]{11}'
      )
    ),
  CONSTRAINT "credenciais_profissionais_usuario_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis"("id") ON DELETE RESTRICT,
  CONSTRAINT "credenciais_profissionais_decidido_por_fkey"
    FOREIGN KEY ("decidido_por") REFERENCES "auth"."users"("id") ON DELETE RESTRICT
);

CREATE TABLE "private"."auditoria_credenciais_profissionais" (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "credencial_id" uuid NOT NULL,
  "usuario_id" uuid NOT NULL,
  "ator_id" uuid NOT NULL,
  "evento" text NOT NULL,
  "estado_anterior" jsonb,
  "estado_novo" jsonb NOT NULL,
  "motivo_controlado" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "auditoria_credenciais_profissionais_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auditoria_credenciais_profissionais_evento_check"
    CHECK ("evento" IN ('submeter', 'ressubmeter', 'validar', 'rejeitar', 'expirar', 'aprovar_perfil')),
  CONSTRAINT "auditoria_credenciais_profissionais_motivo_check"
    CHECK (
      "motivo_controlado" IS NULL
      OR (
        char_length("motivo_controlado") BETWEEN 3 AND 500
        AND "motivo_controlado" !~ '[0-9]{11}'
      )
    ),
  CONSTRAINT "auditoria_credenciais_profissionais_credencial_fkey"
    FOREIGN KEY ("credencial_id")
    REFERENCES "private"."credenciais_profissionais"("id") ON DELETE RESTRICT,
  CONSTRAINT "auditoria_credenciais_profissionais_usuario_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis"("id") ON DELETE RESTRICT,
  CONSTRAINT "auditoria_credenciais_profissionais_ator_fkey"
    FOREIGN KEY ("ator_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT
);

CREATE INDEX "credenciais_profissionais_situacao_idx"
  ON "private"."credenciais_profissionais" ("situacao", "submetido_em");

CREATE INDEX "auditoria_credenciais_usuario_idx"
  ON "private"."auditoria_credenciais_profissionais" ("usuario_id", "criado_em" DESC);

CREATE OR REPLACE FUNCTION "private"."atualizar_credencial_profissional_v22"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'private'
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "private"."bloquear_mutacao_auditoria_v22"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'private'
AS $$
BEGIN
  RAISE EXCEPTION 'Registros de auditoria sao append-only';
END;
$$;

CREATE TRIGGER "credenciais_profissionais_updated_at"
BEFORE UPDATE ON "private"."credenciais_profissionais"
FOR EACH ROW EXECUTE FUNCTION "private"."atualizar_credencial_profissional_v22"();

CREATE TRIGGER "auditoria_credenciais_append_only"
BEFORE UPDATE OR DELETE ON "private"."auditoria_credenciais_profissionais"
FOR EACH ROW EXECUTE FUNCTION "private"."bloquear_mutacao_auditoria_v22"();

CREATE TRIGGER "auditoria_perfis_append_only"
BEFORE UPDATE OR DELETE ON "private"."auditoria_perfis_v20"
FOR EACH ROW EXECUTE FUNCTION "private"."bloquear_mutacao_auditoria_v22"();

CREATE OR REPLACE FUNCTION "private"."usuario_gestao_municipal_v22"("p_usuario_id" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfis p
    WHERE p.id = p_usuario_id
      AND p.perfil = 'gestao_municipal'::public.perfil_usuario
      AND p.status = 'ativo'::public.status_usuario
      AND p.ativo = true
      AND p.cadastro_completo = true
      AND p.aprovacao_status = 'aprovado'
      AND p.perfil_excluido_em IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION "private"."submeter_credencial_profissional_v22"(
  "p_usuario_id" uuid,
  "p_cargo_funcao" text,
  "p_conselho" text,
  "p_uf" text,
  "p_numero_registro" text,
  "p_categoria" text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
DECLARE
  v_perfil public.perfis%ROWTYPE;
  v_credencial private.credenciais_profissionais%ROWTYPE;
  v_cargo text := lower(trim(coalesce(p_cargo_funcao, '')));
  v_conselho text := upper(trim(coalesce(p_conselho, '')));
  v_uf text := upper(trim(coalesce(p_uf, '')));
  v_numero text := regexp_replace(coalesce(p_numero_registro, ''), '[^0-9]', '', 'g');
  v_categoria text := upper(trim(coalesce(p_categoria, '')));
  v_evento text := 'submeter';
  v_anterior jsonb;
BEGIN
  SELECT p.*
  INTO v_perfil
  FROM public.perfis p
  WHERE p.id = p_usuario_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_perfil.perfil_solicitado IS DISTINCT FROM 'equipe_ubs'
    OR v_perfil.aprovacao_status <> 'pendente'
    OR v_perfil.status <> 'ativo'::public.status_usuario
    OR v_perfil.ativo IS NOT TRUE
    OR v_perfil.cadastro_completo IS NOT TRUE
    OR v_perfil.perfil_excluido_em IS NOT NULL
  THEN
    RAISE EXCEPTION 'Solicitacao de equipe UBS inelegivel';
  END IF;

  IF v_cargo NOT IN ('medico', 'enfermeiro') THEN
    RAISE EXCEPTION 'Somente medico ou enfermeiro pode solicitar equipe UBS';
  END IF;

  IF NOT (
    (v_cargo = 'medico' AND v_conselho = 'CRM' AND v_categoria = 'MEDICO')
    OR
    (v_cargo = 'enfermeiro' AND v_conselho = 'COREN' AND v_categoria = 'ENFERMEIRO')
  ) THEN
    RAISE EXCEPTION 'Conselho ou categoria incompativel com a funcao';
  END IF;

  IF v_uf NOT IN (
      'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
      'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
      'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
    )
    OR v_numero !~ '^[0-9]{3,15}$'
  THEN
    RAISE EXCEPTION 'Registro profissional invalido';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.credenciais_profissionais c
    WHERE c.conselho = v_conselho
      AND c.uf = v_uf
      AND c.numero_registro = v_numero
      AND c.usuario_id <> p_usuario_id
  ) THEN
    RAISE EXCEPTION 'Registro profissional ja associado a outra conta';
  END IF;

  SELECT c.*
  INTO v_credencial
  FROM private.credenciais_profissionais c
  WHERE c.usuario_id = p_usuario_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_credencial.situacao = 'validado' THEN
      RAISE EXCEPTION 'Credencial validada nao pode ser sobrescrita';
    END IF;

    v_evento := 'ressubmeter';
    v_anterior := jsonb_build_object(
      'cargoFuncao', v_credencial.cargo_funcao,
      'conselho', v_credencial.conselho,
      'uf', v_credencial.uf,
      'numeroRegistro', v_credencial.numero_registro,
      'categoria', v_credencial.categoria,
      'situacao', v_credencial.situacao
    );

    UPDATE private.credenciais_profissionais
    SET cargo_funcao = v_cargo,
        conselho = v_conselho,
        uf = v_uf,
        numero_registro = v_numero,
        categoria = v_categoria,
        situacao = 'pendente',
        submetido_em = now(),
        decidido_em = NULL,
        decidido_por = NULL,
        fonte_verificacao = NULL,
        motivo_controlado = NULL
    WHERE id = v_credencial.id
    RETURNING * INTO v_credencial;
  ELSE
    INSERT INTO private.credenciais_profissionais (
      usuario_id,
      cargo_funcao,
      conselho,
      uf,
      numero_registro,
      categoria
    )
    VALUES (
      p_usuario_id,
      v_cargo,
      v_conselho,
      v_uf,
      v_numero,
      v_categoria
    )
    RETURNING * INTO v_credencial;
  END IF;

  UPDATE public.perfis
  SET cargo_funcao = v_cargo,
      updated_at = now()
  WHERE id = p_usuario_id;

  INSERT INTO private.auditoria_credenciais_profissionais (
    credencial_id,
    usuario_id,
    ator_id,
    evento,
    estado_anterior,
    estado_novo
  )
  VALUES (
    v_credencial.id,
    p_usuario_id,
    p_usuario_id,
    v_evento,
    v_anterior,
    jsonb_build_object(
      'cargoFuncao', v_credencial.cargo_funcao,
      'conselho', v_credencial.conselho,
      'uf', v_credencial.uf,
      'numeroRegistro', v_credencial.numero_registro,
      'categoria', v_credencial.categoria,
      'situacao', v_credencial.situacao
    )
  );

  RETURN v_credencial.id;
END;
$$;

CREATE OR REPLACE FUNCTION "private"."decidir_credencial_profissional_v22"(
  "p_gestor_id" uuid,
  "p_credencial_id" uuid,
  "p_decisao" text,
  "p_fonte_verificacao" text,
  "p_motivo_controlado" text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
DECLARE
  v_credencial private.credenciais_profissionais%ROWTYPE;
  v_decisao text := lower(trim(coalesce(p_decisao, '')));
  v_fonte text := lower(trim(coalesce(p_fonte_verificacao, '')));
  v_motivo text := nullif(trim(coalesce(p_motivo_controlado, '')), '');
  v_anterior jsonb;
BEGIN
  IF NOT private.usuario_gestao_municipal_v22(p_gestor_id) THEN
    RAISE EXCEPTION 'Gestao municipal nao autorizada';
  END IF;

  IF v_decisao NOT IN ('validar', 'rejeitar', 'expirar') THEN
    RAISE EXCEPTION 'Decisao de credencial invalida';
  END IF;

  SELECT c.*
  INTO v_credencial
  FROM private.credenciais_profissionais c
  WHERE c.id = p_credencial_id
  FOR UPDATE;

  IF NOT FOUND OR v_credencial.situacao <> 'pendente' THEN
    RAISE EXCEPTION 'Credencial nao esta pendente';
  END IF;

  IF v_credencial.usuario_id = p_gestor_id THEN
    RAISE EXCEPTION 'Autoaprovacao nao permitida';
  END IF;

  IF (v_credencial.conselho = 'CRM' AND v_fonte <> 'portal_cfm')
    OR (v_credencial.conselho = 'COREN' AND v_fonte <> 'consulta_cofen')
  THEN
    RAISE EXCEPTION 'Fonte oficial incompativel com o conselho';
  END IF;

  IF v_decisao IN ('rejeitar', 'expirar')
    AND (v_motivo IS NULL OR char_length(v_motivo) NOT BETWEEN 3 AND 500 OR v_motivo ~ '[0-9]{11}')
  THEN
    RAISE EXCEPTION 'Motivo controlado invalido';
  END IF;

  v_anterior := jsonb_build_object(
    'situacao', v_credencial.situacao,
    'fonteVerificacao', v_credencial.fonte_verificacao
  );

  UPDATE private.credenciais_profissionais
  SET situacao = CASE v_decisao
        WHEN 'validar' THEN 'validado'
        WHEN 'rejeitar' THEN 'rejeitado'
        ELSE 'expirado'
      END,
      decidido_em = now(),
      decidido_por = p_gestor_id,
      fonte_verificacao = v_fonte,
      motivo_controlado = CASE WHEN v_decisao = 'validar' THEN NULL ELSE v_motivo END
  WHERE id = p_credencial_id
  RETURNING * INTO v_credencial;

  INSERT INTO private.auditoria_credenciais_profissionais (
    credencial_id,
    usuario_id,
    ator_id,
    evento,
    estado_anterior,
    estado_novo,
    motivo_controlado
  )
  VALUES (
    v_credencial.id,
    v_credencial.usuario_id,
    p_gestor_id,
    v_decisao,
    v_anterior,
    jsonb_build_object(
      'situacao', v_credencial.situacao,
      'fonteVerificacao', v_credencial.fonte_verificacao,
      'decididoEm', v_credencial.decidido_em,
      'decididoPor', v_credencial.decidido_por
    ),
    v_credencial.motivo_controlado
  );

  RETURN jsonb_build_object(
    'credencialId', v_credencial.id,
    'usuarioId', v_credencial.usuario_id,
    'situacao', v_credencial.situacao
  );
END;
$$;

CREATE OR REPLACE FUNCTION "private"."listar_solicitacoes_perfil_v22"(
  "p_gestor_id" uuid
)
RETURNS TABLE (
  "usuario_id" uuid,
  "nome_completo" text,
  "email" text,
  "perfil_solicitado" text,
  "cargo_funcao" text,
  "ubs_solicitada_id" uuid,
  "ubs_solicitada_nome" text,
  "solicitado_em" timestamp with time zone,
  "origem_cadastro" text,
  "credencial_id" uuid,
  "conselho" text,
  "uf" character(2),
  "numero_registro" text,
  "categoria" text,
  "credencial_situacao" text,
  "credencial_submetida_em" timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
BEGIN
  IF NOT private.usuario_gestao_municipal_v22(p_gestor_id) THEN
    RAISE EXCEPTION 'Gestao municipal nao autorizada';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.nome_completo,
    p.email,
    p.perfil_solicitado,
    p.cargo_funcao,
    p.ubs_solicitada_id,
    u.nome,
    p.solicitado_em,
    p.origem_cadastro,
    c.id,
    c.conselho,
    c.uf,
    c.numero_registro,
    c.categoria,
    c.situacao,
    c.submetido_em
  FROM public.perfis p
  LEFT JOIN public.ubs u ON u.id = p.ubs_solicitada_id
  LEFT JOIN private.credenciais_profissionais c ON c.usuario_id = p.id
  WHERE p.aprovacao_status = 'pendente'
    AND p.status = 'ativo'::public.status_usuario
    AND p.ativo = true
    AND p.cadastro_completo = true
    AND p.perfil_excluido_em IS NULL
    AND p.perfil_solicitado IN ('equipe_ubs', 'acs', 'aluno')
  ORDER BY p.solicitado_em, p.nome_completo;
END;
$$;

CREATE OR REPLACE FUNCTION "private"."processar_solicitacao_perfil_v22"(
  "p_gestor_id" uuid,
  "p_usuario_id" uuid,
  "p_decisao" text,
  "p_ubs_id" uuid DEFAULT NULL,
  "p_microarea_id" uuid DEFAULT NULL,
  "p_perfil_esperado" text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
DECLARE
  v_perfil public.perfis%ROWTYPE;
  v_credencial private.credenciais_profissionais%ROWTYPE;
  v_decisao text := lower(trim(coalesce(p_decisao, '')));
  v_perfil_solicitado text;
  v_antes jsonb;
  v_depois jsonb;
BEGIN
  IF NOT private.usuario_gestao_municipal_v22(p_gestor_id) THEN
    RAISE EXCEPTION 'Gestao municipal nao autorizada';
  END IF;

  IF p_gestor_id = p_usuario_id THEN
    RAISE EXCEPTION 'Autoaprovacao nao permitida';
  END IF;

  IF v_decisao NOT IN ('aprovar', 'rejeitar') THEN
    RAISE EXCEPTION 'Decisao de perfil invalida';
  END IF;

  SELECT p.*
  INTO v_perfil
  FROM public.perfis p
  WHERE p.id = p_usuario_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_perfil.aprovacao_status <> 'pendente'
    OR v_perfil.status <> 'ativo'::public.status_usuario
    OR v_perfil.ativo IS NOT TRUE
    OR v_perfil.cadastro_completo IS NOT TRUE
    OR v_perfil.perfil_excluido_em IS NOT NULL
  THEN
    RAISE EXCEPTION 'Solicitacao nao esta elegivel ou pendente';
  END IF;

  v_perfil_solicitado := v_perfil.perfil_solicitado;

  IF v_perfil_solicitado IS NULL
    OR v_perfil_solicitado NOT IN ('equipe_ubs', 'acs', 'aluno')
  THEN
    RAISE EXCEPTION 'Perfil solicitado nao permitido';
  END IF;

  IF p_perfil_esperado IS NOT NULL AND p_perfil_esperado <> v_perfil_solicitado THEN
    RAISE EXCEPTION 'Perfil solicitado foi alterado; recarregue os dados';
  END IF;

  v_antes := jsonb_build_object(
    'perfil', v_perfil.perfil::text,
    'perfilSolicitado', v_perfil.perfil_solicitado,
    'aprovacaoStatus', v_perfil.aprovacao_status,
    'ativo', v_perfil.ativo,
    'ubsId', v_perfil.ubs_id,
    'ubsSolicitadaId', v_perfil.ubs_solicitada_id,
    'microareaId', v_perfil.microarea_id,
    'cargoFuncao', v_perfil.cargo_funcao
  );

  IF v_decisao = 'aprovar' THEN
    IF p_ubs_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.ubs u WHERE u.id = p_ubs_id AND u.ativa = true
    ) THEN
      RAISE EXCEPTION 'UBS ativa obrigatoria';
    END IF;

    IF v_perfil_solicitado = 'acs' THEN
      IF p_microarea_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.microareas m
        WHERE m.id = p_microarea_id
          AND m.ubs_id = p_ubs_id
          AND m.ativa = true
      ) THEN
        RAISE EXCEPTION 'Microarea ativa da UBS obrigatoria para ACS';
      END IF;
    ELSIF p_microarea_id IS NOT NULL THEN
      RAISE EXCEPTION 'Microarea somente pode ser atribuida a ACS';
    END IF;

    IF v_perfil_solicitado = 'equipe_ubs' THEN
      SELECT c.*
      INTO v_credencial
      FROM private.credenciais_profissionais c
      WHERE c.usuario_id = p_usuario_id
      FOR UPDATE;

      IF NOT FOUND
        OR v_credencial.situacao <> 'validado'
        OR v_credencial.decidido_por IS NULL
        OR v_credencial.decidido_em IS NULL
        OR NOT (
          (v_perfil.cargo_funcao = 'medico'
            AND v_credencial.cargo_funcao = 'medico'
            AND v_credencial.conselho = 'CRM'
            AND v_credencial.categoria = 'MEDICO')
          OR
          (v_perfil.cargo_funcao = 'enfermeiro'
            AND v_credencial.cargo_funcao = 'enfermeiro'
            AND v_credencial.conselho = 'COREN'
            AND v_credencial.categoria = 'ENFERMEIRO')
        )
      THEN
        RAISE EXCEPTION 'CRM ou COREN Enfermeiro validado e obrigatorio';
      END IF;
    END IF;

    UPDATE public.perfis
    SET perfil = v_perfil_solicitado::public.perfil_usuario,
        ubs_id = p_ubs_id,
        ubs_solicitada_id = p_ubs_id,
        microarea_id = CASE WHEN v_perfil_solicitado = 'acs' THEN p_microarea_id ELSE NULL END,
        aprovacao_status = 'aprovado',
        aprovado_em = now(),
        aprovado_por = p_gestor_id,
        perfil_excluido_em = NULL,
        perfil_excluido_por = NULL,
        updated_at = now()
    WHERE id = p_usuario_id;
  ELSE
    UPDATE public.perfis
    SET perfil = 'aluno'::public.perfil_usuario,
        ubs_id = NULL,
        microarea_id = NULL,
        aprovacao_status = 'rejeitado',
        aprovado_em = NULL,
        aprovado_por = p_gestor_id,
        updated_at = now()
    WHERE id = p_usuario_id;
  END IF;

  SELECT jsonb_build_object(
    'perfil', p.perfil::text,
    'perfilSolicitado', p.perfil_solicitado,
    'aprovacaoStatus', p.aprovacao_status,
    'ativo', p.ativo,
    'ubsId', p.ubs_id,
    'ubsSolicitadaId', p.ubs_solicitada_id,
    'microareaId', p.microarea_id,
    'cargoFuncao', p.cargo_funcao
  )
  INTO v_depois
  FROM public.perfis p
  WHERE p.id = p_usuario_id;

  INSERT INTO private.auditoria_perfis_v20 (
    administrador_id,
    perfil_alvo_id,
    acao,
    antes,
    depois
  )
  VALUES (
    p_gestor_id,
    p_usuario_id,
    CASE WHEN v_decisao = 'aprovar' THEN 'aprovar_v22' ELSE 'rejeitar_v22' END,
    v_antes,
    v_depois
  );

  IF v_decisao = 'aprovar' AND v_perfil_solicitado = 'equipe_ubs' THEN
    INSERT INTO private.auditoria_credenciais_profissionais (
      credencial_id,
      usuario_id,
      ator_id,
      evento,
      estado_novo
    )
    VALUES (
      v_credencial.id,
      p_usuario_id,
      p_gestor_id,
      'aprovar_perfil',
      jsonb_build_object(
        'situacao', v_credencial.situacao,
        'perfilAprovado', v_perfil_solicitado,
        'ubsId', p_ubs_id
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'usuarioId', p_usuario_id,
    'perfil', CASE WHEN v_decisao = 'aprovar' THEN v_perfil_solicitado ELSE 'aluno' END,
    'aprovacaoStatus', CASE WHEN v_decisao = 'aprovar' THEN 'aprovado' ELSE 'rejeitado' END
  );
END;
$$;

ALTER TABLE "private"."credenciais_profissionais" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."auditoria_credenciais_profissionais" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE "private"."credenciais_profissionais"
  FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL PRIVILEGES ON TABLE "private"."auditoria_credenciais_profissionais"
  FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL PRIVILEGES ON SEQUENCE "private"."auditoria_credenciais_profissionais_id_seq"
  FROM PUBLIC, "anon", "authenticated", "service_role";

REVOKE EXECUTE ON FUNCTION "private"."atualizar_credencial_profissional_v22"()
  FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE EXECUTE ON FUNCTION "private"."bloquear_mutacao_auditoria_v22"()
  FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE EXECUTE ON FUNCTION "private"."usuario_gestao_municipal_v22"(uuid)
  FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE EXECUTE ON FUNCTION "private"."submeter_credencial_profissional_v22"(uuid, text, text, text, text, text)
  FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE EXECUTE ON FUNCTION "private"."decidir_credencial_profissional_v22"(uuid, uuid, text, text, text)
  FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE EXECUTE ON FUNCTION "private"."listar_solicitacoes_perfil_v22"(uuid)
  FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE EXECUTE ON FUNCTION "private"."processar_solicitacao_perfil_v22"(uuid, uuid, text, uuid, uuid, text)
  FROM PUBLIC, "anon", "authenticated", "service_role";

GRANT EXECUTE ON FUNCTION "private"."submeter_credencial_profissional_v22"(uuid, text, text, text, text, text)
  TO "service_role";
GRANT EXECUTE ON FUNCTION "private"."decidir_credencial_profissional_v22"(uuid, uuid, text, text, text)
  TO "service_role";
GRANT EXECUTE ON FUNCTION "private"."listar_solicitacoes_perfil_v22"(uuid)
  TO "service_role";
GRANT EXECUTE ON FUNCTION "private"."processar_solicitacao_perfil_v22"(uuid, uuid, text, uuid, uuid, text)
  TO "service_role";

COMMIT;
