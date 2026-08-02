-- Read-only verification for the revocation of dangerous table privileges.
-- Run only after applying the migration in an authorized local environment.

-- 1. Effective privileges currently held by anon and authenticated on
--    table-like objects in public. This inventory includes ordinary tables,
--    partitioned tables, views, materialized views, and foreign tables.
WITH target_roles(role_name) AS (
  VALUES ('anon'), ('authenticated')
),
applicable_privileges(relkind, privilege_name) AS (
  SELECT relkind, privilege_name
  FROM unnest(ARRAY['r', 'p', 'f']) AS relation_kinds(relkind)
  CROSS JOIN unnest(
    ARRAY[
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
      'MAINTAIN'
    ]
  ) AS privileges(privilege_name)

  UNION ALL

  SELECT relkind, privilege_name
  FROM (VALUES ('v')) AS relation_kinds(relkind)
  CROSS JOIN unnest(
    ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRIGGER']
  ) AS privileges(privilege_name)

  UNION ALL

  SELECT relkind, privilege_name
  FROM (VALUES ('m')) AS relation_kinds(relkind)
  CROSS JOIN unnest(ARRAY['SELECT', 'MAINTAIN']) AS privileges(privilege_name)
)
SELECT
  roles.role_name,
  namespace.nspname AS schema_name,
  relation.relname AS relation_name,
  relation.relkind,
  privileges.privilege_name
FROM pg_catalog.pg_class AS relation
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = relation.relnamespace
JOIN applicable_privileges AS privileges
  ON privileges.relkind = relation.relkind::text
CROSS JOIN target_roles AS roles
WHERE namespace.nspname = 'public'
  AND pg_catalog.has_table_privilege(
    roles.role_name,
    relation.oid,
    privileges.privilege_name
  )
ORDER BY
  roles.role_name,
  namespace.nspname,
  relation.relname,
  privileges.privilege_name;

-- 2. Dangerous effective privileges that remain after the migration.
--    Expected result: zero rows.
WITH target_roles(role_name) AS (
  VALUES ('anon'), ('authenticated')
),
dangerous_privileges(relkind, privilege_name) AS (
  SELECT relkind, privilege_name
  FROM unnest(ARRAY['r', 'p', 'f']) AS relation_kinds(relkind)
  CROSS JOIN unnest(
    ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN']
  ) AS privileges(privilege_name)

  UNION ALL

  VALUES
    ('v', 'TRIGGER'),
    ('m', 'MAINTAIN')
)
SELECT
  roles.role_name,
  namespace.nspname AS schema_name,
  relation.relname AS relation_name,
  relation.relkind,
  privileges.privilege_name
FROM pg_catalog.pg_class AS relation
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = relation.relnamespace
JOIN dangerous_privileges AS privileges
  ON privileges.relkind = relation.relkind::text
CROSS JOIN target_roles AS roles
WHERE namespace.nspname = 'public'
  AND pg_catalog.has_table_privilege(
    roles.role_name,
    relation.oid,
    privileges.privilege_name
  )
ORDER BY
  roles.role_name,
  namespace.nspname,
  relation.relname,
  privileges.privilege_name;

-- 3. Dangerous default privileges for objects created by postgres.
--    Both schema-local and global defaults are inspected because global
--    defaults also affect future relations in public.
--    Expected result: zero rows.
SELECT
  pg_catalog.pg_get_userbyid(default_acl.defaclrole) AS creator_role,
  COALESCE(namespace.nspname, '*global*') AS schema_scope,
  grantee.rolname AS grantee,
  expanded_acl.privilege_type,
  expanded_acl.is_grantable
FROM pg_catalog.pg_default_acl AS default_acl
LEFT JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = default_acl.defaclnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS expanded_acl
JOIN pg_catalog.pg_roles AS grantee
  ON grantee.oid = expanded_acl.grantee
WHERE default_acl.defaclobjtype = 'r'
  AND pg_catalog.pg_get_userbyid(default_acl.defaclrole) = 'postgres'
  AND (default_acl.defaclnamespace = 0 OR namespace.nspname = 'public')
  AND grantee.rolname IN ('anon', 'authenticated')
  AND expanded_acl.privilege_type IN (
    'TRUNCATE',
    'TRIGGER',
    'REFERENCES',
    'MAINTAIN'
  )
ORDER BY
  schema_scope,
  grantee,
  expanded_acl.privilege_type;

