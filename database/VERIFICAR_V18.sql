-- Verifica o vínculo das gestantes aos profissionais responsáveis.
select
  p.email as profissional,
  u.nome as ubs,
  count(g.id) as gestantes_vinculadas
from public.perfis p
left join public.ubs u on u.id = p.ubs_id
left join public.pec_gestantes g
  on g.profissional_responsavel_id = p.id
group by p.email, u.nome
order by p.email;

-- Substitua pelo UUID do profissional para testar os dois escopos.
-- select private.obter_indicadores_v18('UUID_DO_PROFISSIONAL'::uuid, 'ubs');
-- select private.obter_indicadores_v18('UUID_DO_PROFISSIONAL'::uuid, 'profissional');
