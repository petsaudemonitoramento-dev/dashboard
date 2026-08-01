-- Idempotent non-personal seed for local/new-project validation.
BEGIN;

INSERT INTO public.ubs (
  id, nome, nome_abreviado, codigo_interno, cnes, municipio, uf,
  endereco, bairro, telefone, ativa
)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  'UBS Modelo Jardim',
  'UBS Modelo',
  'UBS-TESTE-01',
  NULL,
  'Município Fictício',
  'PB',
  NULL,
  NULL,
  NULL,
  true
)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_abreviado = EXCLUDED.nome_abreviado,
  codigo_interno = EXCLUDED.codigo_interno,
  municipio = EXCLUDED.municipio,
  uf = EXCLUDED.uf,
  ativa = true,
  updated_at = now();

INSERT INTO public.microareas (id, ubs_id, codigo, nome, descricao, ativa)
VALUES
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'MA-01',
    'Microárea Fictícia 01',
    'Território sintético para testes locais',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'MA-02',
    'Microárea Fictícia 02',
    'Território sintético para testes locais',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    'MA-03',
    'Microárea Fictícia 03',
    'Território sintético para testes locais',
    true
  )
ON CONFLICT (id) DO UPDATE SET
  ubs_id = EXCLUDED.ubs_id,
  codigo = EXCLUDED.codigo,
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  ativa = true,
  updated_at = now();

insert into public.config_exames_pre_natal
  (codigo, nome, trimestre, semana_inicio, semana_fim, condicao_aplicacao, ordem, versao_referencia)
values
  ('hemograma_t1', 'Hemograma completo', 1, null, 13, null, 10, 'Tabela de exames fornecida pela equipe'),
  ('tipagem_rh_t1', 'Tipagem sanguínea e fator Rh', 1, null, 13, null, 20, 'Tabela de exames fornecida pela equipe'),
  ('coombs_t1', 'Coombs indireto', 1, null, 13, 'Quando Rh negativo', 30, 'Tabela de exames fornecida pela equipe'),
  ('glicemia_t1', 'Glicemia em jejum', 1, null, 13, null, 40, 'Tabela de exames fornecida pela equipe'),
  ('sifilis_t1', 'Teste rápido de triagem para sífilis e/ou VDRL/RPR', 1, null, 13, null, 50, 'Tabela de exames fornecida pela equipe'),
  ('hiv_rapido_t1', 'Teste rápido diagnóstico anti-HIV', 1, null, 13, null, 60, 'Tabela de exames fornecida pela equipe'),
  ('hiv_t1', 'Anti-HIV', 1, null, 13, null, 70, 'Tabela de exames fornecida pela equipe'),
  ('toxoplasmose_t1', 'Toxoplasmose IgM e IgG', 1, null, 13, null, 80, 'Tabela de exames fornecida pela equipe'),
  ('hepatite_b_t1', 'Sorologia para hepatite B (HBsAg)', 1, null, 13, null, 90, 'Tabela de exames fornecida pela equipe'),
  ('hepatite_c_t1', 'Sorologia para hepatite C', 1, null, 13, null, 95, 'Campo complementar disponível na exportação PEC'),
  ('urina_t1', 'Urocultura + urina tipo 1 (sumário de urina)', 1, null, 13, null, 100, 'Tabela de exames fornecida pela equipe'),
  ('usg_obstetrica_t1', 'Ultrassonografia obstétrica', 1, null, 13, null, 110, 'Tabela de exames fornecida pela equipe'),
  ('citopatologico_t1', 'Citopatológico de colo de útero', 1, null, 13, 'Se necessário', 120, 'Tabela de exames fornecida pela equipe'),
  ('secrecao_vaginal_t1', 'Exame da secreção vaginal', 1, null, 13, 'Se houver indicação clínica', 130, 'Tabela de exames fornecida pela equipe'),
  ('parasitologico_t1', 'Parasitológico de fezes', 1, null, 13, 'Se houver indicação clínica', 140, 'Tabela de exames fornecida pela equipe'),
  ('avaliacao_odonto_t1', 'Avaliação odontológica', 1, null, 13, null, 150, 'Cadastro clínico anterior'),
  ('htlv_t1', 'HTLV', 1, null, 13, null, 160, 'Tabela de exames fornecida pela equipe'),

  ('ttog_t2', 'Teste de tolerância oral à glicose (TTOG) com 75 g', 2, 24, 28, 'Conforme glicemia e fatores de risco', 10, 'Tabela de exames fornecida pela equipe'),
  ('coombs_t2', 'Coombs indireto', 2, 14, 27, 'Quando Rh negativo', 20, 'Tabela de exames fornecida pela equipe'),

  ('hemograma_t3', 'Hemograma completo', 3, 28, 42, null, 10, 'Tabela de exames fornecida pela equipe'),
  ('glicemia_t3', 'Glicemia em jejum', 3, 28, 42, null, 20, 'Tabela de exames fornecida pela equipe'),
  ('coombs_t3', 'Coombs indireto', 3, 28, 42, 'Quando Rh negativo', 30, 'Tabela de exames fornecida pela equipe'),
  ('sifilis_t3', 'VDRL / teste para sífilis', 3, 28, 42, null, 40, 'Tabela de exames fornecida pela equipe'),
  ('hiv_t3', 'Anti-HIV', 3, 28, 42, null, 50, 'Tabela de exames fornecida pela equipe'),
  ('hepatite_b_t3', 'Sorologia para hepatite B (HBsAg)', 3, 28, 42, null, 60, 'Tabela de exames fornecida pela equipe'),
  ('toxoplasmose_t3', 'Repetir toxoplasmose', 3, 28, 42, 'Se IgG não reagente', 70, 'Tabela de exames fornecida pela equipe'),
  ('urina_t3', 'Urocultura + urina tipo 1 (sumário de urina)', 3, 28, 42, null, 80, 'Tabela de exames fornecida pela equipe')
