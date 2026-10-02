-- Fonte: histórico de migrations do Supabase dashboard-v2 (bhkyfcnuxcvjgvusgpgm)
-- Migration já aplicada no remoto. Recuperada para reproduzir o schema em CI/Codespaces.
-- Não contém dump de dados de produção.
-- Não editar retroativamente; novas alterações devem usar migrations posteriores.

-- Dashboard PET Saúde
-- V26 final: camada analítica segura para o Metabase.
--
-- A role metabase_reader é um grupo NOLOGIN e não possui senha.
-- A credencial real do Metabase será criada separadamente.
-- Valores clínicos com menos de cinco ocorrências não são publicados.

BEGIN;

DO $criar_metabase_reader$
DECLARE
  v_role record;
BEGIN
  SELECT
    r.rolcanlogin,
    r.rolsuper,
    r.rolcreatedb,
    r.rolcreaterole,
    r.rolreplication,
    r.rolbypassrls
  INTO v_role
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = 'metabase_reader';

  IF NOT FOUND THEN
    CREATE ROLE metabase_reader NOLOGIN;

    SELECT
      r.rolcanlogin,
      r.rolsuper,
      r.rolcreatedb,
      r.rolcreaterole,
      r.rolreplication,
      r.rolbypassrls
    INTO STRICT v_role
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'metabase_reader';
  END IF;

  IF v_role.rolcanlogin
     OR v_role.rolsuper
     OR v_role.rolcreatedb
     OR v_role.rolcreaterole
     OR v_role.rolreplication
     OR v_role.rolbypassrls
  THEN
    RAISE EXCEPTION
      'A role metabase_reader possui atributos incompatíveis';
  END IF;
END
$criar_metabase_reader$;

CREATE SCHEMA IF NOT EXISTS analytics_publicado
  AUTHORIZATION postgres;

REVOKE ALL ON SCHEMA analytics_publicado
  FROM PUBLIC, anon, authenticated, service_role, metabase_reader;

GRANT USAGE ON SCHEMA analytics_publicado
  TO metabase_reader;

-- As duas views detalhadas V18 permanecem internas.
REVOKE ALL ON TABLE
  analytics.vw_fatores_risco_v18,
  analytics.vw_indicadores_base_v18
FROM metabase_reader, PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW
  analytics_publicado.vw_configuracao_privacidade
WITH (security_barrier = true)
AS
SELECT
  5::integer AS k_minimo,
  'Valores clínicos com menos de cinco ocorrências não são publicados.'::text
    AS regra,
  'v26'::text AS versao;

COMMENT ON VIEW
  analytics_publicado.vw_configuracao_privacidade
IS
  'Regra de proteção contra identificação indireta em grupos pequenos.';

CREATE OR REPLACE VIEW
  analytics_publicado.vw_ubs
WITH (security_barrier = true)
AS
SELECT
  u.id AS ubs_id,
  u.nome AS ubs_nome,
  u.nome_abreviado,
  u.codigo_interno,
  u.cnes,
  u.municipio,
  u.uf,
  u.bairro,
  u.ativa,
  count(m.id) FILTER (WHERE m.ativa)::bigint AS microareas_ativas
FROM public.ubs u
LEFT JOIN public.microareas m
  ON m.ubs_id = u.id
GROUP BY
  u.id,
  u.nome,
  u.nome_abreviado,
  u.codigo_interno,
  u.cnes,
  u.municipio,
  u.uf,
  u.bairro,
  u.ativa;

COMMENT ON VIEW analytics_publicado.vw_ubs
IS 'Dimensão territorial não clínica para filtros do Metabase.';

CREATE OR REPLACE VIEW
  analytics_publicado.vw_resumo_municipal
