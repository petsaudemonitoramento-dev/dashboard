begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

-- Fixtures sintéticas: dois profissionais da MESMA UBS.
insert into auth.users (
  id, aud, role, email, created_at, updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001'::uuid,
    'authenticated',
    'authenticated',
    'profissional-a@ci.invalid',
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000002'::uuid,
    'authenticated',
    'authenticated',
    'profissional-b@ci.invalid',
    now(),
    now()
  )
on conflict (id) do nothing;

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
    '10000000-0000-4000-8000-000000000001'::uuid,
    'Profissional A CI',
    'profissional-a@ci.invalid',
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
    '10000000-0000-4000-8000-000000000002'::uuid,
    'Profissional B CI',
    'profissional-b@ci.invalid',
    'equipe_ubs',
    'ativo',
    '00000000-0000-4000-8000-000000000101'::uuid,
    false,
    true,
    true,
    'aprovado',
    'equipe_ubs',
    'ci',
    'enfermeiro'
  )
on conflict (id) do update set
  perfil = excluded.perfil,
  status = excluded.status,
  ubs_id = excluded.ubs_id,
  ativo = excluded.ativo,
  cadastro_completo = excluded.cadastro_completo,
  aprovacao_status = excluded.aprovacao_status,
  cargo_funcao = excluded.cargo_funcao,
  perfil_excluido_em = null;

insert into private.credenciais_profissionais (
  usuario_id,
  cargo_funcao,
  conselho,
  uf,
  numero_registro,
  categoria,
  situacao,
  decidido_em,
  fonte_verificacao
)
values
  (
    '10000000-0000-4000-8000-000000000001'::uuid,
    'medico',
    'CRM',
    'PB',
    'CI-CRM-001',
    'MEDICO',
    'validado',
    now(),
    'fixture_ci'
  ),
  (
    '10000000-0000-4000-8000-000000000002'::uuid,
    'enfermeiro',
    'COREN',
    'PB',
    'CI-COREN-002',
    'ENFERMEIRO',
    'validado',
    now(),
    'fixture_ci'
  );

insert into public.pec_gestantes (
  id,
  codigo,
  ubs_id,
  profissional_responsavel_id
)
values
  (
    '20000000-0000-4000-8000-000000000001'::uuid,
    'GST-CI-A1',
    '00000000-0000-4000-8000-000000000101'::uuid,
    '10000000-0000-4000-8000-000000000001'::uuid
  ),
  (
    '20000000-0000-4000-8000-000000000002'::uuid,
    'GST-CI-B1',
    '00000000-0000-4000-8000-000000000101'::uuid,
    '10000000-0000-4000-8000-000000000002'::uuid
  )
on conflict (id) do update set
  ubs_id = excluded.ubs_id,
  profissional_responsavel_id =
    excluded.profissional_responsavel_id,
  excluida_em = null;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select ok(
  security.usuario_pode_acessar_gestante_v30(
    '20000000-0000-4000-8000-000000000001'::uuid
  ),
  'Profissional A é autorizado na própria gestante'
);

select ok(
  not security.usuario_pode_acessar_gestante_v30(
    '20000000-0000-4000-8000-000000000002'::uuid
  ),
  'Profissional A não é autorizado na gestante B da mesma UBS'
);

select is(
  (select count(*)::bigint from public.pec_gestantes),
  1::bigint,
  'RLS SELECT de A retorna somente a própria gestante'
);

select is(
  (
    select count(*)::bigint
    from public.profissionais_listar_gestantes_v30(false)
  ),
  1::bigint,
  'RPC de listagem retorna somente a gestante de A'
);

select throws_ok(
  $test$
    select public.profissionais_obter_gestante_clinica_v30(
      '20000000-0000-4000-8000-000000000002'::uuid,
      false
    )
  $test$,
  'P0001',
  'Gestante não encontrada ou não vinculada ao profissional',
  'RPC clínica de A rejeita UUID da gestante B'
);

select lives_ok(
  $test$
    select public.profissionais_mover_gestante_lixeira_v30(
      '20000000-0000-4000-8000-000000000001'::uuid
    )
  $test$,
  'Profissional A consegue mover a própria gestante para lixeira'
);

