begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (
  id, aud, role, email, created_at, updated_at
)
values (
  '17000000-0000-4000-8000-000000000001'::uuid,
  'authenticated',
  'authenticated',
  'authorization-state@ci.invalid',
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
values (
  '17000000-0000-4000-8000-000000000001'::uuid,
  'Profissional Estados CI',
  'authorization-state@ci.invalid',
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
);

insert into public.pec_gestantes (
  id, codigo, ubs_id, profissional_responsavel_id
)
values (
  '27000000-0000-4000-8000-000000000001'::uuid,
  'GST-STATE-CI',
  '00000000-0000-4000-8000-000000000101'::uuid,
  '17000000-0000-4000-8000-000000000001'::uuid
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '17000000-0000-4000-8000-000000000001',
  true
);

select ok(
  security.usuario_pode_acessar_gestante_v30(
    '27000000-0000-4000-8000-000000000001'::uuid
  ),
  'perfil ativo, completo e aprovado acessa a própria gestante'
);

reset role;

update public.perfis
set cadastro_completo = false
where id = '17000000-0000-4000-8000-000000000001'::uuid;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '17000000-0000-4000-8000-000000000001',
  true
);

select ok(
  not security.usuario_pode_acessar_gestante_v30(
    '27000000-0000-4000-8000-000000000001'::uuid
  ),
  'cadastro incompleto perde autorização clínica'
);

reset role;

update public.perfis
set cadastro_completo = true, aprovacao_status = 'pendente'
where id = '17000000-0000-4000-8000-000000000001'::uuid;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '17000000-0000-4000-8000-000000000001',
  true
);

select ok(
  not security.usuario_pode_acessar_gestante_v30(
    '27000000-0000-4000-8000-000000000001'::uuid
  ),
  'perfil pendente perde autorização clínica'
);

select is(
  (select count(*)::bigint from public.pec_gestantes),
  0::bigint,
  'perfil pendente não lê gestante pela Data API/RLS'
);

select throws_ok(
  $test$
    select * from public.profissionais_listar_gestantes_v30(false)
  $test$,
  'P0001',
  'Profissional sem autorização clínica',
  'perfil pendente não usa RPC de listagem'
);

reset role;

update public.perfis
set aprovacao_status = 'rejeitado'
where id = '17000000-0000-4000-8000-000000000001'::uuid;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '17000000-0000-4000-8000-000000000001',
  true
);

select ok(
  not security.usuario_pode_acessar_gestante_v30(
    '27000000-0000-4000-8000-000000000001'::uuid
  ),
  'perfil rejeitado perde autorização clínica'
);

reset role;

update public.perfis
set aprovacao_status = 'aprovado', ativo = false
where id = '17000000-0000-4000-8000-000000000001'::uuid;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '17000000-0000-4000-8000-000000000001',
  true
);

select ok(
  not security.usuario_pode_acessar_gestante_v30(
    '27000000-0000-4000-8000-000000000001'::uuid
  ),
  'perfil inativo perde autorização clínica'
);

reset role;

update public.perfis
set ativo = true, perfil_excluido_em = now()
where id = '17000000-0000-4000-8000-000000000001'::uuid;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '17000000-0000-4000-8000-000000000001',
  true
);

select ok(
  not security.usuario_pode_acessar_gestante_v30(
    '27000000-0000-4000-8000-000000000001'::uuid
  ),
  'perfil excluído logicamente perde autorização clínica'
);

reset role;

select * from finish();

rollback;
