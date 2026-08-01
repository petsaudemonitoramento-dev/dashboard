-- Read-only verification for the clean cumulative schema.
-- Run only against a disposable/local project reconstructed from the new migration.
BEGIN;
SET LOCAL search_path = pg_catalog, public;

DO $verify_tables$
DECLARE
  v_name text;
  v_expected text[] := ARRAY[
    'public.ubs',
    'public.microareas',
    'public.perfis',
    'public.pec_gestantes',
    'public.importacoes_pec_resumo',
    'public.gestante_consultas',
    'public.gestante_exames',
    'public.gestante_vacinas',
    'public.gestante_altas',
    'public.classificacoes_risco_gestacional',
    'public.classificacao_risco_itens',
    'public.visitas_acs_v21',
    'public.config_exames_pre_natal',
    'public.config_fatores_risco_gestacional',
    'public.config_vacinas_gestante',
    'public.avisos_ubs',
    'private.identidades_gestantes',
    'private.acessos_identidade_gestantes',
    'private.importacao_pec_linhas_raw',
    'private.importacao_pec_erros',
    'private.historico_clinico_gestantes',
    'private.historico_classificacoes_risco',
    'private.auditoria_exclusoes_gestantes',
    'private.auditoria_avisos_v20',
    'private.auditoria_perfis_v20',
    'private.auditoria_visitas_acs_v21'
  ];
  v_legacy text[] := ARRAY[
    'public.gestantes',
    'public.gestacoes',
    'public.exames',
    'public.atendimentos',
    'public.classificacoes_risco',
    'public.visitas_domiciliares',
    'public.credenciais_temporarias'
  ];
BEGIN
  FOREACH v_name IN ARRAY v_expected LOOP
    IF to_regclass(v_name) IS NULL THEN
      RAISE EXCEPTION 'Objeto esperado ausente: %', v_name;
    END IF;
  END LOOP;

  FOREACH v_name IN ARRAY v_legacy LOOP
    IF to_regclass(v_name) IS NOT NULL THEN
      RAISE EXCEPTION 'Tabela legada indevidamente presente: %', v_name;
    END IF;
  END LOOP;
END
$verify_tables$;

DO $verify_enum$
DECLARE
  v_values text[];
  v_status_values text[];
BEGIN
  SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
  INTO v_values
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE n.nspname = 'public'
    AND t.typname = 'perfil_usuario';

  IF v_values IS DISTINCT FROM ARRAY[
    'administrador',
    'gestao_municipal',
    'equipe_ubs',
    'acs',
    'aluno'
  ]::text[] THEN
    RAISE EXCEPTION 'Enum public.perfil_usuario divergente: %', v_values;
  END IF;

  SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
  INTO v_status_values
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE n.nspname = 'public'
    AND t.typname = 'status_usuario';

  IF v_status_values IS DISTINCT FROM ARRAY[
    'pendente',
    'ativo',
    'bloqueado'
  ]::text[] THEN
    RAISE EXCEPTION 'Enum public.status_usuario divergente: %', v_status_values;
  END IF;
END
$verify_enum$;

DO $verify_platform_dependencies$
DECLARE
  v_pgcrypto_schema text;
BEGIN
  SELECT n.nspname
  INTO v_pgcrypto_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';

  IF v_pgcrypto_schema IS DISTINCT FROM 'extensions' THEN
    RAISE EXCEPTION 'pgcrypto deve existir no schema extensions; encontrado: %', v_pgcrypto_schema;
  END IF;

  IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'Dependências do Supabase Auth ausentes (auth.users/auth.uid)';
  END IF;

  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION 'Dependência do Vault ausente: vault.decrypted_secrets';
  END IF;

  IF to_regprocedure('extensions.hmac(text,text,text)') IS NULL
     OR to_regprocedure('extensions.pgp_sym_encrypt(text,text,text)') IS NULL
     OR to_regprocedure('extensions.pgp_sym_decrypt(bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'Assinaturas pgcrypto necessárias ausentes no schema extensions';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'pec_pii_key'
  ) THEN
    RAISE NOTICE 'PENDÊNCIA DE BOOTSTRAP: criar pec_pii_key no Vault antes dos testes funcionais de PII';
  END IF;
