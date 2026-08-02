-- Static verification for the final authorization matrix.
-- Run only against a disposable, unlinked local reconstruction after all
-- cumulative and incremental migrations have been applied. This file is
-- read-only: it queries catalogs and application tables without changing data.

-- 1. Final enum and explicit absence of the legacy profile.
SELECT
  array_agg(e.enumlabel ORDER BY e.enumsortorder) = ARRAY[
    'administrador',
    'gestao_municipal',
    'equipe_ubs',
    'acs',
    'aluno'
  ] AS perfil_usuario_exato,
  bool_and(e.enumlabel <> 'profissional_ubs') AS sem_profissional_ubs
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typname = 'perfil_usuario';

-- 2. Required authorization functions and exact signatures.
SELECT expected.signature, to_regprocedure(expected.signature) IS NOT NULL AS existe
FROM (
  VALUES
    ('private.usuario_equipe_clinica_elegivel_v23(uuid,uuid)'),
    ('security.usuario_equipe_clinica_elegivel_v23(uuid)'),
    ('security.usuario_pode_acessar_gestante_v18(uuid)'),
    ('private.importar_pec(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb)'),
    ('private.esvaziar_lixeira_v19(uuid)'),
    ('private.processar_solicitacao_perfil_v22(uuid,uuid,text,uuid,uuid,text)')
) AS expected(signature)
ORDER BY expected.signature;

-- 3. Every SECURITY DEFINER function must have an explicit safe search_path.
SELECT
  n.nspname AS schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef
  AND n.nspname IN ('private', 'security')
  AND NOT coalesce(p.proconfig, ARRAY[]::text[]) && ARRAY[
    'search_path=pg_catalog, public, private',
    'search_path=pg_catalog, private, extensions',
    'search_path=pg_catalog, public, private, extensions',
    'search_path=pg_catalog, public'
  ]::text[];

-- 4. The active PEC entry point must use the eligibility helper and must not
-- authorize administrator or municipal management.
SELECT
  pg_get_functiondef('private.importar_pec(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb)'::regprocedure)
    LIKE '%usuario_equipe_clinica_elegivel_v23%' AS importar_exige_equipe_elegivel,
  pg_get_functiondef('private.importar_pec(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb)'::regprocedure)
    NOT LIKE '%administrador%' AS importar_sem_administrador,
  pg_get_functiondef('private.importar_pec(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb)'::regprocedure)
    NOT LIKE '%gestao_municipal%' AS importar_sem_gestao;

-- 5. The RLS territorial helper contains only eligible team/UBS and ACS/
-- microarea branches. An empty result in the second query is expected.
SELECT pg_get_functiondef(
  'security.usuario_pode_acessar_gestante_v18(uuid)'::regprocedure
) AS definicao_acesso_territorial;

SELECT forbidden.profile
FROM (VALUES ('administrador'), ('gestao_municipal'), ('aluno')) AS forbidden(profile)
WHERE pg_get_functiondef(
  'security.usuario_pode_acessar_gestante_v18(uuid)'::regprocedure
) LIKE '%' || forbidden.profile || '%';

-- 6. Clinical policies must not retain an administrative bypass. The expected
-- result is zero rows.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  p.polname,
  pg_get_expr(p.polqual, p.polrelid) AS using_expression,
  pg_get_expr(p.polwithcheck, p.polrelid) AS check_expression
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'pec_gestantes',
    'importacoes_pec_resumo',
    'gestante_consultas',
    'gestante_exames',
    'gestante_vacinas',
    'gestante_altas',
    'classificacoes_risco_gestacional',
    'classificacao_risco_itens',
    'visitas_acs_v21'
  )
  AND concat_ws(
    ' ',
    pg_get_expr(p.polqual, p.polrelid),
    pg_get_expr(p.polwithcheck, p.polrelid)
  ) ~ '(usuario_eh_admin|administrador|gestao_municipal)';

-- 7. All personal/clinical public tables remain protected by RLS.
SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relname IN (
    'perfis',
    'pec_gestantes',
    'importacoes_pec_resumo',
    'gestante_consultas',
    'gestante_exames',
    'gestante_vacinas',
    'gestante_altas',
    'classificacoes_risco_gestacional',
    'classificacao_risco_itens',
    'visitas_acs_v21'
  )
ORDER BY c.relname;

-- 8. No dangerous table privileges for browser roles. Expected: zero rows.
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee IN ('anon', 'authenticated')
  AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN')
ORDER BY grantee, table_schema, table_name, privilege_type;

-- 9. No direct private-schema table access for browser roles. Expected: zero.
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'private'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, table_name, privilege_type;

-- 10. Exact EXECUTE posture. Private operational entry points are service-only;
-- security helpers used by RLS are available to authenticated, never anon.
SELECT
  expected.signature,
  has_function_privilege('service_role', expected.signature, 'EXECUTE') AS service_role_execute,
  has_function_privilege('authenticated', expected.signature, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('anon', expected.signature, 'EXECUTE') AS anon_execute
FROM (
  VALUES
    ('private.importar_pec(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb)'),
    ('private.esvaziar_lixeira_v19(uuid)'),
    ('private.processar_solicitacao_perfil_v22(uuid,uuid,text,uuid,uuid,text)'),
    ('security.usuario_equipe_clinica_elegivel_v23(uuid)'),
    ('security.usuario_pode_acessar_gestante_v18(uuid)')
) AS expected(signature)
ORDER BY expected.signature;

-- 11. The hidden former PEC implementation must not be executable by service
-- or browser roles. All columns should be false.
SELECT
  has_function_privilege(
    'service_role',
    'private.importar_pec_impl_v22(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) AS service_role_execute_impl,
  has_function_privilege(
    'authenticated',
    'private.importar_pec_impl_v22(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) AS authenticated_execute_impl,
  has_function_privilege(
    'anon',
    'private.importar_pec_impl_v22(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) AS anon_execute_impl;

-- 12. Credential constraints, territorial trigger and append-only audit triggers.
SELECT
  n.nspname AS schema_name,
  c.relname AS object_name,
  con.conname,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE (n.nspname, c.relname) IN (
  ('private', 'credenciais_profissionais'),
  ('public', 'perfis')
)
ORDER BY n.nspname, c.relname, con.conname;

SELECT
  event_object_schema,
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_name IN (
  'trg_validar_importacao_pec_v23',
  'auditoria_credenciais_append_only',
  'auditoria_perfis_append_only'
)
ORDER BY trigger_name, event_manipulation;

-- Authenticated and service_role behavior must additionally be exercised with
-- synthetic users and ROLLBACK as documented in test_final_authorization_matrix.md.
