-- Read-only verification for V24 audit/history identity generation.
-- It reads catalogs and sequence state without consuming sequence values.

DO $verify_audit_identity_generation$
DECLARE
  v_table text;
  v_relation regclass;
  v_attribute_number smallint;
  v_attribute_type oid;
  v_not_null boolean;
  v_identity "char";
  v_table_owner oid;
  v_sequence text;
  v_sequence_owner oid;
  v_dependency "char";
  v_increment bigint;
  v_last_value bigint;
  v_is_called boolean;
  v_next_value numeric;
  v_max_id bigint;
  v_definition text;
  v_insert_columns text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'acessos_identidade_gestantes',
    'auditoria_avisos_v20',
    'auditoria_credenciais_profissionais',
    'auditoria_exclusoes_gestantes',
    'auditoria_perfis_v20',
    'auditoria_visitas_acs_v21',
    'historico_classificacoes_risco',
    'historico_clinico_gestantes',
    'importacao_pec_erros',
    'importacao_pec_linhas_raw'
  ]::text[]
  LOOP
    v_relation := to_regclass(format('%I.%I', 'private', v_table));

    IF v_relation IS NULL THEN
      RAISE EXCEPTION 'Missing audit/history table private.%', v_table;
    END IF;

    SELECT a.attnum, a.atttypid, a.attnotnull, a.attidentity, c.relowner
    INTO v_attribute_number, v_attribute_type, v_not_null, v_identity, v_table_owner
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    WHERE a.attrelid = v_relation
      AND a.attname = 'id'
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF NOT FOUND
       OR v_attribute_type <> 'pg_catalog.int8'::regtype
       OR v_not_null IS NOT TRUE
       OR v_identity <> 'a' THEN
      RAISE EXCEPTION
        'private.%.id must be a bigint NOT NULL GENERATED ALWAYS identity',
        v_table;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint con
      WHERE con.conrelid = v_relation
        AND con.contype = 'p'
        AND con.conkey = ARRAY[v_attribute_number]::smallint[]
    ) THEN
      RAISE EXCEPTION 'private.%.id is not the preserved primary key', v_table;
    END IF;

    v_sequence := pg_get_serial_sequence(
      format('%I.%I', 'private', v_table),
      'id'
    );

    IF v_sequence IS NULL THEN
      RAISE EXCEPTION 'private.%.id has no associated identity sequence', v_table;
    END IF;

    SELECT seq.relowner, dep.deptype, ps.seqincrement
    INTO v_sequence_owner, v_dependency, v_increment
    FROM pg_catalog.pg_class seq
    JOIN pg_catalog.pg_sequence ps ON ps.seqrelid = seq.oid
    JOIN pg_catalog.pg_depend dep
      ON dep.objid = seq.oid
     AND dep.refobjid = v_relation
     AND dep.refobjsubid = v_attribute_number
     AND dep.deptype = 'i'
    WHERE seq.oid = v_sequence::regclass
      AND seq.relkind = 'S';

    IF NOT FOUND
       OR v_dependency <> 'i'
       OR v_sequence_owner <> v_table_owner
       OR v_increment <= 0 THEN
      RAISE EXCEPTION 'Unsafe identity sequence ownership for private.%.id', v_table;
    END IF;

    EXECUTE format('SELECT max(%I) FROM %I.%I', 'id', 'private', v_table)
    INTO v_max_id;
    EXECUTE format('SELECT last_value, is_called FROM %s', v_sequence)
    INTO v_last_value, v_is_called;

    v_next_value := CASE
      WHEN v_is_called THEN v_last_value::numeric + v_increment::numeric
      ELSE v_last_value::numeric
    END;

    IF v_next_value <= coalesce(v_max_id, 0)::numeric THEN
      RAISE EXCEPTION
        'Unsafe next identity value for private.%: next %, max %',
        v_table,
        v_next_value,
        v_max_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      WHERE c.oid = v_relation
        AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS is not enabled on private.%', v_table;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM (VALUES ('anon'), ('authenticated')) AS role_name(name)
      CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE')) AS permission(name)
      WHERE has_table_privilege(
        role_name.name,
        v_relation,
        permission.name
      )
    ) THEN
      RAISE EXCEPTION 'Client mutation privilege found on private.%', v_table;
    END IF;

    IF has_table_privilege('service_role', v_relation, 'UPDATE')
       OR has_table_privilege('service_role', v_relation, 'DELETE') THEN
      RAISE EXCEPTION 'Append-only protection weakened on private.%', v_table;
    END IF;
  END LOOP;

  SELECT pg_get_functiondef(
    'private.processar_solicitacao_perfil_v22(uuid,uuid,text,uuid,uuid,text)'::regprocedure
  )
  INTO v_definition;

  v_insert_columns := (
    regexp_match(
      v_definition,
      'insert[[:space:]]+into[[:space:]]+private[.]auditoria_perfis_v20[[:space:]]*[(]([^)]*)[)]',
      'i'
    )
  )[1];

  IF v_insert_columns IS NULL THEN
    RAISE EXCEPTION 'Official profile approval audit INSERT was not found';
  END IF;

  IF 'id' = ANY (
    regexp_split_to_array(
      lower(replace(v_insert_columns, '"', '')),
      '[[:space:]]*,[[:space:]]*'
    )
  ) THEN
    RAISE EXCEPTION 'Official profile approval function must keep omitting audit id';
  END IF;
END
$verify_audit_identity_generation$;

SELECT
  c.relname AS table_name,
  a.attname AS primary_key,
  format_type(a.atttypid, a.atttypmod) AS key_type,
  a.attnotnull AS not_null,
  CASE a.attidentity
    WHEN 'a' THEN 'ALWAYS'
    WHEN 'd' THEN 'BY DEFAULT'
    ELSE NULL
  END AS identity_generation,
  pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname)
    AS associated_sequence,
  c.relrowsecurity AS rls_enabled,
  has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE') AS anon_can_mutate,
  has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE')
    AS authenticated_can_mutate
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_constraint con
  ON con.conrelid = c.oid
 AND con.contype = 'p'
JOIN pg_catalog.pg_attribute a
  ON a.attrelid = c.oid
 AND a.attnum = ANY (con.conkey)
WHERE n.nspname = 'private'
  AND c.relname = ANY (ARRAY[
    'acessos_identidade_gestantes',
    'auditoria_avisos_v20',
    'auditoria_credenciais_profissionais',
    'auditoria_exclusoes_gestantes',
    'auditoria_perfis_v20',
    'auditoria_visitas_acs_v21',
    'historico_classificacoes_risco',
    'historico_clinico_gestantes',
    'importacao_pec_erros',
    'importacao_pec_linhas_raw'
  ]::text[])
ORDER BY c.relname;
