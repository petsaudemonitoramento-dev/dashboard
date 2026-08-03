-- Dashboard PET Saúde
-- Verificação somente leitura da V26 final.

DO $verify_v26$
DECLARE
  v_role record;
  v_view text;
  v_oid oid;
  v_acl aclitem[];
  v_count integer;
  v_forbidden integer;
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
    RAISE EXCEPTION
      'A role metabase_reader não foi criada';
  END IF;

  IF v_role.rolcanlogin
     OR v_role.rolsuper
     OR v_role.rolcreatedb
     OR v_role.rolcreaterole
     OR v_role.rolreplication
     OR v_role.rolbypassrls
  THEN
    RAISE EXCEPTION
      'metabase_reader possui atributo elevado ou LOGIN';
  END IF;

  IF NOT has_schema_privilege(
      'metabase_reader',
      'analytics_publicado',
      'USAGE'
    )
    OR has_schema_privilege(
      'metabase_reader',
      'analytics_publicado',
      'CREATE'
    )
  THEN
    RAISE EXCEPTION
      'ACL do schema analytics_publicado incorreta';
  END IF;

  IF has_schema_privilege('anon', 'analytics_publicado', 'USAGE')
     OR has_schema_privilege(
       'authenticated',
       'analytics_publicado',
       'USAGE'
     )
     OR has_schema_privilege(
       'service_role',
       'analytics_publicado',
       'USAGE'
     )
  THEN
    RAISE EXCEPTION
      'Role do aplicativo recebeu USAGE no schema publicado';
  END IF;

  IF has_table_privilege(
       'metabase_reader',
       'analytics.vw_fatores_risco_v18',
       'SELECT'
     )
     OR has_table_privilege(
       'metabase_reader',
       'analytics.vw_indicadores_base_v18',
       'SELECT'
     )
  THEN
    RAISE EXCEPTION
      'Leitor do Metabase acessa view interna V18';
  END IF;

  SELECT count(*)
  INTO v_count
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n
    ON n.oid = c.relnamespace
  WHERE n.nspname = 'analytics_publicado'
    AND c.relkind = 'v';

  IF v_count <> 13 THEN
    RAISE EXCEPTION
      'Quantidade de views publicada divergente: %', v_count;
  END IF;

  FOR v_view IN
    SELECT c.relname
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace
    WHERE n.nspname = 'analytics_publicado'
      AND c.relkind = 'v'
    ORDER BY c.relname
  LOOP
    SELECT
      c.oid,
      coalesce(c.relacl, acldefault('r', c.relowner))
    INTO STRICT v_oid, v_acl
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace
    WHERE n.nspname = 'analytics_publicado'
      AND c.relname = v_view
      AND c.relkind = 'v';

    IF NOT has_table_privilege(
        'metabase_reader',
        v_oid,
        'SELECT'
      )
    THEN
      RAISE EXCEPTION
        'metabase_reader sem SELECT em %', v_view;
    END IF;

    IF has_table_privilege('anon', v_oid, 'SELECT')
       OR has_table_privilege(
         'authenticated',
         v_oid,
         'SELECT'
       )
       OR has_table_privilege(
         'service_role',
         v_oid,
         'SELECT'
       )
    THEN
      RAISE EXCEPTION
        'Role do aplicativo recebeu SELECT em %', v_view;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM aclexplode(v_acl) a
      WHERE a.grantee = 0
        AND a.privilege_type = 'SELECT'
    ) THEN
      RAISE EXCEPTION
        'PUBLIC recebeu SELECT em %', v_view;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      WHERE c.oid = v_oid
        AND coalesce(c.reloptions, '{}'::text[])
          @> ARRAY['security_barrier=true']::text[]
    ) THEN
      RAISE EXCEPTION
        'View % sem security_barrier=true', v_view;
    END IF;
  END LOOP;

  SELECT count(*)
  INTO v_forbidden
  FROM information_schema.columns c
  WHERE c.table_schema = 'analytics_publicado'
    AND (
      lower(c.column_name) IN (
        'gestante_id',
        'profissional_id',
        'profissional_responsavel_id',
        'usuario_id',
        'acs_id',
        'nome_completo',
        'email',
        'cpf',
        'cns',
        'telefone',
        'endereco',
        'data_nascimento',
        'ano_nascimento',
        'codigo_gestante',
        'arquivo_nome'
      )
      OR lower(c.column_name) LIKE '%_enc'
      OR lower(c.column_name) LIKE '%identidade%'
      OR lower(c.column_name) LIKE '%suprim%'
    );

  IF v_forbidden <> 0 THEN
    RAISE EXCEPTION
      'Camada publicada contém coluna proibida';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace
    WHERE n.nspname IN (
      'public', 'private', 'analytics', 'security'
    )
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND (
        has_table_privilege(
          'metabase_reader',
          c.oid,
          'SELECT'
        )
        OR has_table_privilege(
          'metabase_reader',
          c.oid,
          'INSERT'
        )
        OR has_table_privilege(
          'metabase_reader',
          c.oid,
          'UPDATE'
        )
        OR has_table_privilege(
          'metabase_reader',
          c.oid,
          'DELETE'
        )
      )
  ) THEN
    RAISE EXCEPTION
      'metabase_reader recebeu privilégio em objeto-fonte';
  END IF;

  PERFORM 1 FROM analytics_publicado.vw_configuracao_privacidade LIMIT 1;
  PERFORM 1 FROM analytics_publicado.vw_ubs LIMIT 1;
  PERFORM 1 FROM analytics_publicado.vw_resumo_municipal LIMIT 1;
  PERFORM 1 FROM analytics_publicado.vw_indicadores_ubs LIMIT 1;
  PERFORM 1 FROM analytics_publicado.vw_indicadores_microareas LIMIT 1;
  PERFORM 1 FROM analytics_publicado.vw_distribuicao_risco_ubs LIMIT 1;
  PERFORM 1 FROM analytics_publicado.vw_captacao_prenatal_ubs LIMIT 1;
  PERFORM 1 FROM analytics_publicado.vw_consultas_prenatal_ubs LIMIT 1;
  PERFORM 1 FROM analytics_publicado.vw_trimestres_ubs LIMIT 1;
  PERFORM 1 FROM analytics_publicado.vw_previsao_partos_mensal LIMIT 1;
  PERFORM 1 FROM analytics_publicado.vw_fatores_risco_agrupados LIMIT 1;
  PERFORM 1 FROM analytics_publicado.vw_visitas_acs_mensal LIMIT 1;
  PERFORM 1 FROM analytics_publicado.vw_qualidade_importacoes_pec LIMIT 1;
END
$verify_v26$;

SELECT
  'APROVADO' AS status,
  (
    SELECT count(*)
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace
    WHERE n.nspname = 'analytics_publicado'
      AND c.relkind = 'v'
  ) AS views_publicadas,
  has_schema_privilege(
    'metabase_reader',
    'analytics_publicado',
    'USAGE'
  ) AS leitor_possui_usage,
  has_schema_privilege(
    'metabase_reader',
    'analytics_publicado',
    'CREATE'
  ) AS leitor_possui_create,
  has_table_privilege(
    'metabase_reader',
    'analytics.vw_indicadores_base_v18',
    'SELECT'
  ) AS leitor_acessa_view_interna;
