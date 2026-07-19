-- =========================================================
-- V21 — Cadastros, autorizações, avisos por público e painel ACS
-- =========================================================
begin;

alter table public.perfis
  add column if not exists microarea_id uuid references public.microareas(id);

create index if not exists perfis_microarea_v21_idx
  on public.perfis(ubs_id, microarea_id)
  where perfil_excluido_em is null;

alter table public.avisos_ubs
  add column if not exists publico text not null default 'todos';

update public.avisos_ubs
set publico = 'todos'
where publico is null
   or publico not in ('todos', 'profissionais', 'acs', 'gestao');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'avisos_ubs_publico_v21_check'
      and conrelid = 'public.avisos_ubs'::regclass
  ) then
    alter table public.avisos_ubs
      add constraint avisos_ubs_publico_v21_check
      check (publico in ('todos', 'profissionais', 'acs', 'gestao'));
  end if;
end
$$;

create table if not exists public.visitas_acs_v21 (
  id uuid primary key default gen_random_uuid(),
  gestante_id uuid not null references public.pec_gestantes(id) on delete cascade,
  acs_id uuid not null references auth.users(id),
  ubs_id uuid not null references public.ubs(id),
  microarea_id uuid not null references public.microareas(id),
  data_acao date not null default current_date,
  compareceu boolean not null default true,
  motivo_falta text,
  orientacoes text[] not null default '{}'::text[],
  sinais_alerta boolean not null default false,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  removido_em timestamptz,
  removido_por uuid references auth.users(id)
);

create index if not exists visitas_acs_v21_territorio_idx
  on public.visitas_acs_v21(
    ubs_id,
    microarea_id,
    data_acao desc
  )
  where removido_em is null;

create index if not exists visitas_acs_v21_gestante_idx
  on public.visitas_acs_v21(
    gestante_id,
    data_acao desc,
    criado_em desc
  )
  where removido_em is null;

alter table public.visitas_acs_v21 enable row level security;
revoke all on public.visitas_acs_v21 from anon, authenticated;

create table if not exists private.auditoria_visitas_acs_v21 (
  id bigint generated always as identity primary key,
  visita_id uuid,
  acs_id uuid references auth.users(id),
  gestante_hash text,
  acao text not null,
  antes jsonb,
  depois jsonb,
  criado_em timestamptz not null default now()
);

revoke all on private.auditoria_visitas_acs_v21
from public, anon, authenticated;

create or replace function private.normalizar_data_cadastro_v21(
  p_valor text
)
returns date
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v text := btrim(coalesce(p_valor, ''));
begin
  if v ~ '^\d{2}/\d{2}/\d{4}$' then
    return to_date(v, 'DD/MM/YYYY');
  end if;

  if v ~ '^\d{4}-\d{2}-\d{2}$' then
    return v::date;
  end if;

  return null;
exception
  when others then
    return null;
end
$$;

revoke all on function private.normalizar_data_cadastro_v21(text)
from public, anon, authenticated;

