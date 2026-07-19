begin;

create table if not exists public.config_fatores_risco_gestacional (
  codigo text primary key,
  grupo text not null check (grupo in ('g1','g3','g4','g5')),
  grupo_titulo text not null,
  titulo text not null,
  pontos integer not null check (pontos >= 0),
  grupo_ordem integer not null,
  ordem integer not null,
  versao text not null,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

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

create table if not exists public.classificacoes_risco_gestacional (
  id uuid primary key default gen_random_uuid(),
  gestante_id uuid not null references public.pec_gestantes(id) on delete cascade,
  instrumento_versao text not null,
  trimestre smallint not null check (trimestre between 1 and 3),
  peso_kg numeric(8,2),
  altura_cm numeric(8,2),
  imc numeric(8,2),
  faixa_imc text not null,
  pontos_individuais integer not null default 0,
  pontos_imc integer not null default 0,
  pontos_clinicos integer not null default 0,
  score_total integer not null default 0,
  classificacao text not null,
  conduta_sugerida text not null,
  observacao text,
  profissional_id uuid not null references auth.users(id),
  profissional_nome_snapshot text not null,
  perfil_snapshot text not null,
  ubs_origem_profissional_id uuid references public.ubs(id),
  ubs_origem_nome_snapshot text not null,
  ubs_atendimento_id uuid references public.ubs(id),
  ubs_atendimento_nome_snapshot text not null,
  realizada_em timestamptz not null default now(),
  status text not null default 'finalizada' check (status in ('finalizada','cancelada'))
);

create index if not exists classificacoes_risco_gestante_idx
  on public.classificacoes_risco_gestacional(gestante_id, realizada_em desc);

create table if not exists public.classificacao_risco_itens (
  id uuid primary key default gen_random_uuid(),
  classificacao_id uuid not null references public.classificacoes_risco_gestacional(id) on delete cascade,
  fator_codigo text not null,
  grupo text not null,
  grupo_titulo text not null,
  fator_titulo text not null,
  pontos integer not null,
  origem text not null default 'manual',
  detalhe_origem text,
  automatico boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (classificacao_id, fator_codigo)
);

create table if not exists private.historico_classificacoes_risco (
  id bigint generated always as identity primary key,
  classificacao_id uuid not null references public.classificacoes_risco_gestacional(id) on delete cascade,
  gestante_id uuid not null references public.pec_gestantes(id) on delete cascade,
  usuario_id uuid not null references auth.users(id),
  acao text not null,
  payload jsonb,
  criado_em timestamptz not null default now()
);

revoke all on private.historico_classificacoes_risco from public, anon, authenticated;

alter table public.config_fatores_risco_gestacional enable row level security;
alter table public.classificacoes_risco_gestacional enable row level security;
alter table public.classificacao_risco_itens enable row level security;

grant select on public.config_fatores_risco_gestacional to authenticated;
grant select on public.classificacoes_risco_gestacional to authenticated;
grant select on public.classificacao_risco_itens to authenticated;
grant all on public.config_fatores_risco_gestacional to service_role;
grant all on public.classificacoes_risco_gestacional to service_role;
grant all on public.classificacao_risco_itens to service_role;

drop policy if exists "catalogo risco autenticados" on public.config_fatores_risco_gestacional;
create policy "catalogo risco autenticados" on public.config_fatores_risco_gestacional
for select to authenticated using (ativo = true);

drop policy if exists "classificacoes da propria ubs" on public.classificacoes_risco_gestacional;
create policy "classificacoes da propria ubs" on public.classificacoes_risco_gestacional
for select to authenticated using (
  security.usuario_eh_admin()
  or exists (
    select 1 from public.pec_gestantes g
    where g.id = gestante_id and g.ubs_id = security.usuario_ubs_id()
  )
);

drop policy if exists "itens classificacoes da propria ubs" on public.classificacao_risco_itens;
create policy "itens classificacoes da propria ubs" on public.classificacao_risco_itens
for select to authenticated using (
  exists (
    select 1
    from public.classificacoes_risco_gestacional c
    join public.pec_gestantes g on g.id = c.gestante_id
    where c.id = classificacao_id
      and (security.usuario_eh_admin() or g.ubs_id = security.usuario_ubs_id())
  )
);

create or replace function private.criar_cadastro_minimo_risco_v17(
  p_usuario_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_ubs_origem uuid;
  v_nome text := private.clean_text(p_payload->>'nome');
  v_nascimento date := private.parse_date(p_payload->>'dataNascimento');
  v_hash text;
  v_id uuid;
  v_codigo text;
  v_dum date := private.parse_date(p_payload->>'dum');
  v_ig_sem integer := private.parse_int(p_payload->>'igSemanas');
  v_ig_dias integer := coalesce(private.parse_int(p_payload->>'igDias'), 0);
  v_idade integer;
begin
  select p.ubs_id into v_ubs_origem
  from public.perfis p
  where p.id = p_usuario_id and p.ativo = true and p.status = 'ativo'
  limit 1;

  if v_ubs_origem is null then raise exception 'Profissional sem UBS vinculada'; end if;
  if v_nome is null or v_nascimento is null then raise exception 'Nome e data de nascimento são obrigatórios'; end if;

  v_hash := private.identidade_hash(
    jsonb_build_object('nome', v_nome, 'data_nascimento', to_char(v_nascimento,'YYYY-MM-DD'), 'cpf', '', 'cns', ''),
    v_ubs_origem
  );

  select gestante_id into v_id
  from private.identidades_gestantes
  where identidade_hash = v_hash
  limit 1;

  if v_id is not null then return v_id; end if;

  v_id := gen_random_uuid();
  v_codigo := 'GST-' || upper(substr(replace(v_id::text,'-',''),1,8));
  v_idade := extract(year from age(current_date, v_nascimento))::integer;

  if v_dum is null and v_ig_sem is not null then
    v_dum := current_date - ((v_ig_sem * 7) + v_ig_dias);
  end if;
  if v_dum is not null then
    v_ig_sem := greatest(0, floor((current_date - v_dum) / 7.0)::integer);
    v_ig_dias := greatest(0, (current_date - v_dum) % 7);
  end if;

  perform set_config('app.origem_atualizacao', 'manual', true);

  insert into private.identidades_gestantes (
    gestante_id, identidade_hash, ubs_id, nome_enc, data_nascimento_enc,
    cpf_enc, cns_enc, telefones_enc, endereco_enc, bloqueios_manuais,
    atualizado_manualmente_em, atualizado_manualmente_por
  ) values (
    v_id, v_hash, v_ubs_origem,
    extensions.pgp_sym_encrypt(v_nome, private.pii_key(), 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt(to_char(v_nascimento,'YYYY-MM-DD'), private.pii_key(), 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt('', private.pii_key(), 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt('', private.pii_key(), 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt('{}', private.pii_key(), 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt('{}', private.pii_key(), 'cipher-algo=aes256'),
    array['nome','data_nascimento'], now(), p_usuario_id
  );

  insert into public.pec_gestantes (
    id, codigo, ubs_id, idade_anos, ano_nascimento, dum,
    ig_dum_semanas, ig_dum_dias, dpp_dum, peso_kg, altura_cm,
    cadastro_origem, fontes_campos, bloqueios_manuais, dados_extras,
    atualizado_em
  ) values (
    v_id, v_codigo, v_ubs_origem, v_idade, extract(year from v_nascimento)::integer,
    v_dum, v_ig_sem, v_ig_dias,
    case when v_dum is null then null else v_dum + 280 end,
    private.parse_numeric(p_payload->>'pesoKg'), private.parse_numeric(p_payload->>'alturaCm'),
    'cadastro_minimo_risco',
    jsonb_build_object('cadastro_minimo','manual'),
    array['idade_anos','dum','ig_dum_semanas','ig_dum_dias','dpp_dum','peso_kg','altura_cm'],
    jsonb_build_object('cadastro_minimo_pendente', true), now()
  );

  return v_id;
end
$$;

revoke all on function private.criar_cadastro_minimo_risco_v17(uuid,jsonb) from public,anon,authenticated;

create or replace function private.salvar_classificacao_risco_v17(
  p_usuario_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_perfil text;
  v_nome_prof text;
  v_ubs_origem uuid;
  v_ubs_origem_nome text;
  v_gestante_id uuid;
  v_gestante_ubs uuid;
  v_codigo text;
  v_ubs_atendimento uuid;
  v_ubs_atendimento_nome text;
  v_trimestre integer := coalesce(private.parse_int(p_payload->>'trimestre'),1);
  v_peso numeric := private.parse_numeric(p_payload->>'pesoKg');
  v_altura_cm numeric := private.parse_numeric(p_payload->>'alturaCm');
  v_altura_m numeric;
  v_imc numeric;
  v_faixa_imc text := 'Não calculado';
  v_pontos_imc integer := 0;
  v_pontos_g1 integer := 0;
  v_pontos_clinicos integer := 0;
  v_score integer;
  v_classificacao text;
  v_conduta text;
  v_id uuid;
  v_item jsonb;
  v_fator record;
begin
  select p.perfil::text, p.nome_completo, p.ubs_id, u.nome
  into v_perfil, v_nome_prof, v_ubs_origem, v_ubs_origem_nome
  from public.perfis p left join public.ubs u on u.id=p.ubs_id
  where p.id=p_usuario_id and p.ativo=true and p.status='ativo' limit 1;
  if not found or v_ubs_origem is null then raise exception 'Profissional sem perfil ativo e UBS vinculada'; end if;

  v_gestante_id := nullif(p_payload->>'gestanteId','')::uuid;
  if v_gestante_id is null then
    v_gestante_id := private.criar_cadastro_minimo_risco_v17(p_usuario_id, coalesce(p_payload->'cadastroMinimo','{}'::jsonb));
  end if;

  select g.ubs_id, g.codigo, coalesce(v_peso,g.peso_kg), coalesce(v_altura_cm,g.altura_cm)
  into v_gestante_ubs, v_codigo, v_peso, v_altura_cm
  from public.pec_gestantes g where g.id=v_gestante_id;
  if not found then raise exception 'Gestante não encontrada'; end if;
  if v_perfil <> 'administrador' and v_gestante_ubs <> v_ubs_origem then raise exception 'Sem autorização para esta gestante'; end if;

  v_ubs_atendimento := nullif(p_payload->>'ubsAtendimentoId','')::uuid;
  if v_ubs_atendimento is not null then
    select nome into v_ubs_atendimento_nome from public.ubs where id=v_ubs_atendimento and ativa=true;
  end if;
  v_ubs_atendimento_nome := coalesce(private.clean_text(p_payload->>'ubsAtendimentoExterna'), v_ubs_atendimento_nome, v_ubs_origem_nome);

  if v_peso is not null and v_altura_cm is not null and v_peso>0 and v_altura_cm>0 then
    v_altura_m := case when v_altura_cm>3 then v_altura_cm/100 else v_altura_cm end;
    v_imc := round(v_peso/(v_altura_m*v_altura_m),2);
    if v_imc < 18 then v_faixa_imc:='Baixo peso'; v_pontos_imc:=2;
    elsif v_imc <=24.9 then v_faixa_imc:='Eutrófica'; v_pontos_imc:=0;
    elsif v_imc <=29.9 then v_faixa_imc:='Sobrepeso'; v_pontos_imc:=1;
    elsif v_imc <=39.9 then v_faixa_imc:='Obesidade grau I/II'; v_pontos_imc:=5;
    else v_faixa_imc:='Obesidade grau III'; v_pontos_imc:=10; end if;
  end if;

  select
    coalesce(sum(f.pontos) filter(where f.grupo='g1'),0)::integer,
    coalesce(sum(f.pontos) filter(where f.grupo in('g3','g4','g5')),0)::integer
  into v_pontos_g1, v_pontos_clinicos
  from public.config_fatores_risco_gestacional f
  where f.ativo=true and f.versao='SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024'
    and f.codigo in (
      select value->>'codigo' from jsonb_array_elements(coalesce(p_payload->'itens','[]'::jsonb))
    );

  v_score := v_pontos_g1 + v_pontos_imc + v_pontos_clinicos;
  if v_score >=10 then
    if v_pontos_clinicos=0 and coalesce(v_imc,0)<40 then
      v_classificacao:='Médio Risco';
      v_conduta:='A pontuação elevada decorre apenas de fatores individuais e/ou nutricionais. Manter acompanhamento na APS com atenção diferenciada e avaliação clínica profissional.';
    else
      v_classificacao:='Alto Risco';
      v_conduta:='Encaminhar ao pré-natal de alto risco, mantendo vínculo e acompanhamento compartilhado com a APS.';
    end if;
  elsif v_score>=5 then
    v_classificacao:='Médio Risco';
    v_conduta:='Realizar pré-natal na APS pelo médico intercalado com enfermeiro, com monitoramento pela Rede Cuidar conforme o instrumento.';
  else
    v_classificacao:='Risco Habitual';
    v_conduta:='Realizar acompanhamento de pré-natal na APS pelo enfermeiro intercalado com médico, conforme o instrumento.';
  end if;

  insert into public.classificacoes_risco_gestacional (
    gestante_id,instrumento_versao,trimestre,peso_kg,altura_cm,imc,faixa_imc,
    pontos_individuais,pontos_imc,pontos_clinicos,score_total,classificacao,
    conduta_sugerida,observacao,profissional_id,profissional_nome_snapshot,
    perfil_snapshot,ubs_origem_profissional_id,ubs_origem_nome_snapshot,
    ubs_atendimento_id,ubs_atendimento_nome_snapshot
  ) values (
    v_gestante_id,'SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024',greatest(1,least(3,v_trimestre)),v_peso,v_altura_cm,v_imc,v_faixa_imc,
    v_pontos_g1,v_pontos_imc,v_pontos_clinicos,v_score,v_classificacao,v_conduta,
    private.clean_text(p_payload->>'observacao'),p_usuario_id,v_nome_prof,v_perfil,
    v_ubs_origem,v_ubs_origem_nome,v_ubs_atendimento,v_ubs_atendimento_nome
  ) returning id into v_id;

  if v_imc is not null then
    insert into public.classificacao_risco_itens(classificacao_id,fator_codigo,grupo,grupo_titulo,fator_titulo,pontos,origem,detalhe_origem,automatico)
    values(v_id,'g2_imc','g2','Avaliação nutricional',v_faixa_imc,v_pontos_imc,'calculado',concat('IMC calculado: ',v_imc),true);
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'itens','[]'::jsonb)) loop
    select * into v_fator from public.config_fatores_risco_gestacional f
    where f.codigo=v_item->>'codigo' and f.ativo=true and f.versao='SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024';
    if found then
      insert into public.classificacao_risco_itens(
        classificacao_id,fator_codigo,grupo,grupo_titulo,fator_titulo,pontos,origem,detalhe_origem,automatico
      ) values (
        v_id,v_fator.codigo,v_fator.grupo,v_fator.grupo_titulo,v_fator.titulo,v_fator.pontos,
        coalesce(private.clean_text(v_item->>'origem'),'manual'),private.clean_text(v_item->>'detalheOrigem'),
        coalesce((v_item->>'automatico')::boolean,false)
      ) on conflict(classificacao_id,fator_codigo) do nothing;
    end if;
  end loop;

  perform set_config('app.origem_atualizacao','manual',true);
  update public.pec_gestantes
  set risco_gestacional=v_classificacao,
      peso_kg=coalesce(v_peso,peso_kg), altura_cm=coalesce(v_altura_cm,altura_cm),
      bloqueios_manuais=array(select distinct unnest(bloqueios_manuais || array['risco_gestacional','peso_kg','altura_cm'])),
      atualizado_em=now()
  where id=v_gestante_id;

  insert into private.historico_classificacoes_risco(classificacao_id,gestante_id,usuario_id,acao,payload)
  values(v_id,v_gestante_id,p_usuario_id,'classificacao_finalizada',p_payload);

  return jsonb_build_object(
    'classificacaoId',v_id,'gestanteId',v_gestante_id,'codigoGestante',v_codigo,
    'score',v_score,'imc',v_imc,'faixaImc',v_faixa_imc,'classificacao',v_classificacao,
    'conduta',v_conduta,'realizadaEm',now()
  );
end
$$;

revoke all on function private.salvar_classificacao_risco_v17(uuid,jsonb) from public,anon,authenticated;

create or replace function private.obter_relatorio_classificacao_v17(
  p_usuario_id uuid,
  p_classificacao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,extensions
as $$
declare
  v_perfil text; v_ubs_usuario uuid; v_gestante_ubs uuid; v_result jsonb;
begin
  select p.perfil::text,p.ubs_id into v_perfil,v_ubs_usuario
  from public.perfis p where p.id=p_usuario_id and p.ativo=true and p.status='ativo' limit 1;
  if not found then raise exception 'Usuário sem perfil ativo'; end if;

  select g.ubs_id into v_gestante_ubs
  from public.classificacoes_risco_gestacional c join public.pec_gestantes g on g.id=c.gestante_id
  where c.id=p_classificacao_id;
  if not found then raise exception 'Classificação não encontrada'; end if;
  if v_perfil<>'administrador' and v_gestante_ubs<>v_ubs_usuario then raise exception 'Sem autorização para este relatório'; end if;

  select jsonb_build_object(
    'id',c.id,'codigo',g.codigo,
    'gestanteNome',coalesce(nullif(private.descriptografar_texto(i.nome_enc),''),'Gestante '||g.codigo),
    'dataNascimento',private.descriptografar_texto(i.data_nascimento_enc),
    'trimestre',c.trimestre,'pesoKg',c.peso_kg,'alturaCm',c.altura_cm,'imc',c.imc,
    'faixaImc',c.faixa_imc,'score',c.score_total,'classificacao',c.classificacao,
    'conduta',c.conduta_sugerida,'observacao',c.observacao,
    'profissionalNome',c.profissional_nome_snapshot,'perfilProfissional',c.perfil_snapshot,
    'ubsOrigemNome',c.ubs_origem_nome_snapshot,'ubsAtendimentoNome',c.ubs_atendimento_nome_snapshot,
    'realizadaEm',c.realizada_em,'instrumentoVersao',c.instrumento_versao,
    'itens',coalesce((select jsonb_agg(jsonb_build_object(
      'grupoTitulo',ri.grupo_titulo,'fatorTitulo',ri.fator_titulo,'pontos',ri.pontos,'origem',ri.origem
    ) order by case ri.grupo when 'g1' then 1 when 'g2' then 2 when 'g3' then 3 when 'g4' then 4 else 5 end,ri.pontos desc,ri.fator_titulo)
      from public.classificacao_risco_itens ri where ri.classificacao_id=c.id),'[]'::jsonb)
  ) into v_result
  from public.classificacoes_risco_gestacional c
  join public.pec_gestantes g on g.id=c.gestante_id
  left join private.identidades_gestantes i on i.gestante_id=g.id
  where c.id=p_classificacao_id;

  insert into private.acessos_identidade_gestantes(usuario_id,ubs_id,perfil,finalidade,total_registros)
  values(p_usuario_id,v_gestante_ubs,v_perfil,'geracao_pdf_classificacao_risco',1);
  return v_result;
end
$$;

revoke all on function private.obter_relatorio_classificacao_v17(uuid,uuid) from public,anon,authenticated;

commit;
notify pgrst,'reload schema';
