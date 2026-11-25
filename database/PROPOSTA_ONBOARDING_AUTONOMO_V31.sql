-- STAGED ONLY. Do not run on the shared production database before CI and institutional review.
-- The new flow creates only an unprivileged demonstration profile. It does not approve clinical access.
begin;
create table if not exists private.gestario_demo_aceites_v31 (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  versao text not null,
  aceito_em timestamptz not null default now(),
  primary key (usuario_id, versao)
);
alter table private.gestario_demo_aceites_v31 enable row level security;
revoke all on private.gestario_demo_aceites_v31 from public, anon, authenticated;

create or replace function public.gestario_completar_demonstracao_v31(
  p_nome_completo text, p_profissao text, p_ubs_id uuid, p_ciencia boolean
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, private, auth
as $$
declare
  v_id uuid := auth.uid();
  v_email text;
  v_nome text := regexp_replace(trim(coalesce(p_nome_completo,'')), '[[:space:]]+', ' ', 'g');
  v_existing public.perfis%rowtype;
  v_origin text;
begin
  if v_id is null then raise exception 'Sessão inválida'; end if;
  select lower(trim(email)), case when raw_app_meta_data->>'provider' = 'google' then 'google' else 'email' end
    into v_email, v_origin from auth.users where id=v_id and email_confirmed_at is not null;
  if v_email is null then raise exception 'E-mail não confirmado'; end if;
  if length(v_nome) not between 5 and 160 or p_ciencia is distinct from true or
    p_profissao is null or p_profissao not in ('enfermeiro','medico','tecnico_enfermagem','acs','dentista','farmaceutico','nutricionista','fisioterapeuta','psicologo','estudante','outro')
  then raise exception 'Cadastro inválido'; end if;
  if p_ubs_id is not null and not exists (select 1 from public.ubs where id=p_ubs_id and ativa)
  then raise exception 'UBS inválida'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 31));
  select * into v_existing from public.perfis where id=v_id for update;
  if found then
    if v_existing.perfil <> 'aluno' or v_existing.aprovacao_status <> 'pendente' or
       v_existing.perfil_excluido_em is not null or not v_existing.ativo or v_existing.cadastro_completo
    then raise exception 'Cadastro indisponível'; end if;
    update public.perfis set nome_completo=v_nome, email=v_email, cargo_funcao=p_profissao,
      ubs_solicitada_id=p_ubs_id, cadastro_completo=true, primeiro_acesso=false,
      perfil_solicitado='equipe_ubs', origem_cadastro=v_origin, status='ativo'
      where id=v_id;
  else
    insert into public.perfis(id,nome_completo,email,perfil,status,ativo,primeiro_acesso,
      cadastro_completo,aprovacao_status,perfil_solicitado,origem_cadastro,cargo_funcao,ubs_solicitada_id)
    values(v_id,v_nome,v_email,'aluno','ativo',true,false,true,'pendente','equipe_ubs',v_origin,p_profissao,p_ubs_id);
  end if;
  insert into private.gestario_demo_aceites_v31(usuario_id,versao) values(v_id,'demo-v1')
    on conflict do nothing;
  return jsonb_build_object('ok',true,'mode','demonstracao');
end;
$$;
revoke all on function public.gestario_completar_demonstracao_v31(text,text,uuid,boolean) from public, anon;
grant execute on function public.gestario_completar_demonstracao_v31(text,text,uuid,boolean) to authenticated;
commit;
