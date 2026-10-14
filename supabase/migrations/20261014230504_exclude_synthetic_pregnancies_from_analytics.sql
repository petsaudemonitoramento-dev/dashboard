-- Exclude fictitious training pregnancies from consolidated analytical indicators.
-- Keep synthetic cases available in the professional's clinical training area.
begin;
set local search_path to public, analytics, pg_catalog;
create or replace view analytics.vw_fatores_risco_v18 as
WITH ultima_classificacao AS (
         SELECT DISTINCT ON (c.gestante_id) c.id,
            c.gestante_id,
            c.classificacao,
            c.realizada_em
           FROM classificacoes_risco_gestacional c
          WHERE (c.status = 'finalizada'::text)
          ORDER BY c.gestante_id, c.realizada_em DESC
        )
 SELECT g.ubs_id,
    g.profissional_responsavel_id,
    uc.classificacao,
    i.grupo,
    i.fator_titulo,
    i.pontos,
    i.automatico,
    uc.realizada_em
   FROM ((ultima_classificacao uc
     JOIN pec_gestantes g ON ((g.id = uc.gestante_id)))
     JOIN classificacao_risco_itens i ON ((i.classificacao_id = uc.id)))
  WHERE ((i.fator_codigo <> 'g2_imc'::text) AND ((g.excluida_em IS NULL) AND (COALESCE((g.dados_extras ->> 'ficticio'::text), 'false'::text) <> 'true'::text)));

create or replace view analytics.vw_indicadores_base_v18 as
SELECT g.ubs_id,
    g.profissional_responsavel_id,
    m.codigo AS microarea,
    (NOT COALESCE(g.alta_ativa, false)) AS ativa,
    COALESCE(g.alta_ativa, false) AS alta,
        CASE
            WHEN (lower(COALESCE(g.risco_gestacional, ''::text)) ~~ '%alto%'::text) THEN 'Alto risco'::text
            WHEN ((lower(COALESCE(g.risco_gestacional, ''::text)) ~~ '%inter%'::text) OR (lower(COALESCE(g.risco_gestacional, ''::text)) ~~ '%médio%'::text) OR (lower(COALESCE(g.risco_gestacional, ''::text)) ~~ '%medio%'::text)) THEN 'Médio risco'::text
            WHEN ((lower(COALESCE(g.risco_gestacional, ''::text)) ~~ '%habit%'::text) OR (lower(COALESCE(g.risco_gestacional, ''::text)) ~~ '%baixo%'::text)) THEN 'Risco habitual'::text
            ELSE 'Não classificado'::text
        END AS risco_categoria,
        CASE
            WHEN (COALESCE(g.atendimentos_ate_12_semanas, 0) > 0) THEN 'Precoce (≤12 sem)'::text
            WHEN ((g.inicio_pre_natal IS NOT NULL) AND (g.dum IS NOT NULL) AND (g.inicio_pre_natal <= (g.dum + 84))) THEN 'Precoce (≤12 sem)'::text
            WHEN ((g.inicio_pre_natal IS NOT NULL) AND (g.dum IS NOT NULL) AND (g.inicio_pre_natal > (g.dum + 84))) THEN 'Tardia (>12 sem)'::text
            ELSE 'Sem dados'::text
        END AS captacao_categoria,
        CASE
            WHEN (COALESCE(g.atendimentos_pre_natal, 0) <= 3) THEN 'Crítico (0–3)'::text
            WHEN ((COALESCE(g.atendimentos_pre_natal, 0) >= 4) AND (COALESCE(g.atendimentos_pre_natal, 0) <= 6)) THEN 'Intermediário (4–6)'::text
            ELSE 'Meta (7+)'::text
        END AS consultas_categoria,
        CASE
            WHEN ((COALESCE(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) >= 1) AND (COALESCE(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) <= 13)) THEN '1º trimestre'::text
            WHEN ((COALESCE(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) >= 14) AND (COALESCE(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) <= 27)) THEN '2º trimestre'::text
            WHEN (COALESCE(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) >= 28) THEN '3º trimestre'::text
            ELSE 'IG não informada'::text
        END AS trimestre,
    (date_trunc('month'::text, (COALESCE(g.dpp_dum, g.dpp_ecografia))::timestamp with time zone))::date AS mes_dpp,
    ( SELECT (count(*))::integer AS count
           FROM config_exames_pre_natal ce
          WHERE ((ce.ativo = true) AND (ce.trimestre <=
                CASE
                    WHEN (COALESCE(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) <= 13) THEN 1
                    WHEN (COALESCE(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) <= 27) THEN 2
                    ELSE 3
                END) AND (NOT (EXISTS ( SELECT 1
                   FROM gestante_exames ge
                  WHERE ((ge.gestante_id = g.id) AND (ge.codigo = ce.codigo) AND (ge.status = ANY (ARRAY['realizado'::text, 'nao_se_aplica'::text])))))))) AS exames_pendentes,
        CASE
            WHEN ((COALESCE(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) >= 20) AND (NOT (EXISTS ( SELECT 1
               FROM gestante_vacinas gv
              WHERE ((gv.gestante_id = g.id) AND (gv.codigo = 'dtpa'::text) AND (gv.status = 'realizada'::text)))))) THEN true
            ELSE false
        END AS dtpa_pendente,
    g.atualizado_em
   FROM (pec_gestantes g
     LEFT JOIN microareas m ON ((m.id = g.microarea_id)))
  WHERE ((g.excluida_em IS NULL) AND (COALESCE((g.dados_extras ->> 'ficticio'::text), 'false'::text) <> 'true'::text));
commit;
