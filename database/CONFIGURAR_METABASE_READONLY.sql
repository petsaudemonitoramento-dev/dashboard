-- EXECUÇÃO OPCIONAL E MANUAL.
-- Troque a senha de exemplo antes de executar.
-- Este usuário enxerga somente as views sem identificação direta da V18.

create role metabase_reader
login
password 'TROQUE-POR-UMA-SENHA-FORTE';

grant connect on database postgres to metabase_reader;
grant usage on schema analytics to metabase_reader;
grant select on analytics.vw_indicadores_base_v18 to metabase_reader;
grant select on analytics.vw_fatores_risco_v18 to metabase_reader;

alter role metabase_reader set statement_timeout = '60s';
alter role metabase_reader set default_transaction_read_only = on;
