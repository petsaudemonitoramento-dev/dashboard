begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- O CI usa banco efemero. Estes UUIDs e contatos nao representam pessoas reais.
insert into auth.users (id, aud, role, email, created_at, updated_at)
values
 ('32000000-0000-4000-8000-000000000001'::uuid,'authenticated','authenticated','pec-manual-ci@ci.invalid',now(),now()),
 ('32000000-0000-4000-8000-000000000099'::uuid,'authenticated','authenticated','pec-auditor-ci@ci.invalid',now(),now())
on conflict (id) do nothing;

insert into public.perfis (
 id,nome_completo,email,perfil,status,ubs_id,primeiro_acesso,
 ativo,cadastro_completo,aprovacao_status,perfil_solicitado,origem_cadastro,cargo_funcao
) values (
 '32000000-0000-4000-8000-000000000001'::uuid,
 'Profissional Ficticia PEC V31',
 'pec-manual-ci@ci.invalid',
 'equipe_ubs','ativo','00000000-0000-4000-8000-000000000101'::uuid,
 false,true,true,'aprovado','equipe_ubs','ci','enfermeiro'
);

insert into private.credenciais_profissionais (
 usuario_id,cargo_funcao,conselho,uf,numero_registro,categoria,
 situacao,decidido_em,decidido_por,fonte_verificacao
) values (
 '32000000-0000-4000-8000-000000000001'::uuid,
 'enfermeiro','COREN','PB','320001','ENFERMEIRO','validado',
 now(),'32000000-0000-4000-8000-000000000099'::uuid,'consulta_cofen'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','32000000-0000-4000-8000-000000000001',true);

select lives_ok(
  $test$
    select public.profissionais_importar_pec_v30(
      'pec-ficticio-v31.csv',repeat('1',64),26,
      '{"nome":"Nome","data_nascimento":"Data de nascimento","microarea":"Microárea"}'::jsonb,
      '[{
        "linha":27,
        "canonical":{
          "nome":"PACIENTE FICTICIA REIMPORT V31",
          "data_nascimento":"15/04/1998",
          "cpf":"00000000000",
          "cns":"000000000000000",
          "microarea":"07",
          "dum":"10/03/2026",
          "dpp_dum":"15/12/2026",
          "atendimentos_pre_natal":"5",
          "visitas_pre_natal":"2",
          "visitas_puerperio":"0",
          "risco_gestacional":"Risco habitual"
        }, "raw":{}, "extras":{}
      }]'::jsonb,'[]'::jsonb
    )
  $test$,
  'primeira importacao RPC com gestante ficticia'
);

select is(
  (select count(*)::bigint from public.pec_gestantes
   where profissional_responsavel_id='32000000-0000-4000-8000-000000000001'::uuid),
  1::bigint,
  'importacao cria exatamente uma ficha'
);

select is(
  (select atendimentos_pre_natal from public.pec_gestantes
   where profissional_responsavel_id='32000000-0000-4000-8000-000000000001'::uuid),
  5::integer,
  'valor original PEC: 5 consultas'
);

select lives_ok(
  $test$
    select public.profissionais_salvar_gestante_clinica_v30(
      jsonb_build_object(
        'id',(select id from public.pec_gestantes
          where profissional_responsavel_id='32000000-0000-4000-8000-000000000001'::uuid limit 1),
        'ubsId','00000000-0000-4000-8000-000000000101',
        'microareaId',(select microarea_id from public.pec_gestantes
          where profissional_responsavel_id='32000000-0000-4000-8000-000000000001'::uuid limit 1),
        'identificacao',jsonb_build_object(
          'nome','PACIENTE FICTICIA REIMPORT V31',
          'dataNascimento','15/04/1998',
          'cpf','00000000000',
          'cns','000000000000000'
        ),
        'gestacao',jsonb_build_object(
          'situacao','gestacao_em_curso',
          'dum','10/03/2026',
          'dpp','15/12/2026',
          'riscoGestacional','Alto risco'
        ),
        'acompanhamento',jsonb_build_object(
          'atendimentosPreNatal',5,
          'visitasPreNatal',2,
          'visitasPuerperio',1
        ),
        'consultas','[]'::jsonb,
        'exames','[]'::jsonb,
        'vacinas','[]'::jsonb,
        'alta','{"ativa":false}'::jsonb
      )
    )
  $test$,
  'profissional complementa visita puerperal e altera risco, sem cadastrar outra paciente'
);

