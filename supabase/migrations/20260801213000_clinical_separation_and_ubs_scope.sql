BEGIN;

DO $$
BEGIN
  IF to_regclass('private.credenciais_profissionais') IS NULL THEN
    RAISE EXCEPTION 'A migracao de credenciais profissionais deve ser aplicada primeiro';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "private"."usuario_equipe_clinica_elegivel_v23"(
  "p_usuario_id" uuid,
  "p_ubs_id" uuid DEFAULT NULL
) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfis p
    JOIN public.ubs u
      ON u.id = p.ubs_id
     AND u.ativa = true
    JOIN private.credenciais_profissionais c
      ON c.usuario_id = p.id
    WHERE p.id = p_usuario_id
      AND p.perfil = 'equipe_ubs'::public.perfil_usuario
      AND p.status = 'ativo'::public.status_usuario
      AND p.ativo = true
      AND p.cadastro_completo = true
      AND p.aprovacao_status = 'aprovado'
      AND p.perfil_excluido_em IS NULL
      AND p.ubs_id IS NOT NULL
      AND (p_ubs_id IS NULL OR p.ubs_id = p_ubs_id)
      AND c.situacao = 'validado'
      AND c.decidido_em IS NOT NULL
      AND c.cargo_funcao = p.cargo_funcao
      AND (
        (
          p.cargo_funcao = 'medico'
          AND c.conselho = 'CRM'
          AND c.categoria = 'MEDICO'
        )
        OR (
          p.cargo_funcao = 'enfermeiro'
          AND c.conselho = 'COREN'
          AND c.categoria = 'ENFERMEIRO'
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION "private"."exigir_usuario_v1"(
  "p_usuario_id" uuid,
  "p_perfis" text[],
  "p_exigir_ubs" boolean DEFAULT false,
  "p_exigir_microarea" boolean DEFAULT false
) RETURNS public.perfis
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
DECLARE
  v_perfil public.perfis%ROWTYPE;
BEGIN
  SELECT p.*
  INTO v_perfil
  FROM public.perfis p
  WHERE p.id = p_usuario_id
    AND p.cadastro_completo = true
    AND p.aprovacao_status = 'aprovado'
    AND p.status = 'ativo'::public.status_usuario
    AND p.ativo = true
    AND p.perfil_excluido_em IS NULL
    AND p.perfil::text = ANY (p_perfis)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario sem perfil ativo e autorizado';
  END IF;

  IF v_perfil.perfil = 'administrador'::public.perfil_usuario THEN
    RAISE EXCEPTION 'O perfil tecnico nao possui acesso operacional';
  END IF;

  IF v_perfil.perfil = 'equipe_ubs'::public.perfil_usuario
     AND NOT private.usuario_equipe_clinica_elegivel_v23(
       p_usuario_id,
       CASE WHEN p_exigir_ubs THEN v_perfil.ubs_id ELSE NULL END
     ) THEN
    RAISE EXCEPTION 'Profissional sem credencial clinica valida';
  END IF;

  IF p_exigir_ubs AND v_perfil.ubs_id IS NULL THEN
    RAISE EXCEPTION 'Usuario sem UBS autorizada';
  END IF;

  IF p_exigir_microarea AND (
    v_perfil.ubs_id IS NULL
    OR v_perfil.microarea_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.microareas m
      WHERE m.id = v_perfil.microarea_id
        AND m.ubs_id = v_perfil.ubs_id
        AND m.ativa = true
    )
  ) THEN
    RAISE EXCEPTION 'Usuario sem microarea ativa e coerente com a UBS';
  END IF;

  RETURN v_perfil;
END
$$;

CREATE OR REPLACE FUNCTION "private"."usuario_pode_gerenciar_gestante_v19"(
  "p_usuario_id" uuid,
  "p_gestante_id" uuid
) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pec_gestantes g
    JOIN public.perfis p ON p.id = p_usuario_id
    WHERE g.id = p_gestante_id
      AND g.excluida_em IS NULL
      AND g.ubs_id = p.ubs_id
      AND private.usuario_equipe_clinica_elegivel_v23(p_usuario_id, g.ubs_id)
  )
