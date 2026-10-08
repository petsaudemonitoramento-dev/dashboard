begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

-- Dois profissionais sintéticos da mesma UBS.
insert into auth.users (
  id, aud, role, email, created_at, updated_at
)
values
  (
    '13000000-0000-4000-8000-000000000001'::uuid,
    'authenticated',
    'authenticated',
    'child-a@ci.invalid',
    now(),
    now()
  ),
  (
    '13000000-0000-4000-8000-000000000002'::uuid,
    'authenticated',
    'authenticated',
    'child-b@ci.invalid',
    now(),
    now()
  ),
  (
    '13000000-0000-4000-8000-000000000099'::uuid,
    'authenticated',
    'authenticated',
    'child-auditor@ci.invalid',
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
    '13000000-0000-4000-8000-000000000001'::uuid,
    'Profissional Child A CI',
    'child-a@ci.invalid',
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
    '13000000-0000-4000-8000-000000000002'::uuid,
    'Profissional Child B CI',
    'child-b@ci.invalid',
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
  decidido_por,
  fonte_verificacao
)
values
  (
    '13000000-0000-4000-8000-000000000001'::uuid,
    'medico',
    'CRM',
    'PB',
    '130001',
    'MEDICO',
    'validado',
    now(),
    '13000000-0000-4000-8000-000000000099'::uuid,
    'portal_cfm'
  ),
  (
    '13000000-0000-4000-8000-000000000002'::uuid,
    'enfermeiro',
    'COREN',
    'PB',
    '130002',
    'ENFERMEIRO',
    'validado',
    now(),
    '13000000-0000-4000-8000-000000000099'::uuid,
    'consulta_cofen'
  );

insert into public.pec_gestantes (
  id, codigo, ubs_id, profissional_responsavel_id
)
values
  (
    '23000000-0000-4000-8000-000000000001'::uuid,
    'GST-CHILD-A',
    '00000000-0000-4000-8000-000000000101'::uuid,
    '13000000-0000-4000-8000-000000000001'::uuid
  ),
  (
    '23000000-0000-4000-8000-000000000002'::uuid,
    'GST-CHILD-B',
    '00000000-0000-4000-8000-000000000101'::uuid,
    '13000000-0000-4000-8000-000000000002'::uuid
  );

insert into public.gestante_consultas (
  id, gestante_id, data_atendimento, profissional_id
)
values
  (
    '33000000-0000-4000-8000-000000000001'::uuid,
    '23000000-0000-4000-8000-000000000001'::uuid,
    current_date,
    '13000000-0000-4000-8000-000000000001'::uuid
  ),
  (
    '33000000-0000-4000-8000-000000000002'::uuid,
    '23000000-0000-4000-8000-000000000002'::uuid,
    current_date,
    '13000000-0000-4000-8000-000000000002'::uuid
  );

insert into public.gestante_exames (
  id, gestante_id, codigo, nome, trimestre, profissional_id
)
values
  (
    '34000000-0000-4000-8000-000000000001'::uuid,
    '23000000-0000-4000-8000-000000000001'::uuid,
    'CI-A', 'Exame A', 1,
    '13000000-0000-4000-8000-000000000001'::uuid
  ),
  (
    '34000000-0000-4000-8000-000000000002'::uuid,
    '23000000-0000-4000-8000-000000000002'::uuid,
    'CI-B', 'Exame B', 1,
    '13000000-0000-4000-8000-000000000002'::uuid
  );

insert into public.gestante_vacinas (
  id, gestante_id, codigo, nome, profissional_id
)
values
  (
    '35000000-0000-4000-8000-000000000001'::uuid,
    '23000000-0000-4000-8000-000000000001'::uuid,
    'VAC-A', 'Vacina A',
    '13000000-0000-4000-8000-000000000001'::uuid
  ),
  (
    '35000000-0000-4000-8000-000000000002'::uuid,
    '23000000-0000-4000-8000-000000000002'::uuid,
    'VAC-B', 'Vacina B',
    '13000000-0000-4000-8000-000000000002'::uuid
  );

insert into public.gestante_altas (
  id,
  gestante_id,
  data_alta,
  motivo,
  ubs_id,
  profissional_id
)
values
  (
    '36000000-0000-4000-8000-000000000001'::uuid,
    '23000000-0000-4000-8000-000000000001'::uuid,
    current_date,
    'Fixture A',
    '00000000-0000-4000-8000-000000000101'::uuid,
    '13000000-0000-4000-8000-000000000001'::uuid
  ),
  (
    '36000000-0000-4000-8000-000000000002'::uuid,
    '23000000-0000-4000-8000-000000000002'::uuid,
    current_date,
    'Fixture B',
    '00000000-0000-4000-8000-000000000101'::uuid,
    '13000000-0000-4000-8000-000000000002'::uuid
  );

