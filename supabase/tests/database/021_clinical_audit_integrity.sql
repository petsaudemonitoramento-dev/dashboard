begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

select has_table(
  'private',
  'auditoria_eventos_clinicos_v30',
  'trilha clínica mínima deve existir'
);

select ok(
  (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relname = 'auditoria_eventos_clinicos_v30'
  ),
  'trilha clínica privada deve ter RLS habilitado'
);

select ok(
  not has_schema_privilege('anon', 'private', 'USAGE'),
  'anon não possui USAGE no schema private'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated não possui USAGE no schema private'
);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and (
        c.relname like 'auditoria_%'
        or c.relname like 'historico_%'
      )
      and (
        has_table_privilege('anon', c.oid, 'SELECT')
        or has_table_privilege('anon', c.oid, 'INSERT')
        or has_table_privilege('anon', c.oid, 'UPDATE')
        or has_table_privilege('anon', c.oid, 'DELETE')
        or has_table_privilege('anon', c.oid, 'TRUNCATE')
      )
  ),
  'anon não adultera nem lê tabelas privadas de auditoria'
);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and (
        c.relname like 'auditoria_%'
        or c.relname like 'historico_%'
      )
      and (
        has_table_privilege('authenticated', c.oid, 'SELECT')
        or has_table_privilege('authenticated', c.oid, 'INSERT')
        or has_table_privilege('authenticated', c.oid, 'UPDATE')
        or has_table_privilege('authenticated', c.oid, 'DELETE')
        or has_table_privilege('authenticated', c.oid, 'TRUNCATE')
      )
  ),
  'authenticated não adultera nem lê tabelas privadas de auditoria'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'auditar_mutacao_clinica_v30',
        'auditar_estado_profissional_v30',
        'minimizar_historico_clinico_v30',
        'minimizar_historico_classificacao_v30'
      )
      and (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  ),
  'funções internas de auditoria não são executáveis pelos clientes'
);

select ok(
  not has_sequence_privilege(
    'anon',
    'private.auditoria_eventos_clinicos_v30_id_seq',
    'USAGE'
  ),
  'anon não usa a sequence da auditoria'
);

select ok(
  not has_sequence_privilege(
    'authenticated',
    'private.auditoria_eventos_clinicos_v30_id_seq',
    'USAGE'
  ),
  'authenticated não usa a sequence da auditoria'
);

insert into auth.users (
  id, aud, role, email, created_at, updated_at
)
values
  (
    '21000000-0000-4000-8000-000000000001'::uuid,
    'authenticated',
    'authenticated',
    'audit-professional@ci.invalid',
    now(),
    now()
  ),
  (
    '21000000-0000-4000-8000-000000000002'::uuid,
    'authenticated',
    'authenticated',
    'audit-admin@ci.invalid',
    now(),
    now()
  ),
  (
    '21000000-0000-4000-8000-000000000003'::uuid,
    'authenticated',
    'authenticated',
    'audit-target@ci.invalid',
    now(),
    now()
  );

insert into public.perfis (
  id,
  nome_completo,
  email,
  perfil,
  status,
  ubs_id,
  primeiro_acesso,
  ativo,
  cadastro_completo,
  aprovacao_status,
  perfil_solicitado,
  origem_cadastro,
  cargo_funcao
)
values
  (
    '21000000-0000-4000-8000-000000000001'::uuid,
    'Profissional Auditoria CI',
    'audit-professional@ci.invalid',
    'equipe_ubs',
    'ativo',
    '00000000-0000-4000-8000-000000000101'::uuid,
    false,
    true,
    true,
    'aprovado',
    'equipe_ubs',
    'ci',
    'medico'
  ),
  (
    '21000000-0000-4000-8000-000000000002'::uuid,
    'Administrador Auditoria CI',
    'audit-admin@ci.invalid',
    'administrador',
    'ativo',
    null,
    false,
    true,
    true,
    'aprovado',
    'administrador',
    'ci',
    null
  ),
  (
    '21000000-0000-4000-8000-000000000003'::uuid,
    'Profissional Alvo CI',
    'audit-target@ci.invalid',
    'aluno',
    'ativo',
    null,
    true,
    true,
    false,
    'pendente',
    'equipe_ubs',
    'ci',
    'enfermeiro'
  );

insert into private.credenciais_profissionais (
  usuario_id,
  cargo_funcao,
  conselho,
  uf,
  numero_registro,
  categoria,
  situacao,
  decidido_em,
  decidido_por,
  fonte_verificacao
)
values (
  '21000000-0000-4000-8000-000000000001'::uuid,
  'medico',
  'CRM',
  'PB',
  '210001',
  'MEDICO',
  'validado',
  now(),
  '21000000-0000-4000-8000-000000000002'::uuid,
  'portal_cfm'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-4000-8000-000000000001',
  true
);

