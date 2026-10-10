-- Retira código privilegiado de módulos V2 desativados.
-- RESTRICT garante que qualquer dependência de catálogo não mapeada interrompa a migration.
-- Tabelas e views históricas permanecem intactas para retenção e analytics.
begin;

drop function if exists private.complementar_acao_acs_v21(uuid, uuid, jsonb) restrict;
drop function if exists private.registrar_acao_acs_v21(uuid, uuid, text) restrict;
drop function if exists private.obter_painel_acs_v21(uuid) restrict;

drop function if exists private.obter_indicadores_v21(uuid, text, uuid) restrict;
drop function if exists private.obter_indicadores_v18(uuid, text, uuid) restrict;
drop function if exists private.obter_indicadores_aluno_v1(uuid) restrict;
drop function if exists private.obter_inicio_v21(uuid) restrict;

drop function if exists private.normalizar_data_cadastro_v21(text) restrict;

commit;