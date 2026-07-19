select
  count(*) filter (where excluida_em is null) as ativas_no_sistema,
  count(*) filter (where excluida_em is not null) as na_lixeira
from public.pec_gestantes;

select
  id,
  codigo,
  excluida_em,
  exclusao_definitiva_prevista_em,
  profissional_responsavel_id
from public.pec_gestantes
where excluida_em is not null
order by exclusao_definitiva_prevista_em;

select
  exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) as cron_habilitado;