insert into public.classificacoes_risco_gestacional (
  id,
  gestante_id,
  instrumento_versao,
  trimestre,
  faixa_imc,
  classificacao,
  conduta_sugerida,
  profissional_id,
  profissional_nome_snapshot,
  perfil_snapshot,
  ubs_origem_profissional_id,
  ubs_origem_nome_snapshot,
  ubs_atendimento_id,
  ubs_atendimento_nome_snapshot
)
values
  (
    '37000000-0000-4000-8000-000000000001'::uuid,
    '23000000-0000-4000-8000-000000000001'::uuid,
    'CI', 1, 'normal', 'baixo', 'fixture',
    '13000000-0000-4000-8000-000000000001'::uuid,
    'Profissional A',
    'equipe_ubs',
    '00000000-0000-4000-8000-000000000101'::uuid,
    'UBS Teste Segurança CI',
    '00000000-0000-4000-8000-000000000101'::uuid,
    'UBS Teste Segurança CI'
  ),
  (
    '37000000-0000-4000-8000-000000000002'::uuid,
    '23000000-0000-4000-8000-000000000002'::uuid,
    'CI', 1, 'normal', 'baixo', 'fixture',
    '13000000-0000-4000-8000-000000000002'::uuid,
    'Profissional B',
    'equipe_ubs',
    '00000000-0000-4000-8000-000000000101'::uuid,
    'UBS Teste Segurança CI',
    '00000000-0000-4000-8000-000000000101'::uuid,
    'UBS Teste Segurança CI'
  );

insert into public.classificacao_risco_itens (
  id,
  classificacao_id,
  fator_codigo,
  grupo,
  grupo_titulo,
  fator_titulo,
  pontos
)
values
  (
    '38000000-0000-4000-8000-000000000001'::uuid,
    '37000000-0000-4000-8000-000000000001'::uuid,
    'FATOR-A',
    'ci',
    'CI',
    'Fator A',
    1
  ),
  (
    '38000000-0000-4000-8000-000000000002'::uuid,
    '37000000-0000-4000-8000-000000000002'::uuid,
    'FATOR-B',
    'ci',
    'CI',
    'Fator B',
    1
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '13000000-0000-4000-8000-000000000001',
  true
);

select is((
  select count(*)::bigint
  from public.gestante_consultas
  where id = '33000000-0000-4000-8000-000000000001'::uuid
), 1::bigint, 'A vê a própria consulta');

select is((
  select count(*)::bigint
  from public.gestante_exames
  where id = '34000000-0000-4000-8000-000000000001'::uuid
), 1::bigint, 'A vê o próprio exame');

select is((
  select count(*)::bigint
  from public.gestante_vacinas
  where id = '35000000-0000-4000-8000-000000000001'::uuid
), 1::bigint, 'A vê a própria vacina');

select is((
  select count(*)::bigint
  from public.gestante_altas
  where id = '36000000-0000-4000-8000-000000000001'::uuid
), 1::bigint, 'A vê a própria alta');

select is((
  select count(*)::bigint
  from public.classificacoes_risco_gestacional
  where id = '37000000-0000-4000-8000-000000000001'::uuid
), 1::bigint, 'A vê a própria classificação');

select is((
  select count(*)::bigint
  from public.classificacao_risco_itens
  where id = '38000000-0000-4000-8000-000000000001'::uuid
), 1::bigint, 'A vê o item da própria classificação');

select lives_ok(
  $test$
    select public.profissionais_obter_relatorio_classificacao_v30(
      '37000000-0000-4000-8000-000000000001'::uuid
    )
  $test$,
  'A obtém o relatório/PDF da própria classificação'
);

select throws_ok(
  $test$
    select public.profissionais_obter_relatorio_classificacao_v30(
      '37000000-0000-4000-8000-000000000002'::uuid
    )
  $test$,
  'P0001',
  'Gestante não encontrada ou não vinculada ao profissional',
  'A não obtém relatório/PDF da classificação de B'
);

-- UPDATE contra B deve afetar zero linhas por RLS.
update public.gestante_consultas
set observacao = 'BREACH'
where id = '33000000-0000-4000-8000-000000000002'::uuid;

