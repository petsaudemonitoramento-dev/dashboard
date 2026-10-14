begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Todos os registros desta suite são sinteticos e revertidos no final.
insert into auth.users (id,aud,role,email,created_at,updated_at)
values
 ('19000000-0000-4000-8000-000000000001','authenticated','authenticated','gestario-admin-ci@ci.invalid',now(),now()),
 ('19000000-0000-4000-8000-000000000002','authenticated','authenticated','gestario-enfermeiro-ci@ci.invalid',now(),now()),
 ('19000000-0000-4000-8000-000000000003','authenticated','authenticated','gestario-sem-registro-ci@ci.invalid',now(),now());

insert into public.perfis (id,nome_completo,email,perfil,status,ativo,primeiro_acesso,cadastro_completo,
  aprovacao_status,perfil_solicitado,origem_cadastro,ubs_id,cargo_funcao)
values
 ('19000000-0000-4000-8000-000000000001','Gestario Admin CI','gestario-admin-ci@ci.invalid','administrador','ativo',true,false,true,
  'aprovado','administrador','ci',null,null),
 ('19000000-0000-4000-8000-000000000002','Gestario Enfermeira CI','gestario-enfermeiro-ci@ci.invalid','aluno','ativo',true,false,true,
  'pendente','equipe_ubs','ci',null,'enfermeiro'),
 ('19000000-0000-4000-8000-000000000003','Gestario Sem Credencial CI','gestario-sem-registro-ci@ci.invalid','aluno','ativo',true,false,true,
  'pendente','equipe_ubs','ci',null,'enfermeiro');

insert into private.credenciais_profissionais (usuario_id,cargo_funcao,conselho,uf,numero_registro,categoria,situacao)
values ('19000000-0000-4000-8000-000000000002','enfermeiro','COREN','PB','98765123','ENFERMEIRO','pendente');

set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000001',true);

select lives_ok(
 $test$select public.profissionais_admin_processar_perfil_v30(
   'approve','19000000-0000-4000-8000-000000000002'::uuid,
   '00000000-0000-4000-8000-000000000101'::uuid)$test$,
 'aprovacao institucional com COREN cadastrado acontece em uma transacao'
);

reset role;

select is((select aprovacao_status from public.perfis
 where id='19000000-0000-4000-8000-000000000002'::uuid), 'aprovado',
 'perfil recebe estado aprovado');
select is((select situacao from private.credenciais_profissionais
 where usuario_id='19000000-0000-4000-8000-000000000002'::uuid), 'validado',
 'credencial recebe estado validado');
select is((select fonte_verificacao from private.credenciais_profissionais
 where usuario_id='19000000-0000-4000-8000-000000000002'::uuid), 'conferencia_institucional',
 'fonte nao finge consulta oficial COFEN');

set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000001',true);

select throws_ok(
 $test$select public.profissionais_admin_processar_perfil_v30(
   'approve','19000000-0000-4000-8000-000000000003'::uuid,
   '00000000-0000-4000-8000-000000000101'::uuid)$test$,
 'P0001','PROFESSIONAL_CREDENTIAL_REQUIRED',
 'profissional sem credencial nao e liberado'
);

reset role;
select * from finish();
rollback;
