-- Synthetic fixtures only, all rolled back; a failing assertion aborts the CI job.
begin;
insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at)
values
('32000000-0000-4000-8000-000000000001','authenticated','authenticated','workspace-a@ci.invalid',now(),now(),now()),
('32000000-0000-4000-8000-000000000002','authenticated','authenticated','workspace-b@ci.invalid',now(),now(),now()),
('32000000-0000-4000-8000-000000000003','authenticated','authenticated','workspace-unverified@ci.invalid',null,now(),now()),
('32000000-0000-4000-8000-000000000004','authenticated','authenticated','workspace-rejected@ci.invalid',now(),now(),now());
insert into public.perfis(id,nome_completo,email,perfil,status,ativo,cadastro_completo,aprovacao_status)
values('32000000-0000-4000-8000-000000000004','Conta rejeitada CI','workspace-rejected@ci.invalid','aluno','ativo',true,true,'rejeitado');
set local role authenticated;
select set_config('request.jwt.claim.sub','32000000-0000-4000-8000-000000000001',true);
select public.gestario_ativar_conta_individual_v32('Conta Individual A','1995-01-01','00000000-0000-4000-8000-000000000101',true);
do $$ begin
 if (select count(*) from public.profissionais_listar_gestantes_v30(false)) <> 0 then raise exception 'New workspace must be empty'; end if;
 if not security.usuario_equipe_clinica_elegivel_v23('00000000-0000-4000-8000-000000000101') then raise exception 'Workspace not eligible'; end if;
end $$;
select set_config('request.jwt.claim.sub','32000000-0000-4000-8000-000000000002',true);
select public.gestario_ativar_conta_individual_v32('Conta Individual B','1995-01-01','00000000-0000-4000-8000-000000000101',true);
reset role;
insert into public.pec_gestantes(id,codigo,ubs_id,profissional_responsavel_id)
values('32000000-0000-4000-8000-000000000011','GST-V32-A','00000000-0000-4000-8000-000000000101','32000000-0000-4000-8000-000000000001'),
('32000000-0000-4000-8000-000000000012','GST-V32-B','00000000-0000-4000-8000-000000000101','32000000-0000-4000-8000-000000000002');
do $$ begin
 if exists(select 1 from private.credenciais_profissionais where usuario_id in ('32000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000002')) then raise exception 'False professional credential'; end if;
 if has_function_privilege('anon','public.gestario_ativar_conta_individual_v32(text,date,uuid,boolean)','EXECUTE') then raise exception 'Anonymous activation'; end if;
 if has_table_privilege('authenticated','private.gestario_contas_individuais_v32','INSERT') then raise exception 'Client may forge workspace'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','32000000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select count(*) from public.pec_gestantes) <> 1 or (select count(*) from public.profissionais_listar_gestantes_v30(false)) <> 1 then raise exception 'Ownership leak'; end if;
 if security.usuario_pode_acessar_gestante_v30('32000000-0000-4000-8000-000000000012') then raise exception 'Cross-account access'; end if;
 begin
  perform public.profissionais_obter_gestante_clinica_v30('32000000-0000-4000-8000-000000000012',false);
  raise exception 'Cross-account RPC unexpectedly succeeded' using errcode='XX000';
 exception when raise_exception then null;
 end;
 begin
  perform public.profissionais_admin_listar_pendentes_v30();
  raise exception 'Admin RPC unexpectedly succeeded' using errcode='XX000';
 exception when raise_exception then null;
 end;
end $$;
select set_config('request.jwt.claim.sub','32000000-0000-4000-8000-000000000003',true);
do $$ begin
 begin
  perform public.gestario_ativar_conta_individual_v32('Conta não confirmada','1995-01-01','00000000-0000-4000-8000-000000000101',true);
  raise exception 'Unverified account activated' using errcode='XX000';
 exception when raise_exception then if sqlerrm <> 'E-mail não confirmado' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claim.sub','32000000-0000-4000-8000-000000000004',true);
do $$ begin
 begin
  perform public.gestario_ativar_conta_individual_v32('Conta rejeitada','1995-01-01','00000000-0000-4000-8000-000000000101',true);
  raise exception 'Rejected account activated' using errcode='XX000';
 exception when raise_exception then if sqlerrm <> 'Cadastro indisponível' then raise; end if;
 end;
end $$;
reset role;
update public.perfis set ativo=false,aprovacao_status='desativado' where id='32000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','32000000-0000-4000-8000-000000000001',true);
do $$ begin
 if security.usuario_equipe_clinica_elegivel_v23('00000000-0000-4000-8000-000000000101') or (select count(*) from public.pec_gestantes) <> 0 then raise exception 'Revoked account retains access'; end if;
 begin
  perform public.gestario_ativar_conta_individual_v32('Conta desativada','1995-01-01','00000000-0000-4000-8000-000000000101',true);
  raise exception 'Disabled account activated' using errcode='XX000';
 exception when raise_exception then if sqlerrm <> 'Cadastro indisponível' then raise; end if;
 end;
end $$;
reset role;
rollback;