-- 4. DML privileges intentionally retained by the final cumulative schema.
--    The query reports only missing privileges on final-schema tables.
--    Expected result: zero rows.
WITH expected_select(role_name, relation_name) AS (
  VALUES
    ('anon', 'ubs'),
    ('anon', 'microareas'),
    ('authenticated', 'perfis'),
    ('authenticated', 'ubs'),
    ('authenticated', 'microareas'),
    ('authenticated', 'classificacao_risco_itens'),
    ('authenticated', 'classificacoes_risco_gestacional'),
    ('authenticated', 'pec_gestantes'),
    ('authenticated', 'config_exames_pre_natal'),
    ('authenticated', 'gestante_exames'),
    ('authenticated', 'gestante_vacinas'),
    ('authenticated', 'classificacoes_risco'),
    ('authenticated', 'config_fatores_risco_gestacional'),
    ('authenticated', 'config_vacinas_gestante'),
    ('authenticated', 'gestante_altas'),
    ('authenticated', 'gestante_consultas'),
    ('authenticated', 'importacoes_pec_resumo'),
    ('authenticated', 'visitas_acs_v21'),
    ('authenticated', 'avisos_ubs')
),
authenticated_write_tables(relation_name) AS (
  VALUES ('avisos_ubs')
),
expected_dml(role_name, relation_name, privilege_name) AS (
  SELECT role_name, relation_name, 'SELECT'
  FROM expected_select

  UNION ALL

  SELECT 'authenticated', tables.relation_name, privileges.privilege_name
  FROM authenticated_write_tables AS tables
  CROSS JOIN unnest(
    ARRAY['INSERT', 'UPDATE', 'DELETE']
  ) AS privileges(privilege_name)
)
SELECT
  expected.role_name,
  'public' AS schema_name,
  expected.relation_name,
  relation.relkind,
  expected.privilege_name AS missing_privilege
FROM expected_dml AS expected
LEFT JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.nspname = 'public'
LEFT JOIN pg_catalog.pg_class AS relation
  ON relation.relnamespace = namespace.oid
 AND relation.relname = expected.relation_name
 AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
WHERE relation.oid IS NULL
   OR NOT COALESCE(
     pg_catalog.has_table_privilege(
       expected.role_name,
       relation.oid,
       expected.privilege_name
     ),
     false
   )
ORDER BY
  expected.role_name,
  expected.relation_name,
  expected.privilege_name;

-- 5. Legacy relations are allowed to be absent. If one reappears, section 2
--    still evaluates all of its effective dangerous privileges. This result is
--    an inventory only and must normally contain zero rows.
WITH legacy_relations(relation_name) AS (
  VALUES
    ('gestantes'),
    ('gestacoes'),
    ('exames'),
    ('atendimentos'),
    ('classificacoes_risco'),
    ('visitas_domiciliares')
)
SELECT
  legacy.relation_name,
  relation.relkind,
  pg_get_userbyid(relation.relowner) AS owner_name
FROM legacy_relations AS legacy
JOIN pg_namespace AS namespace
  ON namespace.nspname = 'public'
JOIN pg_class AS relation
  ON relation.relnamespace = namespace.oid
 AND relation.relname = legacy.relation_name
 AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY legacy.relation_name;

-- 6. Browser roles must not access private tables or the private schema.
--    Expected result: zero rows.
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'private'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, table_name, privilege_type;

SELECT roles.role_name, privileges.privilege_name
FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
CROSS JOIN (VALUES ('USAGE'), ('CREATE')) AS privileges(privilege_name)
WHERE has_schema_privilege(
  roles.role_name,
  'private',
  privileges.privilege_name
)
ORDER BY roles.role_name, privileges.privilege_name;

