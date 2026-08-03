-- Dashboard PET Saúde
-- V29.1 — visitas completas para ACS e equipe UBS.
--
-- Regras:
-- 1. ACS continua restrito à própria UBS e microárea.
-- 2. Equipe UBS consulta somente a própria unidade e exige credencial válida.
-- 3. Acompanhamento da equipe é separado do registro original do ACS.
-- 4. Gestão, administrador e aluno não recebem acesso individual.
-- 5. Funções SECURITY DEFINER revalidam ator e território.

BEGIN;

CREATE TABLE IF NOT EXISTS public.acompanhamentos_visitas_equipe_v29_1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestante_id uuid NOT NULL
    REFERENCES public.pec_gestantes(id) ON DELETE CASCADE,
  visita_id uuid
    REFERENCES public.visitas_acs_v21(id) ON DELETE SET NULL,
  profissional_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  ubs_id uuid NOT NULL
    REFERENCES public.ubs(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  tipo text NOT NULL,
  observacao text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  removido_em timestamptz,
  removido_por uuid REFERENCES auth.users(id),
  CONSTRAINT acompanhamentos_visitas_tipo_v29_1_check
    CHECK (
      tipo IN (
        'acompanhamento',
        'encaminhamento',
        'contato_acs',
        'resolvido'
      )
    ),
  CONSTRAINT acompanhamentos_visitas_observacao_v29_1_check
    CHECK (
      char_length(btrim(observacao)) BETWEEN 3 AND 500
    )
);

CREATE INDEX IF NOT EXISTS acompanhamentos_visitas_ubs_v29_1_idx
  ON public.acompanhamentos_visitas_equipe_v29_1
    (ubs_id, criado_em DESC)
  WHERE removido_em IS NULL;

CREATE INDEX IF NOT EXISTS acompanhamentos_visitas_gestante_v29_1_idx
  ON public.acompanhamentos_visitas_equipe_v29_1
    (gestante_id, criado_em DESC)
  WHERE removido_em IS NULL;

ALTER TABLE public.acompanhamentos_visitas_equipe_v29_1
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.acompanhamentos_visitas_equipe_v29_1
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.acompanhamentos_visitas_equipe_v29_1
FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS private.auditoria_acompanhamentos_visitas_v29_1 (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  acompanhamento_id uuid NOT NULL,
  profissional_id uuid NOT NULL,
  gestante_hash text NOT NULL,
  ubs_id uuid NOT NULL,
  acao text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE
  private.auditoria_acompanhamentos_visitas_v29_1
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.obter_painel_visitas_acs_v29_1(
  p_usuario_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public, private
AS $function$
DECLARE
  v_contexto public.perfis%rowtype;
  v_base jsonb;
  v_historico jsonb;
BEGIN
  v_contexto := private.exigir_usuario_v1(
    p_usuario_id,
    ARRAY['acs']::text[],
    true,
    true
  );

  v_base := private.obter_painel_acs_v21(p_usuario_id);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', v.id,
        'gestanteId', g.id,
        'gestanteCodigo', g.codigo,
        'gestanteNome', COALESCE(
          NULLIF(private.descriptografar_texto(i.nome_enc), ''),
          'Nome não disponível'
        ),
        'acsId', v.acs_id,
        'acsNome', COALESCE(p.nome_completo, 'ACS'),
        'microareaId', v.microarea_id,
        'microareaCodigo', m.codigo,
        'dataAcao', v.data_acao,
        'compareceu', v.compareceu,
        'motivoFalta', v.motivo_falta,
        'orientacoes', v.orientacoes,
        'sinaisAlerta', v.sinais_alerta,
        'observacao', v.observacao,
        'criadoEm', v.criado_em,
        'atualizadoEm', v.atualizado_em
      )
      ORDER BY v.data_acao DESC, v.criado_em DESC
    ),
    '[]'::jsonb
  )
  INTO v_historico
  FROM (
    SELECT *
    FROM public.visitas_acs_v21
    WHERE acs_id = p_usuario_id
      AND ubs_id = v_contexto.ubs_id
      AND microarea_id = v_contexto.microarea_id
      AND removido_em IS NULL
    ORDER BY data_acao DESC, criado_em DESC
    LIMIT 250
  ) v
  JOIN public.pec_gestantes g
    ON g.id = v.gestante_id
   AND g.ubs_id = v_contexto.ubs_id
   AND g.microarea_id = v_contexto.microarea_id
  JOIN public.microareas m
    ON m.id = v.microarea_id
   AND m.ubs_id = v.ubs_id
  LEFT JOIN public.perfis p
    ON p.id = v.acs_id
  LEFT JOIN private.identidades_gestantes i
    ON i.gestante_id = g.id;

  RETURN COALESCE(v_base, '{}'::jsonb) ||
    jsonb_build_object('historico', v_historico);
