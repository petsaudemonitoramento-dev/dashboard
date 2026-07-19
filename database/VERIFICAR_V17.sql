select grupo, count(*) as itens, sum(pontos) as soma_pontos_catalogo
from public.config_fatores_risco_gestacional
where ativo = true
  and versao = 'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'
group by grupo
order by grupo;

select
  count(*) as classificacoes,
  count(*) filter (where classificacao = 'Risco Habitual') as habitual,
  count(*) filter (where classificacao = 'Médio Risco') as medio,
  count(*) filter (where classificacao = 'Alto Risco') as alto
from public.classificacoes_risco_gestacional;