create or replace function private.obter_inicio_v21(
  p_usuario_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_perfil text;
  v_ubs_id uuid;
  v_microarea_id uuid;
  v_ubs_nome text;
  v_microarea_codigo text;
  v_nome text;
  v_resultado jsonb;
begin
  select
    p.perfil::text,
    p.ubs_id,
    p.microarea_id,
    u.nome,
    m.codigo,
    p.nome_completo
  into
    v_perfil,
    v_ubs_id,
    v_microarea_id,
    v_ubs_nome,
    v_microarea_codigo,
    v_nome
  from public.perfis p
  left join public.ubs u on u.id = p.ubs_id
  left join public.microareas m on m.id = p.microarea_id
  where p.id = p_usuario_id
    and p.cadastro_completo = true
    and p.aprovacao_status = 'aprovado'
    and p.status = 'ativo'
    and p.ativo = true
    and p.perfil_excluido_em is null
  limit 1;

  if not found then
    raise exception 'Perfil não aprovado';
  end if;

  with base as (
    select g.*
    from public.pec_gestantes g
    where g.excluida_em is null
      and (
        (
          v_perfil = 'administrador'
          and (v_ubs_id is null or g.ubs_id = v_ubs_id)
        )
        or (
          v_perfil in ('profissional_ubs', 'equipe_ubs')
          and g.ubs_id = v_ubs_id
          and g.profissional_responsavel_id = p_usuario_id
        )
        or (
          v_perfil = 'acs'
          and g.ubs_id = v_ubs_id
          and g.microarea_id = v_microarea_id
        )
        or (
          v_perfil = 'aluno'
          and g.ubs_id = v_ubs_id
        )
      )
  ),
  metricas as (
    select jsonb_build_object(
      'ativas', count(*) filter (where coalesce(alta_ativa, false) = false),
      'altoRisco', count(*) filter (
        where coalesce(alta_ativa, false) = false
          and lower(coalesce(risco_gestacional, '')) like '%alto%'
      ),
      'novasMes', count(*) filter (
        where criado_em >= date_trunc('month', current_date)
      ),
      'partosAltas', count(*) filter (
        where coalesce(alta_ativa, false) = true
          or data_parto is not null
      )
    ) as dados
    from base
  ),
  avisos as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'titulo', a.titulo,
          'mensagem', a.mensagem,
          'tipo', a.tipo,
          'publico', a.publico,
          'publicadoEm', a.publicado_em,
          'ubsId', a.ubs_id,
          'ubsNome', u.nome
        )
        order by a.publicado_em desc
      ),
      '[]'::jsonb
    ) as dados
    from (
      select *
      from public.avisos_ubs a
      where a.removido_em is null
        and (a.expira_em is null or a.expira_em > now())
        and (
          a.ubs_id is null
          or a.ubs_id = v_ubs_id
          or (v_perfil = 'administrador' and v_ubs_id is null)
        )
        and (
          v_perfil = 'administrador'
          or (v_perfil = 'aluno' and a.publico = 'todos')
          or (
            v_perfil in ('profissional_ubs', 'equipe_ubs')
            and a.publico in ('todos', 'profissionais')
          )
          or (
            v_perfil = 'acs'
            and a.publico in ('todos', 'acs')
          )
        )
      order by a.publicado_em desc
      limit 30
    ) a
    left join public.ubs u on u.id = a.ubs_id
  ),
  aniversarios as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'nome', x.nome_completo,
          'dia', x.dia,
          'ubsNome', x.ubs_nome,
          'hoje', x.dia = extract(day from current_date)::integer
        )
        order by x.dia, x.nome_completo
      ),
      '[]'::jsonb
    ) as dados
    from (
      select
        p.nome_completo,
        extract(day from p.data_nascimento)::integer as dia,
        u.nome as ubs_nome
      from public.perfis p
      left join public.ubs u on u.id = p.ubs_id
      where p.data_nascimento is not null
        and extract(month from p.data_nascimento)
          = extract(month from current_date)
        and p.cadastro_completo = true
        and p.aprovacao_status = 'aprovado'
        and p.status = 'ativo'
        and p.ativo = true
        and p.perfil_excluido_em is null
        and (
          (v_ubs_id is not null and p.ubs_id = v_ubs_id)
          or (v_perfil = 'administrador' and v_ubs_id is null)
        )
      order by extract(day from p.data_nascimento), p.nome_completo
      limit 100
    ) x
  )
  select jsonb_build_object(
    'nome', v_nome,
    'perfil', v_perfil,
    'ubsId', v_ubs_id,
    'ubsNome', v_ubs_nome,
    'microareaId', v_microarea_id,
    'microareaCodigo', v_microarea_codigo,
    'escopo', case
      when v_perfil = 'administrador' then 'UBS / gestão'
      when v_perfil = 'acs' then 'Território da microárea'
      when v_perfil = 'aluno' then 'Resumo agregado da UBS'
      else 'Minhas gestantes'
    end,
    'metricas', metricas.dados,
    'avisos', avisos.dados,
    'aniversariantes', aniversarios.dados
  )
  into v_resultado
  from metricas, avisos, aniversarios;

  return v_resultado;
end
$$;

revoke all on function private.obter_inicio_v21(uuid)
from public, anon, authenticated;

