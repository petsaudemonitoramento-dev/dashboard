begin;

-- =========================================================
-- V18 — Indicadores por UBS e por profissional
-- =========================================================

alter table public.pec_gestantes
  add column if not exists profissional_responsavel_id uuid references auth.users(id);

create index if not exists pec_gestantes_profissional_idx
  on public.pec_gestantes(profissional_responsavel_id, alta_ativa, atualizado_em desc);

-- Vincula registros existentes ao profissional que os cadastrou/importou.
update public.pec_gestantes g
set profissional_responsavel_id = coalesce(
  g.profissional_responsavel_id,
  g.atualizado_manualmente_por,
  (
    select r.usuario_id
    from public.importacoes_pec_resumo r
    where r.id = g.importacao_id
    limit 1
  ),
  (
    select cr.profissional_id
    from public.classificacoes_risco_gestacional cr
    where cr.gestante_id = g.id
    order by cr.realizada_em asc
    limit 1
  ),
  (
    select idg.atualizado_manualmente_por
    from private.identidades_gestantes idg
    where idg.gestante_id = g.id
    limit 1
  )
)
where g.profissional_responsavel_id is null;

create or replace function private.definir_profissional_responsavel_v18()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_profissional uuid;
begin
  if tg_op = 'UPDATE' and old.profissional_responsavel_id is not null then
    new.profissional_responsavel_id := old.profissional_responsavel_id;
    return new;
  end if;

  if new.profissional_responsavel_id is not null then
    return new;
  end if;

  v_profissional := new.atualizado_manualmente_por;

  if v_profissional is null then
    select idg.atualizado_manualmente_por
    into v_profissional
    from private.identidades_gestantes idg
    where idg.gestante_id = new.id
    limit 1;
  end if;

  if v_profissional is null and new.importacao_id is not null then
    select r.usuario_id
    into v_profissional
    from public.importacoes_pec_resumo r
    where r.id = new.importacao_id
    limit 1;
  end if;

  new.profissional_responsavel_id := v_profissional;
  return new;
end
$$;

drop trigger if exists trg_definir_profissional_responsavel_v18
on public.pec_gestantes;

create trigger trg_definir_profissional_responsavel_v18
before insert or update on public.pec_gestantes
for each row
execute function private.definir_profissional_responsavel_v18();

create or replace function security.usuario_pode_acessar_gestante_v18(
  p_gestante_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.pec_gestantes g
    join public.perfis p on p.id = auth.uid()
    where g.id = p_gestante_id
      and p.ativo = true
      and p.status = 'ativo'
      and (
        p.perfil = 'administrador'
        or (
          g.ubs_id = p.ubs_id
          and g.profissional_responsavel_id = p.id
        )
      )
  )
$$;

grant execute
on function security.usuario_pode_acessar_gestante_v18(uuid)
to authenticated;

-- RLS operacional: a profissional só consulta registros sob sua responsabilidade.
drop policy if exists "usuarios veem gestantes da propria ubs"
on public.pec_gestantes;

drop policy if exists "usuarios veem gestantes proprias"
on public.pec_gestantes;

create policy "usuarios veem gestantes proprias"
on public.pec_gestantes
for select
to authenticated
using (
  security.usuario_eh_admin()
  or (
    ubs_id = security.usuario_ubs_id()
    and profissional_responsavel_id = auth.uid()
  )
);

drop policy if exists "consultas da propria ubs"
on public.gestante_consultas;
drop policy if exists "consultas das gestantes proprias"
on public.gestante_consultas;
create policy "consultas das gestantes proprias"
on public.gestante_consultas
for select to authenticated
using (security.usuario_pode_acessar_gestante_v18(gestante_id));

drop policy if exists "exames da propria ubs"
on public.gestante_exames;
drop policy if exists "exames das gestantes proprias"
on public.gestante_exames;
create policy "exames das gestantes proprias"
on public.gestante_exames
for select to authenticated
using (security.usuario_pode_acessar_gestante_v18(gestante_id));

drop policy if exists "vacinas da propria ubs"
on public.gestante_vacinas;
drop policy if exists "vacinas das gestantes proprias"
on public.gestante_vacinas;
create policy "vacinas das gestantes proprias"
on public.gestante_vacinas
for select to authenticated
using (security.usuario_pode_acessar_gestante_v18(gestante_id));

drop policy if exists "altas da propria ubs"
on public.gestante_altas;
drop policy if exists "altas das gestantes proprias"
on public.gestante_altas;
create policy "altas das gestantes proprias"
on public.gestante_altas
for select to authenticated
using (security.usuario_pode_acessar_gestante_v18(gestante_id));