on conflict (codigo)
do update set
  nome = excluded.nome,
  trimestre = excluded.trimestre,
  semana_inicio = excluded.semana_inicio,
  semana_fim = excluded.semana_fim,
  condicao_aplicacao = excluded.condicao_aplicacao,
  ordem = excluded.ordem,
  ativo = true,
  versao_referencia = excluded.versao_referencia,
  atualizado_em = now();

insert into public.config_vacinas_gestante
  (codigo, nome, semana_inicio, semana_fim, condicao_aplicacao, ordem, versao_referencia)
values
  ('hepatite_b', 'Hepatite B', null, 42, 'Conforme histórico vacinal', 10, 'Calendário Nacional de Vacinação 2026'),
  ('dt', 'dT (dupla adulto)', null, 42, 'Conforme histórico vacinal', 20, 'Calendário Nacional de Vacinação 2026'),
  ('dtpa', 'dTpa', 20, 42, 'Uma dose em cada gestação', 30, 'Calendário Nacional de Vacinação 2026'),
  ('influenza', 'Influenza', null, 42, 'Durante a gestação, conforme campanha/calendário', 40, 'Calendário Nacional de Vacinação 2026'),
  ('covid_19', 'Covid-19', null, 42, 'Conforme calendário vigente', 50, 'Calendário Nacional de Vacinação 2026'),
  ('vvsr', 'Vírus Sincicial Respiratório (VVSR)', 28, 42, 'Uma dose em cada gestação', 60, 'Calendário Nacional de Vacinação 2026')
on conflict (codigo)
do update set
  nome = excluded.nome,
  semana_inicio = excluded.semana_inicio,
  semana_fim = excluded.semana_fim,
  condicao_aplicacao = excluded.condicao_aplicacao,
  ordem = excluded.ordem,
  ativo = true,
  versao_referencia = excluded.versao_referencia,
  atualizado_em = now();

insert into public.config_fatores_risco_gestacional
  (codigo, grupo, grupo_titulo, titulo, pontos, grupo_ordem, ordem, versao)
