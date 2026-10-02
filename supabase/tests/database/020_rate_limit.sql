begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select ok(
  private.consumir_rate_limit_v30(
    'ci-scope',
    repeat('a', 64),
    2,
    60
  ),
  'primeira chamada é permitida'
);

select ok(
  private.consumir_rate_limit_v30(
    'ci-scope',
    repeat('a', 64),
    2,
    60
  ),
  'segunda chamada dentro do limite é permitida'
);

select ok(
  not private.consumir_rate_limit_v30(
    'ci-scope',
    repeat('a', 64),
    2,
    60
  ),
  'terceira chamada excede o limite'
);

select ok(
  not private.consumir_rate_limit_v30(
    'x',
    repeat('a', 64),
    2,
    60
  ),
  'scope inválido é rejeitado'
);

select ok(
  not private.consumir_rate_limit_v30(
    'ci-scope-2',
    'hash-curto',
    2,
    60
  ),
  'hash inválido é rejeitado'
);

select * from finish();

rollback;