WITH (security_barrier = true)
AS
WITH bruto AS (
  SELECT
    count(*) FILTER (WHERE b.ativa)::bigint AS ativas,
    count(*) FILTER (WHERE b.alta)::bigint AS altas,
    count(*) FILTER (
      WHERE b.ativa
        AND b.risco_categoria = 'Alto risco'
    )::bigint AS alto_risco,
    count(*) FILTER (
      WHERE b.ativa
        AND b.risco_categoria = 'Médio risco'
    )::bigint AS medio_risco,
    count(*) FILTER (
      WHERE b.ativa
        AND b.risco_categoria = 'Risco habitual'
    )::bigint AS risco_habitual,
    count(*) FILTER (
      WHERE b.ativa
        AND b.captacao_categoria = 'Precoce (≤12 sem)'
    )::bigint AS captacao_precoce,
    count(*) FILTER (
      WHERE b.ativa
        AND b.captacao_categoria = 'Tardia (>12 sem)'
    )::bigint AS captacao_tardia,
    count(*) FILTER (
      WHERE b.ativa
        AND b.consultas_categoria = 'Meta (7+)'
    )::bigint AS consultas_meta,
    count(*) FILTER (
      WHERE b.ativa
        AND b.exames_pendentes > 0
    )::bigint AS pessoas_exames_pendentes,
    sum(b.exames_pendentes) FILTER (
      WHERE b.ativa
        AND b.exames_pendentes > 0
    )::bigint AS exames_pendentes,
    count(*) FILTER (
      WHERE b.ativa
        AND b.dtpa_pendente
    )::bigint AS dtpa_pendente,
    max(b.atualizado_em) AS atualizado_em
  FROM analytics.vw_indicadores_base_v18 b
),
territorio AS (
  SELECT
    count(*) FILTER (WHERE u.ativa)::bigint AS ubs_ativas,
    (
      SELECT count(*)::bigint
      FROM public.microareas m
      WHERE m.ativa
    ) AS microareas_ativas
  FROM public.ubs u
)
SELECT
  t.ubs_ativas,
  t.microareas_ativas,
  CASE WHEN b.ativas >= 5 THEN b.ativas END AS gestantes_ativas,
  CASE WHEN b.altas >= 5 THEN b.altas END AS altas,
  CASE WHEN b.alto_risco >= 5 THEN b.alto_risco END AS alto_risco,
  CASE WHEN b.medio_risco >= 5 THEN b.medio_risco END AS medio_risco,
  CASE WHEN b.risco_habitual >= 5 THEN b.risco_habitual END
    AS risco_habitual,
  CASE WHEN b.captacao_precoce >= 5 THEN b.captacao_precoce END
    AS captacao_precoce,
  CASE WHEN b.captacao_tardia >= 5 THEN b.captacao_tardia END
    AS captacao_tardia,
  CASE WHEN b.consultas_meta >= 5 THEN b.consultas_meta END
    AS consultas_meta,
  CASE
    WHEN b.pessoas_exames_pendentes >= 5
      THEN b.pessoas_exames_pendentes
  END AS gestantes_com_exames_pendentes,
  CASE
    WHEN b.pessoas_exames_pendentes >= 5
      THEN coalesce(b.exames_pendentes, 0)
  END AS total_exames_pendentes,
  CASE WHEN b.dtpa_pendente >= 5 THEN b.dtpa_pendente END
    AS dtpa_pendente,
  CASE
    WHEN b.ativas >= 5
      AND b.captacao_precoce >= 5
    THEN round(
      100.0 * b.captacao_precoce / nullif(b.ativas, 0),
      2
    )
  END AS percentual_captacao_precoce,
  CASE
    WHEN b.ativas >= 5
      AND b.consultas_meta >= 5
    THEN round(
      100.0 * b.consultas_meta / nullif(b.ativas, 0),
      2
    )
  END AS percentual_meta_consultas,
  b.atualizado_em
FROM bruto b
CROSS JOIN territorio t;

COMMENT ON VIEW analytics_publicado.vw_resumo_municipal
IS 'Resumo municipal agregado com proteção k=5.';

CREATE OR REPLACE VIEW
  analytics_publicado.vw_indicadores_ubs
