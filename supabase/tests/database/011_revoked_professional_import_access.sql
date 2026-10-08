begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

-- Evidência adversarial sintética para o finding SEC-V30-001.
-- A e B pertencem à mesma UBS; o lote pertence exclusivamente a A.
insert into auth.users (
  id, aud, role, email, created_at, updated_at
)
values
  (
    '11000000-0000-4000-8000-000000000001'::uuid,
    'authenticated',
    'authenticated',
    'revoked-import-a@ci.invalid',
    now(),
    now()
  ),
  (
    '11000000-0000-4000-8000-000000000002'::uuid,
    'authenticated',
    'authenticated',
    'revoked-import-b@ci.invalid',
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
    '11000000-0000-4000-8000-000000000001'::uuid,
    'Profissional A Revogação CI',
    'revoked-import-a@ci.invalid',
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
    '11000000-0000-4000-8000-000000000002'::uuid,
    'Profissional B Revogação CI',
    'revoked-import-b@ci.invalid',
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
  perfil_excluido_em = null;

insert into public.importacoes_pec_resumo (
  id,
  ubs_id,
  usuario_id,
  arquivo_nome,
  arquivo_sha256,
  linha_cabecalho,
  status
)
values (
  '31000000-0000-4000-8000-000000000001'::uuid,
  '00000000-0000-4000-8000-000000000101'::uuid,
  '11000000-0000-4000-8000-000000000001'::uuid,
  'fixture-revogacao.csv',
  repeat('a', 64),
  1,
  'concluida'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-4000-8000-000000000001',
  true
);

select is(
  (
    select count(*)::bigint
    from public.importacoes_pec_resumo
    where id = '31000000-0000-4000-8000-000000000001'::uuid
  ),
  1::bigint,
  'controle: profissional A ativo enxerga o próprio lote PEC'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-4000-8000-000000000002',
  true
);

select is(
  (
    select count(*)::bigint
    from public.importacoes_pec_resumo
    where id = '31000000-0000-4000-8000-000000000001'::uuid
  ),
  0::bigint,
  'controle A x B: profissional B da mesma UBS não lê o lote de A'
);

select is(
  (
    with removido as (
      delete from public.importacoes_pec_resumo
      where id = '31000000-0000-4000-8000-000000000001'::uuid
      returning id
    )
    select count(*)::bigint from removido
  ),
  0::bigint,
  'controle A x B: profissional B da mesma UBS não apaga o lote de A'
);

reset role;

update public.perfis
set ativo = false
where id = '11000000-0000-4000-8000-000000000001'::uuid;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-4000-8000-000000000001',
  true
);

select is(
  (
    select count(*)::bigint
    from public.importacoes_pec_resumo
    where id = '31000000-0000-4000-8000-000000000001'::uuid
  ),
  1::bigint,
  'EVIDÊNCIA SEC-V30-001: JWT antigo de A revogado ainda lê o lote PEC'
);

select is(
  (
    with removido as (
      delete from public.importacoes_pec_resumo
      where id = '31000000-0000-4000-8000-000000000001'::uuid
      returning id
    )
    select count(*)::bigint from removido
  ),
  1::bigint,
  'EVIDÊNCIA SEC-V30-001: JWT antigo de A revogado ainda apaga o lote PEC'
);

reset role;

select * from finish();

rollback;
