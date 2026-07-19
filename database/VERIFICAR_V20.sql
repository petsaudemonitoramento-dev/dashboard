-- V20 — verificações rápidas

-- 1. Perfis e situação de aprovação
select
  p.nome_completo,
  p.email,
  p.perfil::text as perfil_atual,
  p.perfil_solicitado,
  p.aprovacao_status,
  p.cadastro_completo,
  p.ativo,
  u.nome as ubs_atual,
  us.nome as ubs_solicitada
from public.perfis p
left join public.ubs u on u.id = p.ubs_id
left join public.ubs us on us.id = p.ubs_solicitada_id
order by
  case when p.aprovacao_status = 'pendente' then 0 else 1 end,
  p.nome_completo;

-- 2. Avisos ativos por UBS
select
  a.titulo,
  a.tipo,
  u.nome as ubs,
  a.publicado_em,
  a.expira_em
from public.avisos_ubs a
left join public.ubs u on u.id = a.ubs_id
where a.removido_em is null
order by a.publicado_em desc;

-- 3. Confirmação de que a lixeira é separada por quem excluiu
select
  g.excluida_por,
  p.nome_completo as profissional,
  count(*) as itens_na_lixeira
from public.pec_gestantes g
left join public.perfis p on p.id = g.excluida_por
where g.excluida_em is not null
group by g.excluida_por, p.nome_completo
order by itens_na_lixeira desc;

-- 4. Valores disponíveis para perfil
select e.enumlabel
from pg_type t
join pg_enum e on e.enumtypid = t.oid
where t.typname = 'perfil_usuario'
order by e.enumsortorder;
