begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into public.pec_gestantes (id,codigo,ubs_id,dados_extras)
values
 ('39000000-0000-4000-8000-000000000001'::uuid,'CI-REAL-IND-390001',
  '00000000-0000-4000-8000-000000000101'::uuid, '{}'::jsonb),
 ('39000000-0000-4000-8000-000000000002'::uuid,'CI-DEMO-IND-390002',
  '00000000-0000-4000-8000-000000000101'::uuid,
  '{"ficticio":true,"ambiente":"homologacao","uso":"somente_demonstracao"}'::jsonb);

select is(
 (select count(*) from public.pec_gestantes where codigo in ('CI-REAL-IND-390001','CI-DEMO-IND-390002')),
 2::bigint, 'both synthetic and real test records exist at source'
);
select is(
 (select count(*) from analytics.vw_indicadores_base_v18 where ubs_id='00000000-0000-4000-8000-000000000101'::uuid),
 1::bigint, 'synthetic training patient is excluded from real analytical view'
);
select is(
 (select count(*) from analytics.vw_indicadores_base_v18 where ubs_id='00000000-0000-4000-8000-000000000101'::uuid and ativa=true),
 1::bigint, 'real patient remains represented'
);
select * from finish();
rollback;
