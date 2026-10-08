begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

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

select ok(
  not private.consumir_rate_limit_v30(
    'ci-scope-2',
    repeat('z', 64),
    2,
    60
  ),
  'hash com caracteres fora de hexadecimal é rejeitado'
);

insert into private.rate_limits_v30 (
  scope,
  actor_hash,
  window_started_at,
  hits,
  atualizado_em
)
values (
  'ci-cleanup',
  repeat('b', 64),
  now() - interval '3 days',
  1,
  now() - interval '3 days'
);

select ok(
  private.consumir_rate_limit_v30(
    'ci-cleanup',
    repeat('c', 64),
    2,
    60
  ),
  'nova chamada permanece permitida durante a limpeza'
);

select ok(
  not exists (
    select 1
    from private.rate_limits_v30
    where scope = 'ci-cleanup'
      and actor_hash = repeat('b', 64)
  ),
  'entrada expirada do mesmo scope é removida automaticamente'
);

select * from finish();

rollback;
