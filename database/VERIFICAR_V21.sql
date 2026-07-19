-- Perfis pendentes e territórios atribuídos
select
  p.nome_completo,
  p.email,
  p.perfil::text as perfil,
  p.perfil_solicitado,
  p.aprovacao_status,
  u.nome as ubs,
  m.codigo as microarea
from public.perfis p
left join public.ubs u on u.id = p.ubs_id
left join public.microareas m on m.id = p.microarea_id
order by p.aprovacao_status, p.nome_completo;

-- Avisos por público
select
  a.titulo,
  a.publico,
  u.nome as ubs,
  a.publicado_em
from public.avisos_ubs a
left join public.ubs u on u.id = a.ubs_id
where a.removido_em is null
order by a.publicado_em desc;

-- Visitas ACS nos últimos 30 dias
select
  u.nome as ubs,
  m.codigo as microarea,
  count(*) as total_acoes,
  count(*) filter (where v.compareceu) as visitas,
  count(*) filter (where not v.compareceu) as buscas_ativas,
  count(*) filter (where v.sinais_alerta) as sinais_alerta
from public.visitas_acs_v21 v
join public.ubs u on u.id = v.ubs_id
join public.microareas m on m.id = v.microarea_id
where v.removido_em is null
  and v.data_acao >= current_date - 30
group by u.nome, m.codigo
order by u.nome, m.codigo;
