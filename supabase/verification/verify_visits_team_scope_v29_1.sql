-- Verificação somente leitura — V29.1

WITH expected_functions(signature) AS (
  VALUES
    ('private.obter_painel_visitas_acs_v29_1(uuid)'),
    ('private.obter_painel_visitas_equipe_v29_1(uuid)'),
    ('private.registrar_acompanhamento_visita_v29_1(uuid,uuid,uuid,text,text)')
)
SELECT
  e.signature,
  to_regprocedure(e.signature) IS NOT NULL AS instalada
FROM expected_functions e
ORDER BY e.signature;

SELECT
  c.relname AS tabela,
  c.relrowsecurity AS rls,
  c.relforcerowsecurity AS force_rls
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n
  ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'acompanhamentos_visitas_equipe_v29_1';

SELECT
  p.oid::regprocedure::text AS funcao,
  p.prosecdef AS security_definer,
  p.proconfig AS configuracao,
  has_function_privilege(
    'anon',
    p.oid,
    'EXECUTE'
  ) AS anon_executa,
  has_function_privilege(
    'authenticated',
    p.oid,
    'EXECUTE'
  ) AS authenticated_executa,
  has_function_privilege(
    'service_role',
    p.oid,
    'EXECUTE'
  ) AS service_role_executa
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n
  ON n.oid = p.pronamespace
WHERE n.nspname = 'private'
  AND p.proname IN (
    'obter_painel_visitas_acs_v29_1',
    'obter_painel_visitas_equipe_v29_1',
    'registrar_acompanhamento_visita_v29_1'
  )
ORDER BY p.proname;