END
$verify_platform_dependencies$;

DO $verify_rls$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(format('%I.%I', n.nspname, c.relname), ', ')
  INTO v_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND c.relname = ANY (ARRAY[
      'ubs','microareas','perfis','pec_gestantes','importacoes_pec_resumo',
      'gestante_consultas','gestante_exames','gestante_vacinas','gestante_altas',
      'classificacoes_risco_gestacional','classificacao_risco_itens',
      'visitas_acs_v21','config_exames_pre_natal',
      'config_fatores_risco_gestacional','config_vacinas_gestante','avisos_ubs'
    ])
    AND NOT c.relrowsecurity;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Tabelas públicas sem RLS: %', v_missing;
  END IF;

  SELECT string_agg(format('%I.%I', n.nspname, c.relname), ', ')
  INTO v_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'private'
    AND c.relkind IN ('r', 'p')
    AND (
      NOT c.relrowsecurity
      OR EXISTS (
        SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid
      )
    );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Private não está em RLS default-deny (RLS sem policies): %', v_missing;
  END IF;
END
$verify_rls$;

DO $verify_privileges$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(
    format('%I:%I.%I:%s', r.rolname, n.nspname, c.relname, p.privilege),
    ', '
  )
  INTO v_bad
  FROM pg_roles r
  CROSS JOIN pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN (VALUES ('TRUNCATE'), ('TRIGGER'), ('REFERENCES'), ('MAINTAIN')) p(privilege)
  WHERE r.rolname IN ('anon', 'authenticated')
    AND n.nspname IN ('public', 'private', 'analytics')
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND has_table_privilege(r.oid, c.oid, p.privilege);

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Privilégios perigosos detectados: %', v_bad;
  END IF;

  SELECT string_agg(
    format('%s:%I:%s', coalesce(grantee.rolname, 'PUBLIC'), n.nspname, acl.privilege_type),
    ', '
  )
  INTO v_bad
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
  LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
  WHERE d.defaclobjtype = 'r'
    AND n.nspname IN ('public', 'private', 'analytics')
    AND (acl.grantee = 0 OR grantee.rolname IN ('anon', 'authenticated'))
    AND acl.privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Default privilege perigoso detectado: %', v_bad;
  END IF;

  SELECT string_agg(
    format('%I:%s:%s', n.nspname, d.defaclobjtype, acl.privilege_type),
    ', '
  )
  INTO v_bad
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
  WHERE n.nspname IN ('public', 'private', 'security', 'analytics')
    AND d.defaclobjtype IN ('r', 'S', 'f')
    AND acl.grantee = 0;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Default privilege indevido concedido a PUBLIC: %', v_bad;
  END IF;
END
$verify_privileges$;

DO $verify_schema_create$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(
    format('%s:%I:CREATE', coalesce(r.rolname, 'PUBLIC'), n.nspname),
    ', '
  )
  INTO v_bad
  FROM pg_namespace n
  CROSS JOIN LATERAL aclexplode(
    coalesce(n.nspacl, acldefault('n', n.nspowner))
  ) acl
  LEFT JOIN pg_roles r ON r.oid = acl.grantee
  WHERE n.nspname IN ('public', 'private', 'security', 'analytics')
    AND acl.privilege_type = 'CREATE'
    AND (acl.grantee = 0 OR r.rolname IN ('anon', 'authenticated'));

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'CREATE indevido em schema: %', v_bad;
  END IF;
END
$verify_schema_create$;

