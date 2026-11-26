-- STAGED ONLY: execute in disposable synthetic CI, not the shared hosted database.
-- Self-service grants an individual workspace, never a verified professional credential.
-- Existing RLS, ownership, administrative gates, clinical RPC limits and legacy credential path are unchanged.
begin;
-- A technical territory is not an actual health unit; one private territory
-- per unlisted workspace preserves the existing non-null foreign keys.
alter table public.ubs add column if not exists gestario_espaco_individual boolean not null default false;
drop policy if exists gestario_ubs_individual_anon_v32 on public.ubs;
create policy gestario_ubs_individual_anon_v32 on public.ubs as restrictive for select to anon
using (not gestario_espaco_individual);
drop policy if exists gestario_ubs_individual_auth_v32 on public.ubs;
create policy gestario_ubs_individual_auth_v32 on public.ubs as restrictive for select to authenticated
using (not gestario_espaco_individual or id = (select security.usuario_ubs_id()) or (select security.usuario_eh_admin()));
drop policy if exists gestario_microareas_individual_auth_v32 on public.microareas;
create policy gestario_microareas_individual_auth_v32 on public.microareas as restrictive for select to authenticated
using (exists (select 1 from public.ubs u where u.id=microareas.ubs_id));
create table if not exists private.gestario_contas_individuais_v32 (
  usuario_id uuid primary key references auth.users(id) on delete restrict,
  ubs_id uuid not null references public.ubs(id) on delete restrict,
  versao text not null default 'workspace-v32',
  aceito_em timestamptz not null default now()
);
alter table private.gestario_contas_individuais_v32 enable row level security;
revoke all on private.gestario_contas_individuais_v32 from public, anon, authenticated, service_role;

-- Explicit database release gate; frontend settings alone cannot enable signup.
create table if not exists private.gestario_individual_config_v32 (
  singleton boolean primary key default true check(singleton),
  habilitado boolean not null default false
);
alter table private.gestario_individual_config_v32 enable row level security;
revoke all on private.gestario_individual_config_v32 from public, anon, authenticated, service_role;
insert into private.gestario_individual_config_v32(singleton,habilitado) values(true,false) on conflict(singleton) do nothing;