WITH (security_barrier = true)
AS
WITH bruto AS (
  SELECT
    u.id AS ubs_id,
    u.nome AS ubs_nome,
    u.nome_abreviado,
    u.municipio,
    u.uf,
    count(b.ubs_id) FILTER (WHERE b.ativa)::bigint AS ativas,
    count(b.ubs_id) FILTER (WHERE b.alta)::bigint AS altas,
    count(b.ubs_id) FILTER (
      WHERE b.ativa
        AND b.risco_categoria = 'Alto risco'
    )::bigint AS alto_risco,
    count(b.ubs_id) FILTER (
      WHERE b.ativa
        AND b.risco_categoria = 'Médio risco'
    )::bigint AS medio_risco,
    count(b.ubs_id) FILTER (
      WHERE b.ativa
        AND b.captacao_categoria = 'Precoce (≤12 sem)'
    )::bigint AS captacao_precoce,
    count(b.ubs_id) FILTER (
      WHERE b.ativa
        AND b.captacao_categoria = 'Tardia (>12 sem)'
    )::bigint AS captacao_tardia,
    count(b.ubs_id) FILTER (
      WHERE b.ativa
        AND b.consultas_categoria = 'Meta (7+)'
    )::bigint AS consultas_meta,
    count(b.ubs_id) FILTER (
      WHERE b.ativa
        AND b.exames_pendentes > 0
    )::bigint AS pessoas_exames_pendentes,
    sum(b.exames_pendentes) FILTER (
      WHERE b.ativa
        AND b.exames_pendentes > 0
    )::bigint AS exames_pendentes,
    count(b.ubs_id) FILTER (
      WHERE b.ativa
        AND b.dtpa_pendente
    )::bigint AS dtpa_pendente,
    max(b.atualizado_em) AS atualizado_em
  FROM public.ubs u
  LEFT JOIN analytics.vw_indicadores_base_v18 b
    ON b.ubs_id = u.id
  WHERE u.ativa
  GROUP BY
    u.id,
    u.nome,
    u.nome_abreviado,
    u.municipio,
    u.uf
)
SELECT
  r.ubs_id,
  r.ubs_nome,
  r.nome_abreviado,
  r.municipio,
  r.uf,
  CASE WHEN r.ativas >= 5 THEN r.ativas END AS gestantes_ativas,
  CASE WHEN r.altas >= 5 THEN r.altas END AS altas,
  CASE WHEN r.alto_risco >= 5 THEN r.alto_risco END AS alto_risco,
  CASE WHEN r.medio_risco >= 5 THEN r.medio_risco END AS medio_risco,
  CASE WHEN r.captacao_precoce >= 5 THEN r.captacao_precoce END
    AS captacao_precoce,
  CASE WHEN r.captacao_tardia >= 5 THEN r.captacao_tardia END
    AS captacao_tardia,
  CASE WHEN r.consultas_meta >= 5 THEN r.consultas_meta END
    AS consultas_meta,
  CASE
    WHEN r.pessoas_exames_pendentes >= 5
      THEN r.pessoas_exames_pendentes
  END AS gestantes_com_exames_pendentes,
  CASE
    WHEN r.pessoas_exames_pendentes >= 5
      THEN coalesce(r.exames_pendentes, 0)
  END AS total_exames_pendentes,
  CASE WHEN r.dtpa_pendente >= 5 THEN r.dtpa_pendente END
    AS dtpa_pendente,
  CASE
    WHEN r.ativas >= 5
      AND r.captacao_precoce >= 5
    THEN round(
      100.0 * r.captacao_precoce / nullif(r.ativas, 0),
      2
    )
  END AS percentual_captacao_precoce,
  CASE
    WHEN r.ativas >= 5
      AND r.consultas_meta >= 5
    THEN round(
      100.0 * r.consultas_meta / nullif(r.ativas, 0),
      2
    )
  END AS percentual_meta_consultas,
  r.atualizado_em
FROM bruto r;

COMMENT ON VIEW analytics_publicado.vw_indicadores_ubs
IS 'Indicadores agregados por UBS com proteção k=5.';

CREATE OR REPLACE VIEW
  analytics_publicado.vw_indicadores_microareas