DO $verify_private_execution$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(
    format('%I:%I.%I(%s)', r.rolname, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
    ', '
  )
  INTO v_bad
  FROM pg_roles r
  CROSS JOIN pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE r.rolname IN ('anon', 'authenticated')
    AND (
      n.nspname = 'private'
      OR p.prorettype = 'pg_catalog.trigger'::regtype
    )
    AND has_function_privilege(r.oid, p.oid, 'EXECUTE');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'EXECUTE indevido em função privada/de trigger: %', v_bad;
  END IF;

  SELECT string_agg(
    format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
    ', '
  )
  INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('private', 'public')
    AND (
      (n.nspname = 'private' AND p.proname IN (
        'pii_key', 'descriptografar_texto', 'descriptografar_jsonb'
      ))
      OR p.prorettype = 'pg_catalog.trigger'::regtype
    )
    AND has_function_privilege('service_role', p.oid, 'EXECUTE');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'service_role possui EXECUTE direto indevido em cripto/trigger: %', v_bad;
  END IF;

  SELECT string_agg(format('%I:%I', r.rolname, n.nspname), ', ')
  INTO v_bad
  FROM pg_roles r
  CROSS JOIN pg_namespace n
  WHERE r.rolname IN ('anon', 'authenticated')
    AND n.nspname IN ('private', 'analytics')
    AND has_schema_privilege(r.oid, n.oid, 'USAGE');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Acesso direto indevido a schema restrito: %', v_bad;
  END IF;
END
$verify_private_execution$;

DO $verify_search_path$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(
    format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
    ', '
  )
  INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'private', 'security')
    AND p.prosecdef
    AND (
      NOT EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) setting
        WHERE setting LIKE 'search_path=pg_catalog%'
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) setting
        WHERE setting LIKE 'search_path=%'
          AND (setting ILIKE '%$user%' OR setting ILIKE '%pg_temp%')
      )
    );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY DEFINER sem search_path fixo: %', v_bad;
  END IF;
END
$verify_search_path$;

