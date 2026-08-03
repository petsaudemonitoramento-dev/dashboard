-- Verificação dos catálogos clínicos da V29.1

SELECT
  (SELECT count(*)
   FROM public.config_fatores_risco_gestacional) AS fatores_total,
  (SELECT count(*)
   FROM public.config_fatores_risco_gestacional
   WHERE ativo = true) AS fatores_ativos,
  (SELECT count(*)
   FROM public.config_exames_pre_natal) AS exames_total,
  (SELECT count(*)
   FROM public.config_exames_pre_natal
   WHERE ativo = true) AS exames_ativos,
  (SELECT count(*)
   FROM public.config_vacinas_gestante) AS vacinas_total,
  (SELECT count(*)
   FROM public.config_vacinas_gestante
   WHERE ativo = true) AS vacinas_ativas;

SELECT
  grupo,
  grupo_ordem,
  count(*) AS quantidade,
  min(ordem) AS primeira_ordem,
  max(ordem) AS ultima_ordem
FROM public.config_fatores_risco_gestacional
WHERE ativo = true
GROUP BY grupo, grupo_ordem
ORDER BY grupo_ordem;

SELECT
  trimestre,
  count(*) AS quantidade
FROM public.config_exames_pre_natal
WHERE ativo = true
GROUP BY trimestre
ORDER BY trimestre;

DO $verification$
DECLARE
  v_fatores integer;
  v_exames integer;
  v_vacinas integer;
  v_g1 integer;
  v_g3 integer;
  v_g4 integer;
  v_g5 integer;
BEGIN
  SELECT count(*) INTO v_fatores
  FROM public.config_fatores_risco_gestacional
  WHERE ativo = true;

  SELECT count(*) INTO v_exames
  FROM public.config_exames_pre_natal
  WHERE ativo = true;

  SELECT count(*) INTO v_vacinas
  FROM public.config_vacinas_gestante
  WHERE ativo = true;

  SELECT count(*) FILTER (WHERE grupo = 'g1'),
         count(*) FILTER (WHERE grupo = 'g3'),
         count(*) FILTER (WHERE grupo = 'g4'),
         count(*) FILTER (WHERE grupo = 'g5')
  INTO v_g1, v_g3, v_g4, v_g5
  FROM public.config_fatores_risco_gestacional
  WHERE ativo = true;

  IF v_fatores <> 73
     OR v_exames <> 27
     OR v_vacinas <> 6
     OR v_g1 <> 8
     OR v_g3 <> 23
     OR v_g4 <> 16
     OR v_g5 <> 26 THEN
    RAISE EXCEPTION
      'Verificação falhou: fatores=%, exames=%, vacinas=%, g1=%, g3=%, g4=%, g5=%',
      v_fatores, v_exames, v_vacinas, v_g1, v_g3, v_g4, v_g5;
  END IF;
END
$verification$;