create or replace function private.obter_indicadores_v21(
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
  v_escopo text := lower(coalesce(p_escopo, 'ubs'));
  v_dados jsonb;
  v_microareas jsonb;
begin
  select p.perfil::text, p.ubs_id
  into v_perfil, v_ubs_id
  from public.perfis p
  where p.id = p_usuario_id
    and p.cadastro_completo = true
    and p.aprovacao_status = 'aprovado'
    and p.status = 'ativo'
    and p.ativo = true
    and p.perfil_excluido_em is null
  limit 1;

  if not found then
    raise exception 'Perfil não aprovado';
  end if;

  if v_perfil = 'aluno' then
    v_escopo := 'ubs';
  end if;

  v_dados := private.obter_indicadores_v18(p_usuario_id, v_escopo);

  if v_perfil = 'aluno' then
    v_dados := jsonb_set(
      jsonb_set(
        v_dados,
        '{microareas}',
        '[]'::jsonb,
        true
      ),
      '{fatoresRisco}',
      '[]'::jsonb,
      true
    );
    v_dados := jsonb_set(
      v_dados,
      '{titulo}',
      to_jsonb('Indicadores gerais não sensíveis'::text),
      true
    );
  elsif v_perfil = 'administrador' and v_escopo = 'ubs' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rotulo', x.rotulo,
          'quantidade', x.quantidade
        )
        order by x.quantidade desc, x.rotulo
      ),
      '[]'::jsonb
    )
    into v_microareas
    from (
      select
        coalesce(nullif(m.codigo, ''), 'Não informada') as rotulo,
        count(*)::integer as quantidade
      from public.pec_gestantes g
      left join public.microareas m on m.id = g.microarea_id
      where g.excluida_em is null
        and coalesce(g.alta_ativa, false) = false
        and (v_ubs_id is null or g.ubs_id = v_ubs_id)
      group by coalesce(nullif(m.codigo, ''), 'Não informada')
    ) x;

    v_dados := jsonb_set(
      v_dados,
      '{microareas}',
      v_microareas,
      true
    );
  end if;

  return v_dados;
end
$$;

revoke all on function private.obter_indicadores_v21(uuid, text)
from public, anon, authenticated;