drop policy if exists "classificacoes da propria ubs"
on public.classificacoes_risco_gestacional;
drop policy if exists "classificacoes das gestantes proprias"
on public.classificacoes_risco_gestacional;
create policy "classificacoes das gestantes proprias"
on public.classificacoes_risco_gestacional
for select to authenticated
using (security.usuario_pode_acessar_gestante_v18(gestante_id));

drop policy if exists "itens classificacoes da propria ubs"
on public.classificacao_risco_itens;
drop policy if exists "itens das classificacoes proprias"
on public.classificacao_risco_itens;
create policy "itens das classificacoes proprias"
on public.classificacao_risco_itens
for select to authenticated
using (
  exists (
    select 1
    from public.classificacoes_risco_gestacional c
    where c.id = classificacao_id
      and security.usuario_pode_acessar_gestante_v18(c.gestante_id)
  )
);

-- =========================================================
-- Views sem identificação direta para construção dos dashboards Metabase.
-- =========================================================

create schema if not exists analytics;

create or replace view analytics.vw_indicadores_base_v18 as
select
  g.ubs_id,
  g.profissional_responsavel_id,
  m.codigo as microarea,
  not coalesce(g.alta_ativa, false) as ativa,
  coalesce(g.alta_ativa, false) as alta,
  case
    when lower(coalesce(g.risco_gestacional, '')) like '%alto%' then 'Alto risco'
    when lower(coalesce(g.risco_gestacional, '')) like '%inter%'
      or lower(coalesce(g.risco_gestacional, '')) like '%médio%'
      or lower(coalesce(g.risco_gestacional, '')) like '%medio%' then 'Médio risco'
    when lower(coalesce(g.risco_gestacional, '')) like '%habit%'
      or lower(coalesce(g.risco_gestacional, '')) like '%baixo%' then 'Risco habitual'
    else 'Não classificado'
  end as risco_categoria,
  case
    when coalesce(g.atendimentos_ate_12_semanas, 0) > 0 then 'Precoce (≤12 sem)'
    when g.inicio_pre_natal is not null and g.dum is not null
      and g.inicio_pre_natal <= g.dum + 84 then 'Precoce (≤12 sem)'
    when g.inicio_pre_natal is not null and g.dum is not null
      and g.inicio_pre_natal > g.dum + 84 then 'Tardia (>12 sem)'
    else 'Sem dados'
  end as captacao_categoria,
  case
    when coalesce(g.atendimentos_pre_natal, 0) <= 3 then 'Crítico (0–3)'
    when coalesce(g.atendimentos_pre_natal, 0) between 4 and 6 then 'Intermediário (4–6)'
    else 'Meta (7+)'
  end as consultas_categoria,
  case
    when coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) between 1 and 13 then '1º trimestre'
    when coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) between 14 and 27 then '2º trimestre'
    when coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) >= 28 then '3º trimestre'
    else 'IG não informada'
  end as trimestre,
  date_trunc('month', coalesce(g.dpp_dum, g.dpp_ecografia))::date as mes_dpp,
  (
    select count(*)::integer
    from public.config_exames_pre_natal ce
    where ce.ativo = true
      and ce.trimestre <= case
        when coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) <= 13 then 1
        when coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) <= 27 then 2
        else 3
      end
      and not exists (
        select 1
        from public.gestante_exames ge
        where ge.gestante_id = g.id
          and ge.codigo = ce.codigo
          and ge.status in ('realizado', 'nao_se_aplica')
      )
  ) as exames_pendentes,
  case
    when coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) >= 20
      and not exists (
        select 1
        from public.gestante_vacinas gv
        where gv.gestante_id = g.id
          and gv.codigo = 'dtpa'
          and gv.status = 'realizada'
      ) then true
    else false
  end as dtpa_pendente,
  g.atualizado_em
from public.pec_gestantes g
left join public.microareas m on m.id = g.microarea_id;

create or replace view analytics.vw_fatores_risco_v18 as
with ultima_classificacao as (
  select distinct on (c.gestante_id)
    c.id,
    c.gestante_id,
    c.classificacao,
    c.realizada_em
  from public.classificacoes_risco_gestacional c
  where c.status = 'finalizada'
  order by c.gestante_id, c.realizada_em desc
)
select
  g.ubs_id,
  g.profissional_responsavel_id,
  uc.classificacao,
  i.grupo,
  i.fator_titulo,
  i.pontos,
  i.automatico,
  uc.realizada_em
from ultima_classificacao uc
join public.pec_gestantes g on g.id = uc.gestante_id
join public.classificacao_risco_itens i on i.classificacao_id = uc.id
where i.fator_codigo <> 'g2_imc';