insert into public.pec_gestantes (
  id, codigo, ubs_id, profissional_responsavel_id
)
values
  (
    '22000000-0000-4000-8000-000000000001'::uuid,
    'AUDIT-GESTANTE-1',
    '00000000-0000-4000-8000-000000000101'::uuid,
    '21000000-0000-4000-8000-000000000001'::uuid
  ),
  (
    '22000000-0000-4000-8000-000000000002'::uuid,
    'AUDIT-GESTANTE-2',
    '00000000-0000-4000-8000-000000000101'::uuid,
    '21000000-0000-4000-8000-000000000001'::uuid
  );

insert into public.gestante_consultas (
  id, gestante_id, data_atendimento, observacao, profissional_id
)
values (
  '23000000-0000-4000-8000-000000000001'::uuid,
  '22000000-0000-4000-8000-000000000001'::uuid,
  current_date,
  'SEGREDO-CONSULTA-CI',
  '21000000-0000-4000-8000-000000000001'::uuid
);

insert into public.gestante_exames (
  id, gestante_id, codigo, nome, trimestre, resultado_resumido, profissional_id
)
values (
  '24000000-0000-4000-8000-000000000001'::uuid,
  '22000000-0000-4000-8000-000000000001'::uuid,
  'AUDIT-CI',
  'Exame sintético',
  1,
  'SEGREDO-EXAME-CI',
  '21000000-0000-4000-8000-000000000001'::uuid
);

insert into public.gestante_vacinas (
  id, gestante_id, codigo, nome, lote, profissional_id
)
values (
  '25000000-0000-4000-8000-000000000001'::uuid,
  '22000000-0000-4000-8000-000000000001'::uuid,
  'AUDIT-VAC',
  'Vacina sintética',
  'SEGREDO-LOTE-CI',
  '21000000-0000-4000-8000-000000000001'::uuid
);

insert into public.gestante_altas (
  id, gestante_id, data_alta, motivo, observacao, ubs_id, profissional_id
)
values (
  '26000000-0000-4000-8000-000000000001'::uuid,
  '22000000-0000-4000-8000-000000000001'::uuid,
  current_date,
  'Alta sintética',
  'SEGREDO-ALTA-CI',
  '00000000-0000-4000-8000-000000000101'::uuid,
  '21000000-0000-4000-8000-000000000001'::uuid
);

insert into public.classificacoes_risco_gestacional (
  id,
  gestante_id,
  instrumento_versao,
  trimestre,
  faixa_imc,
  classificacao,
  conduta_sugerida,
  observacao,
  profissional_id,
  profissional_nome_snapshot,
  perfil_snapshot,
  ubs_origem_profissional_id,
  ubs_origem_nome_snapshot,
  ubs_atendimento_id,
  ubs_atendimento_nome_snapshot
)
values (
  '27000000-0000-4000-8000-000000000001'::uuid,
  '22000000-0000-4000-8000-000000000001'::uuid,
  'CI',
  1,
  'normal',
  'baixo',
  'conduta sintética',
  'SEGREDO-CLASSIFICACAO-CI',
  '21000000-0000-4000-8000-000000000001'::uuid,
  'Profissional Auditoria CI',
  'equipe_ubs',
  '00000000-0000-4000-8000-000000000101'::uuid,
  'UBS Teste Segurança CI',
  '00000000-0000-4000-8000-000000000101'::uuid,
  'UBS Teste Segurança CI'
);

insert into public.importacoes_pec_resumo (
  id,
  ubs_id,
  usuario_id,
  arquivo_nome,
  arquivo_sha256,
  linha_cabecalho
)
values (
  '28000000-0000-4000-8000-000000000001'::uuid,
  '00000000-0000-4000-8000-000000000101'::uuid,
  '21000000-0000-4000-8000-000000000001'::uuid,
  'sintetico.csv',
  repeat('a', 64),
  1
);

select public.profissionais_mover_gestante_lixeira_v30(
  '22000000-0000-4000-8000-000000000001'::uuid
);
select public.profissionais_restaurar_gestante_v30(
  '22000000-0000-4000-8000-000000000001'::uuid
);
select public.profissionais_mover_gestante_lixeira_v30(
  '22000000-0000-4000-8000-000000000002'::uuid
);
select public.profissionais_excluir_gestante_definitivamente_v30(
  '22000000-0000-4000-8000-000000000002'::uuid,
  true
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-4000-8000-000000000002',
  true
);

select public.profissionais_admin_processar_perfil_v30(
  'approve',
  '21000000-0000-4000-8000-000000000003'::uuid,
  '00000000-0000-4000-8000-000000000101'::uuid
);
select public.profissionais_admin_processar_perfil_v30(
  'deactivate',
  '21000000-0000-4000-8000-000000000003'::uuid,
  null
);

reset role;

insert into private.historico_clinico_gestantes (
  gestante_id,
  usuario_id,
  ubs_id,
  acao,
  antes,
  depois
)
values (
  '22000000-0000-4000-8000-000000000001'::uuid,
  '21000000-0000-4000-8000-000000000001'::uuid,
  '00000000-0000-4000-8000-000000000101'::uuid,
  'teste_minimizacao_v30',
  '{"nome":"SEGREDO-ANTES-CI"}'::jsonb,
  '{"diagnostico":"SEGREDO-DEPOIS-CI"}'::jsonb
);

