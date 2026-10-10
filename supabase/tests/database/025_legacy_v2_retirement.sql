begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

select ok(
  to_regprocedure('private.complementar_acao_acs_v21(uuid,uuid,jsonb)') is null,
  'função legada de complemento ACS foi removida'
);

select ok(
  to_regprocedure('private.registrar_acao_acs_v21(uuid,uuid,text)') is null,
  'função legada de registro ACS foi removida'
);

select ok(
  to_regprocedure('private.obter_painel_acs_v21(uuid)') is null,
  'painel territorial ACS privilegiado foi removido'
);

select ok(
  to_regprocedure('private.obter_indicadores_v21(uuid,text,uuid)') is null,
  'agregador territorial V21 foi removido'
);

select ok(
  to_regprocedure('private.obter_indicadores_v18(uuid,text,uuid)') is null,
  'agregador territorial V18 foi removido'
);

select ok(
  to_regprocedure('private.obter_indicadores_aluno_v1(uuid)') is null,
  'helper de indicadores do módulo antigo foi removido'
);

select ok(
  to_regprocedure('private.obter_inicio_v21(uuid)') is null,
  'home territorial V21 foi removida'
);

select ok(
  to_regprocedure('private.normalizar_data_cadastro_v21(text)') is null,
  'helper exclusivo do fluxo ACS removido não permanece órfão'
);

select ok(
  to_regclass('public.visitas_acs_v21') is not null,
  'tabela histórica de visitas ACS foi preservada'
);

select ok(
  to_regclass('private.auditoria_visitas_acs_v21') is not null,
  'auditoria histórica ACS foi preservada'
);

select ok(
  to_regclass('analytics.vw_indicadores_base_v18') is not null,
  'view-base ainda necessária ao analytics publicado foi preservada'
);

select ok(
  to_regclass('analytics.vw_fatores_risco_v18') is not null,
  'view de fatores ainda necessária ao analytics publicado foi preservada'
);

select ok(
  not has_table_privilege('anon', 'public.visitas_acs_v21', 'SELECT')
  and not has_table_privilege('authenticated', 'public.visitas_acs_v21', 'SELECT')
  and not has_table_privilege('anon', 'public.visitas_acs_v21', 'INSERT')
  and not has_table_privilege('authenticated', 'public.visitas_acs_v21', 'INSERT'),
  'tabela ACS preservada continua indisponível aos clientes'
);

select ok(
  to_regprocedure('public.profissionais_listar_gestantes_v30(boolean)') is not null,
  'RPC V30 de gestantes permanece disponível'
);

select ok(
  to_regprocedure('public.profissionais_obter_relatorio_classificacao_v30(uuid)') is not null,
  'RPC V30 de relatório permanece disponível'
);

select ok(
  to_regprocedure(
    'public.profissionais_importar_pec_v30(text,text,integer,jsonb,jsonb,jsonb)'
  ) is not null,
  'RPC V30 de PEC permanece disponível'
);

select ok(
  to_regprocedure('public.profissionais_mover_gestante_lixeira_v30(uuid)') is not null,
  'RPC V30 de lixeira permanece disponível'
);

select * from finish();

rollback;