begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (
  id, aud, role, email, created_at, updated_at
)
values
  (
    '16000000-0000-4000-8000-000000000001'::uuid,
    'authenticated',
    'authenticated',
    'admin-active@ci.invalid',
    now(),
    now()
  ),
  (
    '16000000-0000-4000-8000-000000000002'::uuid,
    'authenticated',
    'authenticated',
    'professional-active@ci.invalid',
    now(),
    now()
  ),
  (
    '16000000-0000-4000-8000-000000000003'::uuid,
    'authenticated',
    'authenticated',
    'admin-revoked@ci.invalid',
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
  ubs_id,
  perfil_excluido_em
)
values
  (
    '16000000-0000-4000-8000-000000000001'::uuid,
    'Admin Ativo CI',
    'admin-active@ci.invalid',
    'administrador',
    'ativo',
    true,
    false,
    true,
    'aprovado',
    'administrador',
    'ci',
    null,
    null
  ),
  (
    '16000000-0000-4000-8000-000000000002'::uuid,
    'Profissional Ativo CI',
    'professional-active@ci.invalid',
    'equipe_ubs',
    'ativo',
    true,
    false,
    true,
    'aprovado',
    'equipe_ubs',
    'ci',
    '00000000-0000-4000-8000-000000000101'::uuid,
    null
  ),
  (
    '16000000-0000-4000-8000-000000000003'::uuid,
    'Admin Revogado CI',
    'admin-revoked@ci.invalid',
    'administrador',
    'ativo',
    false,
    false,
    true,
    'desativado',
    'administrador',
    'ci',
    null,
    now()
  );

select ok(
  private.usuario_admin_v20(
    '16000000-0000-4000-8000-000000000001'::uuid
  ),
  'admin ativo e aprovado passa na barreira administrativa'
);

select ok(
  not private.usuario_admin_v20(
    '16000000-0000-4000-8000-000000000002'::uuid
  ),
  'profissional comum não passa na barreira administrativa'
);

select ok(
  not private.usuario_admin_v20(
    '16000000-0000-4000-8000-000000000003'::uuid
  ),
  'admin revogado não passa na barreira administrativa'
);

select ok(
  not private.usuario_admin_v20(null),
  'identidade nula não passa na barreira administrativa'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.usuario_admin_v20(uuid)',
    'EXECUTE'
  ),
  'cliente authenticated não chama diretamente helper privado de admin'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.usuario_admin_v20(uuid)',
    'EXECUTE'
  ),
  'anon não chama helper privado de admin'
);


set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '16000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $test$
    select public.profissionais_admin_listar_ubs_v30()
  $test$,
  'admin ativo executa RPC administrativa autenticada'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '16000000-0000-4000-8000-000000000002',
  true
);

select throws_ok(
  $test$
    select public.profissionais_admin_listar_ubs_v30()
  $test$,
  'P0001',
  'ADMIN_FORBIDDEN',
  'profissional comum não executa RPC administrativa'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '16000000-0000-4000-8000-000000000003',
  true
);

select throws_ok(
  $test$
    select public.profissionais_admin_listar_ubs_v30()
  $test$,
  'P0001',
  'ADMIN_FORBIDDEN',
  'admin revogado não executa RPC administrativa'
);

reset role;

select ok(
  not has_function_privilege(
    'anon',
    'public.profissionais_admin_listar_ubs_v30()',
    'EXECUTE'
  ),
  'anon não executa RPC administrativa'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.profissionais_admin_listar_ubs_v30()',
    'EXECUTE'
  ),
  'authenticated só alcança RPC administrativa antes da barreira interna'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.profissionais_admin_processar_perfil_v30(text,uuid,uuid)',
    'EXECUTE'
  ),
  'anon não executa mutação administrativa'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.avisos_ubs',
    'INSERT'
  ),
  'authenticated não insere aviso diretamente pela Data API'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.avisos_ubs',
    'UPDATE'
  ),
  'authenticated não altera aviso diretamente pela Data API'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.avisos_ubs',
    'DELETE'
  ),
  'authenticated não remove aviso diretamente pela Data API'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '16000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $test$
    select public.profissionais_admin_publicar_aviso_v30(
      '00000000-0000-4000-8000-000000000101'::uuid,
      'Aviso CI',
      'Publicação somente pela RPC auditada.',
      'informativo',
      'profissionais'
    )
  $test$,
  'admin ativo continua publicando aviso pela RPC auditada'
);

reset role;

select * from finish();

rollback;
