begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select has_table(
  'public',
  'ubs',
  'public.ubs deve existir'
);

select has_table(
  'public',
  'perfis',
  'public.perfis deve existir'
);

select has_table(
  'public',
  'pec_gestantes',
  'public.pec_gestantes deve existir'
);

select has_table(
  'private',
  'identidades_gestantes',
  'private.identidades_gestantes deve existir'
);

select ok(
  (
    select relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'pec_gestantes'
  ),
  'pec_gestantes deve ter RLS habilitado'
);

select ok(
  (
    select relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'perfis'
  ),
  'perfis deve ter RLS habilitado'
);

select has_function(
  'security',
  'usuario_pode_acessar_gestante_v18',
  array['uuid'],
  'função de autorização clínica deve existir'
);

select is(
  private.pii_key(),
  '0000000000000000000000000000000000000000000000000000000000000000',
  'CI deve usar somente a chave sintética'
);

select * from finish();

rollback;