END
$function$;

CREATE OR REPLACE FUNCTION private.obter_painel_visitas_equipe_v29_1(
  p_usuario_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO pg_catalog, public, private
AS $function$
DECLARE
  v_contexto public.perfis%rowtype;
  v_ubs_nome text;
  v_metricas jsonb;
  v_microareas jsonb;
  v_agentes jsonb;
  v_pendencias jsonb;
  v_historico jsonb;
  v_acompanhamentos jsonb;
  v_total_identidades integer;
BEGIN
  v_contexto := private.exigir_usuario_v1(
    p_usuario_id,
    ARRAY['equipe_ubs']::text[],
    true,
    false
  );

  IF NOT private.usuario_equipe_clinica_elegivel_v23(
    p_usuario_id,
    v_contexto.ubs_id
  ) THEN
    RAISE EXCEPTION 'Equipe UBS sem credencial clínica válida';
  END IF;

  SELECT nome
  INTO v_ubs_nome
  FROM public.ubs
  WHERE id = v_contexto.ubs_id
    AND ativa = true;

  IF v_ubs_nome IS NULL THEN
    RAISE EXCEPTION 'UBS ativa não encontrada';
  END IF;

  WITH ultimas AS (
    SELECT DISTINCT ON (v.gestante_id)
      v.gestante_id,
      v.id,
      v.data_acao,
      v.compareceu,
      v.sinais_alerta
    FROM public.visitas_acs_v21 v
    WHERE v.ubs_id = v_contexto.ubs_id
      AND v.removido_em IS NULL
    ORDER BY
      v.gestante_id,
      v.data_acao DESC,
      v.criado_em DESC
  ),
  gestantes AS (
    SELECT
      g.id,
      g.microarea_id,
      u.id AS ultima_visita_id,
      u.data_acao AS ultima_visita,
      u.compareceu AS ultima_compareceu,
      u.sinais_alerta AS ultimo_alerta,
      CASE
        WHEN u.data_acao IS NULL THEN 9999
        ELSE GREATEST(current_date - u.data_acao, 0)
      END AS dias_sem_visita
    FROM public.pec_gestantes g
    LEFT JOIN ultimas u ON u.gestante_id = g.id
    WHERE g.ubs_id = v_contexto.ubs_id
      AND g.excluida_em IS NULL
      AND COALESCE(g.alta_ativa, false) = false
  )
  SELECT jsonb_build_object(
    'gestantesAtivas', COUNT(*),
    'visitadas30Dias', COUNT(*) FILTER (
      WHERE ultima_visita >= current_date - 30
        AND ultima_compareceu = true
    ),
    'pendentes30Dias', COUNT(*) FILTER (
      WHERE ultima_visita IS NULL
         OR ultima_visita <= current_date - 30
    ),
    'naoEncontradas30Dias', (
      SELECT COUNT(*)
      FROM public.visitas_acs_v21 v
      WHERE v.ubs_id = v_contexto.ubs_id
        AND v.data_acao >= current_date - 30
        AND v.compareceu = false
        AND v.removido_em IS NULL
    ),
    'sinaisAlerta30Dias', (
      SELECT COUNT(*)
      FROM public.visitas_acs_v21 v
      WHERE v.ubs_id = v_contexto.ubs_id
        AND v.data_acao >= current_date - 30
        AND v.sinais_alerta = true
        AND v.removido_em IS NULL
    )
  )
  INTO v_metricas
  FROM gestantes;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'codigo', m.codigo
      )
      ORDER BY m.codigo
    ),
    '[]'::jsonb
  )
  INTO v_microareas
  FROM public.microareas m
  WHERE m.ubs_id = v_contexto.ubs_id
    AND m.ativa = true;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'nome', p.nome_completo,
        'microareaId', p.microarea_id,
        'microareaCodigo', m.codigo
      )
      ORDER BY p.nome_completo
    ),
    '[]'::jsonb
  )
  INTO v_agentes
  FROM public.perfis p
  LEFT JOIN public.microareas m
    ON m.id = p.microarea_id
   AND m.ubs_id = p.ubs_id
  WHERE p.perfil::text = 'acs'
    AND p.ubs_id = v_contexto.ubs_id
    AND p.status = 'ativo'
    AND p.ativo = true
    AND p.aprovacao_status = 'aprovado'
    AND p.perfil_excluido_em IS NULL;

  WITH ultimas AS (
    SELECT DISTINCT ON (v.gestante_id)
      v.gestante_id,
      v.id,
      v.data_acao,
      v.compareceu,
      v.sinais_alerta
    FROM public.visitas_acs_v21 v
    WHERE v.ubs_id = v_contexto.ubs_id
      AND v.removido_em IS NULL
    ORDER BY
      v.gestante_id,
      v.data_acao DESC,
      v.criado_em DESC
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'codigo', g.codigo,
        'nome', COALESCE(
          NULLIF(private.descriptografar_texto(i.nome_enc), ''),
          'Nome não disponível'
        ),
        'risco', g.risco_gestacional,
        'microareaId', g.microarea_id,
        'microareaCodigo', m.codigo,
        'ultimaVisita', u.data_acao,
        'ultimaCompareceu', u.compareceu,
        'ultimoAlerta', u.sinais_alerta,
        'diasSemVisita', CASE
          WHEN u.data_acao IS NULL THEN 9999
          ELSE GREATEST(current_date - u.data_acao, 0)
        END,
        'semVisita30d', (
          u.data_acao IS NULL OR u.data_acao <= current_date - 30
        ),
        'altoRisco', (
          lower(COALESCE(g.risco_gestacional, '')) LIKE '%alto%'
        )
      )
      ORDER BY
        CASE
          WHEN u.data_acao IS NULL THEN 1
          WHEN u.data_acao <= current_date - 30 THEN 2
          WHEN lower(COALESCE(g.risco_gestacional, '')) LIKE '%alto%' THEN 3
          ELSE 4
        END,
        m.codigo,
        g.codigo
    ),
    '[]'::jsonb
  )
  INTO v_pendencias
  FROM public.pec_gestantes g
  JOIN public.microareas m
    ON m.id = g.microarea_id
   AND m.ubs_id = g.ubs_id
  LEFT JOIN ultimas u
    ON u.gestante_id = g.id
  LEFT JOIN private.identidades_gestantes i
    ON i.gestante_id = g.id
  WHERE g.ubs_id = v_contexto.ubs_id
    AND g.excluida_em IS NULL
    AND COALESCE(g.alta_ativa, false) = false;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', v.id,
        'gestanteId', g.id,
        'gestanteCodigo', g.codigo,
        'gestanteNome', COALESCE(
          NULLIF(private.descriptografar_texto(i.nome_enc), ''),
          'Nome não disponível'
        ),
        'acsId', v.acs_id,
        'acsNome', COALESCE(p.nome_completo, 'ACS'),
        'microareaId', v.microarea_id,
        'microareaCodigo', m.codigo,
        'dataAcao', v.data_acao,
        'compareceu', v.compareceu,
        'motivoFalta', v.motivo_falta,
        'orientacoes', v.orientacoes,
        'sinaisAlerta', v.sinais_alerta,
        'observacao', v.observacao,
        'criadoEm', v.criado_em,
        'atualizadoEm', v.atualizado_em
      )
      ORDER BY v.data_acao DESC, v.criado_em DESC
    ),
    '[]'::jsonb
  )
  INTO v_historico
  FROM (
    SELECT *
    FROM public.visitas_acs_v21
    WHERE ubs_id = v_contexto.ubs_id
      AND removido_em IS NULL
    ORDER BY data_acao DESC, criado_em DESC
    LIMIT 500
  ) v
  JOIN public.pec_gestantes g
    ON g.id = v.gestante_id
   AND g.ubs_id = v_contexto.ubs_id
  JOIN public.microareas m
    ON m.id = v.microarea_id
   AND m.ubs_id = v.ubs_id
  LEFT JOIN public.perfis p
    ON p.id = v.acs_id
  LEFT JOIN private.identidades_gestantes i
    ON i.gestante_id = g.id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'gestanteId', g.id,
        'gestanteCodigo', g.codigo,
        'gestanteNome', COALESCE(
          NULLIF(private.descriptografar_texto(i.nome_enc), ''),
          'Nome não disponível'
        ),
        'profissionalNome', COALESCE(p.nome_completo, 'Equipe UBS'),
        'tipo', a.tipo,
        'observacao', a.observacao,
        'criadoEm', a.criado_em
      )
      ORDER BY a.criado_em DESC
    ),
    '[]'::jsonb
  )
  INTO v_acompanhamentos
  FROM (
    SELECT *
    FROM public.acompanhamentos_visitas_equipe_v29_1
    WHERE ubs_id = v_contexto.ubs_id
      AND removido_em IS NULL
    ORDER BY criado_em DESC
    LIMIT 250
  ) a
  JOIN public.pec_gestantes g
    ON g.id = a.gestante_id
   AND g.ubs_id = v_contexto.ubs_id
  LEFT JOIN private.identidades_gestantes i
    ON i.gestante_id = g.id
  LEFT JOIN public.perfis p
    ON p.id = a.profissional_id;

  SELECT COUNT(*)
  INTO v_total_identidades
  FROM public.pec_gestantes g
  WHERE g.ubs_id = v_contexto.ubs_id
    AND g.excluida_em IS NULL
    AND COALESCE(g.alta_ativa, false) = false;

  INSERT INTO private.acessos_identidade_gestantes (
    usuario_id,
    ubs_id,
    perfil,
    finalidade,
    total_registros
  )
  VALUES (
    p_usuario_id,
    v_contexto.ubs_id,
    'equipe_ubs',
    'acompanhamento_visitas_ubs',
    v_total_identidades
  );

  RETURN jsonb_build_object(
    'nome', v_contexto.nome_completo,
    'ubsId', v_contexto.ubs_id,
    'ubsNome', v_ubs_nome,
    'atualizadoEm', now(),
    'metricas', v_metricas,
    'microareas', v_microareas,
    'agentes', v_agentes,
    'pendencias', v_pendencias,
    'historico', v_historico,
    'acompanhamentos', v_acompanhamentos
  );
