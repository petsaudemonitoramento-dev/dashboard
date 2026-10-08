begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

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

select * from finish();

rollback;
