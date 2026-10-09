-- Profissionais V30 pós-homologação - trilha clínica mínima e imutável
begin;

create table private.auditoria_eventos_clinicos_v30 (
  id bigint generated always as identity primary key,
  ator_id uuid,
  ator_banco text not null,
  acao text not null check (
    acao in (
      'insert',
      'update',
      'delete',
      'mover_lixeira',
      'restaurar_lixeira',
      'hard_delete',
      'aprovacao_profissional',
      'revogacao_profissional',
      'alteracao_estado_profissional'
    )
  ),
  recurso text not null check (
    recurso in (
      'gestante',
      'consulta',
      'exame',
      'vacina',
      'alta',
      'classificacao_risco',
      'importacao_pec',
      'perfil_profissional'
    )
  ),
  recurso_id uuid,
  gestante_hash text,
  detalhes jsonb not null default '{}'::jsonb,
  ocorrido_em timestamptz not null default clock_timestamp(),
  constraint auditoria_eventos_clinicos_v30_detalhes_objeto
    check (jsonb_typeof(detalhes) = 'object')
);

comment on table private.auditoria_eventos_clinicos_v30 is
  'Trilha append-only mínima. Não armazena payload, texto clínico ou identidade da gestante.';
comment on column private.auditoria_eventos_clinicos_v30.gestante_hash is
  'HMAC estável do UUID da gestante; evita copiar identidade clínica para a trilha.';
comment on column private.auditoria_eventos_clinicos_v30.detalhes is
  'Somente metadados operacionais allowlisted, nunca payload clínico.';

alter table private.auditoria_eventos_clinicos_v30
  enable row level security;

revoke all on table private.auditoria_eventos_clinicos_v30
  from public, anon, authenticated, service_role;
revoke all on sequence private.auditoria_eventos_clinicos_v30_id_seq
  from public, anon, authenticated, service_role;

create or replace function private.auditar_mutacao_clinica_v30()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linha jsonb;
  v_recurso text;
  v_recurso_id uuid;
  v_gestante_id uuid;
  v_acao text := pg_catalog.lower(TG_OP);
  v_detalhes jsonb := '{}'::jsonb;
  v_ator_banco text := pg_catalog.coalesce(
    pg_catalog.nullif(pg_catalog.current_setting('role', true), 'none'),
    session_user::text
  );
begin
  if TG_OP = 'DELETE' then
    v_linha := pg_catalog.to_jsonb(OLD);
  else
    v_linha := pg_catalog.to_jsonb(NEW);
  end if;

  v_recurso_id := pg_catalog.nullif(v_linha ->> 'id', '')::uuid;

  case TG_TABLE_NAME
    when 'pec_gestantes' then
      v_recurso := 'gestante';
      v_gestante_id := v_recurso_id;

      if TG_OP = 'UPDATE' then
        if OLD.excluida_em is null and NEW.excluida_em is not null then
          v_acao := 'mover_lixeira';
        elsif OLD.excluida_em is not null and NEW.excluida_em is null then
          v_acao := 'restaurar_lixeira';
        end if;
      elsif TG_OP = 'DELETE' then
        v_acao := 'hard_delete';
      end if;
    when 'gestante_consultas' then
      v_recurso := 'consulta';
      v_gestante_id := pg_catalog.nullif(v_linha ->> 'gestante_id', '')::uuid;
    when 'gestante_exames' then
      v_recurso := 'exame';
      v_gestante_id := pg_catalog.nullif(v_linha ->> 'gestante_id', '')::uuid;
    when 'gestante_vacinas' then
      v_recurso := 'vacina';
      v_gestante_id := pg_catalog.nullif(v_linha ->> 'gestante_id', '')::uuid;
    when 'gestante_altas' then
      v_recurso := 'alta';
      v_gestante_id := pg_catalog.nullif(v_linha ->> 'gestante_id', '')::uuid;
    when 'classificacoes_risco_gestacional' then
      v_recurso := 'classificacao_risco';
      v_gestante_id := pg_catalog.nullif(v_linha ->> 'gestante_id', '')::uuid;
    when 'importacoes_pec_resumo' then
      v_recurso := 'importacao_pec';

      if TG_OP = 'UPDATE' then
        v_detalhes := pg_catalog.jsonb_build_object(
          'status_anterior',
          pg_catalog.to_jsonb(OLD) ->> 'status',
          'status_atual',
          pg_catalog.to_jsonb(NEW) ->> 'status'
        );
      else
        v_detalhes := pg_catalog.jsonb_build_object(
          'status',
          v_linha ->> 'status'
        );
      end if;
    else
      raise exception 'AUDIT_RESOURCE_NOT_ALLOWED';
  end case;

  insert into private.auditoria_eventos_clinicos_v30 (
    ator_id,
    ator_banco,
    acao,
    recurso,
    recurso_id,
    gestante_hash,
    detalhes
  )
  values (
    auth.uid(),
    v_ator_banco,
    v_acao,
    v_recurso,
    v_recurso_id,
    case
      when v_gestante_id is null then null
      else private.hash_gestante_auditoria_v19(v_gestante_id)
    end,
    v_detalhes
  );

  if TG_OP = 'DELETE' then
    return OLD;
  end if;

  return NEW;