update public.gestante_exames
set observacao = 'BREACH'
where id = '34000000-0000-4000-8000-000000000002'::uuid;

update public.gestante_vacinas
set observacao = 'BREACH'
where id = '35000000-0000-4000-8000-000000000002'::uuid;

update public.gestante_altas
set observacao = 'BREACH'
where id = '36000000-0000-4000-8000-000000000002'::uuid;

update public.classificacoes_risco_gestacional
set observacao = 'BREACH'
where id = '37000000-0000-4000-8000-000000000002'::uuid;

update public.classificacao_risco_itens
set detalhe_origem = 'BREACH'
where id = '38000000-0000-4000-8000-000000000002'::uuid;

reset role;

select ok((
  select observacao is null
  from public.gestante_consultas
  where id = '33000000-0000-4000-8000-000000000002'::uuid
), 'A não atualiza consulta de B');

select ok((
  select observacao is null
  from public.gestante_exames
  where id = '34000000-0000-4000-8000-000000000002'::uuid
), 'A não atualiza exame de B');

select ok((
  select observacao is null
  from public.gestante_vacinas
  where id = '35000000-0000-4000-8000-000000000002'::uuid
), 'A não atualiza vacina de B');

select ok((
  select observacao is null
  from public.gestante_altas
  where id = '36000000-0000-4000-8000-000000000002'::uuid
), 'A não atualiza alta de B');

select ok((
  select observacao is null
  from public.classificacoes_risco_gestacional
  where id = '37000000-0000-4000-8000-000000000002'::uuid
), 'A não atualiza classificação de B');

select ok((
  select detalhe_origem is null
  from public.classificacao_risco_itens
  where id = '38000000-0000-4000-8000-000000000002'::uuid
), 'A não atualiza item de classificação de B');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '13000000-0000-4000-8000-000000000001',
  true
);

-- DELETE contra B também deve afetar zero linhas.
delete from public.gestante_consultas
where id = '33000000-0000-4000-8000-000000000002'::uuid;

delete from public.gestante_exames
where id = '34000000-0000-4000-8000-000000000002'::uuid;

delete from public.gestante_vacinas
where id = '35000000-0000-4000-8000-000000000002'::uuid;

delete from public.gestante_altas
where id = '36000000-0000-4000-8000-000000000002'::uuid;

delete from public.classificacao_risco_itens
where id = '38000000-0000-4000-8000-000000000002'::uuid;

delete from public.classificacoes_risco_gestacional
where id = '37000000-0000-4000-8000-000000000002'::uuid;

reset role;

select ok(exists (
  select 1 from public.gestante_consultas
  where id = '33000000-0000-4000-8000-000000000002'::uuid
), 'A não apaga consulta de B');

select ok(exists (
  select 1 from public.gestante_exames
  where id = '34000000-0000-4000-8000-000000000002'::uuid
), 'A não apaga exame de B');

select ok(exists (
  select 1 from public.gestante_vacinas
  where id = '35000000-0000-4000-8000-000000000002'::uuid
), 'A não apaga vacina de B');

select ok(exists (
  select 1 from public.gestante_altas
  where id = '36000000-0000-4000-8000-000000000002'::uuid
), 'A não apaga alta de B');

select ok(exists (
  select 1 from public.classificacao_risco_itens
  where id = '38000000-0000-4000-8000-000000000002'::uuid
), 'A não apaga item de classificação de B');

select ok(exists (
  select 1 from public.classificacoes_risco_gestacional
  where id = '37000000-0000-4000-8000-000000000002'::uuid
), 'A não apaga classificação de B');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '13000000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $test$
    insert into public.gestante_consultas (
      gestante_id, data_atendimento, profissional_id
    ) values (
      '23000000-0000-4000-8000-000000000002'::uuid,
      current_date,
      '13000000-0000-4000-8000-000000000001'::uuid
    )
  $test$,
  '42501',
  'new row violates row-level security policy for table "gestante_consultas"',
  'A não insere consulta apontando para gestante B'
);

select throws_ok(
  $test$
    insert into public.gestante_exames (
      gestante_id, codigo, nome, trimestre, profissional_id
    ) values (
      '23000000-0000-4000-8000-000000000002'::uuid,
      'BREACH', 'Brecha', 2,
      '13000000-0000-4000-8000-000000000001'::uuid
    )
  $test$,
  '42501',
  'new row violates row-level security policy for table "gestante_exames"',
  'A não insere exame apontando para gestante B'
);

