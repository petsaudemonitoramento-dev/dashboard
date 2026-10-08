-- Profissionais V30.8 - listagem de lixeira isolada por ownership
begin;

create or replace function public.profissionais_listar_lixeira_v30(
  p_exibir_identidade boolean default true
)
returns table (
  gestante_id uuid,
  codigo text,
  nome_visual text,
  ubs_nome text,
  microarea_codigo text,
  excluida_em timestamptz,
  excluir_em timestamptz,
  exclusao_motivo text
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_ubs_id uuid;
  v_total integer := 0;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida';
  end if;

  perform private.exigir_rate_limit_usuario_v30(
    'rpc-trash-list',
    v_user_id,
    120,
    300
  );

  select p.ubs_id
  into v_ubs_id
  from public.perfis p
  where p.id = v_user_id
    and p.perfil = 'equipe_ubs'::public.perfil_usuario
    and p.status = 'ativo'::public.status_usuario
    and p.ativo = true
    and p.cadastro_completo = true
    and p.aprovacao_status = 'aprovado'
    and p.perfil_excluido_em is null
  limit 1;

  if v_ubs_id is null then
    raise exception 'Profissional sem autorização para lixeira';
  end if;

  select count(*)::integer
  into v_total
  from public.pec_gestantes g
  where g.profissional_responsavel_id = v_user_id
    and g.ubs_id = v_ubs_id
    and g.excluida_em is not null;

  if p_exibir_identidade and v_total > 0 then
    insert into private.acessos_identidade_gestantes (
      usuario_id,
      ubs_id,
      perfil,
      finalidade,
      total_registros
    )
    values (
      v_user_id,
      v_ubs_id,
      'equipe_ubs',
      'visualizacao_lixeira_profissional_v30',
      v_total
    );
  end if;

  return query
  select
    g.id,
    g.codigo,
    case
      when p_exibir_identidade then coalesce(
        nullif(private.descriptografar_texto(i.nome_enc), ''),
        'Nome não disponível'
      )
      else 'Gestante ' || g.codigo
    end,
    u.nome,
    m.codigo,
    g.excluida_em,
    coalesce(
      g.exclusao_definitiva_prevista_em,
      g.excluida_em + interval '10 days'
    ),
    g.exclusao_motivo
  from public.pec_gestantes g
  join public.ubs u on u.id = g.ubs_id
  left join public.microareas m on m.id = g.microarea_id
  left join private.identidades_gestantes i
    on i.gestante_id = g.id
  where g.profissional_responsavel_id = v_user_id
    and g.ubs_id = v_ubs_id
    and g.excluida_em is not null
  order by coalesce(
    g.exclusao_definitiva_prevista_em,
    g.excluida_em + interval '10 days'
  ) asc;
end
$$;

revoke all on function public.profissionais_listar_lixeira_v30(boolean)
from public, anon;

grant execute on function public.profissionais_listar_lixeira_v30(boolean)
to authenticated;

commit;
