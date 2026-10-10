begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (
  id, aud, role, email, created_at, updated_at
)
values
  (
    '15000000-0000-4000-8000-000000000001'::uuid,
    'authenticated',
    'authenticated',
    'profile-complete@ci.invalid',
    now(),
    now()
  ),
  (
    '15000000-0000-4000-8000-000000000002'::uuid,
    'authenticated',
    'authenticated',
    'profile-approved@ci.invalid',
    now(),
    now()
  ),
  (
    '15000000-0000-4000-8000-000000000003'::uuid,
    'authenticated',
    'authenticated',
    'profile-disabled@ci.invalid',
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
  ativo,
  primeiro_acesso,
  cadastro_completo,
  aprovacao_status,
  perfil_solicitado,
  origem_cadastro,
  ubs_id
)
values
  (
    '15000000-0000-4000-8000-000000000002'::uuid,
    'Profissional Aprovado CI',
    'profile-approved@ci.invalid',
    'equipe_ubs',
    'ativo',
    true,
    false,
    true,
    'aprovado',
    'equipe_ubs',
    'ci',
    '00000000-0000-4000-8000-000000000101'::uuid
  ),
  (
    '15000000-0000-4000-8000-000000000003'::uuid,
    'Profissional Desativado CI',
    'profile-disabled@ci.invalid',
    'aluno',
    'ativo',
    false,
    false,
    true,
    'desativado',
    'equipe_ubs',
    'ci',
    null
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '15000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $test$
    select public.profissionais_completar_perfil_v30(
      '  Profissional   Novo CI  ',
      date '1995-06-10',
      '00000000-0000-4000-8000-000000000101'::uuid
    )
  $test$,
  'usuário autenticado completa o próprio perfil'
);

reset role;

select is(
  (
    select perfil_solicitado
    from public.perfis
    where id = '15000000-0000-4000-8000-000000000001'::uuid
  ),
  'equipe_ubs',
  'perfil solicitado é fixado em equipe_ubs'
);

select ok(
  (
    select
      perfil = 'aluno'::public.perfil_usuario
      and ubs_id is null
      and ubs_solicitada_id =
        '00000000-0000-4000-8000-000000000101'::uuid
      and aprovacao_status = 'pendente'
      and ativo = true
    from public.perfis
    where id = '15000000-0000-4000-8000-000000000001'::uuid
  ),
  'perfil novo permanece sem privilégio até aprovação'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '15000000-0000-4000-8000-000000000002',
  true
);

select throws_ok(
  $test$
    select public.profissionais_completar_perfil_v30(
      'Profissional Aprovado CI',
      date '1990-01-01',
      '00000000-0000-4000-8000-000000000101'::uuid
    )
  $test$,
  'P0001',
  'Cadastro já aprovado',
  'perfil aprovado não é rebaixado para pendente pelo próprio usuário'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '15000000-0000-4000-8000-000000000003',
  true
);

select throws_ok(
  $test$
    select public.profissionais_completar_perfil_v30(
      'Profissional Desativado CI',
      date '1990-01-01',
      '00000000-0000-4000-8000-000000000101'::uuid
    )
  $test$,
  'P0001',
  'Acesso desativado',
  'perfil desativado não consegue se reativar pelo onboarding'
);

reset role;

select ok(
  not has_function_privilege(
    'anon',
    'public.profissionais_completar_perfil_v30(text,date,uuid)',
    'EXECUTE'
  ),
  'anon não executa RPC de completar perfil'
);

select * from finish();

rollback;
