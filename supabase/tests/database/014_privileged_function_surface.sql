begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.prosecdef = true
      and has_function_privilege(
        'anon',
        p.oid,
        'EXECUTE'
      )
  ),
  'anon não executa SECURITY DEFINER do schema private'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.prosecdef = true
      and has_function_privilege(
        'authenticated',
        p.oid,
        'EXECUTE'
      )
  ),
  'authenticated não executa SECURITY DEFINER internos do schema private'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('private', 'security', 'public')
      and p.prosecdef = true
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) config
        where config like 'search_path=%'
      )
  ),
  'toda SECURITY DEFINER relevante possui search_path explícito'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and has_function_privilege(
        'anon',
        p.oid,
        'EXECUTE'
      )
  ),
  'anon não executa SECURITY DEFINER exposta em public'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and has_function_privilege(
        'authenticated',
        p.oid,
        'EXECUTE'
      )
      and p.proname not like 'profissionais_%_v30'
  ),
  'authenticated só executa SECURITY DEFINER públicas da API profissional V30'
);

select * from finish();

rollback;
