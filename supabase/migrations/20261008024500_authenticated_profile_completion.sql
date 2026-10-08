-- Profissionais V30.7 - completar perfil sem conexão PostgreSQL privilegiada
begin;

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
    if v_existing.aprovacao_status = 'desativado'
       or v_existing.perfil_excluido_em is not null
       or v_existing.ativo = false
    then
      raise exception 'Acesso desativado';
    end if;

    if v_existing.aprovacao_status = 'aprovado' then
      raise exception 'Cadastro já aprovado';
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
