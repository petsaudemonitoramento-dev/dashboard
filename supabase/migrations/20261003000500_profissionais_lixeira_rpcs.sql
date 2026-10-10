-- Profissionais V30.5 - lixeira clínica com ownership individual
begin;

create or replace function private.exigir_gestante_responsavel_incluindo_lixeira_v30(
  p_usuario_id uuid,
  p_gestante_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_usuario_id is null or p_gestante_id is null then
    raise exception 'Acesso clínico inválido';
  end if;

  if auth.uid() is not null and auth.uid() <> p_usuario_id then
    raise exception 'Identidade autenticada incompatível';
  end if;

  if not exists (
    select 1
    from public.pec_gestantes g
    join public.perfis p on p.id = p_usuario_id
    where g.id = p_gestante_id
      and g.profissional_responsavel_id = p.id
      and g.ubs_id = p.ubs_id
      and p.perfil = 'equipe_ubs'::public.perfil_usuario
      and p.cadastro_completo = true
      and p.aprovacao_status = 'aprovado'
      and p.status = 'ativo'::public.status_usuario
      and p.ativo = true
      and p.perfil_excluido_em is null
  ) then
    raise exception 'Gestante não encontrada ou não vinculada ao profissional';
  end if;
end
$$;

revoke all on function private.exigir_gestante_responsavel_incluindo_lixeira_v30(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.profissionais_mover_gestante_lixeira_v30(
  p_gestante_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sessão inválida';
  end if;

  perform private.exigir_gestante_responsavel_v30(
    v_user_id,
    p_gestante_id
  );

  return private.mover_gestante_lixeira_v19(
    v_user_id,
    p_gestante_id,
    'Exclusão solicitada pela profissional'
  );
end
$$;

create or replace function public.profissionais_restaurar_gestante_v30(
  p_gestante_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sessão inválida';
  end if;

  perform private.exigir_gestante_responsavel_incluindo_lixeira_v30(
    v_user_id,
    p_gestante_id
  );

  if not exists (
    select 1
    from public.pec_gestantes g
    where g.id = p_gestante_id
      and g.excluida_em is not null
  ) then
    raise exception 'Gestante não está na lixeira';
  end if;

  return private.restaurar_gestante_v19(
    v_user_id,
    p_gestante_id
  );
end
$$;

create or replace function public.profissionais_excluir_gestante_definitivamente_v30(
  p_gestante_id uuid,
  p_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sessão inválida';
  end if;

  if p_confirmed is distinct from true then
    raise exception 'Confirmação obrigatória';
  end if;

  perform private.exigir_gestante_responsavel_incluindo_lixeira_v30(
    v_user_id,
    p_gestante_id
  );

  if not exists (
    select 1
    from public.pec_gestantes g
    where g.id = p_gestante_id
      and g.excluida_em is not null
  ) then
    raise exception 'Exclusão definitiva exige passagem pela lixeira';
  end if;

  return private.excluir_gestante_definitivamente_v19(
    v_user_id,
    p_gestante_id,
    true
  );
end
$$;

revoke all on function public.profissionais_mover_gestante_lixeira_v30(uuid)
from public, anon;
revoke all on function public.profissionais_restaurar_gestante_v30(uuid)
from public, anon;
revoke all on function public.profissionais_excluir_gestante_definitivamente_v30(uuid, boolean)
from public, anon;

grant execute on function public.profissionais_mover_gestante_lixeira_v30(uuid)
to authenticated;
grant execute on function public.profissionais_restaurar_gestante_v30(uuid)
to authenticated;
grant execute on function public.profissionais_excluir_gestante_definitivamente_v30(uuid, boolean)
to authenticated;

commit;