create or replace function private.obter_painel_acs_v21(
  p_usuario_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_nome text;
  v_ubs_id uuid;
  v_ubs_nome text;
  v_microarea_id uuid;
  v_microarea_codigo text;
  v_total integer;
  v_resultado jsonb;
begin
  select
    p.nome_completo,
    p.ubs_id,
    u.nome,
    p.microarea_id,
    m.codigo
  into
    v_nome,
    v_ubs_id,
    v_ubs_nome,
    v_microarea_id,
    v_microarea_codigo
  from public.perfis p
  join public.ubs u on u.id = p.ubs_id
  join public.microareas m on m.id = p.microarea_id
  where p.id = p_usuario_id
    and p.perfil::text = 'acs'
    and p.cadastro_completo = true
    and p.aprovacao_status = 'aprovado'
    and p.status = 'ativo'
    and p.ativo = true
    and p.perfil_excluido_em is null
  limit 1;

  if not found then
    raise exception 'ACS sem UBS e microárea aprovadas';
  end if;

  select count(*)::integer
  into v_total
  from public.pec_gestantes g
  where g.ubs_id = v_ubs_id
    and g.microarea_id = v_microarea_id
    and g.excluida_em is null
    and coalesce(g.alta_ativa, false) = false;

  if v_total > 0 then
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
      'acs',
      'painel_territorial_acs_v21',
      v_total
    );
  end if;

  with ultimas as (
    select distinct on (v.gestante_id)
      v.gestante_id,
      v.id as visita_id,
      v.acs_id as visita_acs_id,
      v.data_acao,
      v.compareceu,
      v.sinais_alerta,
      v.atualizado_em
    from public.visitas_acs_v21 v
    where v.removido_em is null
      and v.ubs_id = v_ubs_id
      and v.microarea_id = v_microarea_id
    order by
      v.gestante_id,
      v.data_acao desc,
      v.criado_em desc
  ),
  gestantes as (
    select
      g.id,
      g.codigo,
      coalesce(
        nullif(private.descriptografar_texto(i.nome_enc), ''),
        'Nome não disponível'
      ) as nome,
      g.risco_gestacional,
      coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas) as ig_semanas,
      coalesce(g.dpp_dum, g.dpp_ecografia) as dpp,
      g.inicio_pre_natal,
      g.data_parto,
      case
        when u.visita_acs_id = p_usuario_id then u.visita_id
        else null
      end as visita_id,
      u.data_acao as ultima_visita,
      u.compareceu as ultima_compareceu,
      u.sinais_alerta as ultimo_alerta,
      case
        when u.data_acao is null then 9999
        else greatest(current_date - u.data_acao, 0)
      end as dias_sem_visita,
      (
        g.data_parto is not null
        and g.data_parto between current_date - 42 and current_date
        and (
          u.data_acao is null
          or u.data_acao < g.data_parto
        )
      ) as puerperio_sem_visita,
      (
        u.data_acao is null
        or u.data_acao <= current_date - 30
      ) as sem_visita_30d,
      (
        lower(coalesce(g.risco_gestacional, '')) like '%alto%'
      ) as alto_risco
    from public.pec_gestantes g
    left join private.identidades_gestantes i
      on i.gestante_id = g.id
    left join ultimas u
      on u.gestante_id = g.id
    where g.ubs_id = v_ubs_id
      and g.microarea_id = v_microarea_id
      and g.excluida_em is null
      and coalesce(g.alta_ativa, false) = false
  ),
  gestantes_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'codigo', g.codigo,
          'nome', g.nome,
          'risco', g.risco_gestacional,
          'igSemanas', g.ig_semanas,
          'dpp', g.dpp,
          'inicioPreNatal', g.inicio_pre_natal,
          'dataParto', g.data_parto,
          'visitaId', g.visita_id,
          'ultimaVisita', g.ultima_visita,
          'diasSemVisita', g.dias_sem_visita,
          'ultimaCompareceu', g.ultima_compareceu,
          'ultimoAlerta', g.ultimo_alerta,
          'puerperioSemVisita', g.puerperio_sem_visita,
          'semVisita30d', g.sem_visita_30d,
          'altoRisco', g.alto_risco,
          'prioridade', case
            when g.puerperio_sem_visita then 1
            when g.alto_risco then 2
            when g.sem_visita_30d then 3
            when g.inicio_pre_natal is null then 4
            else 5
          end,
          'alertas', jsonb_strip_nulls(
            jsonb_build_object(
              'puerperio', case when g.puerperio_sem_visita then 'Puerpério sem visita' end,
              'risco', case when g.alto_risco then 'Alto risco' end,
              'visita', case when g.sem_visita_30d then 'Sem visita há 30 dias ou mais' end,
              'inicioPn', case when g.inicio_pre_natal is null then 'Início do pré-natal não informado' end
            )
          )
        )
        order by
          case
            when g.puerperio_sem_visita then 1
            when g.alto_risco then 2
            when g.sem_visita_30d then 3
            when g.inicio_pre_natal is null then 4
            else 5
          end,
          g.nome
      ),
      '[]'::jsonb
    ) as dados
    from gestantes g
  ),
  metricas as (
    select jsonb_build_object(
      'gestantesTerritorio', count(*),
      'visitadas30Dias', count(*) filter (
        where ultima_visita >= current_date - 30
      ),
      'pendentes30Dias', count(*) filter (
        where sem_visita_30d
      ),
      'altoRisco', count(*) filter (
        where alto_risco
      ),
      'puerperioSemVisita', count(*) filter (
        where puerperio_sem_visita
      )
    ) as dados
    from gestantes
  ),
  acoes30 as (
    select jsonb_build_object(
      'visitas', count(*) filter (where compareceu),
      'buscasAtivas', count(*) filter (where not compareceu),
      'sinaisAlerta', count(*) filter (where sinais_alerta)
    ) as dados
    from public.visitas_acs_v21
    where ubs_id = v_ubs_id
      and microarea_id = v_microarea_id
      and removido_em is null
      and data_acao >= current_date - 30
  )
  select jsonb_build_object(
    'nome', v_nome,
    'ubsId', v_ubs_id,
    'ubsNome', v_ubs_nome,
    'microareaId', v_microarea_id,
    'microareaCodigo', v_microarea_codigo,
    'atualizadoEm', now(),
    'metricas', metricas.dados || acoes30.dados,
    'gestantes', gestantes_json.dados
  )
  into v_resultado
  from metricas, acoes30, gestantes_json;

  return v_resultado;
end
$$;

revoke all on function private.obter_painel_acs_v21(uuid)
from public, anon, authenticated;

