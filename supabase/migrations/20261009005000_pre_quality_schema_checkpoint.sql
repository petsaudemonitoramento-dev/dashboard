-- Safety checkpoint for the hosted post-V30 deployment.
-- Captures the exact pre-change definitions of dropped functions, affected
-- triggers and policies. This is NOT an offsite database or Auth backup.
begin;

create schema backup_pre_quality_v30_20261010;
revoke all on schema backup_pre_quality_v30_20261010
  from public, anon, authenticated, service_role;

create table backup_pre_quality_v30_20261010.metadata as
select
  clock_timestamp() as captured_at,
  current_database()::text as database_name,
  '47b544194e9efa4575e7a5208bd7b49f2e36d3b4'::text as prior_production_sha,
  'schema-level logical rollback checkpoint; NOT a full/offsite backup'::text as purpose;

create table backup_pre_quality_v30_20261010.function_definitions as
select
  p.oid::regprocedure::text as signature,
  n.nspname::text as schema_name,
  p.proname::text as function_name,
  pg_get_functiondef(p.oid) as create_function_sql,
  p.proacl::text as original_acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname in (
    'complementar_acao_acs_v21',
    'registrar_acao_acs_v21',
    'obter_painel_acs_v21',
    'obter_indicadores_v21',
    'obter_indicadores_v18',
    'obter_indicadores_aluno_v1',
    'obter_inicio_v21',
    'normalizar_data_cadastro_v21'
  );

do $snapshot$
begin
  if (select count(*) from backup_pre_quality_v30_20261010.function_definitions) <> 8 then
    raise exception 'ROLLBACK_CHECKPOINT_INCOMPLETE: 8 legacy functions expected';
  end if;
end
$snapshot$;

create table backup_pre_quality_v30_20261010.trigger_definitions as
select
  n.nspname::text as schema_name,
  c.relname::text as table_name,
  t.tgname::text as trigger_name,
  pg_get_triggerdef(t.oid, true) as create_trigger_sql
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and (
    (n.nspname = 'public' and c.relname in (
      'perfis', 'pec_gestantes', 'gestante_consultas', 'gestante_exames',
      'gestante_vacinas', 'gestante_altas',
      'classificacoes_risco_gestacional', 'importacoes_pec_resumo'
    ))
    or (n.nspname = 'private' and c.relname in (
      'historico_clinico_gestantes', 'historico_classificacoes_risco'
    ))
  );

create table backup_pre_quality_v30_20261010.policy_definitions as
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'perfis';

create table backup_pre_quality_v30_20261010.migration_history as
select version, name from supabase_migrations.schema_migrations;

create table backup_pre_quality_v30_20261010.operational_counts as
select 'auth.users'::text as object_name, count(*)::bigint as row_count from auth.users
union all select 'public.perfis', count(*) from public.perfis
union all select 'public.pec_gestantes', count(*) from public.pec_gestantes
union all select 'public.ubs', count(*) from public.ubs
union all select 'public.microareas', count(*) from public.microareas
union all select 'public.config_exames_pre_natal', count(*) from public.config_exames_pre_natal
union all select 'public.config_fatores_risco_gestacional', count(*) from public.config_fatores_risco_gestacional
union all select 'public.config_vacinas_gestante', count(*) from public.config_vacinas_gestante;

revoke all on all tables in schema backup_pre_quality_v30_20261010
  from public, anon, authenticated, service_role;

commit;