select throws_ok(
  $test$
    select public.profissionais_mover_gestante_lixeira_v30(
      '20000000-0000-4000-8000-000000000002'::uuid
    )
  $test$,
  'P0001',
  'Gestante não encontrada ou não vinculada ao profissional',
  'Profissional A não move gestante B para lixeira'
);

select lives_ok(
  $test$
    select public.profissionais_restaurar_gestante_v30(
      '20000000-0000-4000-8000-000000000001'::uuid
    )
  $test$,
  'Profissional A consegue restaurar a própria gestante'
);

select throws_ok(
  $test$
    select public.profissionais_excluir_gestante_definitivamente_v30(
      '20000000-0000-4000-8000-000000000002'::uuid,
      true
    )
  $test$,
  'P0001',
  'Gestante não encontrada ou não vinculada ao profissional',
  'Profissional A não exclui definitivamente gestante B'
);

update public.pec_gestantes
set risco_gestacional = 'CI-A-OK'
where id = '20000000-0000-4000-8000-000000000001'::uuid;

update public.pec_gestantes
set risco_gestacional = 'CI-BREACH'
where id = '20000000-0000-4000-8000-000000000002'::uuid;

delete from public.pec_gestantes
where id = '20000000-0000-4000-8000-000000000002'::uuid;

reset role;

select is(
  (
    select risco_gestacional
    from public.pec_gestantes
    where id =
      '20000000-0000-4000-8000-000000000001'::uuid
  ),
  'CI-A-OK',
  'Profissional A consegue atualizar a própria gestante'
);

select isnt(
  (
    select risco_gestacional
    from public.pec_gestantes
    where id =
      '20000000-0000-4000-8000-000000000002'::uuid
  ),
  'CI-BREACH',
  'Profissional A não consegue atualizar a gestante B'
);

select ok(
  exists (
    select 1
    from public.pec_gestantes
    where id =
      '20000000-0000-4000-8000-000000000002'::uuid
  ),
  'Profissional A não consegue excluir a gestante B'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);

select ok(
  security.usuario_pode_acessar_gestante_v30(
    '20000000-0000-4000-8000-000000000002'::uuid
  ),
  'Profissional B é autorizado na própria gestante'
);

select ok(
  not security.usuario_pode_acessar_gestante_v30(
    '20000000-0000-4000-8000-000000000001'::uuid
  ),
  'Profissional B não é autorizado na gestante A da mesma UBS'
);

select is(
  (select count(*)::bigint from public.pec_gestantes),
  1::bigint,
  'RLS SELECT de B retorna somente a própria gestante'
);

select is(
  (
    select count(*)::bigint
    from public.profissionais_listar_gestantes_v30(false)
  ),
  1::bigint,
  'RPC de listagem retorna somente a gestante de B'
);

reset role;

update public.perfis
set ativo = false
where id =
  '10000000-0000-4000-8000-000000000001'::uuid;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select ok(
  not security.usuario_pode_acessar_gestante_v30(
    '20000000-0000-4000-8000-000000000001'::uuid
  ),
  'Profissional revogado perde autorização'
);

select is(
  (select count(*)::bigint from public.pec_gestantes),
  0::bigint,
  'Profissional revogado não enxerga gestantes via RLS'
);

select throws_ok(
  $test$
    select *
    from public.profissionais_listar_gestantes_v30(false)
  $test$,
  'P0001',
  'Profissional sem autorização clínica',
  'RPC de listagem rejeita profissional revogado'
);

reset role;

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pec_gestantes'
      and (
        coalesce(qual, '') like '%usuario_eh_admin%'
        or coalesce(qual, '') like '%ubs_id = security.usuario_ubs_id()%'
      )
  ),
  'pec_gestantes não mantém policy ampla por admin/mesma UBS'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'importacoes_pec_resumo'
      and coalesce(qual, '') like '%security.usuario_eh_admin%'
  ),
  'importações PEC não mantêm leitura ampla de administrador'
);

select * from finish();

rollback;