create or replace function private.registrar_acao_acs_v21(
  p_usuario_id uuid,
  p_gestante_id uuid,
  p_tipo text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ubs_id uuid;
  v_microarea_id uuid;
  v_visita_id uuid;
  v_compareceu boolean;
  v_motivo text;
begin
  if p_tipo not in ('visita', 'nao_encontrada') then
    raise exception 'Tipo de ação inválido';
  end if;

  select p.ubs_id, p.microarea_id
  into v_ubs_id, v_microarea_id
  from public.perfis p
  where p.id = p_usuario_id
    and p.perfil::text = 'acs'
    and p.cadastro_completo = true
    and p.aprovacao_status = 'aprovado'
    and p.status = 'ativo'
    and p.ativo = true
    and p.perfil_excluido_em is null
  limit 1;

  if not found or v_ubs_id is null or v_microarea_id is null then
    raise exception 'ACS sem território aprovado';
  end if;

  if not exists (
    select 1
    from public.pec_gestantes g
    where g.id = p_gestante_id
      and g.ubs_id = v_ubs_id
      and g.microarea_id = v_microarea_id
      and g.excluida_em is null
      and coalesce(g.alta_ativa, false) = false
  ) then
    raise exception 'Gestante fora do território autorizado';
  end if;

  v_compareceu := p_tipo = 'visita';
  v_motivo := case
    when p_tipo = 'nao_encontrada' then 'Não encontrada no domicílio'
    else null
  end;

  insert into public.visitas_acs_v21 (
    gestante_id,
    acs_id,
    ubs_id,
    microarea_id,
    data_acao,
    compareceu,
    motivo_falta
  )
  values (
    p_gestante_id,
    p_usuario_id,
    v_ubs_id,
    v_microarea_id,
    current_date,
    v_compareceu,
    v_motivo
  )
  returning id into v_visita_id;

  insert into private.auditoria_visitas_acs_v21 (
    visita_id,
    acs_id,
    gestante_hash,
    acao,
    depois
  )
  values (
    v_visita_id,
    p_usuario_id,
    private.hash_gestante_auditoria_v19(p_gestante_id),
    p_tipo,
    jsonb_build_object(
      'data', current_date,
      'compareceu', v_compareceu,
      'motivo', v_motivo
    )
  );

  return jsonb_build_object(
    'ok', true,
    'visitaId', v_visita_id
  );
end
$$;

revoke all on function private.registrar_acao_acs_v21(uuid, uuid, text)
from public, anon, authenticated;

create or replace function private.complementar_acao_acs_v21(
  p_usuario_id uuid,
  p_visita_id uuid,
  p_dados jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_antes jsonb;
  v_depois jsonb;
  v_gestante_id uuid;
  v_data date;
begin
  select to_jsonb(v.*), v.gestante_id
  into v_antes, v_gestante_id
  from public.visitas_acs_v21 v
  where v.id = p_visita_id
    and v.acs_id = p_usuario_id
    and v.removido_em is null
  for update;

  if not found then
    raise exception 'Registro não encontrado ou sem autorização';
  end if;

  v_data := coalesce(
    private.normalizar_data_cadastro_v21(p_dados->>'data'),
    current_date
  );

  if v_data > current_date or v_data < current_date - 365 then
    raise exception 'Data da ação fora do período permitido';
  end if;

  update public.visitas_acs_v21
  set
    data_acao = v_data,
    motivo_falta = nullif(btrim(p_dados->>'motivo'), ''),
    orientacoes = coalesce(
      array(
        select jsonb_array_elements_text(
          coalesce(p_dados->'orientacoes', '[]'::jsonb)
        )
      ),
      '{}'::text[]
    ),
    sinais_alerta = coalesce(
      (p_dados->>'sinaisAlerta')::boolean,
      false
    ),
    observacao = nullif(left(btrim(p_dados->>'observacao'), 240), ''),
    atualizado_em = now()
  where id = p_visita_id
  returning jsonb_build_object(
    'id', id,
    'data_acao', data_acao,
    'compareceu', compareceu,
    'motivo_falta', motivo_falta,
    'orientacoes', orientacoes,
    'sinais_alerta', sinais_alerta,
    'observacao', observacao,
    'atualizado_em', atualizado_em
  )
  into v_depois;

  insert into private.auditoria_visitas_acs_v21 (
    visita_id,
    acs_id,
    gestante_hash,
    acao,
    antes,
    depois
  )
  values (
    p_visita_id,
    p_usuario_id,
    private.hash_gestante_auditoria_v19(v_gestante_id),
    'complementar',
    v_antes,
    v_depois
  );

  return jsonb_build_object('ok', true);
end
$$;

revoke all on function private.complementar_acao_acs_v21(uuid, uuid, jsonb)
from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
