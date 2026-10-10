begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select ok(
  (select c.relrowsecurity
     from pg_class c
    where c.oid = 'public.perfis'::regclass),
  'perfis permanece com RLS habilitado'
);

select is(
  (select count(*)::integer
     from pg_policies
    where schemaname = 'public'
      and tablename = 'perfis'
      and policyname = 'perfis_proprio_select'),
  1,
  'policy original de leitura do próprio perfil permanece'
);

select ok(
  (select roles = array['authenticated'::name]
     from pg_policies
    where schemaname = 'public'
      and tablename = 'perfis'
      and policyname = 'perfis_proprio_select'),
  'policy segue limitada a authenticated'
);

select ok(
  (select cmd = 'SELECT'
     from pg_policies
    where schemaname = 'public'
      and tablename = 'perfis'
      and policyname = 'perfis_proprio_select'),
  'policy continua autorizando apenas SELECT'
);

select ok(
  (
    select
      pg_get_expr(p.polqual, p.polrelid) ~* 'select[[:space:]]+auth[.]uid[(][)]'
      and pg_get_expr(p.polqual, p.polrelid) ~* 'id[[:space:]]*='
    from pg_policy p
    where p.polrelid = 'public.perfis'::regclass
      and p.polname = 'perfis_proprio_select'
  ),
  'policy compara id com auth.uid() encapsulado em subselect'
);

select * from finish();

rollback;
