-- Profissionais V30.6 - retenção do rate limiter
begin;

create index if not exists rate_limits_v30_scope_updated_idx
on private.rate_limits_v30 (scope, atualizado_em);

create or replace function private.consumir_rate_limit_v30(
  p_scope text,
  p_actor_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_hits integer;
  v_now timestamptz := now();
  v_window interval;
begin
  if p_scope is null
     or length(p_scope) < 2
     or length(p_scope) > 80
     or p_actor_hash is null
     or p_actor_hash !~ '^[0-9a-f]{64}$'
     or p_limit < 1
     or p_limit > 10000
     or p_window_seconds < 1
     or p_window_seconds > 86400
  then
    return false;
  end if;

  v_window := make_interval(secs => p_window_seconds);

  -- A maior janela aceita é 24h. Dois dias preservam margem suficiente
  -- para diagnóstico sem permitir crescimento indefinido da tabela.
  delete from private.rate_limits_v30
  where scope = p_scope
    and atualizado_em < v_now - interval '2 days';

  insert into private.rate_limits_v30 (
    scope,
    actor_hash,
    window_started_at,
    hits,
    atualizado_em
  )
  values (
    p_scope,
    p_actor_hash,
    v_now,
    1,
    v_now
  )
  on conflict (scope, actor_hash)
  do update set
    hits = case
      when private.rate_limits_v30.window_started_at
        <= v_now - v_window
      then 1
      else private.rate_limits_v30.hits + 1
    end,
    window_started_at = case
      when private.rate_limits_v30.window_started_at
        <= v_now - v_window
      then v_now
      else private.rate_limits_v30.window_started_at
    end,
    atualizado_em = v_now
  returning hits into v_hits;

  return v_hits <= p_limit;
end
$$;

revoke all on function private.consumir_rate_limit_v30(
  text,
  text,
  integer,
  integer
)
from public, anon, authenticated, service_role;

commit;
