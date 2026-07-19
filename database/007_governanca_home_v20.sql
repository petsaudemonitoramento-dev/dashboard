-- =========================================================
-- V20 — Governança de perfis, início, avisos e lixeira privada
-- =========================================================
-- Os valores do enum são adicionados antes da transação porque
-- novos valores de enum só devem ser usados após o commit.

alter type public.perfil_usuario
  add value if not exists 'aluno';

alter type public.perfil_usuario
  add value if not exists 'acs';

begin;

alter table public.microareas
  add column if not exists nome text;

alter table public.perfis
  add column if not exists data_nascimento date,
  add column if not exists cadastro_completo boolean not null default false,
  add column if not exists aprovacao_status text not null default 'pendente',
  add column if not exists perfil_solicitado text,
  add column if not exists ubs_solicitada_id uuid references public.ubs(id),
  add column if not exists origem_cadastro text not null default 'administrador',
  add column if not exists solicitado_em timestamptz not null default now(),
  add column if not exists aprovado_em timestamptz,
  add column if not exists aprovado_por uuid references auth.users(id),
  add column if not exists perfil_excluido_em timestamptz,
  add column if not exists perfil_excluido_por uuid references auth.users(id),
  add column if not exists ultimo_acesso_em timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'perfis_aprovacao_status_check'
      and conrelid = 'public.perfis'::regclass
  ) then
    alter table public.perfis
      add constraint perfis_aprovacao_status_check
      check (
        aprovacao_status in (
          'pendente',
          'aprovado',
          'rejeitado',
          'desativado'
        )
      );
  end if;
end
$$;

-- Perfis que já existiam antes da V20 permanecem liberados.
update public.perfis
set
  cadastro_completo = true,
  aprovacao_status = 'aprovado',
  perfil_solicitado = coalesce(perfil_solicitado, perfil::text),
  ubs_solicitada_id = coalesce(ubs_solicitada_id, ubs_id),
  aprovado_em = coalesce(aprovado_em, now()),
  origem_cadastro = coalesce(nullif(origem_cadastro, ''), 'legado')
where perfil_excluido_em is null;

create index if not exists perfis_aprovacao_idx
  on public.perfis(aprovacao_status, ubs_solicitada_id);

create index if not exists perfis_aniversario_idx
  on public.perfis(
    extract(month from data_nascimento),
    extract(day from data_nascimento)
  )
  where data_nascimento is not null
    and perfil_excluido_em is null;

create table if not exists public.avisos_ubs (
  id uuid primary key default gen_random_uuid(),
  ubs_id uuid references public.ubs(id),
  titulo text not null,
  mensagem text not null,
  tipo text not null default 'informativo'
    check (tipo in ('informativo', 'alerta', 'sucesso')),
  criado_por uuid not null references auth.users(id),
  publicado_em timestamptz not null default now(),
  expira_em timestamptz,
  removido_em timestamptz,
  removido_por uuid references auth.users(id)
);

create index if not exists avisos_ubs_validos_idx
  on public.avisos_ubs(ubs_id, publicado_em desc)
  where removido_em is null;

alter table public.avisos_ubs enable row level security;
revoke all on public.avisos_ubs from anon, authenticated;

create table if not exists private.auditoria_perfis_v20 (
  id bigint generated always as identity primary key,
  administrador_id uuid references auth.users(id),
  perfil_alvo_id uuid,
  acao text not null,
  antes jsonb,
  depois jsonb,
  criado_em timestamptz not null default now()
);

create table if not exists private.auditoria_avisos_v20 (
  id bigint generated always as identity primary key,
  aviso_id uuid,
  usuario_id uuid references auth.users(id),
  acao text not null,
  metadados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

revoke all on private.auditoria_perfis_v20
from public, anon, authenticated;

revoke all on private.auditoria_avisos_v20
from public, anon, authenticated;

create or replace function private.usuario_admin_v20(
  p_usuario_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.perfis p
    where p.id = p_usuario_id
      and p.perfil::text = 'administrador'
      and p.cadastro_completo = true
      and p.aprovacao_status = 'aprovado'
      and p.status = 'ativo'
      and p.ativo = true
      and p.perfil_excluido_em is null
  )
$$;

revoke all on function private.usuario_admin_v20(uuid)
from public, anon, authenticated;

-- Reforça a função usada pelas políticas existentes.
create or replace function security.usuario_eh_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.perfis p
    where p.id = auth.uid()
      and p.perfil::text = 'administrador'
      and p.cadastro_completo = true
      and p.aprovacao_status = 'aprovado'
      and p.status = 'ativo'
      and p.ativo = true
      and p.perfil_excluido_em is null
  )
$$;

create or replace function security.usuario_ubs_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.ubs_id
  from public.perfis p
  where p.id = auth.uid()
    and p.cadastro_completo = true
    and p.aprovacao_status = 'aprovado'
    and p.status = 'ativo'
    and p.ativo = true
    and p.perfil_excluido_em is null
  limit 1
$$;

grant execute on function security.usuario_eh_admin()
to authenticated;

grant execute on function security.usuario_ubs_id()
to authenticated;

-- A lixeira passa a ser estritamente pessoal:
-- somente quem moveu a gestante para a lixeira pode vê-la,
-- restaurá-la ou antecipar sua exclusão.
create or replace function private.usuario_pode_operar_lixeira_v20(
  p_usuario_id uuid,
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
    join public.perfis p on p.id = p_usuario_id
    where g.id = p_gestante_id
      and g.excluida_em is not null
      and g.excluida_por = p_usuario_id
      and p.cadastro_completo = true
      and p.aprovacao_status = 'aprovado'
      and p.status = 'ativo'
      and p.ativo = true
      and p.perfil_excluido_em is null
  )
