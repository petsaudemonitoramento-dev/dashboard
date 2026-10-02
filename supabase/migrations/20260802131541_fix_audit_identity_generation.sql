-- Fonte: histórico de migrations do Supabase dashboard-v2 (bhkyfcnuxcvjgvusgpgm)
-- Migration já aplicada no remoto. Recuperada para reproduzir o schema em CI/Codespaces.
-- Não contém dump de dados de produção.
-- Não editar retroativamente; novas alterações devem usar migrations posteriores.

-- Dashboard 2.0 - restore automatic keys for immutable audit/history records.
-- The cumulative schema preserved bigint primary keys but omitted the identity
-- clauses present in the frozen baseline. Keep this correction incremental.
BEGIN;

DO $fix_audit_identity_generation$
DECLARE
  v_table text;
  v_relation regclass;
  v_attribute_number smallint;
  v_attribute_type oid;
  v_not_null boolean;
  v_identity "char";
  v_default text;
  v_table_owner oid;
  v_sequence text;
  v_sequence_owner oid;
  v_dependency "char";
  v_max_id bigint;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'acessos_identidade_gestantes',
    'auditoria_avisos_v20',
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
      RAISE EXCEPTION 'Required audit/history table private.% is missing', v_table;
    END IF;

    SELECT
      a.attnum,
      a.atttypid,
      a.attnotnull,
      a.attidentity,
      pg_get_expr(ad.adbin, ad.adrelid),
      c.relowner
    INTO
      v_attribute_number,
      v_attribute_type,
      v_not_null,
      v_identity,
      v_default,
      v_table_owner
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    LEFT JOIN pg_catalog.pg_attrdef ad
      ON ad.adrelid = a.attrelid
     AND ad.adnum = a.attnum
    WHERE a.attrelid = v_relation
      AND a.attname = 'id'
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Required column private.%.id is missing', v_table;
    END IF;

    IF v_attribute_type <> 'pg_catalog.int8'::regtype OR v_not_null IS NOT TRUE THEN
      RAISE EXCEPTION 'private.%.id must remain bigint NOT NULL', v_table;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint con
      WHERE con.conrelid = v_relation
        AND con.contype = 'p'
        AND con.conkey = ARRAY[v_attribute_number]::smallint[]
    ) THEN
      RAISE EXCEPTION 'private.%.id must remain the single-column primary key', v_table;
    END IF;

    IF v_identity = '' THEN
      IF v_default IS NOT NULL THEN
        RAISE EXCEPTION
          'private.%.id has an unexpected default and will not be changed: %',
          v_table,
          v_default;
      END IF;

      EXECUTE format(
        'ALTER TABLE %I.%I ALTER COLUMN %I ADD GENERATED ALWAYS AS IDENTITY',
        'private',
        v_table,
        'id'
      );
    ELSIF v_identity <> 'a' THEN
      RAISE EXCEPTION
        'private.%.id has unexpected identity mode %, expected GENERATED ALWAYS',
        v_table,
        v_identity;
    END IF;

    v_sequence := pg_get_serial_sequence(
      format('%I.%I', 'private', v_table),
      'id'
    );

    IF v_sequence IS NULL THEN
      RAISE EXCEPTION 'Identity sequence was not created for private.%.id', v_table;
    END IF;

    SELECT seq.relowner, dep.deptype
    INTO v_sequence_owner, v_dependency
    FROM pg_catalog.pg_class seq
    JOIN pg_catalog.pg_depend dep
      ON dep.objid = seq.oid
     AND dep.refobjid = v_relation
     AND dep.refobjsubid = v_attribute_number
     AND dep.deptype = 'i'
    WHERE seq.oid = v_sequence::regclass
      AND seq.relkind = 'S';

    IF NOT FOUND OR v_dependency <> 'i' THEN
      RAISE EXCEPTION 'Identity sequence for private.%.id is not internally owned', v_table;
    END IF;

    IF v_sequence_owner <> v_table_owner THEN
      RAISE EXCEPTION 'Identity sequence owner differs from private.% owner', v_table;
    END IF;

    EXECUTE format('SELECT max(%I) FROM %I.%I', 'id', 'private', v_table)
    INTO v_max_id;

    IF v_max_id IS NULL THEN
      PERFORM pg_catalog.setval(v_sequence::regclass, 1, false);
    ELSE
      PERFORM pg_catalog.setval(v_sequence::regclass, v_max_id, true);
    END IF;
  END LOOP;
END
$fix_audit_identity_generation$;

COMMIT;