WITH (security_barrier = true)
AS
WITH bruto AS (
  SELECT
    u.id AS ubs_id,
    u.nome AS ubs_nome,
    m.id AS microarea_id,
    m.codigo AS microarea_codigo,
    m.nome AS microarea_nome,
    count(b.ubs_id) FILTER (WHERE b.ativa)::bigint AS ativas,
    count(b.ubs_id) FILTER (
      WHERE b.ativa
        AND b.risco_categoria = 'Alto risco'
    )::bigint AS alto_risco,
    count(b.ubs_id) FILTER (
      WHERE b.ativa
        AND b.captacao_categoria = 'Precoce (≤12 sem)'
    )::bigint AS captacao_precoce,
    count(b.ubs_id) FILTER (
      WHERE b.ativa
        AND b.consultas_categoria = 'Meta (7+)'
    )::bigint AS consultas_meta,
    count(b.ubs_id) FILTER (
      WHERE b.ativa
        AND b.exames_pendentes > 0
    )::bigint AS pessoas_exames_pendentes,
    max(b.atualizado_em) AS atualizado_em
  FROM public.microareas m
  JOIN public.ubs u
    ON u.id = m.ubs_id
  LEFT JOIN analytics.vw_indicadores_base_v18 b
    ON b.ubs_id = m.ubs_id
   AND b.microarea = m.codigo
  WHERE m.ativa
    AND u.ativa
  GROUP BY
    u.id,
    u.nome,
    m.id,
    m.codigo,
    m.nome
)
SELECT
  r.ubs_id,
  r.ubs_nome,
  r.microarea_id,
  r.microarea_codigo,
  r.microarea_nome,
  CASE WHEN r.ativas >= 5 THEN r.ativas END AS gestantes_ativas,
  CASE
    WHEN r.ativas >= 5 AND r.alto_risco >= 5
      THEN r.alto_risco
  END AS alto_risco,
  CASE
    WHEN r.ativas >= 5 AND r.captacao_precoce >= 5
      THEN r.captacao_precoce
  END AS captacao_precoce,
  CASE
    WHEN r.ativas >= 5 AND r.consultas_meta >= 5
      THEN r.consultas_meta
  END AS consultas_meta,
  CASE
    WHEN r.ativas >= 5
      AND r.pessoas_exames_pendentes >= 5
      THEN r.pessoas_exames_pendentes
  END AS gestantes_com_exames_pendentes,
  r.atualizado_em
FROM bruto r;

COMMENT ON VIEW analytics_publicado.vw_indicadores_microareas
IS 'Indicadores agregados por microárea com proteção k=5.';

CREATE OR REPLACE VIEW
  analytics_publicado.vw_distribuicao_risco_ubs
WITH (security_barrier = true)
AS
WITH categorias(categoria, ordem) AS (
  VALUES
    ('Alto risco'::text, 1),
    ('Médio risco'::text, 2),
    ('Risco habitual'::text, 3),
    ('Não classificado'::text, 4)
),
grupos AS (
  SELECT
    u.id AS ubs_id,
    u.nome AS ubs_nome,
    c.categoria,
    c.ordem,
    count(b.ubs_id)::bigint AS quantidade
  FROM public.ubs u
  CROSS JOIN categorias c
  LEFT JOIN analytics.vw_indicadores_base_v18 b
    ON b.ubs_id = u.id
   AND b.ativa
   AND b.risco_categoria = c.categoria
  WHERE u.ativa
  GROUP BY u.id, u.nome, c.categoria, c.ordem
)
SELECT
  g.ubs_id,
  g.ubs_nome,
  g.categoria,
  g.ordem,
  CASE WHEN g.quantidade >= 5 THEN g.quantidade END AS quantidade
FROM grupos g;

CREATE OR REPLACE VIEW
  analytics_publicado.vw_captacao_prenatal_ubs
WITH (security_barrier = true)
AS
WITH categorias(categoria, ordem) AS (
  VALUES
    ('Precoce (≤12 sem)'::text, 1),
    ('Tardia (>12 sem)'::text, 2),
    ('Sem dados'::text, 3)
),
grupos AS (
  SELECT
    u.id AS ubs_id,
    u.nome AS ubs_nome,
    c.categoria,
    c.ordem,
    count(b.ubs_id)::bigint AS quantidade
  FROM public.ubs u
  CROSS JOIN categorias c
  LEFT JOIN analytics.vw_indicadores_base_v18 b
    ON b.ubs_id = u.id
   AND b.ativa
   AND b.captacao_categoria = c.categoria
  WHERE u.ativa
  GROUP BY u.id, u.nome, c.categoria, c.ordem
)
SELECT
  g.ubs_id,
  g.ubs_nome,
  g.categoria,
  g.ordem,
  CASE WHEN g.quantidade >= 5 THEN g.quantidade END AS quantidade
