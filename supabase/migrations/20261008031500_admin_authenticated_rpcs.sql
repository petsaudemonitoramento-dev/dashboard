-- Profissionais V30.8 - administração técnica via RPC autenticada
begin;

create or replace function private.exigir_admin_autenticado_v30()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null
     or not private.usuario_admin_v20(v_user_id)
  then
    raise exception 'ADMIN_FORBIDDEN';
  end if;

  return v_user_id;
end
$$;

revoke all on function private.exigir_admin_autenticado_v30()
from public, anon, authenticated, service_role;

create or replace function public.profissionais_admin_listar_pendentes_v30()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.exigir_admin_autenticado_v30();

  return jsonb_build_object(
    'rows',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'nome_completo', p.nome_completo,
          'email', p.email,
          'data_nascimento', p.data_nascimento,
          'perfil_solicitado', p.perfil_solicitado,
          'ubs_solicitada_id', p.ubs_solicitada_id,
          'ubs_solicitada_nome', u.nome,
          'solicitado_em', p.solicitado_em,
          'origem_cadastro', p.origem_cadastro
        )
        order by p.solicitado_em, p.nome_completo
      )
      from public.perfis p
      left join public.ubs u
        on u.id = p.ubs_solicitada_id
      where p.aprovacao_status = 'pendente'
        and p.perfil_excluido_em is null
        and p.perfil <> 'administrador'::public.perfil_usuario
    ), '[]'::jsonb),
    'ubs',
    coalesce((
      select jsonb_agg(
        jsonb_build_object('id', u.id, 'nome', u.nome)
        order by u.nome
      )
      from public.ubs u
      where u.ativa = true
    ), '[]'::jsonb),
    'microareas',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'ubs_id', m.ubs_id,
          'codigo', m.codigo,
          'nome', m.nome
        )
        order by m.ubs_id, m.codigo
      )
      from public.microareas m
      where m.ativa = true
    ), '[]'::jsonb)
  );
end
$$;

create or replace function public.profissionais_admin_listar_perfis_v30()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.exigir_admin_autenticado_v30();

  return jsonb_build_object(
    'rows',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'nome_completo', p.nome_completo,
          'email', p.email,
          'data_nascimento', p.data_nascimento,
          'perfil_atual', p.perfil::text,
          'perfil_solicitado', p.perfil_solicitado,
          'aprovacao_status', p.aprovacao_status,
          'ativo', p.ativo,
          'ubs_id', p.ubs_id,
          'ubs_nome', u.nome,
          'ubs_solicitada_id', p.ubs_solicitada_id,
          'ubs_solicitada_nome', us.nome,
          'origem_cadastro', p.origem_cadastro,
          'solicitado_em', p.solicitado_em,
          'perfil_excluido_em', p.perfil_excluido_em
        )
        order by p.solicitado_em desc, p.nome_completo
      )
      from public.perfis p
      left join public.ubs u on u.id = p.ubs_id
      left join public.ubs us on us.id = p.ubs_solicitada_id
      where p.aprovacao_status <> 'pendente'
        and p.perfil <> 'administrador'::public.perfil_usuario
    ), '[]'::jsonb),
    'ubs',
    coalesce((
      select jsonb_agg(
        jsonb_build_object('id', u.id, 'nome', u.nome)
        order by u.nome
      )
      from public.ubs u
      where u.ativa = true
    ), '[]'::jsonb)
  );
end
$$;

create or replace function public.profissionais_admin_listar_ubs_v30()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.exigir_admin_autenticado_v30();

  return jsonb_build_object(
    'ubs',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'nome', u.nome,
          'ativa', u.ativa
        )
        order by u.ativa desc, u.nome
      )
      from public.ubs u
    ), '[]'::jsonb),
    'microareas',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'ubs_id', m.ubs_id,
          'codigo', m.codigo,
          'nome', m.nome,
          'ativa', m.ativa
        )
        order by m.ubs_id, m.ativa desc, m.codigo
      )
      from public.microareas m
    ), '[]'::jsonb)
  );
end
$$;