DO $verify_territory_and_views$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(expected.name, ', ')
  INTO v_missing
  FROM (
    VALUES
      ('microareas_id_ubs_unique'),
      ('perfis_microarea_ubs_fkey'),
      ('pec_gestantes_microarea_ubs_territorio_fkey'),
      ('visitas_acs_microarea_ubs_territorio_fkey')
  ) expected(name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = expected.name
      AND c.convalidated
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Constraints territoriais ausentes/não validadas: %', v_missing;
  END IF;

  IF to_regclass('analytics.vw_indicadores_base_v18') IS NULL
     OR to_regclass('analytics.vw_fatores_risco_v18') IS NULL THEN
    RAISE EXCEPTION 'As duas views analytics esperadas não existem';
  END IF;
END
$verify_territory_and_views$;

DO $verify_function_signatures_and_grants$
BEGIN
  IF to_regprocedure('private.indicador_contagem_segura_v1(integer,integer)') IS NULL
     OR to_regprocedure('private.indicador_resumo_aluno_v1(jsonb)') IS NULL
     OR to_regprocedure('private.obter_indicadores_aluno_v1(uuid)') IS NULL
     OR to_regprocedure('private.obter_indicadores_v18(uuid,text,uuid)') IS NULL
     OR to_regprocedure('private.obter_indicadores_v21(uuid,text,uuid)') IS NULL
     OR to_regprocedure('private.esvaziar_lixeira_v19(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Uma ou mais assinaturas privadas esperadas estão ausentes';
  END IF;

  IF to_regprocedure('private.indicador_contagem_segura_v1(integer)') IS NOT NULL
     OR to_regprocedure('private.obter_indicadores_v21(uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Assinatura obsoleta de indicador ainda presente';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'private.obter_indicadores_v21(uuid,text,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'GRANT EXECUTE exato ausente para obter_indicadores_v21(uuid,text,uuid)';
  END IF;
END
$verify_function_signatures_and_grants$;

DO $verify_student_contract$
DECLARE
  v_result jsonb;
  v_top_keys text[];
  v_resumo_keys text[];
BEGIN
  v_result := private.indicador_resumo_aluno_v1(
    jsonb_build_object(
      'resumo', jsonb_build_object(
        'total', 10,
        'ativas', 3,
        'altas', 7,
        'altoRisco', 2,
        'medioRisco', 5,
        'habitual', 3,
        'captacaoPrecoce', 3,
        'captacaoTardia', 7,
        'captacaoSemDados', 0,
        'acompanhamentoAtrasado', 1,
        'examesPendentes', 4,
        'dtpaPendente', 6
      )
    )
  );

  SELECT array_agg(k ORDER BY k)
  INTO v_top_keys
  FROM jsonb_object_keys(v_result) k;

  IF v_top_keys IS DISTINCT FROM ARRAY[
    'avisos','captacao','consultas','fatoresRisco','microareas','resumo','riscos','trimestres'
  ]::text[] THEN
    RAISE EXCEPTION 'Contrato superior do indicador de aluno divergente: %', v_top_keys;
  END IF;

  SELECT array_agg(k ORDER BY k)
  INTO v_resumo_keys
  FROM jsonb_object_keys(v_result->'resumo') k;

  IF v_resumo_keys IS DISTINCT FROM ARRAY[
    'acompanhamentoAtrasado','altas','altoRisco','ativas','captacaoPrecoce',
    'captacaoSemDados','captacaoTardia','dtpaPendente','examesPendentes',
    'habitual','medioRisco','total'
  ]::text[] THEN
    RAISE EXCEPTION 'Contrato resumo do indicador de aluno divergente: %', v_resumo_keys;
  END IF;

  IF (v_result->'resumo'->'ativas') <> 'null'::jsonb
     OR (v_result->'resumo'->'altoRisco') <> 'null'::jsonb
     OR (v_result->'resumo'->'captacaoPrecoce') <> 'null'::jsonb
     OR (v_result->'resumo'->'captacaoTardia') <> 'null'::jsonb
     OR (v_result->'resumo'->'captacaoSemDados') <> 'null'::jsonb
     OR EXISTS (
       SELECT 1
       FROM jsonb_each(v_result - 'resumo') item
       WHERE jsonb_typeof(item.value) <> 'array'
          OR jsonb_array_length(item.value) <> 0
     ) THEN
    RAISE EXCEPTION 'Supressão de grupos pequenos/arrays vazios do aluno falhou: %', v_result;
  END IF;
END
$verify_student_contract$;

DO $verify_role_boundaries$
DECLARE
  v_access_def text;
  v_v18_def text;
  v_v21_def text;
  v_acs_def text;
  v_trash_def text;
BEGIN
  v_access_def := pg_get_functiondef(
    to_regprocedure('security.usuario_pode_acessar_gestante_v18(uuid)')
  );
  v_v18_def := pg_get_functiondef(
    to_regprocedure('private.obter_indicadores_v18(uuid,text,uuid)')
  );
  v_v21_def := pg_get_functiondef(
    to_regprocedure('private.obter_indicadores_v21(uuid,text,uuid)')
  );
  v_acs_def := pg_get_functiondef(
    to_regprocedure('private.complementar_acao_acs_v21(uuid,uuid,jsonb)')
  );
  v_trash_def := pg_get_functiondef(
    to_regprocedure('private.usuario_pode_operar_lixeira_v20(uuid,uuid)')
  );

  IF v_access_def ILIKE '%gestao_municipal%'
     OR v_access_def ILIKE '%aluno%'
     OR v_access_def NOT ILIKE '%g.ubs_id = p.ubs_id%'
     OR v_access_def NOT ILIKE '%g.microarea_id = p.microarea_id%' THEN
    RAISE EXCEPTION 'Limites RLS de acesso clínico individual divergentes';
  END IF;

  IF v_v18_def ILIKE '%''aluno''%'
     OR v_v21_def NOT ILIKE '%obter_indicadores_aluno_v1%'
     OR v_v21_def NOT ILIKE '%p_ubs_filtro%' THEN
    RAISE EXCEPTION 'Separação aluno/gestão/admin nos indicadores está divergente';
  END IF;

  IF v_acs_def NOT ILIKE '%v.ubs_id = v_contexto.ubs_id%'
     OR v_acs_def NOT ILIKE '%v.microarea_id = v_contexto.microarea_id%'
     OR v_trash_def NOT ILIKE '%g.ubs_id = p.ubs_id%' THEN
    RAISE EXCEPTION 'Validação territorial atual ausente em ACS ou lixeira';
  END IF;
END
$verify_role_boundaries$;

DO $verify_append_only_audit$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(format('%I.%I', n.nspname, c.relname), ', ')
  INTO v_bad
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'private'
    AND c.relname = ANY (ARRAY[
      'acessos_identidade_gestantes',
      'importacao_pec_linhas_raw',
      'importacao_pec_erros',
      'historico_clinico_gestantes',
      'historico_classificacoes_risco',
      'auditoria_exclusoes_gestantes',
      'auditoria_avisos_v20',
      'auditoria_perfis_v20',
      'auditoria_visitas_acs_v21'
    ])
    AND (
      has_table_privilege('service_role', c.oid, 'UPDATE')
      OR has_table_privilege('service_role', c.oid, 'DELETE')
    );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Auditoria editável por service_role: %', v_bad;
  END IF;

  SELECT string_agg(acl.privilege_type, ', ')
  INTO v_bad
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
  JOIN pg_roles r ON r.oid = acl.grantee
  WHERE n.nspname = 'private'
    AND d.defaclobjtype = 'r'
    AND r.rolname = 'service_role'
    AND acl.privilege_type IN ('UPDATE', 'DELETE');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Default privileges tornam futuras tabelas private mutáveis por service_role: %', v_bad;
  END IF;
END
$verify_append_only_audit$;

DO $verify_no_legacy_profile$
DECLARE
  v_bad text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname IN ('public', 'private', 'security', 'analytics')
      AND e.enumlabel = 'profissional_ubs'
  ) THEN
    RAISE EXCEPTION 'Valor legado profissional_ubs presente no enum';
  END IF;

  SELECT string_agg(x.object_name, ', ')
  INTO v_bad
  FROM (
    SELECT format('função:%I.%I', n.nspname, p.proname) AS object_name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private', 'security', 'analytics')
      AND p.prokind IN ('f', 'p')
      AND pg_get_functiondef(p.oid) ILIKE '%profissional_ubs%'

    UNION ALL

    SELECT format('view:%I.%I', n.nspname, c.relname)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'private', 'security', 'analytics')
      AND c.relkind IN ('v', 'm')
      AND pg_get_viewdef(c.oid, true) ILIKE '%profissional_ubs%'

    UNION ALL

    SELECT format('policy:%I.%I', pn.nspname, pol.polname)
    FROM pg_policy pol
    JOIN pg_class pc ON pc.oid = pol.polrelid
    JOIN pg_namespace pn ON pn.oid = pc.relnamespace
    WHERE pn.nspname IN ('public', 'private', 'security', 'analytics')
      AND (
        coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ILIKE '%profissional_ubs%'
        OR coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ILIKE '%profissional_ubs%'
      )

    UNION ALL

    SELECT format('constraint:%I.%I', cn.nspname, con.conname)
    FROM pg_constraint con
    JOIN pg_namespace cn ON cn.oid = con.connamespace
    WHERE cn.nspname IN ('public', 'private', 'security', 'analytics')
      AND pg_get_constraintdef(con.oid, true) ILIKE '%profissional_ubs%'

    UNION ALL

    SELECT format('default:%I.%I.%I', an.nspname, ac.relname, a.attname)
    FROM pg_attrdef ad
    JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
    JOIN pg_class ac ON ac.oid = ad.adrelid
    JOIN pg_namespace an ON an.oid = ac.relnamespace
    WHERE an.nspname IN ('public', 'private', 'security', 'analytics')
      AND pg_get_expr(ad.adbin, ad.adrelid) ILIKE '%profissional_ubs%'
  ) x;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Referência legada profissional_ubs no schema: %', v_bad;
  END IF;
END
$verify_no_legacy_profile$;

-- Diagnostic result sets
SELECT
  n.nspname AS schema_name,
  c.relname AS object_name,
  c.relkind,
  c.relrowsecurity,
  c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'private', 'analytics')
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY n.nspname, c.relname;

SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

SELECT
  grantee,
  table_schema,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE grantee IN ('anon', 'authenticated', 'service_role')
  AND table_schema IN ('public', 'private', 'analytics')
ORDER BY grantee, table_schema, table_name, privilege_type;

ROLLBACK;