FROM grupos g;

CREATE OR REPLACE VIEW
  analytics_publicado.vw_consultas_prenatal_ubs
WITH (security_barrier = true)
AS
WITH categorias(categoria, ordem) AS (
  VALUES
    ('Crítico (0–3)'::text, 1),
    ('Intermediário (4–6)'::text, 2),
    ('Meta (7+)'::text, 3)
),
grupos AS (
  SELECT
    u.id AS ubs_id,
    u.nome AS ubs_nome,
    c.categoria,
    c.ordem,
    count(b.ubs_id)::bigint AS quantidade
  FROM public.ubs u
  CROSS JOIN categorias c
  LEFT JOIN analytics.vw_indicadores_base_v18 b
    ON b.ubs_id = u.id
   AND b.ativa
   AND b.consultas_categoria = c.categoria
  WHERE u.ativa
  GROUP BY u.id, u.nome, c.categoria, c.ordem
)
SELECT
  g.ubs_id,
  g.ubs_nome,
  g.categoria,
  g.ordem,
  CASE WHEN g.quantidade >= 5 THEN g.quantidade END AS quantidade
FROM grupos g;

CREATE OR REPLACE VIEW
  analytics_publicado.vw_trimestres_ubs
WITH (security_barrier = true)
AS
WITH categorias(categoria, ordem) AS (
  VALUES
    ('1º trimestre'::text, 1),
    ('2º trimestre'::text, 2),
    ('3º trimestre'::text, 3),
    ('IG não informada'::text, 4)
),
grupos AS (
  SELECT
    u.id AS ubs_id,
    u.nome AS ubs_nome,
    c.categoria,
    c.ordem,
    count(b.ubs_id)::bigint AS quantidade
  FROM public.ubs u
  CROSS JOIN categorias c
  LEFT JOIN analytics.vw_indicadores_base_v18 b
    ON b.ubs_id = u.id
   AND b.ativa
   AND b.trimestre = c.categoria
  WHERE u.ativa
  GROUP BY u.id, u.nome, c.categoria, c.ordem
)
SELECT
  g.ubs_id,
  g.ubs_nome,
  g.categoria,
  g.ordem,
  CASE WHEN g.quantidade >= 5 THEN g.quantidade END AS quantidade
FROM grupos g;

CREATE OR REPLACE VIEW
  analytics_publicado.vw_previsao_partos_mensal
WITH (security_barrier = true)
AS
SELECT
  b.ubs_id,
  u.nome AS ubs_nome,
  b.mes_dpp,
  count(*)::bigint AS quantidade
FROM analytics.vw_indicadores_base_v18 b
JOIN public.ubs u
  ON u.id = b.ubs_id
WHERE b.ativa
  AND b.mes_dpp IS NOT NULL
  AND u.ativa
GROUP BY b.ubs_id, u.nome, b.mes_dpp
HAVING count(*) >= 5;

CREATE OR REPLACE VIEW
  analytics_publicado.vw_fatores_risco_agrupados
WITH (security_barrier = true)
AS
SELECT
  f.ubs_id,
  u.nome AS ubs_nome,
  f.classificacao,
  f.grupo,
  f.fator_titulo,
  f.automatico,
  count(*)::bigint AS ocorrencias,
  sum(f.pontos)::bigint AS pontos_acumulados,
  max(f.realizada_em) AS ultima_ocorrencia_em
FROM analytics.vw_fatores_risco_v18 f
JOIN public.ubs u
  ON u.id = f.ubs_id
WHERE u.ativa
GROUP BY
  f.ubs_id,
  u.nome,
  f.classificacao,
  f.grupo,
  f.fator_titulo,
  f.automatico
HAVING count(*) >= 5;

