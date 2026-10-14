-- GESTARIO APS: aprovação institucional simples.
-- UI: apenas Aprovar / Rejeitar. Metadados de auditoria são gravados no servidor.
-- A fonte 'conferencia_institucional' NÃO equivale a consulta oficial ao conselho.
begin;

alter table private.credenciais_profissionais
  drop constraint if exists credenciais_profissionais_fonte_check;
alter table private.credenciais_profissionais
  add constraint credenciais_profissionais_fonte_check
  check (fonte_verificacao is null
    or fonte_verificacao = 'conferencia_institucional'
    or (conselho = 'CRM' and fonte_verificacao = 'portal_cfm')
    or (conselho = 'COREN' and fonte_verificacao = 'consulta_cofen'));

alter table private.credenciais_profissionais
  drop constraint if exists credenciais_profissionais_decisao_check;
alter table private.credenciais_profissionais
  add constraint credenciais_profissionais_decisao_check
  check (
    (situacao='pendente' and decidido_em is null and decidido_por is null
     and fonte_verificacao is null and motivo_controlado is null)
    or (situacao='validado' and decidido_em is not null and decidido_por is not null
        and fonte_verificacao is not null and motivo_controlado is null)
    or (situacao in ('rejeitado','expirado') and decidido_em is not null
        and decidido_por is not null and fonte_verificacao is not null)
  );

create or replace function private.decidir_credencial_profissional_v22(
  p_gestor_id uuid,
  p_credencial_id uuid,
  p_decisao text,
  p_fonte_verificacao text default null,
  p_motivo_controlado text default null
) returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_credencial private.credenciais_profissionais%rowtype;
  v_decisao text := lower(trim(coalesce(p_decisao,'')));
  v_fonte text := coalesce(nullif(lower(trim(coalesce(p_fonte_verificacao,''))),''),
                           'conferencia_institucional');
  v_motivo text := nullif(trim(coalesce(p_motivo_controlado,'')),'');
  v_anterior jsonb;
begin
  -- A conta que aprova deve corresponder à sessão; chamadas de serviço são
  -- autorizadas somente por perfil administrativo elegível, como antes.
  if auth.uid() is not null and auth.uid() <> p_gestor_id then
    raise exception 'Aprovador diferente da sessao';
  end if;
  if not private.usuario_gestao_municipal_v22(p_gestor_id)
     and not exists (
       select 1 from public.perfis p where p.id=p_gestor_id
         and p.perfil='administrador'::public.perfil_usuario
         and p.status='ativo'::public.status_usuario
         and p.ativo=true and p.cadastro_completo=true
         and p.aprovacao_status='aprovado' and p.perfil_excluido_em is null
     ) then
    raise exception 'Aprovador nao autorizado';
  end if;
  if v_decisao not in ('validar','rejeitar','expirar') then
    raise exception 'Decisao de credencial invalida';
  end if;

  select * into v_credencial from private.credenciais_profissionais
   where id=p_credencial_id for update;
  if not found or v_credencial.situacao <> 'pendente' then
    raise exception 'Credencial nao esta pendente';
  end if;
  if v_credencial.usuario_id = p_gestor_id then
    raise exception 'Autoaprovacao nao permitida';
  end if;
  if not (v_fonte='conferencia_institucional'
      or (v_credencial.conselho='CRM' and v_fonte='portal_cfm')
      or (v_credencial.conselho='COREN' and v_fonte='consulta_cofen')) then
    raise exception 'Fonte de verificacao invalida';
  end if;
  if v_motivo is not null
     and (char_length(v_motivo) not between 3 and 500
          or v_motivo ~ '[0-9]{11}') then
    raise exception 'Motivo controlado invalido';
  end if;

  v_anterior := jsonb_build_object('situacao',v_credencial.situacao,
                                    'fonteVerificacao',v_credencial.fonte_verificacao);
  update private.credenciais_profissionais
     set situacao=case v_decisao
                    when 'validar' then 'validado'
                    when 'rejeitar' then 'rejeitado'
                    else 'expirado' end,
         decidido_em=now(), decidido_por=p_gestor_id,
         fonte_verificacao=v_fonte,
         motivo_controlado=case when v_decisao='validar' then null else v_motivo end,
         atualizado_em=now()
   where id=p_credencial_id returning * into v_credencial;

  insert into private.auditoria_credenciais_profissionais
    (credencial_id,usuario_id,ator_id,evento,estado_anterior,estado_novo,motivo_controlado)
  values (v_credencial.id,v_credencial.usuario_id,p_gestor_id,v_decisao,v_anterior,
     jsonb_build_object('situacao',v_credencial.situacao,
                        'fonteVerificacao',v_credencial.fonte_verificacao,
                        'decididoEm',v_credencial.decidido_em,
                        'decididoPor',v_credencial.decidido_por),
     v_credencial.motivo_controlado);

  return jsonb_build_object('credencialId',v_credencial.id,
                            'usuarioId',v_credencial.usuario_id,
                            'situacao',v_credencial.situacao);
end;
$function$;
commit;