create or replace function public.profissionais_admin_processar_perfil_v30(
  p_action text,
  p_target_id uuid,
  p_ubs_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_admin_id uuid;
  v_before public.perfis%rowtype;
  v_after public.perfis%rowtype;
begin
  v_admin_id := private.exigir_admin_autenticado_v30();

  if p_action not in ('approve', 'reject', 'deactivate', 'reactivate')
     or p_target_id is null
     or p_target_id = v_admin_id
  then
    raise exception 'INVALID_OPERATION';
  end if;

  select p.*
  into v_before
  from public.perfis p
  where p.id = p_target_id
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if v_before.perfil = 'administrador'::public.perfil_usuario then
    raise exception 'ADMIN_TARGET_FORBIDDEN';
  end if;

  if p_action = 'approve' then
    if p_ubs_id is null or not exists (
      select 1
      from public.ubs u
      where u.id = p_ubs_id and u.ativa = true
    ) then
      raise exception 'UBS_INACTIVE';
    end if;

    update public.perfis
    set
      perfil = 'equipe_ubs'::public.perfil_usuario,
      perfil_solicitado = 'equipe_ubs',
      ubs_id = p_ubs_id,
      ubs_solicitada_id = p_ubs_id,
      microarea_id = null,
      aprovacao_status = 'aprovado',
      cadastro_completo = true,
      status = 'ativo'::public.status_usuario,
      ativo = true,
      aprovado_em = now(),
      aprovado_por = v_admin_id,
      perfil_excluido_em = null,
      perfil_excluido_por = null
    where id = p_target_id;
  elsif p_action = 'reject' then
    update public.perfis
    set
      perfil = 'aluno'::public.perfil_usuario,
      ubs_id = null,
      microarea_id = null,
      aprovacao_status = 'rejeitado',
      aprovado_em = null,
      aprovado_por = v_admin_id
    where id = p_target_id;
  elsif p_action = 'deactivate' then
    update public.perfis
    set
      aprovacao_status = 'desativado',
      ativo = false,
      perfil_excluido_em = now(),
      perfil_excluido_por = v_admin_id
    where id = p_target_id;
  else
    update public.perfis
    set
      perfil = 'aluno'::public.perfil_usuario,
      ubs_id = null,
      microarea_id = null,
      aprovacao_status = 'pendente',
      ativo = true,
      status = 'ativo'::public.status_usuario,
      perfil_excluido_em = null,
      perfil_excluido_por = null,
      solicitado_em = now()
    where id = p_target_id;
  end if;

  select p.*
  into v_after
  from public.perfis p
  where p.id = p_target_id;

  insert into private.auditoria_perfis_v20 (
    administrador_id,
    perfil_alvo_id,
    acao,
    antes,
    depois
  )
  values (
    v_admin_id,
    p_target_id,
    'admin_perfil_v30:' || p_action,
    jsonb_build_object(
      'perfil', v_before.perfil::text,
      'status', v_before.status::text,
      'ativo', v_before.ativo,
      'cadastroCompleto', v_before.cadastro_completo,
      'aprovacaoStatus', v_before.aprovacao_status,
      'ubsId', v_before.ubs_id,
      'excluido', v_before.perfil_excluido_em is not null
    ),
    jsonb_build_object(
      'perfil', v_after.perfil::text,
      'status', v_after.status::text,
      'ativo', v_after.ativo,
      'cadastroCompleto', v_after.cadastro_completo,
      'aprovacaoStatus', v_after.aprovacao_status,
      'ubsId', v_after.ubs_id,
      'excluido', v_after.perfil_excluido_em is not null
    )
  );

  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.profissionais_admin_processar_lote_v30(
  p_action text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_admin_id uuid;
  v_item jsonb;
  v_target_id uuid;
  v_ubs_id uuid;
  v_count integer := 0;
begin
  v_admin_id := private.exigir_admin_autenticado_v30();

  if p_action not in ('approve', 'reject')
     or p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 100
  then
    raise exception 'INVALID_BATCH';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or nullif(v_item->>'targetId', '') is null
    then
      raise exception 'INVALID_BATCH';
    end if;

    begin
      v_target_id := (v_item->>'targetId')::uuid;
    exception when invalid_text_representation then
      raise exception 'INVALID_BATCH';
    end;

    if v_target_id = v_admin_id then
      raise exception 'ADMIN_TARGET_FORBIDDEN';
    end if;

    if p_action = 'approve' then
      if coalesce(v_item->>'perfil', '') <> 'equipe_ubs'
         or nullif(v_item->>'ubsId', '') is null
      then
        raise exception 'INVALID_BATCH';
      end if;

      begin
        v_ubs_id := (v_item->>'ubsId')::uuid;
      exception when invalid_text_representation then
        raise exception 'INVALID_BATCH';
      end;
    else
      v_ubs_id := null;
    end if;

    if not exists (
      select 1
      from public.perfis p
      where p.id = v_target_id
        and p.aprovacao_status = 'pendente'
        and p.perfil <> 'administrador'::public.perfil_usuario
    ) then
      raise exception 'REQUEST_NOT_PENDING';
    end if;

    perform public.profissionais_admin_processar_perfil_v30(
      p_action,
      v_target_id,
      v_ubs_id
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'processed', v_count,
    'action', p_action
  );
end
$$;

create or replace function public.profissionais_admin_gerenciar_ubs_v30(
  p_action text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_nome text;
  v_codigo text;
  v_id uuid;
  v_ubs_id uuid;
begin
  perform private.exigir_admin_autenticado_v30();

  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or pg_column_size(p_payload) > 32768
  then
    raise exception 'INVALID_OPERATION';
  end if;

  if p_action = 'create_ubs' then
    v_nome := left(regexp_replace(trim(coalesce(p_payload->>'nome', '')), '[[:space:]]+', ' ', 'g'), 160);
    if length(v_nome) < 3 then raise exception 'INVALID_OPERATION'; end if;
    insert into public.ubs (nome, ativa) values (v_nome, true);
  elsif p_action = 'update_ubs' then
    v_id := nullif(p_payload->>'id','')::uuid;
    v_nome := left(regexp_replace(trim(coalesce(p_payload->>'nome', '')), '[[:space:]]+', ' ', 'g'), 160);
    if v_id is null or length(v_nome) < 3 then raise exception 'INVALID_OPERATION'; end if;
    update public.ubs set nome = v_nome where id = v_id;
  elsif p_action = 'toggle_ubs' then
    v_id := nullif(p_payload->>'id','')::uuid;
    if v_id is null or jsonb_typeof(p_payload->'ativa') <> 'boolean' then raise exception 'INVALID_OPERATION'; end if;
    update public.ubs set ativa = (p_payload->>'ativa')::boolean where id = v_id;
  elsif p_action = 'create_microarea' then
    v_ubs_id := nullif(p_payload->>'ubsId','')::uuid;
    v_codigo := left(regexp_replace(trim(coalesce(p_payload->>'codigo', '')), '[[:space:]]+', ' ', 'g'), 30);
    v_nome := nullif(left(regexp_replace(trim(coalesce(p_payload->>'nome', '')), '[[:space:]]+', ' ', 'g'), 120), '');
    if v_ubs_id is null or v_codigo = '' or not exists (select 1 from public.ubs u where u.id=v_ubs_id and u.ativa=true) then
      raise exception 'INVALID_OPERATION';
    end if;
    insert into public.microareas (ubs_id,codigo,nome,ativa) values (v_ubs_id,v_codigo,v_nome,true);
  elsif p_action = 'update_microarea' then
    v_id := nullif(p_payload->>'id','')::uuid;
    v_codigo := left(regexp_replace(trim(coalesce(p_payload->>'codigo', '')), '[[:space:]]+', ' ', 'g'), 30);
    v_nome := nullif(left(regexp_replace(trim(coalesce(p_payload->>'nome', '')), '[[:space:]]+', ' ', 'g'), 120), '');
    if v_id is null or v_codigo = '' then raise exception 'INVALID_OPERATION'; end if;
    update public.microareas set codigo=v_codigo, nome=v_nome where id=v_id;
  elsif p_action = 'toggle_microarea' then
    v_id := nullif(p_payload->>'id','')::uuid;
    if v_id is null or jsonb_typeof(p_payload->'ativa') <> 'boolean' then raise exception 'INVALID_OPERATION'; end if;
    update public.microareas set ativa=(p_payload->>'ativa')::boolean where id=v_id;
  else
    raise exception 'INVALID_OPERATION';
  end if;

  return jsonb_build_object('ok', true);
exception
  when invalid_text_representation then
    raise exception 'INVALID_OPERATION';
  when unique_violation then
    raise exception 'DUPLICATE_RECORD';
end
$$;

create or replace function public.profissionais_admin_publicar_aviso_v30(
  p_ubs_id uuid,
  p_titulo text,
  p_mensagem text,
  p_tipo text,
  p_publico text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_admin_id uuid;
  v_aviso_id uuid;
  v_titulo text := trim(coalesce(p_titulo,''));
  v_mensagem text := trim(coalesce(p_mensagem,''));
begin
  v_admin_id := private.exigir_admin_autenticado_v30();

  if p_ubs_id is null
     or not exists (select 1 from public.ubs u where u.id=p_ubs_id and u.ativa=true)
     or length(v_titulo) not between 1 and 120
     or length(v_mensagem) not between 1 and 1500
     or p_tipo not in ('informativo','alerta','sucesso')
     or p_publico not in ('todos','profissionais','acs','gestao')
  then
    raise exception 'INVALID_NOTICE';
  end if;

  insert into public.avisos_ubs (
    ubs_id, titulo, mensagem, tipo, publico, criado_por
  )
  values (
    p_ubs_id, v_titulo, v_mensagem, p_tipo, p_publico, v_admin_id
  )
  returning id into v_aviso_id;

  insert into private.auditoria_avisos_v20 (
    aviso_id, usuario_id, acao, metadados
  )
  values (
    v_aviso_id,
    v_admin_id,
    'publicar_v30',
    jsonb_build_object(
      'ubsId', p_ubs_id,
      'tipo', p_tipo,
      'publico', p_publico
    )
  );

  return v_aviso_id;
end
$$;

create or replace function public.profissionais_admin_remover_aviso_v30(
  p_aviso_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_admin_id uuid;
begin
  v_admin_id := private.exigir_admin_autenticado_v30();

  update public.avisos_ubs
  set removido_em=now(), removido_por=v_admin_id
  where id=p_aviso_id and removido_em is null;

  if not found then
    return false;
  end if;

  insert into private.auditoria_avisos_v20 (
    aviso_id, usuario_id, acao
  )
  values (p_aviso_id, v_admin_id, 'remover_v30');

  return true;
end
$$;

revoke all on function public.profissionais_admin_listar_pendentes_v30() from public, anon;
revoke all on function public.profissionais_admin_listar_perfis_v30() from public, anon;
revoke all on function public.profissionais_admin_listar_ubs_v30() from public, anon;
revoke all on function public.profissionais_admin_processar_perfil_v30(text,uuid,uuid) from public, anon;
revoke all on function public.profissionais_admin_processar_lote_v30(text,jsonb) from public, anon;
revoke all on function public.profissionais_admin_gerenciar_ubs_v30(text,jsonb) from public, anon;
revoke all on function public.profissionais_admin_publicar_aviso_v30(uuid,text,text,text,text) from public, anon;
revoke all on function public.profissionais_admin_remover_aviso_v30(uuid) from public, anon;

grant execute on function public.profissionais_admin_listar_pendentes_v30() to authenticated;
grant execute on function public.profissionais_admin_listar_perfis_v30() to authenticated;
grant execute on function public.profissionais_admin_listar_ubs_v30() to authenticated;
grant execute on function public.profissionais_admin_processar_perfil_v30(text,uuid,uuid) to authenticated;
grant execute on function public.profissionais_admin_processar_lote_v30(text,jsonb) to authenticated;
grant execute on function public.profissionais_admin_gerenciar_ubs_v30(text,jsonb) to authenticated;
grant execute on function public.profissionais_admin_publicar_aviso_v30(uuid,text,text,text,text) to authenticated;
grant execute on function public.profissionais_admin_remover_aviso_v30(uuid) to authenticated;

commit;
