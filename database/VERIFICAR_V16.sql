select
  (select count(*) from public.config_exames_pre_natal where ativo) as exames_configurados,
  (select count(*) from public.config_vacinas_gestante where ativo) as vacinas_configuradas,
  (select count(*) from public.gestante_consultas) as consultas_registradas,
  (select count(*) from public.gestante_exames) as exames_registrados,
  (select count(*) from public.gestante_vacinas) as vacinas_registradas,
  (select count(*) from public.gestante_altas) as altas_registradas;

select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'pec_gestantes'
  and column_name in (
    'inicio_pre_natal',
    'situacao_acompanhamento',
    'alta_ativa',
    'bloqueios_manuais',
    'fontes_campos'
  )
order by column_name;
