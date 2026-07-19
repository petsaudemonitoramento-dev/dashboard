begin;

-- Corrige o caminho das funções criptográficas do pgcrypto no Supabase.
alter function private.identidade_hash(jsonb, uuid)
set search_path = pg_catalog, private, extensions;

alter function private.importar_pec(
  uuid,
  uuid,
  text,
  text,
  integer,
  jsonb,
  jsonb,
  jsonb
)
set search_path = pg_catalog, public, private, extensions;

-- Descriptografia tolerante a registros legados ou inválidos.
create or replace function private.descriptografar_texto(
  p_valor bytea
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, private, extensions
as $$
begin
  if p_valor is null then
    return null;
  end if;

  return extensions.pgp_sym_decrypt(
    p_valor,
    private.pii_key()
  );
exception
  when others then
    return null;
end
$$;

revoke all
on function private.descriptografar_texto(bytea)
from public, anon, authenticated;

-- Auditoria mínima: registra quando uma tela identificada é aberta.
create table if not exists private.acessos_identidade_gestantes (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users(id),
  ubs_id uuid references public.ubs(id),
  perfil text not null,
  finalidade text not null default 'assistencia_na_ubs',
  total_registros integer not null default 0,
  criado_em timestamptz not null default now()
);

revoke all
on private.acessos_identidade_gestantes
from public, anon, authenticated;

-- A identidade permanece criptografada no schema private.
-- A função devolve o nome somente para perfis assistenciais autorizados.
create or replace function private.listar_gestantes_autorizadas(
  p_usuario_id uuid,
  p_exibir_identidade boolean default false
)
returns table (
  gestante_id uuid,
  codigo text,
  nome_visual text,
  ubs_nome text,
  microarea_codigo text,
  idade_anos integer,
  risco_gestacional text,
  ig_semanas integer,
  ig_dias integer,
  dpp date,
  atendimentos_pre_natal integer,
  atendimentos_ate_12_semanas integer,
  ultima_consulta_pre_natal date,
  atendimentos_odontologicos integer,
  dtpa text,
  pressao_arterial text,
  peso_kg numeric,
  altura_cm numeric,
  visitas_pre_natal integer,
  dias_ultima_visita integer,
  exame_hiv_primeiro text,
  exame_sifilis_primeiro text,
  exame_hepatite_b_primeiro text,
  exame_hepatite_c_primeiro text,
  exame_hiv_terceiro text,
  exame_sifilis_terceiro text,
  observacao text,
  atualizado_em timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_perfil text;
  v_ubs_id uuid;
  v_ativo boolean;
  v_pode_ver_identidade boolean := false;
  v_total integer := 0;
begin
  select
    p.perfil::text,
    p.ubs_id,
    p.ativo and p.status = 'ativo'
  into
    v_perfil,
    v_ubs_id,
    v_ativo
  from public.perfis p
  where p.id = p_usuario_id
  limit 1;

  if not found or not coalesce(v_ativo, false) then
    raise exception 'Usuário inativo ou sem perfil autorizado';
  end if;

  v_pode_ver_identidade := v_perfil in (
    'administrador',
    'profissional_ubs',
    'equipe_ubs'
  );

  if v_perfil <> 'administrador' and v_ubs_id is null then
    raise exception 'Usuário sem UBS vinculada';
  end if;

  if p_exibir_identidade and v_pode_ver_identidade then
    select count(*)::integer
    into v_total
    from public.pec_gestantes g
    where
      v_perfil = 'administrador'
      or g.ubs_id = v_ubs_id;

    insert into private.acessos_identidade_gestantes (
      usuario_id,
      ubs_id,
      perfil,
      finalidade,
      total_registros
    )
    values (
      p_usuario_id,
      v_ubs_id,
      v_perfil,
      'visualizacao_operacional_da_lista',
      v_total
    );
  end if;

  return query
  select
    g.id as gestante_id,
    g.codigo,
    case
      when p_exibir_identidade and v_pode_ver_identidade then
        coalesce(
          nullif(private.descriptografar_texto(i.nome_enc), ''),
          'Nome não disponível'
        )
      else
        'Gestante ' || g.codigo
    end as nome_visual,
    u.nome as ubs_nome,
    m.codigo as microarea_codigo,
    g.idade_anos,
    g.risco_gestacional,
    coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas) as ig_semanas,
    coalesce(g.ig_dum_dias, g.ig_ecografia_dias) as ig_dias,
    coalesce(g.dpp_dum, g.dpp_ecografia) as dpp,
    g.atendimentos_pre_natal,
    g.atendimentos_ate_12_semanas,
    g.ultima_consulta_pre_natal,
    g.atendimentos_odontologicos,
    g.dtpa,
    g.pressao_arterial,
    g.peso_kg,
    g.altura_cm,
    g.visitas_pre_natal,
    g.dias_ultima_visita,
    g.exame_hiv_primeiro,
    g.exame_sifilis_primeiro,
    g.exame_hepatite_b_primeiro,
    g.exame_hepatite_c_primeiro,
    g.exame_hiv_terceiro,
    g.exame_sifilis_terceiro,
    coalesce(
      nullif(g.dados_extras ->> 'Cenário clínico de teste', ''),
      nullif(g.dados_extras ->> 'Cenario clinico de teste', ''),
      nullif(g.dados_extras ->> 'Observações', ''),
      nullif(g.dados_extras ->> 'Observacao', '')
    ) as observacao,
    g.atualizado_em
  from public.pec_gestantes g
  join public.ubs u
    on u.id = g.ubs_id
  left join public.microareas m
    on m.id = g.microarea_id
  left join private.identidades_gestantes i
    on i.gestante_id = g.id
  where
    v_perfil = 'administrador'
    or g.ubs_id = v_ubs_id
  order by
    case
      when lower(coalesce(g.risco_gestacional, '')) like '%alto%' then 1
      when lower(coalesce(g.risco_gestacional, '')) like '%inter%' then 2
      when lower(coalesce(g.risco_gestacional, '')) like '%habit%' then 3
      else 4
    end,
    g.atualizado_em desc;
end
$$;

revoke all
on function private.listar_gestantes_autorizadas(uuid, boolean)
from public, anon, authenticated;

commit;