-- 7. Exact function EXECUTE posture for final entry points and hidden
--    implementations. Every row must report conforme = true.
SELECT
  expected.signature,
  has_function_privilege('service_role', expected.signature, 'EXECUTE') AS service_role_execute,
  has_function_privilege('authenticated', expected.signature, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('anon', expected.signature, 'EXECUTE') AS anon_execute,
  has_function_privilege('service_role', expected.signature, 'EXECUTE') = expected.service_execute
    AND has_function_privilege('authenticated', expected.signature, 'EXECUTE') = expected.authenticated_execute
    AND NOT has_function_privilege('anon', expected.signature, 'EXECUTE') AS conforme
FROM (
  VALUES
    ('private.importar_pec(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb)', true, false),
    ('private.esvaziar_lixeira_v19(uuid)', true, false),
    ('private.listar_lixeira_gestantes_v19(uuid,boolean)', true, false),
    ('private.usuario_equipe_clinica_elegivel_v23(uuid,uuid)', true, false),
    ('private.submeter_credencial_profissional_v22(uuid,text,text,text,text,text)', true, false),
    ('private.decidir_credencial_profissional_v22(uuid,uuid,text,text,text)', true, false),
    ('private.listar_solicitacoes_perfil_v22(uuid)', true, false),
    ('private.processar_solicitacao_perfil_v22(uuid,uuid,text,uuid,uuid,text)', true, false),
    ('security.usuario_equipe_clinica_elegivel_v23(uuid)', false, true),
    ('security.usuario_pode_acessar_gestante_v18(uuid)', false, true)
) AS expected(signature, service_execute, authenticated_execute)
ORDER BY expected.signature;

SELECT
  internal.signature,
  has_function_privilege('service_role', internal.signature, 'EXECUTE') AS service_role_execute,
  has_function_privilege('authenticated', internal.signature, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('anon', internal.signature, 'EXECUTE') AS anon_execute
FROM (
  VALUES
    ('private.importar_pec_impl_v22(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb)'),
    ('private.validar_importacao_pec_v23()'),
    ('private.atualizar_credencial_profissional_v22()'),
    ('private.bloquear_mutacao_auditoria_v22()')
) AS internal(signature)
ORDER BY internal.signature;

-- 8. Assert the final security contract. These checks make the verifier fail,
--    rather than merely printing rows, when a dangerous grant is found.
DO $verify_final_grants$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(
    format('%I:%I.%I:%s', roles.role_name, namespace.nspname, relation.relname, privileges.privilege_name),
    ', ' ORDER BY roles.role_name, namespace.nspname, relation.relname, privileges.privilege_name
  )
  INTO v_bad
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  JOIN (
    SELECT relkind, privilege_name
    FROM unnest(ARRAY['r', 'p', 'f']) AS relation_kinds(relkind)
    CROSS JOIN unnest(ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN']) AS p(privilege_name)
    UNION ALL VALUES ('v', 'TRIGGER'), ('m', 'MAINTAIN')
  ) AS privileges ON privileges.relkind = relation.relkind::text
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS roles(role_name)
  WHERE namespace.nspname IN ('public', 'private', 'analytics')
    AND has_table_privilege(roles.role_name, relation.oid, privileges.privilege_name);

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Privilégios perigosos efetivos detectados: %', v_bad;
  END IF;

  SELECT string_agg(
    format('%I:%s:%s:%s',
      pg_get_userbyid(default_acl.defaclrole),
      coalesce(namespace.nspname, '*global*'),
      coalesce(grantee.rolname, 'PUBLIC'),
      expanded_acl.privilege_type
    ),
    ', ' ORDER BY pg_get_userbyid(default_acl.defaclrole), namespace.nspname,
      coalesce(grantee.rolname, 'PUBLIC'), expanded_acl.privilege_type
  )
  INTO v_bad
  FROM pg_default_acl AS default_acl
  LEFT JOIN pg_namespace AS namespace ON namespace.oid = default_acl.defaclnamespace
  CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) AS expanded_acl
  LEFT JOIN pg_roles AS grantee ON grantee.oid = expanded_acl.grantee
  WHERE default_acl.defaclobjtype = 'r'
    AND (default_acl.defaclnamespace = 0 OR namespace.nspname IN ('public', 'private', 'analytics'))
    AND pg_get_userbyid(default_acl.defaclrole) <> 'supabase_admin'
    AND (expanded_acl.grantee = 0 OR grantee.rolname IN ('anon', 'authenticated'))
    AND expanded_acl.privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Default privileges perigosos não gerenciados detectados: %', v_bad;
  END IF;

  WITH expected_select(role_name, relation_name) AS (
    VALUES
      ('anon', 'ubs'), ('anon', 'microareas'),
      ('authenticated', 'perfis'), ('authenticated', 'ubs'),
      ('authenticated', 'microareas'), ('authenticated', 'classificacao_risco_itens'),
      ('authenticated', 'classificacoes_risco_gestacional'),
      ('authenticated', 'pec_gestantes'), ('authenticated', 'config_exames_pre_natal'),
      ('authenticated', 'gestante_exames'), ('authenticated', 'gestante_vacinas'),
      ('authenticated', 'config_fatores_risco_gestacional'),
      ('authenticated', 'config_vacinas_gestante'), ('authenticated', 'gestante_altas'),
      ('authenticated', 'gestante_consultas'), ('authenticated', 'importacoes_pec_resumo'),
      ('authenticated', 'visitas_acs_v21'), ('authenticated', 'avisos_ubs')
  ),
  expected_dml(role_name, relation_name, privilege_name) AS (
    SELECT role_name, relation_name, 'SELECT' FROM expected_select
    UNION ALL
    SELECT 'authenticated', 'avisos_ubs', privilege_name
    FROM unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) AS privileges(privilege_name)
  )
  SELECT string_agg(
    format('%I:public.%I:%s', expected.role_name, expected.relation_name, expected.privilege_name),
    ', ' ORDER BY expected.role_name, expected.relation_name, expected.privilege_name
  )
  INTO v_bad
  FROM expected_dml AS expected
  WHERE to_regclass(format('public.%I', expected.relation_name)) IS NULL
     OR NOT coalesce(
       has_table_privilege(
         expected.role_name,
         to_regclass(format('public.%I', expected.relation_name)),
         expected.privilege_name
       ),
       false
     );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Grant DML mínimo ausente no schema final: %', v_bad;
  END IF;

  SELECT string_agg(format('%I:%I', roles.role_name, privileges.privilege_name), ', ')
  INTO v_bad
  FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
  CROSS JOIN (VALUES ('USAGE'), ('CREATE')) AS privileges(privilege_name)
  WHERE has_schema_privilege(roles.role_name, 'private', privileges.privilege_name);

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Acesso direto indevido ao schema private: %', v_bad;
  END IF;

  SELECT string_agg(expected.signature, ', ' ORDER BY expected.signature)
  INTO v_bad
  FROM (
    VALUES
      ('private.importar_pec(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb)', true, false),
      ('private.esvaziar_lixeira_v19(uuid)', true, false),
      ('private.listar_lixeira_gestantes_v19(uuid,boolean)', true, false),
      ('private.usuario_equipe_clinica_elegivel_v23(uuid,uuid)', true, false),
      ('private.submeter_credencial_profissional_v22(uuid,text,text,text,text,text)', true, false),
      ('private.decidir_credencial_profissional_v22(uuid,uuid,text,text,text)', true, false),
      ('private.listar_solicitacoes_perfil_v22(uuid)', true, false),
      ('private.processar_solicitacao_perfil_v22(uuid,uuid,text,uuid,uuid,text)', true, false),
      ('security.usuario_equipe_clinica_elegivel_v23(uuid)', false, true),
      ('security.usuario_pode_acessar_gestante_v18(uuid)', false, true)
  ) AS expected(signature, service_execute, authenticated_execute)
  WHERE to_regprocedure(expected.signature) IS NULL
     OR has_function_privilege('service_role', to_regprocedure(expected.signature), 'EXECUTE')
          IS DISTINCT FROM expected.service_execute
     OR has_function_privilege('authenticated', to_regprocedure(expected.signature), 'EXECUTE')
          IS DISTINCT FROM expected.authenticated_execute
     OR coalesce(has_function_privilege('anon', to_regprocedure(expected.signature), 'EXECUTE'), false);

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Matriz EXECUTE divergente: %', v_bad;
  END IF;

  SELECT string_agg(internal.signature, ', ' ORDER BY internal.signature)
  INTO v_bad
  FROM (
    VALUES
      ('private.importar_pec_impl_v22(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb)'),
      ('private.validar_importacao_pec_v23()'),
      ('private.atualizar_credencial_profissional_v22()'),
      ('private.bloquear_mutacao_auditoria_v22()')
  ) AS internal(signature)
  WHERE to_regprocedure(internal.signature) IS NULL
     OR coalesce(has_function_privilege('service_role', to_regprocedure(internal.signature), 'EXECUTE'), false)
     OR coalesce(has_function_privilege('authenticated', to_regprocedure(internal.signature), 'EXECUTE'), false)
     OR coalesce(has_function_privilege('anon', to_regprocedure(internal.signature), 'EXECUTE'), false);

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Implementação interna ausente ou executável por cliente: %', v_bad;
  END IF;

  SELECT string_agg(format('%I:%I.%I:%s', grants.grantee, grants.table_schema, grants.table_name, grants.privilege_type), ', ')
  INTO v_bad
  FROM information_schema.role_table_grants AS grants
  WHERE grants.table_schema = 'private'
    AND grants.grantee IN ('anon', 'authenticated');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Grant direto indevido em tabela private: %', v_bad;
  END IF;
END
$verify_final_grants$;