select throws_ok(
  $test$
    insert into public.gestante_vacinas (
      gestante_id, codigo, nome, profissional_id
    ) values (
      '23000000-0000-4000-8000-000000000002'::uuid,
      'BREACH', 'Brecha',
      '13000000-0000-4000-8000-000000000001'::uuid
    )
  $test$,
  '42501',
  'new row violates row-level security policy for table "gestante_vacinas"',
  'A não insere vacina apontando para gestante B'
);

select throws_ok(
  $test$
    insert into public.gestante_altas (
      gestante_id, data_alta, motivo, ubs_id, profissional_id
    ) values (
      '23000000-0000-4000-8000-000000000002'::uuid,
      current_date,
      'Brecha',
      '00000000-0000-4000-8000-000000000101'::uuid,
      '13000000-0000-4000-8000-000000000001'::uuid
    )
  $test$,
  '42501',
  'new row violates row-level security policy for table "gestante_altas"',
  'A não insere alta apontando para gestante B'
);

select throws_ok(
  $test$
    insert into public.classificacoes_risco_gestacional (
      gestante_id,
      instrumento_versao,
      trimestre,
      faixa_imc,
      classificacao,
      conduta_sugerida,
      profissional_id,
      profissional_nome_snapshot,
      perfil_snapshot,
      ubs_origem_profissional_id,
      ubs_origem_nome_snapshot,
      ubs_atendimento_id,
      ubs_atendimento_nome_snapshot
    ) values (
      '23000000-0000-4000-8000-000000000002'::uuid,
      'CI', 1, 'normal', 'baixo', 'breach',
      '13000000-0000-4000-8000-000000000001'::uuid,
      'Profissional A',
      'equipe_ubs',
      '00000000-0000-4000-8000-000000000101'::uuid,
      'UBS Teste Segurança CI',
      '00000000-0000-4000-8000-000000000101'::uuid,
      'UBS Teste Segurança CI'
    )
  $test$,
  '42501',
  'new row violates row-level security policy for table "classificacoes_risco_gestacional"',
  'A não insere classificação apontando para gestante B'
);

select throws_ok(
  $test$
    insert into public.classificacao_risco_itens (
      classificacao_id,
      fator_codigo,
      grupo,
      grupo_titulo,
      fator_titulo,
      pontos
    ) values (
      '37000000-0000-4000-8000-000000000002'::uuid,
      'BREACH',
      'ci',
      'CI',
      'Brecha',
      1
    )
  $test$,
  '42501',
  'new row violates row-level security policy for table "classificacao_risco_itens"',
  'A não insere item na classificação de B'
);

reset role;

update public.perfis
set ativo = false
where id = '13000000-0000-4000-8000-000000000001'::uuid;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '13000000-0000-4000-8000-000000000001',
  true
);

select is(
  (
    select
      (select count(*) from public.gestante_consultas
       where gestante_id = '23000000-0000-4000-8000-000000000001'::uuid)
      + (select count(*) from public.gestante_exames
       where gestante_id = '23000000-0000-4000-8000-000000000001'::uuid)
      + (select count(*) from public.gestante_vacinas
       where gestante_id = '23000000-0000-4000-8000-000000000001'::uuid)
      + (select count(*) from public.gestante_altas
       where gestante_id = '23000000-0000-4000-8000-000000000001'::uuid)
      + (select count(*) from public.classificacoes_risco_gestacional
       where gestante_id = '23000000-0000-4000-8000-000000000001'::uuid)
      + (select count(*) from public.classificacao_risco_itens
       where classificacao_id = '37000000-0000-4000-8000-000000000001'::uuid)
  )::bigint,
  0::bigint,
  'Profissional A revogado perde SELECT em todas as tabelas clínicas filhas'
);

select throws_ok(
  $test$
    select public.profissionais_obter_relatorio_classificacao_v30(
      '37000000-0000-4000-8000-000000000001'::uuid
    )
  $test$,
  'P0001',
  'Gestante não encontrada ou não vinculada ao profissional',
  'Profissional revogado não obtém relatório/PDF da própria classificação'
);

update public.gestante_consultas
set observacao = 'REVOKED-BREACH'
where id = '33000000-0000-4000-8000-000000000001'::uuid;

reset role;

select ok(
  (
    select observacao is null
    from public.gestante_consultas
    where id = '33000000-0000-4000-8000-000000000001'::uuid
  ),
  'Profissional revogado não atualiza a própria consulta'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '13000000-0000-4000-8000-000000000001',
  true
);

reset role;

select * from finish();

rollback;