end
$$;

revoke all on function private.auditar_mutacao_clinica_v30()
  from public, anon, authenticated, service_role;

create or replace function private.auditar_estado_profissional_v30()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acao text;
  v_ator_banco text := pg_catalog.coalesce(
    pg_catalog.nullif(pg_catalog.current_setting('role', true), 'none'),
    session_user::text
  );
begin
  if OLD.aprovacao_status is not distinct from NEW.aprovacao_status
     and OLD.ativo is not distinct from NEW.ativo
     and OLD.perfil_excluido_em is not distinct from NEW.perfil_excluido_em
  then
    return NEW;
  end if;

  if NEW.aprovacao_status = 'aprovado'
     and OLD.aprovacao_status is distinct from NEW.aprovacao_status
  then
    v_acao := 'aprovacao_profissional';
  elsif NEW.aprovacao_status = 'desativado'
        or NEW.ativo is false
        or NEW.perfil_excluido_em is not null
  then
    v_acao := 'revogacao_profissional';
  else
    v_acao := 'alteracao_estado_profissional';
  end if;

  insert into private.auditoria_eventos_clinicos_v30 (
    ator_id,
    ator_banco,
    acao,
    recurso,
    recurso_id,
    detalhes
  )
  values (
    auth.uid(),
    v_ator_banco,
    v_acao,
    'perfil_profissional',
    NEW.id,
    pg_catalog.jsonb_build_object(
      'status_anterior', OLD.aprovacao_status,
      'status_atual', NEW.aprovacao_status,
      'ativo_anterior', OLD.ativo,
      'ativo_atual', NEW.ativo
    )
  );

  return NEW;
end
$$;

revoke all on function private.auditar_estado_profissional_v30()
  from public, anon, authenticated, service_role;

create or replace function private.minimizar_historico_clinico_v30()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  NEW.antes := null;
  NEW.depois := null;
  return NEW;
end
$$;

create or replace function private.minimizar_historico_classificacao_v30()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  NEW.payload := null;
  return NEW;
end
$$;

revoke all on function private.minimizar_historico_clinico_v30()
  from public, anon, authenticated, service_role;
revoke all on function private.minimizar_historico_classificacao_v30()
  from public, anon, authenticated, service_role;

do $triggers$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'pec_gestantes',
    'gestante_consultas',
    'gestante_exames',
    'gestante_vacinas',
    'gestante_altas',
    'classificacoes_risco_gestacional',
    'importacoes_pec_resumo'
  ]
  loop
    execute pg_catalog.format(
      'drop trigger if exists trg_auditoria_clinica_v30 on public.%I',
      v_tabela
    );
    execute pg_catalog.format(
      'create trigger trg_auditoria_clinica_v30
       after insert or update or delete on public.%I
       for each row execute function private.auditar_mutacao_clinica_v30()',
      v_tabela
    );
  end loop;
end
$triggers$;

drop trigger if exists trg_auditoria_estado_profissional_v30
  on public.perfis;
create trigger trg_auditoria_estado_profissional_v30
after update of aprovacao_status, ativo, perfil_excluido_em
on public.perfis
for each row
execute function private.auditar_estado_profissional_v30();

drop trigger if exists trg_minimizar_historico_clinico_v30
  on private.historico_clinico_gestantes;
create trigger trg_minimizar_historico_clinico_v30
before insert on private.historico_clinico_gestantes
for each row
execute function private.minimizar_historico_clinico_v30();

drop trigger if exists trg_minimizar_historico_classificacao_v30
  on private.historico_classificacoes_risco;
create trigger trg_minimizar_historico_classificacao_v30
before insert on private.historico_classificacoes_risco
for each row
execute function private.minimizar_historico_classificacao_v30();

create trigger auditoria_eventos_clinicos_v30_append_only
before update or delete on private.auditoria_eventos_clinicos_v30
for each row
execute function private.bloquear_mutacao_auditoria_v22();

create trigger auditoria_eventos_clinicos_v30_no_truncate
before truncate on private.auditoria_eventos_clinicos_v30
for each statement
execute function private.bloquear_mutacao_auditoria_v22();

commit;