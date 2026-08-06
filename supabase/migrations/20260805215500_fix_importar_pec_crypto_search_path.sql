BEGIN;

-- pgcrypto is installed in the extensions schema. The PEC importer was
-- resolving pgp_sym_encrypt only in pg_catalog, public and private, causing
-- every parsed row to fail with PostgreSQL error 42883.
ALTER FUNCTION private.importar_pec(
  uuid,
  uuid,
  text,
  text,
  integer,
  jsonb,
  jsonb,
  jsonb
)
SET search_path TO pg_catalog, public, private, extensions;

COMMIT;