CREATE OR REPLACE VIEW
  analytics_publicado.vw_visitas_acs_mensal
WITH (security_barrier = true)
AS
WITH grupos AS (
  SELECT
    v.ubs_id,
    u.nome AS ubs_nome,
    date_trunc('month', v.data_acao)::date AS mes,
    count(*)::bigint AS total_acoes,
    count(*) FILTER (WHERE v.compareceu)::bigint
      AS visitas_realizadas,
    count(*) FILTER (WHERE NOT v.compareceu)::bigint
      AS nao_encontradas,
    count(*) FILTER (WHERE v.sinais_alerta)::bigint
      AS com_sinais_alerta
  FROM public.visitas_acs_v21 v
  JOIN public.ubs u
    ON u.id = v.ubs_id
  WHERE v.removido_em IS NULL
    AND u.ativa
  GROUP BY
    v.ubs_id,
    u.nome,
    date_trunc('month', v.data_acao)::date
  HAVING count(*) >= 5
)
SELECT
  g.ubs_id,
  g.ubs_nome,
  g.mes,
  g.total_acoes,
  CASE
    WHEN g.visitas_realizadas >= 5
      THEN g.visitas_realizadas
  END AS visitas_realizadas,
  CASE
    WHEN g.nao_encontradas >= 5
      THEN g.nao_encontradas
  END AS nao_encontradas,
  CASE
    WHEN g.com_sinais_alerta >= 5
      THEN g.com_sinais_alerta
  END AS com_sinais_alerta
FROM grupos g;

CREATE OR REPLACE VIEW
  analytics_publicado.vw_qualidade_importacoes_pec
WITH (security_barrier = true)
AS
SELECT
  r.ubs_id,
  u.nome AS ubs_nome,
  date_trunc('month', r.criado_em)::date AS mes,
  count(*)::bigint AS arquivos_importados,
  sum(r.total_linhas)::bigint AS linhas_recebidas,
  sum(r.total_processadas)::bigint AS linhas_processadas,
  sum(r.total_erros)::bigint AS linhas_com_erro,
  count(*) FILTER (
    WHERE r.status = 'concluida'
  )::bigint AS importacoes_concluidas,
  count(*) FILTER (
    WHERE r.status = 'concluida_com_erros'
  )::bigint AS importacoes_com_erros,
  count(*) FILTER (
    WHERE r.status = 'falhou'
  )::bigint AS importacoes_falhas,
  CASE
    WHEN sum(r.total_linhas) > 0
    THEN round(
      100.0 * sum(r.total_processadas)
      / nullif(sum(r.total_linhas), 0),
      2
    )
  END AS percentual_processado,
  max(r.concluido_em) AS ultima_importacao_concluida_em
FROM public.importacoes_pec_resumo r
JOIN public.ubs u
  ON u.id = r.ubs_id
WHERE u.ativa
GROUP BY
  r.ubs_id,
  u.nome,
  date_trunc('month', r.criado_em)::date;

COMMENT ON VIEW analytics_publicado.vw_qualidade_importacoes_pec
IS 'Indicadores técnicos da importação PEC sem nomes de arquivos ou usuários.';

REVOKE ALL ON ALL TABLES IN SCHEMA analytics_publicado
  FROM PUBLIC, anon, authenticated, service_role, metabase_reader;

GRANT SELECT ON TABLE
  analytics_publicado.vw_configuracao_privacidade,
  analytics_publicado.vw_ubs,
  analytics_publicado.vw_resumo_municipal,
  analytics_publicado.vw_indicadores_ubs,
  analytics_publicado.vw_indicadores_microareas,
  analytics_publicado.vw_distribuicao_risco_ubs,
  analytics_publicado.vw_captacao_prenatal_ubs,
  analytics_publicado.vw_consultas_prenatal_ubs,
  analytics_publicado.vw_trimestres_ubs,
  analytics_publicado.vw_previsao_partos_mensal,
  analytics_publicado.vw_fatores_risco_agrupados,
  analytics_publicado.vw_visitas_acs_mensal,
  analytics_publicado.vw_qualidade_importacoes_pec
TO metabase_reader;

COMMIT;