$$;

CREATE OR REPLACE FUNCTION "private"."usuario_pode_operar_lixeira_v20"(
  "p_usuario_id" uuid,
  "p_gestante_id" uuid
) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pec_gestantes g
    JOIN public.perfis p ON p.id = p_usuario_id
    WHERE g.id = p_gestante_id
      AND g.excluida_em IS NOT NULL
      AND g.ubs_id = p.ubs_id
      AND private.usuario_equipe_clinica_elegivel_v23(p_usuario_id, g.ubs_id)
  )
$$;

DO $$
BEGIN
  IF to_regprocedure(
    'private.importar_pec_impl_v22(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb)'
  ) IS NULL THEN
    ALTER FUNCTION private.importar_pec(
      uuid,
      uuid,
      text,
      text,
      integer,
      jsonb,
      jsonb,
      jsonb
    ) RENAME TO importar_pec_impl_v22;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "private"."importar_pec"(
  "p_ubs_id" uuid,
  "p_usuario_id" uuid,
  "p_arquivo_nome" text,
  "p_arquivo_sha256" text,
  "p_linha_cabecalho" integer,
  "p_mapeamento" jsonb,
  "p_linhas" jsonb,
  "p_avisos" jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
BEGIN
  IF NOT private.usuario_equipe_clinica_elegivel_v23(
    p_usuario_id,
    p_ubs_id
  ) THEN
    RAISE EXCEPTION 'Importacao PEC permitida somente para equipe elegivel da propria UBS';
  END IF;

  RETURN private.importar_pec_impl_v22(
    p_ubs_id,
    p_usuario_id,
    p_arquivo_nome,
    p_arquivo_sha256,
    p_linha_cabecalho,
    p_mapeamento,
    p_linhas,
    p_avisos
  );
END
$$;

CREATE OR REPLACE FUNCTION "private"."validar_importacao_pec_v23"()
RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
BEGIN
  IF NOT private.usuario_equipe_clinica_elegivel_v23(NEW.usuario_id, NEW.ubs_id) THEN
    RAISE EXCEPTION 'Importacao PEC permitida somente para equipe elegivel da propria UBS';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS "trg_validar_importacao_pec_v23"
  ON "public"."importacoes_pec_resumo";
CREATE TRIGGER "trg_validar_importacao_pec_v23"
BEFORE INSERT OR UPDATE OF "ubs_id", "usuario_id"
ON "public"."importacoes_pec_resumo"
FOR EACH ROW
EXECUTE FUNCTION "private"."validar_importacao_pec_v23"();

CREATE OR REPLACE FUNCTION "security"."usuario_equipe_clinica_elegivel_v23"(
  "p_ubs_id" uuid DEFAULT NULL
) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
  SELECT private.usuario_equipe_clinica_elegivel_v23(auth.uid(), p_ubs_id)
$$;

CREATE OR REPLACE FUNCTION "security"."usuario_pode_acessar_gestante_v18"(
  "p_gestante_id" uuid
) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pec_gestantes g
    JOIN public.perfis p ON p.id = auth.uid()
    WHERE g.id = p_gestante_id
      AND g.excluida_em IS NULL
      AND p.cadastro_completo = true
      AND p.aprovacao_status = 'aprovado'
      AND p.status = 'ativo'::public.status_usuario
      AND p.ativo = true
      AND p.perfil_excluido_em IS NULL
      AND (
        (
          p.perfil = 'equipe_ubs'::public.perfil_usuario
          AND g.ubs_id = p.ubs_id
          AND private.usuario_equipe_clinica_elegivel_v23(p.id, g.ubs_id)
        )
        OR (
          p.perfil = 'acs'::public.perfil_usuario
          AND g.ubs_id = p.ubs_id
          AND g.microarea_id = p.microarea_id
          AND EXISTS (
            SELECT 1
            FROM public.microareas m
            WHERE m.id = p.microarea_id
              AND m.ubs_id = p.ubs_id
              AND m.ativa = true
          )
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION "private"."esvaziar_lixeira_v19"(
  "p_usuario_id" uuid
) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
DECLARE
  v_perfil public.perfis%ROWTYPE;
  v_item record;
  v_total integer := 0;
BEGIN
  v_perfil := private.exigir_usuario_v1(
    p_usuario_id,
    ARRAY['equipe_ubs']::text[],
    true,
    false
  );

  FOR v_item IN
    SELECT
      g.id,
      g.ubs_id,
      g.exclusao_motivo,
      g.excluida_em,
      g.exclusao_definitiva_prevista_em
    FROM public.pec_gestantes g
    WHERE g.ubs_id = v_perfil.ubs_id
      AND g.excluida_em IS NOT NULL
      AND coalesce(
        g.exclusao_definitiva_prevista_em,
        g.excluida_em + interval '10 days'
      ) <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO private.auditoria_exclusoes_gestantes (
      gestante_hash,
      usuario_id,
      ubs_id,
      acao,
      motivo,
      metadados
    ) VALUES (
      private.hash_gestante_auditoria_v19(v_item.id),
      p_usuario_id,
      v_item.ubs_id,
      'expiracao_automatica',
      v_item.exclusao_motivo,
      jsonb_build_object(
        'excluida_em', v_item.excluida_em,
        'prazo_final', v_item.exclusao_definitiva_prevista_em,
        'regra', 'lixeira_ubs_v23'
      )
    );

    DELETE FROM private.identidades_gestantes
    WHERE gestante_id = v_item.id;

    DELETE FROM public.pec_gestantes
    WHERE id = v_item.id;

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END
$$;

CREATE OR REPLACE FUNCTION "private"."listar_lixeira_gestantes_v19"(
  "p_usuario_id" uuid,
  "p_exibir_identidade" boolean DEFAULT true
) RETURNS TABLE(
  "gestante_id" uuid,
  "codigo" text,
  "nome_visual" text,
  "ubs_nome" text,
  "microarea_codigo" text,
  "excluida_em" timestamptz,
  "excluir_em" timestamptz,
  "exclusao_motivo" text
)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public', 'private', 'extensions'
AS $$
DECLARE
  v_perfil public.perfis%ROWTYPE;
  v_total integer := 0;
BEGIN
  v_perfil := private.exigir_usuario_v1(
    p_usuario_id,
    ARRAY['equipe_ubs']::text[],
    true,
    false
  );

  SELECT count(*)::integer
  INTO v_total
  FROM public.pec_gestantes g
  WHERE g.excluida_em IS NOT NULL
    AND g.ubs_id = v_perfil.ubs_id;

  IF p_exibir_identidade AND v_total > 0 THEN
    INSERT INTO private.acessos_identidade_gestantes (
      usuario_id,
      ubs_id,
      perfil,
      finalidade,
      total_registros
    ) VALUES (
      p_usuario_id,
      v_perfil.ubs_id,
      v_perfil.perfil::text,
      'visualizacao_lixeira_ubs_v23',
      v_total
    );
  END IF;

  RETURN QUERY
  SELECT
    g.id,
    g.codigo,
    CASE
      WHEN p_exibir_identidade THEN coalesce(
        nullif(private.descriptografar_texto(i.nome_enc), ''),
        'Nome nao disponivel'
      )
      ELSE 'Gestante ' || g.codigo
    END,
    u.nome,
    m.codigo,
    g.excluida_em,
    coalesce(
      g.exclusao_definitiva_prevista_em,
      g.excluida_em + interval '10 days'
    ),
    g.exclusao_motivo
  FROM public.pec_gestantes g
  JOIN public.ubs u ON u.id = g.ubs_id
  LEFT JOIN public.microareas m ON m.id = g.microarea_id
  LEFT JOIN private.identidades_gestantes i ON i.gestante_id = g.id
  WHERE g.excluida_em IS NOT NULL
    AND g.ubs_id = v_perfil.ubs_id
  ORDER BY coalesce(
    g.exclusao_definitiva_prevista_em,
    g.excluida_em + interval '10 days'
  ) ASC;
END
$$;

DROP POLICY IF EXISTS "pec_gestantes_clinica_write" ON public.pec_gestantes;
CREATE POLICY "pec_gestantes_clinica_write"
  ON public.pec_gestantes FOR ALL TO authenticated
  USING (
    security.usuario_equipe_clinica_elegivel_v23(ubs_id)
    AND ubs_id = security.usuario_ubs_id()
  )
  WITH CHECK (
    security.usuario_equipe_clinica_elegivel_v23(ubs_id)
    AND ubs_id = security.usuario_ubs_id()
  );

DROP POLICY IF EXISTS "importacoes_pec_resumo_equipe_select" ON public.importacoes_pec_resumo;
CREATE POLICY "importacoes_pec_resumo_equipe_select"
  ON public.importacoes_pec_resumo FOR SELECT TO authenticated
  USING (
    security.usuario_equipe_clinica_elegivel_v23(ubs_id)
    AND ubs_id = security.usuario_ubs_id()
  );

DROP POLICY IF EXISTS "importacoes_pec_resumo_equipe_write" ON public.importacoes_pec_resumo;
CREATE POLICY "importacoes_pec_resumo_equipe_write"
  ON public.importacoes_pec_resumo FOR ALL TO authenticated
  USING (
    security.usuario_equipe_clinica_elegivel_v23(ubs_id)
    AND ubs_id = security.usuario_ubs_id()
  )
  WITH CHECK (
    security.usuario_equipe_clinica_elegivel_v23(ubs_id)
    AND ubs_id = security.usuario_ubs_id()
    AND usuario_id = auth.uid()
  );

DROP POLICY IF EXISTS "gestante_consultas_equipe_write" ON public.gestante_consultas;
CREATE POLICY "gestante_consultas_equipe_write"
  ON public.gestante_consultas FOR ALL TO authenticated
  USING (
    security.usuario_equipe_clinica_elegivel_v23(security.usuario_ubs_id())
    AND security.usuario_pode_acessar_gestante_v18(gestante_id)
  )
  WITH CHECK (
    security.usuario_equipe_clinica_elegivel_v23(security.usuario_ubs_id())
    AND security.usuario_pode_acessar_gestante_v18(gestante_id)
  );

DROP POLICY IF EXISTS "gestante_exames_equipe_write" ON public.gestante_exames;
CREATE POLICY "gestante_exames_equipe_write"
  ON public.gestante_exames FOR ALL TO authenticated
  USING (
    security.usuario_equipe_clinica_elegivel_v23(security.usuario_ubs_id())
    AND security.usuario_pode_acessar_gestante_v18(gestante_id)
  )
  WITH CHECK (
    security.usuario_equipe_clinica_elegivel_v23(security.usuario_ubs_id())
    AND security.usuario_pode_acessar_gestante_v18(gestante_id)
  );

DROP POLICY IF EXISTS "gestante_vacinas_equipe_write" ON public.gestante_vacinas;
CREATE POLICY "gestante_vacinas_equipe_write"
  ON public.gestante_vacinas FOR ALL TO authenticated
  USING (
    security.usuario_equipe_clinica_elegivel_v23(security.usuario_ubs_id())
    AND security.usuario_pode_acessar_gestante_v18(gestante_id)
  )
  WITH CHECK (
    security.usuario_equipe_clinica_elegivel_v23(security.usuario_ubs_id())
    AND security.usuario_pode_acessar_gestante_v18(gestante_id)
  );

DROP POLICY IF EXISTS "gestante_altas_equipe_write" ON public.gestante_altas;
CREATE POLICY "gestante_altas_equipe_write"
  ON public.gestante_altas FOR ALL TO authenticated
  USING (
    security.usuario_equipe_clinica_elegivel_v23(security.usuario_ubs_id())
    AND security.usuario_pode_acessar_gestante_v18(gestante_id)
  )
  WITH CHECK (
    security.usuario_equipe_clinica_elegivel_v23(security.usuario_ubs_id())
    AND security.usuario_pode_acessar_gestante_v18(gestante_id)
  );

DROP POLICY IF EXISTS "classificacoes_risco_equipe_write" ON public.classificacoes_risco_gestacional;
CREATE POLICY "classificacoes_risco_equipe_write"
  ON public.classificacoes_risco_gestacional FOR ALL TO authenticated
  USING (
    security.usuario_equipe_clinica_elegivel_v23(security.usuario_ubs_id())
    AND security.usuario_pode_acessar_gestante_v18(gestante_id)
  )
  WITH CHECK (
    security.usuario_equipe_clinica_elegivel_v23(security.usuario_ubs_id())
    AND security.usuario_pode_acessar_gestante_v18(gestante_id)
  );

DROP POLICY IF EXISTS "classificacao_itens_equipe_write" ON public.classificacao_risco_itens;
CREATE POLICY "classificacao_itens_equipe_write"
  ON public.classificacao_risco_itens FOR ALL TO authenticated
  USING (
    security.usuario_equipe_clinica_elegivel_v23(security.usuario_ubs_id())
    AND EXISTS (
      SELECT 1
      FROM public.classificacoes_risco_gestacional c
      WHERE c.id = classificacao_risco_itens.classificacao_id
        AND security.usuario_pode_acessar_gestante_v18(c.gestante_id)
    )
  )
  WITH CHECK (
    security.usuario_equipe_clinica_elegivel_v23(security.usuario_ubs_id())
    AND EXISTS (
      SELECT 1
      FROM public.classificacoes_risco_gestacional c
      WHERE c.id = classificacao_risco_itens.classificacao_id
        AND security.usuario_pode_acessar_gestante_v18(c.gestante_id)
    )
  );

DROP POLICY IF EXISTS "visitas_acs_territorio_select" ON public.visitas_acs_v21;
CREATE POLICY "visitas_acs_territorio_select"
  ON public.visitas_acs_v21 FOR SELECT TO authenticated
  USING (
    (
      security.usuario_equipe_clinica_elegivel_v23(ubs_id)
      AND ubs_id = security.usuario_ubs_id()
    )
    OR (
      security.usuario_perfil() = 'acs'::public.perfil_usuario
      AND ubs_id = security.usuario_ubs_id()
      AND microarea_id = security.usuario_microarea_id()
    )
  );

DROP POLICY IF EXISTS "visitas_acs_proprio_write" ON public.visitas_acs_v21;
CREATE POLICY "visitas_acs_proprio_write"
  ON public.visitas_acs_v21 FOR ALL TO authenticated
  USING (
    security.usuario_perfil() = 'acs'::public.perfil_usuario
    AND acs_id = auth.uid()
    AND ubs_id = security.usuario_ubs_id()
    AND microarea_id = security.usuario_microarea_id()
  )
  WITH CHECK (
    security.usuario_perfil() = 'acs'::public.perfil_usuario
    AND acs_id = auth.uid()
    AND ubs_id = security.usuario_ubs_id()
    AND microarea_id = security.usuario_microarea_id()
  );

REVOKE EXECUTE ON FUNCTION "private"."usuario_equipe_clinica_elegivel_v23"(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION "private"."validar_importacao_pec_v23"()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION "private"."importar_pec_impl_v22"(uuid, uuid, text, text, integer, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION "private"."importar_pec"(uuid, uuid, text, text, integer, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION "private"."exigir_usuario_v1"(uuid, text[], boolean, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION "private"."usuario_pode_gerenciar_gestante_v19"(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION "private"."usuario_pode_operar_lixeira_v20"(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION "private"."esvaziar_lixeira_v19"(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION "private"."listar_lixeira_gestantes_v19"(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION "security"."usuario_equipe_clinica_elegivel_v23"(uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION "security"."usuario_pode_acessar_gestante_v18"(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION "private"."usuario_equipe_clinica_elegivel_v23"(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION "private"."importar_pec"(uuid, uuid, text, text, integer, jsonb, jsonb, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION "private"."esvaziar_lixeira_v19"(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION "private"."listar_lixeira_gestantes_v19"(uuid, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION "security"."usuario_equipe_clinica_elegivel_v23"(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION "security"."usuario_pode_acessar_gestante_v18"(uuid)
  TO authenticated;

COMMIT;
