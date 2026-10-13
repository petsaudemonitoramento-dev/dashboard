begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Identidades sem qualquer vinculo com pessoas reais; rollback ao final.
insert into auth.users (id, aud, role, email, created_at, updated_at)
values (
  '31000000-0000-4000-8000-000000000001'::uuid,
  'authenticated', 'authenticated',
  'paciente-ficticia-pec-test@ci.invalid',
  now(), now()
)
on conflict (id) do nothing;

insert into public.perfis (
  id, nome_completo, email, perfil, status, ubs_id, primeiro_acesso,
  ativo, cadastro_completo, aprovacao_status, perfil_solicitado,
  origem_cadastro, cargo_funcao
) values (
  '31000000-0000-4000-8000-000000000001'::uuid,
  'Profissional Sintetica Teste PEC',
  'paciente-ficticia-pec-test@ci.invalid', 'equipe_ubs', 'ativo',
  '00000000-0000-4000-8000-000000000101'::uuid, false, true, true,
  'aprovado', 'equipe_ubs', 'ci', 'enfermeiro'
)
on conflict (id) do update set
  ubs_id = excluded.ubs_id,
  ativo = true,
  status = 'ativo',
  cadastro_completo = true,
  aprovacao_status = 'aprovado',
  perfil_excluido_em = null;

-- Importação de PEC exige credencial clínica validada, além do perfil aprovado.
-- A fixture reproduz essa condição; não altera permissões de produção.
insert into auth.users (id, aud, role, email, created_at, updated_at)
values (
  '31000000-0000-4000-8000-000000000099'::uuid,
  'authenticated', 'authenticated', 'admin-sintetico@ci.invalid',
  now(), now()
)
on conflict (id) do nothing;

insert into private.credenciais_profissionais (
  usuario_id, cargo_funcao, conselho, uf, numero_registro, categoria,
  situacao, decidido_em, decidido_por, fonte_verificacao
) values (
  '31000000-0000-4000-8000-000000000001'::uuid,
  'enfermeiro', 'COREN', 'PB', '310001', 'ENFERMEIRO',
  'validado', now(), '31000000-0000-4000-8000-000000000099'::uuid,
  'consulta_cofen'
)
on conflict (usuario_id) do update set
  cargo_funcao=excluded.cargo_funcao,
  conselho=excluded.conselho, categoria=excluded.categoria,
  situacao=excluded.situacao, decidido_em=excluded.decidido_em,
  decidido_por=excluded.decidido_por;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '31000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $import$
    select public.profissionais_importar_pec_v30(
      'gestante-sintetica-original-60.csv',
      repeat('d',64),
      26,
      '{"nome":"Nome","data_nascimento":"Data de nascimento","microarea":"Microárea","atendimentos_pre_natal":"Quantidade de atendimentos no pré-natal","atendimentos_ate_12_semanas":"Quantidade de atendimentos até 12 semanas no pré-natal","dum":"DUM","dpp_dum":"DPP (DUM)","visitas_pre_natal":"Quantidade de visitas domiciliares no pré-natal"}'::jsonb,
      '[{
        "linha":27,
        "canonical":{
          "nome":"PACIENTE FICTICIA C3 001",
          "data_nascimento":"15/04/1998",
          "cpf":"00000000000",
          "cns":"000000000000000",
          "microarea":"07",
          "dum":"10/03/2026",
          "dpp_dum":"15/12/2026",
          "atendimentos_pre_natal":"5",
          "atendimentos_ate_12_semanas":"1",
          "visitas_pre_natal":"2"
        },
        "raw":{},
        "extras":{"Meses desde o último atendimento médico":"0"}
      }]'::jsonb,
      '[]'::jsonb
    )
  $import$,
  'RPC importa paciente ficticia usando layout original do PEC, sem erro geral'
);

select is(
  (select count(*)::bigint from public.pec_gestantes
   where profissional_responsavel_id='31000000-0000-4000-8000-000000000001'::uuid),
  1::bigint,
  'RPC realmente criou uma gestante para a profissional sintetica'
);

select is(
  (select atendimentos_pre_natal from public.pec_gestantes
   where profissional_responsavel_id='31000000-0000-4000-8000-000000000001'::uuid
   limit 1),
  5::integer,
  'Cinco consultas foram aproveitadas da planilha sem serem inventadas'
);

select lives_ok(
  $import2$
    select public.profissionais_importar_pec_v30(
      'gestante-sintetica-reimport.csv',
      repeat('e',64),
      26,
      '{"nome":"Nome","data_nascimento":"Data de nascimento","microarea":"Microárea"}'::jsonb,
      '[{
        "linha":27,
        "canonical":{
          "nome":"PACIENTE FICTICIA C3 001",
          "data_nascimento":"15/04/1998",
          "cpf":"00000000000",
          "cns":"000000000000000",
          "microarea":"07",
          "atendimentos_pre_natal":"5",
          "atendimentos_ate_12_semanas":"1",
          "visitas_pre_natal":"2"
        },
        "raw":{},
        "extras":{}
      }]'::jsonb,
      '[]'::jsonb
    )
  $import2$,
  'Reimportacao de mesma paciente sintetica nao gera erro geral'
);

select is(
  (select count(*)::bigint from public.pec_gestantes
   where profissional_responsavel_id='31000000-0000-4000-8000-000000000001'::uuid),
  1::bigint,
  'Reimportacao nao duplica paciente ficticia'
);

select is(
  (select count(*)::bigint from public.importacoes_pec_resumo
   where usuario_id='31000000-0000-4000-8000-000000000001'::uuid),
  2::bigint,
  'Duas tentativas de importacao ficam registradas com rastreabilidade'
);

select * from finish();
rollback;