values
  ('g1_idade_15','g1','Características individuais, condições socioeconômicas e familiares','≤ 15 anos',3,1,10,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g1_idade_40','g1','Características individuais, condições socioeconômicas e familiares','≥ 40 anos',3,1,20,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g1_nao_aceitacao','g1','Características individuais, condições socioeconômicas e familiares','Não aceitação da gravidez',3,1,30,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g1_violencia_domestica','g1','Características individuais, condições socioeconômicas e familiares','Indícios de violência doméstica',2,1,40,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g1_vulnerabilidade_territorial','g1','Características individuais, condições socioeconômicas e familiares','Situação de rua, indígena ou quilombola',2,1,50,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g1_sem_escolaridade','g1','Características individuais, condições socioeconômicas e familiares','Sem escolaridade',1,1,60,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g1_tabagista','g1','Características individuais, condições socioeconômicas e familiares','Tabagista ativa',2,1,70,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g1_raca_negra','g1','Características individuais, condições socioeconômicas e familiares','Raça negra',1,1,80,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_aids_hiv','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','AIDS/HIV',10,3,10,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_tireoide','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Alterações da tireoide (hipotireoidismo sem controle e hipertireoidismo)',10,3,20,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_diabetes_mellitus','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Diabetes Mellitus',10,3,30,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_endocrinopatias','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Endocrinopatias sem controle',10,3,40,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_cardiopatia','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Cardiopatia',10,3,50,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_cancer_materno','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Câncer materno',10,3,60,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_bariatrica','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Cirurgia bariátrica há menos de 6 meses',10,3,70,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_autoimunes','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Doenças autoimunes (colagenose)',10,3,80,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_psiquiatricas','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Doenças psiquiátricas (encaminhar ao CAPS)',5,3,90,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_renal_grave','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Doença renal grave',10,3,100,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_drogas','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Dependência de drogas (encaminhar ao CAPS)',10,3,110,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_neurologicas','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Epilepsia e doenças neurológicas graves de difícil controle',10,3,120,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_hepatites','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Hepatites (encaminhar ao infectologista)',5,3,130,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_has_controlada','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','HAS crônica controlada',5,3,140,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_has_complicada','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','HAS crônica complicada',10,3,150,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_ginecopatia','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Ginecopatia (miomatose > 7 cm, malformação uterina)',5,3,160,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_pneumopatia','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Pneumopatia grave de difícil controle',10,3,170,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_tuberculose','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Tuberculose em tratamento ou diagnosticada na gestação',10,3,180,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_trombofilia','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Trombofilia ou tromboembolia',10,3,190,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_teratogenicos','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Uso de medicações com potencial efeito teratogênico',5,3,200,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_varizes','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Varizes acentuadas',1,3,210,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_hematologicas','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Doenças hematológicas (PTI, anemia falciforme, PTT, coagulopatias, talassemias)',10,3,220,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g3_transplante','g3','Comorbidades prévias à gestação atual (doenças preexistentes)','Transplante',10,3,230,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g4_abortos_2','g4','Condições clínicas específicas e relacionadas às gestações prévias','2 abortamentos espontâneos consecutivos ou 3 não consecutivos',5,4,10,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g4_abortos_3','g4','Condições clínicas específicas e relacionadas às gestações prévias','3 ou mais abortamentos espontâneos consecutivos',10,4,20,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g4_prematuros','g4','Condições clínicas específicas e relacionadas às gestações prévias','Mais de um prematuro com menos de 36 semanas',10,4,30,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g4_obito_fetal','g4','Condições clínicas específicas e relacionadas às gestações prévias','Óbito fetal sem causa determinada',10,4,40,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g4_pre_eclampsia','g4','Condições clínicas específicas e relacionadas às gestações prévias','Pré-eclâmpsia ou pré-eclâmpsia superposta',10,4,50,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g4_eclampsia','g4','Condições clínicas específicas e relacionadas às gestações prévias','Eclâmpsia',10,4,60,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g4_hipertensao_gestacional','g4','Condições clínicas específicas e relacionadas às gestações prévias','Hipertensão gestacional',5,4,70,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g4_acretismo','g4','Condições clínicas específicas e relacionadas às gestações prévias','Acretismo placentário',7,4,80,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g4_dpp','g4','Condições clínicas específicas e relacionadas às gestações prévias','Descolamento prematuro de placenta',5,4,90,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g4_istmo_cervical','g4','Condições clínicas específicas e relacionadas às gestações prévias','Insuficiência istmocervical',10,4,100,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g4_rciu','g4','Condições clínicas específicas e relacionadas às gestações prévias','Restrição de crescimento intrauterino',2,4,110,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g4_malformacao_fetal','g4','Condições clínicas específicas e relacionadas às gestações prévias','História de malformação fetal complexa',2,4,120,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g4_isoimunizacao','g4','Condições clínicas específicas e relacionadas às gestações prévias','Isoimunização em gestação anterior',10,4,130,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g4_diabetes_gestacional','g4','Condições clínicas específicas e relacionadas às gestações prévias','Diabetes gestacional',2,4,140,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g4_psicose_puerperal','g4','Condições clínicas específicas e relacionadas às gestações prévias','Psicose puerperal',5,4,150,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g4_tromboembolia','g4','Condições clínicas específicas e relacionadas às gestações prévias','História de tromboembolia',10,4,160,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_ameaca_aborto','g5','Condições clínicas específicas e relacionadas à gestação atual','Ameaça de aborto — encaminhar urgência',2,5,10,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_acretismo','g5','Condições clínicas específicas e relacionadas à gestação atual','Acretismo placentário',10,5,20,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_placenta_previa','g5','Condições clínicas específicas e relacionadas à gestação atual','Placenta prévia após 28 semanas',10,5,30,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_anemia_grave','g5','Condições clínicas específicas e relacionadas à gestação atual','Anemia não responsiva ao tratamento e hemopatias',10,5,40,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_citologia_anormal','g5','Condições clínicas específicas e relacionadas à gestação atual','Citologia cervical anormal (LIEAG) — encaminhar para PTGI',3,5,50,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_tireoide','g5','Condições clínicas específicas e relacionadas à gestação atual','Doenças da tireoide diagnosticadas na gestação',10,5,60,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_diabetes_gestacional','g5','Condições clínicas específicas e relacionadas à gestação atual','Diabetes gestacional',10,5,70,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_doenca_hipertensiva','g5','Condições clínicas específicas e relacionadas à gestação atual','Doença hipertensiva na gestação',10,5,80,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_doppler_uterinas','g5','Condições clínicas específicas e relacionadas à gestação atual','Alteração no Doppler das artérias uterinas e/ou alto risco para pré-eclâmpsia',5,5,90,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_doenca_hemolitica','g5','Condições clínicas específicas e relacionadas à gestação atual','Doença hemolítica',10,5,100,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_gemelar','g5','Condições clínicas específicas e relacionadas à gestação atual','Gestação gemelar',10,5,110,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_isoimunizacao_rh','g5','Condições clínicas específicas e relacionadas à gestação atual','Isoimunização Rh',10,5,120,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_istmo_cervical','g5','Condições clínicas específicas e relacionadas à gestação atual','Insuficiência istmocervical',10,5,130,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_colo_curto','g5','Condições clínicas específicas e relacionadas à gestação atual','Colo curto no morfológico do 2º trimestre',10,5,140,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_malformacao_fetal','g5','Condições clínicas específicas e relacionadas à gestação atual','Malformação congênita fetal',10,5,150,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_neoplasia','g5','Condições clínicas específicas e relacionadas à gestação atual','Neoplasia ginecológica ou câncer diagnosticado na gestação',10,5,160,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_liquido_amniotico','g5','Condições clínicas específicas e relacionadas à gestação atual','Polidrâmnio ou oligodrâmnio',10,5,170,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_restricao_crescimento','g5','Condições clínicas específicas e relacionadas à gestação atual','Restrição de crescimento fetal intrauterino',10,5,180,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_toxoplasmose','g5','Condições clínicas específicas e relacionadas à gestação atual','Toxoplasmose',10,5,190,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_sifilis_grave','g5','Condições clínicas específicas e relacionadas à gestação atual','Sífilis terciária, alterações ultrassonográficas sugestivas de sífilis neonatal ou resistência ao tratamento',10,5,200,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_itu_repeticao','g5','Condições clínicas específicas e relacionadas à gestação atual','Infecção urinária de repetição (pielonefrite ou ITU 3 vezes ou mais)',10,5,210,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_hiv_htlv_hepatites','g5','Condições clínicas específicas e relacionadas à gestação atual','HIV, HTLV ou hepatites agudas',10,5,220,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_condiloma','g5','Condições clínicas específicas e relacionadas à gestação atual','Condiloma acuminado — encaminhar para PTGI',5,5,230,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_percentil_fetal','g5','Condições clínicas específicas e relacionadas à gestação atual','Feto com percentil > P90 (GIG) ou entre P3 e P10 com Doppler normal (PIG)',5,5,240,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_hepatopatias','g5','Condições clínicas específicas e relacionadas à gestação atual','Hepatopatias (colestase ou aumento das transaminases)',10,5,250,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'),
  ('g5_hanseniase','g5','Condições clínicas específicas e relacionadas à gestação atual','Hanseníase diagnosticada na gestação',10,5,260,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024')
on conflict (codigo) do update set
  grupo = excluded.grupo,
  grupo_titulo = excluded.grupo_titulo,
  titulo = excluded.titulo,
  pontos = excluded.pontos,
  grupo_ordem = excluded.grupo_ordem,
  ordem = excluded.ordem,
  versao = excluded.versao,
  ativo = true,
  atualizado_em = now();

COMMIT;
