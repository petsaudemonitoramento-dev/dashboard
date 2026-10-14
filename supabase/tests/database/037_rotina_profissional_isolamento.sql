begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Todos os dados, UUIDs e emails abaixo são fictícios e descartados ao final.
insert into auth.users(id,aud,role,email,created_at,updated_at)
values
 ('41000000-0000-4000-8000-000000000001','authenticated','authenticated','rotina-a@ci.invalid',now(),now()),
 ('41000000-0000-4000-8000-000000000002','authenticated','authenticated','rotina-b@ci.invalid',now(),now()),
 ('41000000-0000-4000-8000-000000000099','authenticated','authenticated','auditor-rotina@ci.invalid',now(),now())
on conflict(id) do nothing;

insert into public.perfis(
 id,nome_completo,email,perfil,status,ubs_id,primeiro_acesso,ativo,
 cadastro_completo,aprovacao_status,perfil_solicitado,origem_cadastro,cargo_funcao
)
values
 ('41000000-0000-4000-8000-000000000001','Profissional A Fictícia','rotina-a@ci.invalid',
 'equipe_ubs','ativo','00000000-0000-4000-8000-000000000101',false,true,true,
 'aprovado','equipe_ubs','ci','enfermeiro'),
 ('41000000-0000-4000-8000-000000000002','Profissional B Fictícia','rotina-b@ci.invalid',
 'equipe_ubs','ativo','00000000-0000-4000-8000-000000000101',false,true,true,
 'aprovado','equipe_ubs','ci','enfermeiro');

insert into private.credenciais_profissionais(
 usuario_id,cargo_funcao,conselho,uf,numero_registro,categoria,
 situacao,decidido_em,decidido_por,fonte_verificacao
) values
 ('41000000-0000-4000-8000-000000000001','enfermeiro','COREN','PB',
  '410001','ENFERMEIRO','validado',now(),'41000000-0000-4000-8000-000000000099','consulta_cofen'),
 ('41000000-0000-4000-8000-000000000002','enfermeiro','COREN','PB',
  '410002','ENFERMEIRO','validado',now(),'41000000-0000-4000-8000-000000000099','consulta_cofen');

insert into public.pec_gestantes(
 id,codigo,ubs_id,profissional_responsavel_id
) values
 ('42000000-0000-4000-8000-000000000001','GST-AGENDA-A',
  '00000000-0000-4000-8000-000000000101','41000000-0000-4000-8000-000000000001'),
 ('42000000-0000-4000-8000-000000000002','GST-AGENDA-B',
  '00000000-0000-4000-8000-000000000101','41000000-0000-4000-8000-000000000002');

select ok(
 not has_table_privilege('anon','public.rotina_profissional_tarefas_v1','SELECT')
 and not has_table_privilege('anon','public.rotina_profissional_tarefas_v1','INSERT')
 and not has_table_privilege('anon','public.rotina_profissional_tarefas_v1','UPDATE'),
 'anon não pode listar, criar ou modificar tarefas'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);

select lives_ok(
 $sql$
 insert into public.rotina_profissional_tarefas_v1
 (id,profissional_id,gestante_id,tipo,data_prevista)
 values(
 '43000000-0000-4000-8000-000000000001',
 '41000000-0000-4000-8000-000000000001',
 '42000000-0000-4000-8000-000000000001',
 'consulta',date '2026-10-20')
 $sql$,
 'Profissional A agenda tarefa para gestante própria'
);

select is(
 (select count(*)::bigint from public.rotina_profissional_tarefas_v1),
 1::bigint,
 'A só visualiza sua própria agenda'
);

select lives_ok(
 $sql$
 update public.rotina_profissional_tarefas_v1
 set status='concluida', concluida_em=now()
 where id='43000000-0000-4000-8000-000000000001'
 $sql$,
 'A pode concluir a própria tarefa'
);
select is(
 (select status from public.rotina_profissional_tarefas_v1
   where id='43000000-0000-4000-8000-000000000001'),
 'concluida'::text,
 'Estado concluída persistiu'
);

select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000002',true);

select is(
 (select count(*)::bigint from public.rotina_profissional_tarefas_v1),
 0::bigint,
 'B não vê tarefas de A mesmo sendo da mesma UBS'
);

select lives_ok(
 $sql$
 update public.rotina_profissional_tarefas_v1
 set data_prevista=date '2026-11-10'
 where id='43000000-0000-4000-8000-000000000001'
 $sql$,
 'Tentativa de edição por B não causa acesso autorizado'
);

select lives_ok(
 $sql$
 insert into public.rotina_profissional_tarefas_v1(
 id,profissional_id,gestante_id,tipo,data_prevista)
 values(
 '43000000-0000-4000-8000-000000000002',
 '41000000-0000-4000-8000-000000000002',
 '42000000-0000-4000-8000-000000000002',
 'exame',date '2026-10-22')
 $sql$,
 'B cria uma atividade própria sem compartilhar agenda'
);

select is(
 (select count(*)::bigint from public.rotina_profissional_tarefas_v1),
 1::bigint,
 'B só enxerga a tarefa que criou'
);

select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);

select is(
 (select count(*)::bigint from public.rotina_profissional_tarefas_v1),
 1::bigint,
 'A continua sem ver agenda da colega'
);

select lives_ok(
 $sql$
 delete from public.rotina_profissional_tarefas_v1
 where id='43000000-0000-4000-8000-000000000002'
 $sql$,
 'Tentativa de exclusão por A é filtrada pela RLS'
);
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000002',true);
select is(
 (select count(*)::bigint from public.rotina_profissional_tarefas_v1
   where id='43000000-0000-4000-8000-000000000002'),
 1::bigint,
 'Exclusão por A não apagou a tarefa de B'
);
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);
select is(
 (select data_prevista from public.rotina_profissional_tarefas_v1
   where id='43000000-0000-4000-8000-000000000001'),
 date '2026-10-20',
 'Reagendamento por B não alterou data de A'
);

reset role;
update public.perfis
set ativo=false
where id='41000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);

select is(
 (select count(*)::bigint from public.rotina_profissional_tarefas_v1),
 0::bigint,
 'Revogação do perfil também revoga leitura das tarefas'
);

select * from finish();
rollback;
