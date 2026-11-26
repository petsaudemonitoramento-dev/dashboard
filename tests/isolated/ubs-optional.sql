begin;
insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at)
values('91000000-0000-4000-8000-000000000001','authenticated','authenticated','ubs-option-ci@ci.invalid',now(),now(),now());
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select public.profissionais_completar_perfil_v30('Profissional Outra UBS CI',date '1995-06-10',null::uuid);
reset role;
do $$
begin
 if not exists(select 1 from public.perfis where id='91000000-0000-4000-8000-000000000001' and perfil='aluno' and cadastro_completo and aprovacao_status='pendente' and ubs_id is null and ubs_solicitada_id is null)
 then raise exception 'Cadastro sem UBS não permaneceu pendente e sem vínculo'; end if;
end $$;
rollback;
