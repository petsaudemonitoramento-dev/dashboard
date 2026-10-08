begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select ok(
  not has_table_privilege(
    'anon',
    'public.visitas_acs_v21',
    'SELECT'
  ),
  'anon não lê tabela legada de visitas ACS'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.visitas_acs_v21',
    'SELECT'
  ),
  'authenticated não lê visitas ACS por Data API'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.visitas_acs_v21',
    'INSERT'
  ),
  'authenticated não insere visita ACS pela Data API'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.visitas_acs_v21',
    'UPDATE'
  ),
  'authenticated não altera visita ACS pela Data API'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.visitas_acs_v21',
    'DELETE'
  ),
  'authenticated não remove visita ACS pela Data API'
);

select * from finish();

rollback;
