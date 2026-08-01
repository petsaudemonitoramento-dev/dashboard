-- WARNING: THIS ROLLBACK DELIBERATELY REINTRODUCES INSECURE PERMISSIONS.
-- Documentation only. Do not execute automatically and do not add this file
-- to the migration chain. Use only after an explicit security review.
--
-- This restores only the dangerous grants present in the frozen baseline and
-- does not use GRANT ALL or grant privileges on all existing tables.

BEGIN;

GRANT REFERENCES, TRIGGER, TRUNCATE, MAINTAIN
ON TABLE
  "public"."perfis",
  "public"."ubs",
  "public"."microareas",
  "public"."classificacao_risco_itens",
  "public"."classificacoes_risco_gestacional",
  "public"."config_exames_pre_natal",
  "public"."gestante_exames",
  "public"."gestante_vacinas",
  "public"."config_fatores_risco_gestacional",
  "public"."config_vacinas_gestante",
  "public"."gestante_altas",
  "public"."gestante_consultas"
TO "anon", "authenticated";

GRANT REFERENCES, TRIGGER, TRUNCATE, MAINTAIN
ON TABLE
  "public"."exames",
  "public"."gestacoes",
  "public"."gestantes",
  "public"."atendimentos",
  "public"."visitas_domiciliares",
  "public"."classificacoes_risco"
TO "authenticated";

ALTER DEFAULT PRIVILEGES
FOR ROLE "postgres"
IN SCHEMA "public"
GRANT REFERENCES, TRIGGER, TRUNCATE, MAINTAIN
ON TABLES
TO "anon", "authenticated";

COMMIT;