insert into private.historico_classificacoes_risco (
  classificacao_id,
  gestante_id,
  usuario_id,
  acao,
  payload
)
values (
  '27000000-0000-4000-8000-000000000001'::uuid,
  '22000000-0000-4000-8000-000000000001'::uuid,
  '21000000-0000-4000-8000-000000000001'::uuid,
  'teste_minimizacao_v30',
  '{"diagnostico":"SEGREDO-PAYLOAD-CI"}'::jsonb
);

select is(
  (
    select count(distinct recurso)::bigint
    from private.auditoria_eventos_clinicos_v30
    where ator_id in (
      '21000000-0000-4000-8000-000000000001'::uuid,
      '21000000-0000-4000-8000-000000000002'::uuid
    )
  ),
  8::bigint,
  'trilha cobre as oito superfícies exigidas'
);

select ok(
  not exists (
    select 1
    from private.auditoria_eventos_clinicos_v30
    where recurso <> 'perfil_profissional'
      and ator_id is null
  ),
  'mutações clínicas autenticadas preservam auth.uid() como ator'
);

select ok(
  (
    select count(*)
    from private.auditoria_eventos_clinicos_v30
    where acao = 'insert'
      and ator_id = '21000000-0000-4000-8000-000000000001'::uuid
  ) >= 8,
  'inserções clínicas geram eventos mínimos'
);

select ok(
  exists (
    select 1
    from private.auditoria_eventos_clinicos_v30
    where recurso_id = '22000000-0000-4000-8000-000000000001'::uuid
      and acao = 'mover_lixeira'
  )
  and exists (
    select 1
    from private.auditoria_eventos_clinicos_v30
    where recurso_id = '22000000-0000-4000-8000-000000000001'::uuid
      and acao = 'restaurar_lixeira'
  ),
  'lixeira registra envio e restauração'
);

select ok(
  exists (
    select 1
    from private.auditoria_eventos_clinicos_v30
    where recurso_id = '22000000-0000-4000-8000-000000000002'::uuid
      and acao = 'hard_delete'
      and gestante_hash is not null
  ),
  'hard delete preserva evento e hash pseudonimizado'
);

select ok(
  exists (
    select 1
    from private.auditoria_eventos_clinicos_v30
    where recurso_id = '21000000-0000-4000-8000-000000000003'::uuid
      and acao = 'aprovacao_profissional'
      and ator_id = '21000000-0000-4000-8000-000000000002'::uuid
  ),
  'aprovação registra o administrador derivado de auth.uid()'
);

select ok(
  exists (
    select 1
    from private.auditoria_eventos_clinicos_v30
    where recurso_id = '21000000-0000-4000-8000-000000000003'::uuid
      and acao = 'revogacao_profissional'
      and ator_id = '21000000-0000-4000-8000-000000000002'::uuid
  ),
  'revogação registra o administrador derivado de auth.uid()'
);

select ok(
  not exists (
    select 1
    from private.auditoria_eventos_clinicos_v30
    where ocorrido_em is null
      or acao is null
      or recurso is null
  ),
  'todo evento possui horário, ação e recurso'
);

select ok(
  not exists (
    select 1
    from private.auditoria_eventos_clinicos_v30
    where detalhes::text ~ 'SEGREDO-|diagnostico|observacao|resultado_resumido|arquivo_nome'
  ),
  'trilha mínima não copia conteúdo clínico nem nome de arquivo PEC'
);

select ok(
  not exists (
    select 1
    from private.auditoria_eventos_clinicos_v30 a,
      lateral jsonb_object_keys(a.detalhes) chave
    where chave not in (
      'status',
      'status_anterior',
      'status_atual',
      'ativo_anterior',
      'ativo_atual'
    )
  ),
  'metadados de auditoria obedecem allowlist estrita'
);

select ok(
  (
    select antes is null and depois is null
    from private.historico_clinico_gestantes
    where acao = 'teste_minimizacao_v30'
  ),
  'histórico clínico legado não recebe novos snapshots completos'
);

select ok(
  (
    select payload is null
    from private.historico_classificacoes_risco
    where acao = 'teste_minimizacao_v30'
  ),
  'histórico de classificação legado não recebe novos payloads completos'
);

select throws_ok(
  $test$
    update private.auditoria_eventos_clinicos_v30
    set detalhes = '{"violacao":true}'::jsonb
    where id = (
      select min(id)
      from private.auditoria_eventos_clinicos_v30
    )
  $test$,
  'P0001',
  'Registros de auditoria sao append-only',
  'nem o owner altera evento append-only'
);

select throws_ok(
  $test$
    delete from private.auditoria_eventos_clinicos_v30
    where id = (
      select min(id)
      from private.auditoria_eventos_clinicos_v30
    )
  $test$,
  'P0001',
  'Registros de auditoria sao append-only',
  'nem o owner exclui evento append-only'
);

select throws_ok(
  'truncate table private.auditoria_eventos_clinicos_v30',
  'P0001',
  'Registros de auditoria sao append-only',
  'nem o owner trunca a trilha append-only'
);

select * from finish();

rollback;