END
$function$;

CREATE OR REPLACE FUNCTION private.registrar_acompanhamento_visita_v29_1(
  p_usuario_id uuid,
  p_gestante_id uuid,
  p_visita_id uuid,
  p_tipo text,
  p_observacao text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, private
AS $function$
DECLARE
  v_contexto public.perfis%rowtype;
  v_id uuid;
  v_observacao text;
BEGIN
  v_contexto := private.exigir_usuario_v1(
    p_usuario_id,
    ARRAY['equipe_ubs']::text[],
    true,
    false
  );

  IF NOT private.usuario_equipe_clinica_elegivel_v23(
    p_usuario_id,
    v_contexto.ubs_id
  ) THEN
    RAISE EXCEPTION 'Equipe UBS sem credencial clínica válida';
  END IF;

  IF p_tipo NOT IN (
    'acompanhamento',
    'encaminhamento',
    'contato_acs',
    'resolvido'
  ) THEN
    RAISE EXCEPTION 'Tipo de acompanhamento inválido';
  END IF;

  v_observacao := btrim(COALESCE(p_observacao, ''));

  IF char_length(v_observacao) < 3
     OR char_length(v_observacao) > 500
  THEN
    RAISE EXCEPTION 'Observação fora do limite permitido';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pec_gestantes g
    WHERE g.id = p_gestante_id
      AND g.ubs_id = v_contexto.ubs_id
      AND g.excluida_em IS NULL
      AND COALESCE(g.alta_ativa, false) = false
  ) THEN
    RAISE EXCEPTION 'Gestante fora da UBS autorizada';
  END IF;

  IF p_visita_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.visitas_acs_v21 v
    WHERE v.id = p_visita_id
      AND v.gestante_id = p_gestante_id
      AND v.ubs_id = v_contexto.ubs_id
      AND v.removido_em IS NULL
  ) THEN
    RAISE EXCEPTION 'Visita fora da UBS autorizada';
  END IF;

  INSERT INTO public.acompanhamentos_visitas_equipe_v29_1 (
    gestante_id,
    visita_id,
    profissional_id,
    ubs_id,
    tipo,
    observacao
  )
  VALUES (
    p_gestante_id,
    p_visita_id,
    p_usuario_id,
    v_contexto.ubs_id,
    p_tipo,
    v_observacao
  )
  RETURNING id INTO v_id;

  INSERT INTO private.auditoria_acompanhamentos_visitas_v29_1 (
    acompanhamento_id,
    profissional_id,
    gestante_hash,
    ubs_id,
    acao,
    payload
  )
  VALUES (
    v_id,
    p_usuario_id,
    private.hash_gestante_auditoria_v19(p_gestante_id),
    v_contexto.ubs_id,
    'registrar',
    jsonb_build_object(
      'visitaId', p_visita_id,
      'tipo', p_tipo
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'acompanhamentoId', v_id
  );
END
$function$;

REVOKE ALL ON FUNCTION
  private.obter_painel_visitas_acs_v29_1(uuid)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  private.obter_painel_visitas_equipe_v29_1(uuid)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  private.registrar_acompanhamento_visita_v29_1(
    uuid,
    uuid,
    uuid,
    text,
    text
  )
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  private.obter_painel_visitas_acs_v29_1(uuid)
TO service_role;

GRANT EXECUTE ON FUNCTION
  private.obter_painel_visitas_equipe_v29_1(uuid)
TO service_role;

GRANT EXECUTE ON FUNCTION
  private.registrar_acompanhamento_visita_v29_1(
    uuid,
    uuid,
    uuid,
    text,
    text
  )
TO service_role;

COMMIT;