create or replace function public.gestario_ativar_conta_individual_v32(
  p_nome_completo text, p_data_nascimento date, p_ubs_id uuid, p_ciencia boolean
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, private, auth
as $$
declare
  v_id uuid := auth.uid();
  v_email text;
  v_origem text;
  v_nome text := regexp_replace(trim(coalesce(p_nome_completo,'')), '[[:space:]]+', ' ', 'g');
  v_existing public.perfis%rowtype;
  v_ubs_id uuid := p_ubs_id;
begin
  if v_id is null then raise exception 'Sessão inválida'; end if;
  if not exists(select 1 from private.gestario_individual_config_v32 where singleton and habilitado) then raise exception 'Cadastro autônomo indisponível'; end if;
  select lower(trim(email)), case when raw_app_meta_data->>'provider' = 'google' then 'google' else 'email' end
    into v_email,v_origem from auth.users where id=v_id and email_confirmed_at is not null;
  if v_email is null or length(v_email)>254 then raise exception 'E-mail não confirmado'; end if;
  if p_ciencia is distinct from true or length(v_nome) not between 5 and 160 or
     p_data_nascimento is null or p_data_nascimento not between date '1930-01-01' and current_date
  then raise exception 'Cadastro inválido'; end if;
  if p_ubs_id is not null and not exists (select 1 from public.ubs u where u.id=p_ubs_id and u.ativa and not u.gestario_espaco_individual)
  then raise exception 'UBS inválida'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id::text,32));
  select * into v_existing from public.perfis where id=v_id for update;
  if found then
    if v_existing.perfil='equipe_ubs' and v_existing.aprovacao_status='aprovado' and
       v_existing.ativo and v_existing.status='ativo' and v_existing.cadastro_completo and v_existing.perfil_excluido_em is null
       and (v_existing.ubs_id=p_ubs_id or (p_ubs_id is null and exists(select 1 from public.ubs u where u.id=v_existing.ubs_id and u.gestario_espaco_individual)))
       and exists(select 1 from private.gestario_contas_individuais_v32 w where w.usuario_id=v_id and w.ubs_id=v_existing.ubs_id)
    then return jsonb_build_object('ok',true,'status','aprovado'); end if;
    if v_existing.perfil <> 'aluno' or v_existing.aprovacao_status <> 'pendente'
      or v_existing.status='bloqueado' or not v_existing.ativo or v_existing.perfil_excluido_em is not null
      or v_existing.aprovado_em is not null or v_existing.aprovado_por is not null
      or exists(select 1 from private.gestario_contas_individuais_v32 w where w.usuario_id=v_id)
      or exists(select 1 from private.credenciais_profissionais c where c.usuario_id=v_id and c.situacao in ('rejeitado','expirado'))
      or exists(select 1 from private.auditoria_eventos_clinicos_v30 e where e.recurso='perfil_profissional' and e.recurso_id=v_id and (e.acao in ('aprovacao_profissional','revogacao_profissional') or e.detalhes->>'status_atual' in ('rejeitado','desativado')))
      or exists(select 1 from public.pec_gestantes g where g.profissional_responsavel_id=v_id)
      or exists(select 1 from public.importacoes_pec_resumo i where i.usuario_id=v_id)
    then raise exception 'Cadastro indisponível'; end if;
  end if;
  if p_ubs_id is null then
    v_ubs_id := gen_random_uuid();
    insert into public.ubs(id,nome,nome_abreviado,codigo_interno,municipio,uf,ativa,gestario_espaco_individual)
    values(v_ubs_id,'Outra UBS · espaço individual ' || left(v_ubs_id::text,8),'Outra UBS','GESTARIO-IND-' || v_ubs_id::text,'Não informado','NI',true,true);
    insert into public.microareas(ubs_id,codigo,nome,ativa) values(v_ubs_id,'00','Não informada',true);
  end if;
  if v_existing.id is not null then
    update public.perfis set nome_completo=v_nome,email=v_email,data_nascimento=p_data_nascimento,
      perfil='equipe_ubs',perfil_solicitado='equipe_ubs',status='ativo',ativo=true,primeiro_acesso=false,
      cadastro_completo=true,aprovacao_status='aprovado',ubs_id=v_ubs_id,ubs_solicitada_id=p_ubs_id,
      microarea_id=null,origem_cadastro=v_origem,aprovado_em=now(),aprovado_por=null
    where id=v_id;
  else
    insert into public.perfis(id,nome_completo,email,data_nascimento,perfil,perfil_solicitado,status,ativo,
      primeiro_acesso,cadastro_completo,aprovacao_status,ubs_id,ubs_solicitada_id,origem_cadastro,solicitado_em,aprovado_em)
    values(v_id,v_nome,v_email,p_data_nascimento,'equipe_ubs','equipe_ubs','ativo',true,
      false,true,'aprovado',v_ubs_id,p_ubs_id,v_origem,now(),now());
  end if;
  insert into private.gestario_contas_individuais_v32(usuario_id,ubs_id) values(v_id,v_ubs_id);
  return jsonb_build_object('ok',true,'status','aprovado');
end;
$$;
revoke all on function public.gestario_ativar_conta_individual_v32(text,date,uuid,boolean) from public,anon;
grant execute on function public.gestario_ativar_conta_individual_v32(text,date,uuid,boolean) to authenticated;

-- Preserve the verified-credential branch exactly; add only server-recorded individual accounts.
CREATE OR REPLACE FUNCTION "private"."usuario_equipe_clinica_elegivel_v23"(
  "p_usuario_id" uuid,
  "p_ubs_id" uuid DEFAULT NULL
) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfis p
    JOIN public.ubs u
      ON u.id = p.ubs_id
     AND u.ativa = true
    LEFT JOIN private.credenciais_profissionais c
      ON c.usuario_id = p.id
    WHERE p.id = p_usuario_id
      AND p.perfil = 'equipe_ubs'::public.perfil_usuario
      AND p.status = 'ativo'::public.status_usuario
      AND p.ativo = true
      AND p.cadastro_completo = true
      AND p.aprovacao_status = 'aprovado'
      AND p.perfil_excluido_em IS NULL
      AND p.ubs_id IS NOT NULL
      AND (p_ubs_id IS NULL OR p.ubs_id = p_ubs_id)
      AND (
        EXISTS (SELECT 1 FROM private.gestario_contas_individuais_v32 w JOIN auth.users a ON a.id=w.usuario_id AND a.email_confirmed_at IS NOT NULL WHERE w.usuario_id=p.id AND w.ubs_id=p.ubs_id)
        OR (not u.gestario_espaco_individual and c.situacao = 'validado'
      AND c.decidido_em IS NOT NULL
      AND c.cargo_funcao = p.cargo_funcao
      AND (
        (
          p.cargo_funcao = 'medico'
          AND c.conselho = 'CRM'
          AND c.categoria = 'MEDICO'
        )
        OR (
          p.cargo_funcao = 'enfermeiro'
          AND c.conselho = 'COREN'
          AND c.categoria = 'ENFERMEIRO'
        )
      ))
      )
  )