revoke all on analytics.vw_indicadores_base_v18 from anon, authenticated;
revoke all on analytics.vw_fatores_risco_v18 from anon, authenticated;

grant usage on schema analytics to service_role;
grant select on analytics.vw_indicadores_base_v18 to service_role;
grant select on analytics.vw_fatores_risco_v18 to service_role;

-- =========================================================
-- Cards de gestantes: administradores veem tudo; profissionais veem as próprias.
-- =========================================================

create or replace function private.listar_gestantes_autorizadas_v16(
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
  alta_ativa boolean,
  alta_data date,
  alta_motivo text,
  pendencias_count integer,
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
      or (
        g.ubs_id = v_ubs_id
        and g.profissional_responsavel_id = p_usuario_id
      );

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
      'visualizacao_operacional_das_gestantes_proprias_v18',
      v_total
    );
  end if;

  return query
  select
    g.id,
    g.codigo,
    case
      when p_exibir_identidade and v_pode_ver_identidade then
        coalesce(
          nullif(private.descriptografar_texto(i.nome_enc), ''),
          'Nome não disponível'
        )
      else
        'Gestante ' || g.codigo
    end,
    u.nome,
    m.codigo,
    g.idade_anos,
    g.risco_gestacional,
    coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas),
    coalesce(g.ig_dum_dias, g.ig_ecografia_dias),
    coalesce(g.dpp_dum, g.dpp_ecografia),
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
    ),
    g.alta_ativa,
    g.alta_data,
    g.alta_motivo,
    (
      select count(*)::integer
      from public.config_exames_pre_natal ce
      where ce.ativo = true
        and ce.trimestre <= case
          when coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) <= 13 then 1
          when coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) <= 27 then 2
          else 3
        end
        and not exists (
          select 1
          from public.gestante_exames ge
          where ge.gestante_id = g.id
            and ge.codigo = ce.codigo
            and ge.status in ('realizado', 'nao_se_aplica')
        )
    ),
    g.atualizado_em
  from public.pec_gestantes g
  join public.ubs u on u.id = g.ubs_id
  left join public.microareas m on m.id = g.microarea_id
  left join private.identidades_gestantes i on i.gestante_id = g.id
  where
    v_perfil = 'administrador'
    or (
      g.ubs_id = v_ubs_id
      and g.profissional_responsavel_id = p_usuario_id
    )
  order by
    g.alta_ativa asc,
    case
      when lower(coalesce(g.risco_gestacional, '')) like '%alto%' then 1
      when lower(coalesce(g.risco_gestacional, '')) like '%inter%'
        or lower(coalesce(g.risco_gestacional, '')) like '%médio%'
        or lower(coalesce(g.risco_gestacional, '')) like '%medio%' then 2
      when lower(coalesce(g.risco_gestacional, '')) like '%habit%' then 3
      else 4
    end,
    g.atualizado_em desc;
end
$$;

revoke all
on function private.listar_gestantes_autorizadas_v16(uuid, boolean)
from public, anon, authenticated;

-- =========================================================
-- Indicadores agregados. Nenhum identificador direto é retornado.
-- =========================================================