select is(
  (select visitas_puerperio from public.pec_gestantes
   where profissional_responsavel_id='32000000-0000-4000-8000-000000000001'::uuid),
  1::integer,
  'valor complementar manual foi salvo'
);

select ok(
  (select 'visitas_puerperio'=any(bloqueios_manuais)
   from public.pec_gestantes
   where profissional_responsavel_id='32000000-0000-4000-8000-000000000001'::uuid),
  'campo realmente editado recebe trava manual'
);

select ok(
  (select not ('atendimentos_pre_natal'=any(bloqueios_manuais))
   from public.pec_gestantes
   where profissional_responsavel_id='32000000-0000-4000-8000-000000000001'::uuid),
  'campo PEC mantido igual nao recebe trava manual indevida'
);

select is(
  (select risco_gestacional from public.pec_gestantes
   where profissional_responsavel_id='32000000-0000-4000-8000-000000000001'::uuid),
  'Alto risco'::text,
  'correcao de risco clinico manual foi salva'
);

-- Segunda chamada com o MESMO SHA, sem nova gravação da mesma planilha.
select lives_ok(
  $test$
    select public.profissionais_importar_pec_v30(
      'pec-ficticio-v31.csv',repeat('1',64),26,
      '{"nome":"Nome","data_nascimento":"Data de nascimento","microarea":"Microárea"}'::jsonb,
      '[{"linha":27,"canonical":{"nome":"PACIENTE FICTICIA REIMPORT V31","data_nascimento":"15/04/1998","cpf":"00000000000","cns":"000000000000000","microarea":"07","atendimentos_pre_natal":"5"},"raw":{},"extras":{}}]'::jsonb,
      '[]'::jsonb
    )
  $test$,
  'reenvio do mesmo arquivo e idempotente'
);

select is(
  (select count(*)::bigint from public.importacoes_pec_resumo
   where usuario_id='32000000-0000-4000-8000-000000000001'::uuid),
  1::bigint,
  'mesmo arquivo nao duplica lote de importacao'
);

-- Simula outro POST independente: limpa contexto manual anterior.
select set_config('app.origem_atualizacao','pec',true);

select lives_ok(
  $test$
    select public.profissionais_importar_pec_v30(
      'pec-ficticio-v31-atualizado.csv',repeat('2',64),26,
      '{"nome":"Nome","data_nascimento":"Data de nascimento","microarea":"Microárea"}'::jsonb,
      '[{
        "linha":27,
        "canonical":{
          "nome":"PACIENTE FICTICIA REIMPORT V31",
          "data_nascimento":"15/04/1998",
          "cpf":"00000000000",
          "cns":"000000000000000",
          "microarea":"07",
          "atendimentos_pre_natal":"6",
          "visitas_pre_natal":"3",
          "visitas_puerperio":"0",
          "risco_gestacional":"Risco habitual"
        },"raw":{}, "extras":{}
      }]'::jsonb,'[]'::jsonb
    )
  $test$,
  'nova exportacao PEC atualiza sem apagar complementacao manual'
);

select is(
  (select atendimentos_pre_natal from public.pec_gestantes
   where profissional_responsavel_id='32000000-0000-4000-8000-000000000001'::uuid),
  6::integer,
  'dado PEC nao alterado manualmente continua atualizavel'
);

select is(
  (select visitas_puerperio from public.pec_gestantes
   where profissional_responsavel_id='32000000-0000-4000-8000-000000000001'::uuid),
  1::integer,
  'nova exportacao nao apaga visita puerperal manual'
);

select is(
  (select risco_gestacional from public.pec_gestantes
   where profissional_responsavel_id='32000000-0000-4000-8000-000000000001'::uuid),
  'Alto risco'::text,
  'nova exportacao nao apaga correcao clinica manual'
);

select is(
  (select count(*)::bigint from public.pec_gestantes
   where profissional_responsavel_id='32000000-0000-4000-8000-000000000001'::uuid),
  1::bigint,
  'atualizacoes nao criam paciente duplicada'
);

select is(
  (select dum from public.pec_gestantes
   where profissional_responsavel_id='32000000-0000-4000-8000-000000000001'::uuid),
  date '2026-03-10',
  'exportacao parcial sem DUM nao apaga DUM PEC antiga'
);

select ok(
  (select not ('dum'=any(bloqueios_manuais))
   from public.pec_gestantes
   where profissional_responsavel_id='32000000-0000-4000-8000-000000000001'::uuid),
  'DUM original permanece automaticamente gerenciavel pelo PEC'
);

select * from finish();
rollback;