$$;

-- Prevent the old onboarding RPC from resetting rejected/blocked profiles.
create or replace function public.profissionais_completar_perfil_v30(
  p_nome_completo text,
  p_data_nascimento date,
  p_ubs_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_nome text;
  v_existing public.perfis%rowtype;
  v_origem text;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida';
  end if;

  v_nome := regexp_replace(
    trim(coalesce(p_nome_completo, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if length(v_nome) < 5 or length(v_nome) > 160 then
    raise exception 'Nome inválido';
  end if;

  if p_data_nascimento is null
     or p_data_nascimento > current_date
     or p_data_nascimento < date '1900-01-01'
  then
    raise exception 'Data de nascimento inválida';
  end if;

  if p_ubs_id is null
     or not exists (
       select 1
       from public.ubs u
       where u.id = p_ubs_id
         and u.ativa = true
     )
  then
    raise exception 'UBS inválida';
  end if;

  select lower(u.email)
  into v_email
  from auth.users u
  where u.id = v_user_id
  limit 1;

  if v_email is null or length(v_email) > 254 then
    raise exception 'Usuário sem e-mail válido';
  end if;

  select p.*
  into v_existing
  from public.perfis p
  where p.id = v_user_id
  limit 1;

  if found then
    if v_existing.aprovacao_status in ('desativado','rejeitado')
       or v_existing.status = 'bloqueado'
       or v_existing.perfil_excluido_em is not null
       or v_existing.ativo = false
    then
      raise exception 'Acesso desativado';
    end if;

    if v_existing.aprovacao_status = 'aprovado' then
      raise exception 'Cadastro já aprovado';
    end if;

    if v_existing.perfil <> 'aluno' or v_existing.aprovacao_status <> 'pendente' then
      raise exception 'Cadastro indisponível';
    end if;
    v_origem := coalesce(v_existing.origem_cadastro, 'google');
  else
    v_origem := 'google';
  end if;

  insert into public.perfis (
    id,
    nome_completo,
    email,
    perfil,
    status,
    ativo,
    primeiro_acesso,
    data_nascimento,
    cadastro_completo,
    aprovacao_status,
    perfil_solicitado,
    ubs_id,
    ubs_solicitada_id,
    origem_cadastro,
    solicitado_em,
    microarea_id,
    aprovado_em,
    aprovado_por
  )
  values (
    v_user_id,
    v_nome,
    v_email,
    'aluno'::public.perfil_usuario,
    'ativo'::public.status_usuario,
    true,
    false,
    p_data_nascimento,
    true,
    'pendente',
    'equipe_ubs',
    null,
    p_ubs_id,
    v_origem,
    now(),
    null,
    null,
    null
  )
  on conflict (id)
  do update set
    nome_completo = excluded.nome_completo,
    email = excluded.email,
    perfil = 'aluno'::public.perfil_usuario,
    status = 'ativo'::public.status_usuario,
    ativo = true,
    primeiro_acesso = false,
    data_nascimento = excluded.data_nascimento,
    cadastro_completo = true,
    aprovacao_status = 'pendente',
    perfil_solicitado = 'equipe_ubs',
    ubs_id = null,
    ubs_solicitada_id = excluded.ubs_solicitada_id,
    origem_cadastro = excluded.origem_cadastro,
    solicitado_em = now(),
    aprovado_em = null,
    aprovado_por = null,
    microarea_id = null;

  return jsonb_build_object(
    'ok', true,
    'status', 'pendente'
  );
end
$$;

revoke all on function public.profissionais_completar_perfil_v30(
  text,
  date,
  uuid
)
from public, anon;

grant execute on function public.profissionais_completar_perfil_v30(
  text,
  date,
  uuid
)
to authenticated;


commit;