create or replace function private.obter_indicadores_v18(
  p_usuario_id uuid,
  p_escopo text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_perfil text;
  v_ubs_id uuid;
  v_ubs_nome text;
  v_nome_profissional text;
  v_escopo text := lower(coalesce(p_escopo, 'profissional'));
  v_resultado jsonb;
begin
  select
    p.perfil::text,
    p.ubs_id,
    u.nome,
    p.nome_completo
  into
    v_perfil,
    v_ubs_id,
    v_ubs_nome,
    v_nome_profissional
  from public.perfis p
  left join public.ubs u on u.id = p.ubs_id
  where p.id = p_usuario_id
    and p.ativo = true
    and p.status = 'ativo'
  limit 1;

  if not found then
    raise exception 'Usuário sem perfil ativo';
  end if;

  if v_escopo not in ('ubs', 'profissional') then
    raise exception 'Escopo de indicadores inválido';
  end if;

  if v_perfil <> 'administrador' and v_ubs_id is null then
    raise exception 'Usuário sem UBS vinculada';
  end if;

  with base as (
    select
      g.*,
      m.codigo as microarea_codigo,
      coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas) as ig_semanas,
      case
        when coalesce(g.atendimentos_ate_12_semanas, 0) > 0 then 'precoce'
        when g.inicio_pre_natal is not null and g.dum is not null
          and g.inicio_pre_natal <= g.dum + 84 then 'precoce'
        when g.inicio_pre_natal is not null and g.dum is not null
          and g.inicio_pre_natal > g.dum + 84 then 'tardia'
        else 'sem_dados'
      end as captacao
    from public.pec_gestantes g
    left join public.microareas m on m.id = g.microarea_id
    where
      (
        v_perfil = 'administrador'
        or g.ubs_id = v_ubs_id
      )
      and (
        v_escopo = 'ubs'
        or g.profissional_responsavel_id = p_usuario_id
      )
  ),
  ativas as (
    select *
    from base
    where coalesce(alta_ativa, false) = false
  ),
  resumo as (
    select
      count(*)::integer as total,
      count(*) filter (where not alta_ativa)::integer as ativas,
      count(*) filter (where alta_ativa)::integer as altas,
      count(*) filter (
        where lower(coalesce(risco_gestacional, '')) like '%alto%'
      )::integer as alto_risco,
      count(*) filter (
        where lower(coalesce(risco_gestacional, '')) like '%inter%'
           or lower(coalesce(risco_gestacional, '')) like '%médio%'
           or lower(coalesce(risco_gestacional, '')) like '%medio%'
      )::integer as medio_risco,
      count(*) filter (
        where lower(coalesce(risco_gestacional, '')) like '%habit%'
           or lower(coalesce(risco_gestacional, '')) like '%baixo%'
      )::integer as habitual,
      count(*) filter (where captacao = 'precoce')::integer as captacao_precoce,
      count(*) filter (where captacao = 'tardia')::integer as captacao_tardia,
      count(*) filter (where captacao = 'sem_dados')::integer as captacao_sem_dados,
      count(*) filter (
        where ultima_consulta_pre_natal is null
           or ultima_consulta_pre_natal < current_date - 35
      )::integer as acompanhamento_atrasado
    from base
  ),
  consulta_categorias as (
    select *
    from (
      values
        ('Crítico (0–3)', (select count(*)::integer from ativas where coalesce(atendimentos_pre_natal, 0) <= 3), 1),
        ('Intermediário (4–6)', (select count(*)::integer from ativas where coalesce(atendimentos_pre_natal, 0) between 4 and 6), 2),
        ('Meta (7+)', (select count(*)::integer from ativas where coalesce(atendimentos_pre_natal, 0) >= 7), 3)
    ) as v(rotulo, quantidade, ordem)
  ),
  risco_categorias as (
    select *
    from (
      values
        ('Alto risco', (select count(*)::integer from ativas where lower(coalesce(risco_gestacional, '')) like '%alto%'), 1),
        ('Médio risco', (select count(*)::integer from ativas where lower(coalesce(risco_gestacional, '')) like '%inter%' or lower(coalesce(risco_gestacional, '')) like '%médio%' or lower(coalesce(risco_gestacional, '')) like '%medio%'), 2),
        ('Risco habitual', (select count(*)::integer from ativas where lower(coalesce(risco_gestacional, '')) like '%habit%' or lower(coalesce(risco_gestacional, '')) like '%baixo%'), 3),
        ('Não classificado', (select count(*)::integer from ativas where coalesce(btrim(risco_gestacional), '') = ''), 4)
    ) as v(rotulo, quantidade, ordem)
  ),
  trimestres as (
    select *
    from (
      values
        ('1º trimestre', (select count(*)::integer from ativas where coalesce(ig_semanas, 0) between 1 and 13), 1),
        ('2º trimestre', (select count(*)::integer from ativas where coalesce(ig_semanas, 0) between 14 and 27), 2),
        ('3º trimestre', (select count(*)::integer from ativas where coalesce(ig_semanas, 0) >= 28), 3),
        ('IG não informada', (select count(*)::integer from ativas where ig_semanas is null or ig_semanas = 0), 4)
    ) as v(rotulo, quantidade, ordem)
  ),
  microareas_brutas as (
    select
      coalesce(nullif(microarea_codigo, ''), 'Não informada') as rotulo,
      count(*)::integer as quantidade
    from ativas
    group by coalesce(nullif(microarea_codigo, ''), 'Não informada')
  ),
  microareas_privadas as (
    select
      case
        when v_escopo = 'ubs' and quantidade < 5
          then 'Outras microáreas (agrupadas)'
        else rotulo
      end as rotulo,
      sum(quantidade)::integer as quantidade
    from microareas_brutas
    group by 1
  ),
  ultima_classificacao as (
    select distinct on (c.gestante_id)
      c.id,
      c.gestante_id
    from public.classificacoes_risco_gestacional c
    join ativas a on a.id = c.gestante_id
    where c.status = 'finalizada'
    order by c.gestante_id, c.realizada_em desc
  ),
  fatores as (
    select
      i.fator_titulo as rotulo,
      count(*)::integer as quantidade
    from ultima_classificacao uc
    join public.classificacao_risco_itens i
      on i.classificacao_id = uc.id
    where i.fator_codigo <> 'g2_imc'
    group by i.fator_titulo
    order by count(*) desc, i.fator_titulo
    limit 8
  ),
  exames_pendentes as (
    select count(*)::integer as quantidade
    from ativas a
    join public.config_exames_pre_natal ce
      on ce.ativo = true
     and ce.trimestre <= case
       when coalesce(a.ig_semanas, 0) <= 13 then 1
       when coalesce(a.ig_semanas, 0) <= 27 then 2
       else 3
     end
    where not exists (
      select 1
      from public.gestante_exames ge
      where ge.gestante_id = a.id
        and ge.codigo = ce.codigo
        and ge.status in ('realizado', 'nao_se_aplica')
    )
  ),
  dtpa_pendente as (
    select count(*)::integer as quantidade
    from ativas a
    where coalesce(a.ig_semanas, 0) >= 20
      and not exists (
        select 1
        from public.gestante_vacinas gv
        where gv.gestante_id = a.id
          and gv.codigo = 'dtpa'
          and gv.status = 'realizada'
      )
  )
  select jsonb_build_object(
    'escopo', v_escopo,
    'titulo', case
      when v_escopo = 'ubs' then coalesce(v_ubs_nome, 'Todas as UBS')
      else 'Gestantes de ' || coalesce(v_nome_profissional, 'profissional')
    end,
    'atualizadoEm', now(),
    'resumo', jsonb_build_object(
      'total', r.total,
      'ativas', r.ativas,
      'altas', r.altas,
      'altoRisco', r.alto_risco,
      'medioRisco', r.medio_risco,
      'habitual', r.habitual,
      'captacaoPrecoce', r.captacao_precoce,
      'captacaoTardia', r.captacao_tardia,
      'captacaoSemDados', r.captacao_sem_dados,
      'acompanhamentoAtrasado', r.acompanhamento_atrasado,
      'examesPendentes', ep.quantidade,
      'dtpaPendente', dp.quantidade
    ),
    'captacao', jsonb_build_array(
      jsonb_build_object('rotulo', 'Precoce (≤12 sem)', 'quantidade', r.captacao_precoce),
      jsonb_build_object('rotulo', 'Tardia (>12 sem)', 'quantidade', r.captacao_tardia),
      jsonb_build_object('rotulo', 'Sem dados', 'quantidade', r.captacao_sem_dados)
    ),
    'consultas', coalesce((
      select jsonb_agg(jsonb_build_object('rotulo', rotulo, 'quantidade', quantidade) order by ordem)
      from consulta_categorias
    ), '[]'::jsonb),
    'riscos', coalesce((
      select jsonb_agg(jsonb_build_object('rotulo', rotulo, 'quantidade', quantidade) order by ordem)
      from risco_categorias
    ), '[]'::jsonb),
    'trimestres', coalesce((
      select jsonb_agg(jsonb_build_object('rotulo', rotulo, 'quantidade', quantidade) order by ordem)
      from trimestres
    ), '[]'::jsonb),
    'microareas', coalesce((
      select jsonb_agg(jsonb_build_object('rotulo', rotulo, 'quantidade', quantidade) order by quantidade desc, rotulo)
      from microareas_privadas
    ), '[]'::jsonb),
    'fatoresRisco', coalesce((
      select jsonb_agg(jsonb_build_object('rotulo', rotulo, 'quantidade', quantidade) order by quantidade desc, rotulo)
      from fatores
    ), '[]'::jsonb),
    'avisos', jsonb_build_array(
      jsonb_build_object('tipo', 'alto_risco', 'rotulo', 'Gestantes em alto risco', 'quantidade', r.alto_risco),
      jsonb_build_object('tipo', 'atraso', 'rotulo', 'Acompanhamento possivelmente atrasado', 'quantidade', r.acompanhamento_atrasado),
      jsonb_build_object('tipo', 'exames', 'rotulo', 'Exames previstos ainda pendentes', 'quantidade', ep.quantidade),
      jsonb_build_object('tipo', 'vacina', 'rotulo', 'dTpa pendente entre gestantes elegíveis', 'quantidade', dp.quantidade)
    )
  )
  into v_resultado
  from resumo r
  cross join exames_pendentes ep
  cross join dtpa_pendente dp;

  return coalesce(v_resultado, '{}'::jsonb);
end
$$;

revoke all
on function private.obter_indicadores_v18(uuid, text)
from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
