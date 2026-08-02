-- Read-only verification for the V25 one-time initial governance bootstrap.
-- Valid both before and after the bootstrap function is executed.

DO $verify_initial_governance_bootstrap$
DECLARE
  v_state_relation regclass := to_regclass('private.bootstrap_governanca_v25');
  v_function regprocedure := to_regprocedure(
    'private.bootstrap_governanca_inicial_v25(uuid,text,uuid,text)'
  );
  v_function_definition text;
  v_function_config text[];
  v_state_count integer;
  v_admin_count integer;
  v_management_count integer;
  v_state record;
BEGIN
  IF v_state_relation IS NULL THEN
    RAISE EXCEPTION 'Missing private.bootstrap_governanca_v25';
  END IF;

  IF v_function IS NULL THEN
    RAISE EXCEPTION 'Missing private.bootstrap_governanca_inicial_v25(uuid,text,uuid,text)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.oid = v_state_relation
      AND n.nspname = 'private'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND pg_get_userbyid(c.relowner) = 'postgres'
  ) THEN
    RAISE EXCEPTION 'Bootstrap state table must be an RLS-enabled postgres-owned table';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = con.conrelid
     AND a.attnum = ANY (con.conkey)
    WHERE con.conrelid = v_state_relation
      AND con.contype = 'p'
      AND array_length(con.conkey, 1) = 1
      AND a.attname = 'singleton'
  ) THEN
    RAISE EXCEPTION 'Bootstrap state table must keep singleton as its primary key';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid = v_state_relation
      AND NOT t.tgisinternal
      AND t.tgname = 'bootstrap_governanca_v25_append_only'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid = v_state_relation
      AND NOT t.tgisinternal
      AND t.tgname = 'bootstrap_governanca_v25_no_truncate'
  ) THEN
    RAISE EXCEPTION 'Bootstrap completion marker is not append-only';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS role_name(name)
    CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) AS permission(name)
    WHERE has_table_privilege(
      role_name.name,
      v_state_relation,
      permission.name
    )
  ) THEN
    RAISE EXCEPTION 'Direct mutation privilege found on bootstrap state table';
  END IF;

  IF NOT has_table_privilege('service_role', v_state_relation, 'SELECT') THEN
    RAISE EXCEPTION 'service_role must be able to inspect bootstrap completion state';
  END IF;

  SELECT p.proconfig, pg_get_functiondef(p.oid)
  INTO v_function_config, v_function_definition
  FROM pg_catalog.pg_proc p
  WHERE p.oid = v_function;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    WHERE p.oid = v_function
      AND p.prosecdef
      AND pg_get_userbyid(p.proowner) = 'postgres'
  ) THEN
    RAISE EXCEPTION 'Bootstrap function must be postgres-owned SECURITY DEFINER';
  END IF;

  IF v_function_config IS NULL
     OR NOT ('search_path=pg_catalog, auth, public, private' = ANY (v_function_config)) THEN
    RAISE EXCEPTION 'Bootstrap function has an unsafe search_path';
  END IF;

  IF has_function_privilege('anon', v_function, 'EXECUTE')
     OR has_function_privilege('authenticated', v_function, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'Bootstrap function EXECUTE ACL is incorrect';
  END IF;

  IF v_function_definition NOT ILIKE '%LOCK TABLE private.bootstrap_governanca_v25 IN EXCLUSIVE MODE%'
     OR v_function_definition NOT ILIKE '%Bootstrap inicial de governanca ja foi concluido%'
     OR v_function_definition NOT ILIKE '%email_confirmed_at IS NULL%'
     OR v_function_definition NOT ILIKE '%bootstrap_administrador_v25%'
     OR v_function_definition NOT ILIKE '%bootstrap_gestao_v25%'
     OR v_function_definition NOT ILIKE '%origem_cadastro%bootstrap_v25%'
  THEN
    RAISE EXCEPTION 'Bootstrap function is missing a required safety invariant';
  END IF;

  IF v_function_definition ILIKE '%pec_gestantes%'
     OR v_function_definition ILIKE '%identidades_gestantes%'
     OR v_function_definition ILIKE '%credenciais_profissionais%'
  THEN
    RAISE EXCEPTION 'Bootstrap function must not touch clinical or professional credential data';
  END IF;

  SELECT count(*) INTO v_state_count
  FROM private.bootstrap_governanca_v25;

  SELECT count(*) INTO v_admin_count
  FROM public.perfis p
  WHERE p.perfil = 'administrador'::public.perfil_usuario;

  SELECT count(*) INTO v_management_count
  FROM public.perfis p
  WHERE p.perfil = 'gestao_municipal'::public.perfil_usuario;

  IF v_state_count = 0 THEN
    IF v_admin_count <> 0 OR v_management_count <> 0 THEN
      RAISE EXCEPTION 'Administrative profiles exist without the irreversible bootstrap marker';
    END IF;
  ELSIF v_state_count = 1 THEN
    SELECT * INTO STRICT v_state
    FROM private.bootstrap_governanca_v25;

    IF v_admin_count <> 1 OR v_management_count <> 1 THEN
      RAISE EXCEPTION 'Completed bootstrap must produce exactly one administrator and one management profile';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.perfis p
      WHERE p.id = v_state.administrador_id
        AND p.perfil = 'administrador'::public.perfil_usuario
        AND p.status = 'ativo'::public.status_usuario
        AND p.ativo
        AND p.cadastro_completo
        AND p.aprovacao_status = 'aprovado'
        AND p.ubs_id IS NULL
        AND p.microarea_id IS NULL
        AND p.perfil_excluido_em IS NULL
        AND p.origem_cadastro = 'bootstrap_v25'
    ) THEN
      RAISE EXCEPTION 'Initial administrator profile does not match the hardened bootstrap state';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.perfis p
      WHERE p.id = v_state.gestao_id
        AND p.perfil = 'gestao_municipal'::public.perfil_usuario
        AND p.status = 'ativo'::public.status_usuario
        AND p.ativo
        AND p.cadastro_completo
        AND p.aprovacao_status = 'aprovado'
        AND p.ubs_id IS NULL
        AND p.microarea_id IS NULL
        AND p.perfil_excluido_em IS NULL
        AND p.aprovado_por = v_state.administrador_id
        AND p.origem_cadastro = 'bootstrap_v25'
    ) THEN
      RAISE EXCEPTION 'Initial management profile does not match the hardened bootstrap state';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM private.auditoria_perfis_v20 a
      WHERE a.perfil_alvo_id = v_state.administrador_id
        AND a.administrador_id IS NULL
        AND a.acao = 'bootstrap_administrador_v25'
    ) OR NOT EXISTS (
      SELECT 1
      FROM private.auditoria_perfis_v20 a
      WHERE a.perfil_alvo_id = v_state.gestao_id
        AND a.administrador_id = v_state.administrador_id
        AND a.acao = 'bootstrap_gestao_v25'
    ) THEN
      RAISE EXCEPTION 'Completed bootstrap is missing its immutable audit records';
    END IF;
  ELSE
    RAISE EXCEPTION 'Bootstrap state table contains more than one row';
  END IF;
END
$verify_initial_governance_bootstrap$;

SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM private.bootstrap_governanca_v25
  ) THEN 'COMPLETED' ELSE 'READY' END AS bootstrap_status,
  (SELECT count(*) FROM public.perfis
    WHERE perfil = 'administrador'::public.perfil_usuario) AS administrators,
  (SELECT count(*) FROM public.perfis
    WHERE perfil = 'gestao_municipal'::public.perfil_usuario) AS management_profiles,
  has_function_privilege(
    'service_role',
    'private.bootstrap_governanca_inicial_v25(uuid,text,uuid,text)',
    'EXECUTE'
  ) AS service_role_can_execute,
  has_function_privilege(
    'authenticated',
    'private.bootstrap_governanca_inicial_v25(uuid,text,uuid,text)',
    'EXECUTE'
  ) AS authenticated_can_execute;
