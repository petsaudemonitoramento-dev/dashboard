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

-- 4. DML privileges recorded in the frozen baseline that must remain after
--    the migration. The query reports only missing privileges.
--    Expected result: zero rows.
WITH expected_select(role_name, relation_name) AS (
  VALUES
    ('anon', 'ubs'),
    ('anon', 'microareas'),
    ('authenticated', 'perfis'),
    ('authenticated', 'exames'),
    ('authenticated', 'gestacoes'),
    ('authenticated', 'gestantes'),
    ('authenticated', 'ubs'),
    ('authenticated', 'microareas'),
    ('authenticated', 'atendimentos'),
    ('authenticated', 'visitas_domiciliares'),
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
    ('authenticated', 'importacoes_pec_resumo')
),
authenticated_write_tables(relation_name) AS (
  VALUES
    ('exames'),
    ('gestacoes'),
    ('gestantes'),
    ('atendimentos'),
    ('visitas_domiciliares'),
    ('classificacoes_risco')
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
