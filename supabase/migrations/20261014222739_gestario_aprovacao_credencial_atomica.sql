-- A aprovacao do profissional deve validar institucionalmente sua credencial
-- e seu perfil clinico em uma unica transacao, sem declarar consulta oficial.
-- Requisitos: administrador autenticado, UBS ativa, COREN/CRM compatível,
-- auditoria de credencial e perfil (nao afeta unidades nem perfis existentes).
CREATE OR REPLACE FUNCTION public.profissionais_admin_processar_perfil_v30(p_action text, p_target_id uuid, p_ubs_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_admin_id uuid;
  v_before public.perfis%rowtype;
  v_after public.perfis%rowtype;
  v_credencial_id uuid;
  v_credencial_situacao text;
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

    -- Conferencia institucional simples, declarada pelo administrador logado.
    -- A credencial deve existir e ser coerente com a profissao cadastrada.
    -- A atualizacao da credencial e a aprovacao do perfil sao atomicas.
    select c.id, c.situacao
      into v_credencial_id, v_credencial_situacao
      from private.credenciais_profissionais c
     where c.usuario_id = p_target_id
       and c.cargo_funcao = v_before.cargo_funcao
       and ((c.cargo_funcao = 'enfermeiro' and c.conselho = 'COREN' and c.categoria = 'ENFERMEIRO')
         or (c.cargo_funcao = 'medico' and c.conselho = 'CRM' and c.categoria = 'MEDICO'))
     for update;

    if not found or v_credencial_situacao not in ('pendente','validado') then
      raise exception 'PROFESSIONAL_CREDENTIAL_REQUIRED';
    end if;

    if v_credencial_situacao = 'pendente' then
      perform private.decidir_credencial_profissional_v22(
        v_admin_id, v_credencial_id, 'validar', 'conferencia_institucional', null
      );
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
$function$