$$;

revoke all on function private.usuario_pode_operar_lixeira_v20(uuid, uuid)
from public, anon, authenticated;

create or replace function private.listar_lixeira_gestantes_v19(
  p_usuario_id uuid,
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
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_perfil text;
  v_ubs_id uuid;
  v_ativo boolean;
  v_pode_ver_identidade boolean := false;
  v_total integer := 0;
begin
  perform private.esvaziar_lixeira_v19();

  select
    p.perfil::text,
    p.ubs_id,
    (
      p.ativo
      and p.status = 'ativo'
      and p.cadastro_completo
      and p.aprovacao_status = 'aprovado'
      and p.perfil_excluido_em is null
    )
  into v_perfil, v_ubs_id, v_ativo
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

  select count(*)::integer into v_total
  from public.pec_gestantes g
  where g.excluida_em is not null
    and g.excluida_por = p_usuario_id;

  if p_exibir_identidade and v_pode_ver_identidade and v_total > 0 then
    insert into private.acessos_identidade_gestantes (
      usuario_id,
      ubs_id,
      perfil,
      finalidade,
      total_registros
    ) values (
      p_usuario_id,
      v_ubs_id,
      v_perfil,
      'visualizacao_lixeira_pessoal_v20',
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
    g.excluida_em,
    coalesce(
      g.exclusao_definitiva_prevista_em,
      g.excluida_em + interval '10 days'
    ),
    g.exclusao_motivo
  from public.pec_gestantes g
  join public.ubs u on u.id = g.ubs_id
  left join public.microareas m on m.id = g.microarea_id
  left join private.identidades_gestantes i on i.gestante_id = g.id
  where g.excluida_em is not null
    and g.excluida_por = p_usuario_id
  order by coalesce(
    g.exclusao_definitiva_prevista_em,
    g.excluida_em + interval '10 days'
  ) asc;
end
$$;

create or replace function private.restaurar_gestante_v19(
  p_usuario_id uuid,
  p_gestante_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_gestante public.pec_gestantes%rowtype;
begin
  if not private.usuario_pode_operar_lixeira_v20(
    p_usuario_id,
    p_gestante_id
  ) then
    raise exception 'Somente quem enviou a gestante para a lixeira pode restaurá-la';
  end if;

  select * into v_gestante
  from public.pec_gestantes
  where id = p_gestante_id
  for update;

  update public.pec_gestantes
  set
    excluida_em = null,
    excluida_por = null,
    exclusao_motivo = null,
    exclusao_definitiva_prevista_em = null,
    atualizado_em = now()
  where id = p_gestante_id;

  insert into private.auditoria_exclusoes_gestantes (
    gestante_hash,
    usuario_id,
    ubs_id,
    acao,
    metadados
  )
  values (
    private.hash_gestante_auditoria_v19(p_gestante_id),
    p_usuario_id,
    v_gestante.ubs_id,
    'restaurar',
    jsonb_build_object('restaurada_em', now(), 'regra', 'lixeira_pessoal_v20')
  );

  return jsonb_build_object('ok', true);
end
$$;

create or replace function private.excluir_gestante_definitivamente_v19(
  p_usuario_id uuid,
  p_gestante_id uuid,
  p_confirmado boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_gestante public.pec_gestantes%rowtype;
  v_hash text;
begin
  if not coalesce(p_confirmado, false) then
    raise exception 'Confirmação da exclusão definitiva ausente';
  end if;

  if not private.usuario_pode_operar_lixeira_v20(
    p_usuario_id,
    p_gestante_id
  ) then
    raise exception 'Somente quem enviou a gestante para a lixeira pode excluí-la definitivamente';
  end if;

  select * into v_gestante
  from public.pec_gestantes
  where id = p_gestante_id
  for update;

  if not found then
    raise exception 'Gestante não encontrada';
  end if;

  v_hash := private.hash_gestante_auditoria_v19(p_gestante_id);

  insert into private.auditoria_exclusoes_gestantes (
    gestante_hash,
    usuario_id,
    ubs_id,
    acao,
    motivo,
    metadados
  )
  values (
    v_hash,
    p_usuario_id,
    v_gestante.ubs_id,
    'excluir_definitivamente',
    v_gestante.exclusao_motivo,
    jsonb_build_object(
      'excluida_em', v_gestante.excluida_em,
      'exclusao_antecipada', true,
      'regra', 'lixeira_pessoal_v20'
    )
  );

  delete from private.identidades_gestantes
  where gestante_id = p_gestante_id;

  delete from public.pec_gestantes
  where id = p_gestante_id;

  return jsonb_build_object('ok', true, 'deletedPermanently', true);
end
$$;

-- Dados compactos da página inicial.
create or replace function private.obter_inicio_v20(
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
  v_ubs_nome text;
  v_nome text;
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
    v_nome
  from public.perfis p
  left join public.ubs u on u.id = p.ubs_id
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
          v_perfil <> 'administrador'
          and g.ubs_id = v_ubs_id
          and g.profissional_responsavel_id = p_usuario_id
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
    'escopo', case
      when v_perfil = 'administrador' then 'UBS / gestão'
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

revoke all on function private.obter_inicio_v20(uuid)
from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
