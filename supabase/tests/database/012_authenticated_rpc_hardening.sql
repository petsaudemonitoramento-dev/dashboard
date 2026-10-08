begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

select lives_ok(
  $test$
    select private.exigir_payload_pec_rpc_v30(
      'arquivo.csv',
      repeat('a', 64),
      1,
      '{}'::jsonb,
      '[{"linha":1,"raw":{},"canonical":{},"extras":{}}]'::jsonb,
      '[]'::jsonb
    )
  $test$,
  'validador interno aceita uma estrutura CSV válida'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '12000000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $test$
    select public.profissionais_salvar_gestante_clinica_v30(
      '{"profissional_responsavel_id":"12000000-0000-4000-8000-000000000002"}'::jsonb
    )
  $test$,
  'P0001',
  'Payload clínico contém campos não permitidos',
  'RPC clínica rejeita mass assignment de owner'
);

select throws_ok(
  $test$
    select public.profissionais_salvar_gestante_clinica_v30(
      jsonb_build_object(
        'consultas',
        (
          select jsonb_agg('{}'::jsonb)
          from generate_series(1, 301)
        )
      )
    )
  $test$,
  'P0001',
  'Consultas excedem o limite permitido',
  'RPC clínica aplica limite de consultas mesmo sem Route Handler'
);

select throws_ok(
  $test$
    select public.profissionais_salvar_classificacao_risco_v30(
      '{"profissional_responsavel_id":"12000000-0000-4000-8000-000000000002"}'::jsonb
    )
  $test$,
  'P0001',
  'Payload de risco contém campos não permitidos',
  'RPC de risco rejeita campo de ownership inesperado'
);

select throws_ok(
  $test$
    select public.profissionais_salvar_classificacao_risco_v30(
      jsonb_build_object(
        'itens',
        (
          select jsonb_agg('{}'::jsonb)
          from generate_series(1, 151)
        )
      )
    )
  $test$,
  'P0001',
  'Itens de risco excedem o limite permitido',
  'RPC de risco aplica limite de itens'
);

select throws_ok(
  $test$
    select public.profissionais_importar_pec_v30(
      'arquivo.xlsx',
      repeat('a', 64),
      1,
      '{}'::jsonb,
      '[{"linha":1,"raw":{},"canonical":{},"extras":{}}]'::jsonb,
      '[]'::jsonb
    )
  $test$,
  'P0001',
  'Nome de arquivo PEC inválido',
  'RPC PEC rejeita XLSX mesmo quando chamada diretamente'
);

select throws_ok(
  $test$
    select public.profissionais_importar_pec_v30(
      'arquivo.csv',
      'hash-invalido',
      1,
      '{}'::jsonb,
      '[{"linha":1,"raw":{},"canonical":{},"extras":{}}]'::jsonb,
      '[]'::jsonb
    )
  $test$,
  'P0001',
  'Hash do arquivo PEC inválido',
  'RPC PEC rejeita hash fora do formato'
);

select throws_ok(
  $test$
    select public.profissionais_importar_pec_v30(
      'arquivo.csv',
      repeat('a', 64),
      1,
      '{}'::jsonb,
      (
        select jsonb_agg(
          jsonb_build_object(
            'linha', value,
            'raw', '{}'::jsonb,
            'canonical', '{}'::jsonb,
            'extras', '{}'::jsonb
          )
        )
        from generate_series(1, 10001) as g(value)
      ),
      '[]'::jsonb
    )
  $test$,
  'P0001',
  'Linhas PEC inválidas ou acima do limite',
  'RPC PEC limita quantidade de linhas sem depender do parser HTTP'
);

select throws_ok(
  $test$
    select public.profissionais_importar_pec_v30(
      '../arquivo.csv',
      repeat('a', 64),
      1,
      '{}'::jsonb,
      '[{"linha":1,"raw":{},"canonical":{},"extras":{}}]'::jsonb,
      '[]'::jsonb
    )
  $test$,
  'P0001',
  'Nome de arquivo PEC inválido',
  'RPC PEC rejeita path traversal no nome'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.profissionais_salvar_gestante_clinica_v30(jsonb)',
    'EXECUTE'
  ),
  'anon não executa RPC clínica'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.profissionais_salvar_gestante_clinica_v30(jsonb)',
    'EXECUTE'
  ),
  'authenticated mantém acesso à RPC clínica protegida'
);

reset role;

select * from finish();

rollback;
