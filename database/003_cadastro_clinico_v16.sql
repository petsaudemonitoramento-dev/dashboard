begin;

-- =========================================================
-- V16 — Cadastro clínico e acompanhamento
-- =========================================================


-- Garante dependências introduzidas na V15.
create or replace function private.descriptografar_texto(
  p_valor bytea
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, private, extensions
as $$
begin
  if p_valor is null then
    return null;
  end if;

  return extensions.pgp_sym_decrypt(
    p_valor,
    private.pii_key()
  );
exception
  when others then
    return null;
end
$$;

revoke all
on function private.descriptografar_texto(bytea)
from public, anon, authenticated;

create table if not exists private.acessos_identidade_gestantes (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users(id),
  ubs_id uuid references public.ubs(id),
  perfil text not null,
  finalidade text not null default 'assistencia_na_ubs',
  total_registros integer not null default 0,
  criado_em timestamptz not null default now()
);

revoke all
on private.acessos_identidade_gestantes
from public, anon, authenticated;


-- Identificador estável: prioriza CPF, depois CNS e por fim nome + nascimento.
-- Isso reduz duplicidades entre cadastro manual e novas importações.
create or replace function private.normalizar_nome(
  p_texto text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select lower(
    regexp_replace(
      translate(
        coalesce(p_texto, ''),
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
      ),
      '\s+',
      ' ',
      'g'
    )
  )
$$;

create or replace function private.identidade_hash(
  p_canonical jsonb,
  p_ubs_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, private, extensions
as $$
declare
  v_cpf text := regexp_replace(
    coalesce(p_canonical->>'cpf', ''),
    '\D',
    '',
    'g'
  );
  v_cns text := regexp_replace(
    coalesce(p_canonical->>'cns', ''),
    '\D',
    '',
    'g'
  );
  v_nome text := private.normalizar_nome(
    p_canonical->>'nome'
  );
  v_nascimento text := coalesce(
    p_canonical->>'data_nascimento',
    ''
  );
  v_base text;
begin
  if v_cpf <> '' then
    v_base := concat_ws('|', p_ubs_id::text, 'cpf', v_cpf);
  elsif v_cns <> '' then
    v_base := concat_ws('|', p_ubs_id::text, 'cns', v_cns);
  elsif v_nome <> '' and v_nascimento <> '' then
    v_base := concat_ws(
      '|',
      p_ubs_id::text,
      'nome_nascimento',
      v_nome,
      v_nascimento
    );
  else
    raise exception 'Linha sem identificador suficiente';
  end if;

  return encode(
    extensions.hmac(
      v_base,
      private.pii_key(),
      'sha256'
    ),
    'hex'
  );
end
$$;

revoke all
on function private.identidade_hash(jsonb, uuid)
from public, anon, authenticated;

alter table private.identidades_gestantes
  add column if not exists bloqueios_manuais text[] not null default '{}'::text[],
  add column if not exists atualizado_manualmente_em timestamptz,
  add column if not exists atualizado_manualmente_por uuid references auth.users(id);

create or replace function private.proteger_identidade_manual()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_origem text := current_setting('app.origem_atualizacao', true);
begin
  if v_origem = 'manual' then
    return new;
  end if;

  if 'nome' = any(old.bloqueios_manuais) then
    new.nome_enc := old.nome_enc;
  end if;
  if 'data_nascimento' = any(old.bloqueios_manuais) then
    new.data_nascimento_enc := old.data_nascimento_enc;
  end if;
  if 'cpf' = any(old.bloqueios_manuais) then
    new.cpf_enc := old.cpf_enc;
  end if;
  if 'cns' = any(old.bloqueios_manuais) then
    new.cns_enc := old.cns_enc;
  end if;
  if 'telefones' = any(old.bloqueios_manuais) then
    new.telefones_enc := old.telefones_enc;
  end if;
  if 'endereco' = any(old.bloqueios_manuais) then
    new.endereco_enc := old.endereco_enc;
  end if;

  new.identidade_hash := old.identidade_hash;
  new.bloqueios_manuais := old.bloqueios_manuais;
  new.atualizado_manualmente_em := old.atualizado_manualmente_em;
  new.atualizado_manualmente_por := old.atualizado_manualmente_por;

  return new;
end
$$;

drop trigger if exists trg_proteger_identidade_manual
on private.identidades_gestantes;

create trigger trg_proteger_identidade_manual
before update on private.identidades_gestantes
for each row
execute function private.proteger_identidade_manual();

-- Migra hashes legados para a estratégia estável. Registros ilegíveis
-- permanecem com o hash anterior.
do $$
declare
  v_item record;
  v_novo_hash text;
begin
  for v_item in
    select
      i.gestante_id,
      i.ubs_id,
      i.nome_enc,
      i.data_nascimento_enc,
      i.cpf_enc,
      i.cns_enc
    from private.identidades_gestantes i
  loop
    begin
      v_novo_hash := private.identidade_hash(
        jsonb_build_object(
          'nome', coalesce(private.descriptografar_texto(v_item.nome_enc), ''),
          'data_nascimento', coalesce(private.descriptografar_texto(v_item.data_nascimento_enc), ''),
          'cpf', coalesce(private.descriptografar_texto(v_item.cpf_enc), ''),
          'cns', coalesce(private.descriptografar_texto(v_item.cns_enc), '')
        ),
        v_item.ubs_id
      );

      update private.identidades_gestantes
      set identidade_hash = v_novo_hash
      where gestante_id = v_item.gestante_id;
    exception
      when unique_violation then
        null;
      when others then
        null;
    end;
  end loop;
end
$$;

alter table public.pec_gestantes
  add column if not exists inicio_pre_natal date,
  add column if not exists situacao_acompanhamento text not null default 'gestacao_em_curso',
  add column if not exists data_parto date,
  add column if not exists tipo_parto text,
  add column if not exists alta_ativa boolean not null default false,
  add column if not exists alta_data date,
  add column if not exists alta_motivo text,
  add column if not exists alta_situacao_final text,
  add column if not exists alta_observacao text,
  add column if not exists cadastro_origem text not null default 'pec',
  add column if not exists fontes_campos jsonb not null default '{}'::jsonb,
  add column if not exists bloqueios_manuais text[] not null default '{}'::text[],
  add column if not exists atualizado_manualmente_em timestamptz,
  add column if not exists atualizado_manualmente_por uuid references auth.users(id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pec_gestantes_situacao_acompanhamento_check'
  ) then
    alter table public.pec_gestantes
      add constraint pec_gestantes_situacao_acompanhamento_check
      check (
        situacao_acompanhamento in (
          'gestacao_em_curso',
          'puerperio',
          'alta'
        )
      );
  end if;
end
$$;

create index if not exists pec_gestantes_alta_idx
  on public.pec_gestantes(ubs_id, alta_ativa);

create table if not exists public.config_exames_pre_natal (
  codigo text primary key,
  nome text not null,
  trimestre smallint not null check (trimestre between 1 and 3),
  semana_inicio smallint,
  semana_fim smallint,
  condicao_aplicacao text,
  ordem integer not null default 0,
  ativo boolean not null default true,
  versao_referencia text not null default 'Protocolo local informado pela equipe',
  atualizado_em timestamptz not null default now()
);

create table if not exists public.config_vacinas_gestante (
  codigo text primary key,
  nome text not null,
  semana_inicio smallint,
  semana_fim smallint,
  condicao_aplicacao text,
  ordem integer not null default 0,
  ativo boolean not null default true,
  versao_referencia text not null default 'Calendário Nacional de Vacinação 2026',
  atualizado_em timestamptz not null default now()
);

create table if not exists public.gestante_consultas (
  id uuid primary key default gen_random_uuid(),
  gestante_id uuid not null references public.pec_gestantes(id) on delete cascade,
  data_atendimento date not null,
  tipo_atendimento text not null default 'pre_natal',
  observacao text,
  origem text not null default 'manual'
    check (origem in ('manual', 'pec', 'migracao')),
  profissional_id uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists gestante_consultas_gestante_data_idx
  on public.gestante_consultas(gestante_id, data_atendimento desc);

create table if not exists public.gestante_exames (
  id uuid primary key default gen_random_uuid(),
  gestante_id uuid not null references public.pec_gestantes(id) on delete cascade,
  codigo text not null,
  nome text not null,
  trimestre smallint not null check (trimestre between 1 and 3),
  status text not null default 'nao_informado'
    check (
      status in (
        'nao_informado',
        'pendente',
        'solicitado',
        'realizado',
        'resultado_alterado',
        'nao_se_aplica'
      )
    ),
  data_solicitacao date,
  data_realizacao date,
  resultado_resumido text,
  observacao text,
  origem text not null default 'manual'
    check (origem in ('manual', 'pec', 'migracao')),
  profissional_id uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (gestante_id, codigo, trimestre)
);

create index if not exists gestante_exames_gestante_idx
  on public.gestante_exames(gestante_id, trimestre, codigo);

create table if not exists public.gestante_vacinas (
  id uuid primary key default gen_random_uuid(),
  gestante_id uuid not null references public.pec_gestantes(id) on delete cascade,
  codigo text not null,
  nome text not null,
  status text not null default 'nao_informado'
    check (
      status in (
        'nao_informado',
        'pendente',
        'agendada',
        'realizada',
        'nao_se_aplica'
      )
    ),
  dose text not null default 'dose_unica',
  data_aplicacao date,
  lote text,
  unidade_aplicadora text,
  observacao text,
  origem text not null default 'manual'
    check (origem in ('manual', 'pec', 'migracao')),
  profissional_id uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (gestante_id, codigo, dose)
);

create index if not exists gestante_vacinas_gestante_idx
  on public.gestante_vacinas(gestante_id, codigo);

create table if not exists public.gestante_altas (
  id uuid primary key default gen_random_uuid(),
  gestante_id uuid not null references public.pec_gestantes(id) on delete cascade,
  data_alta date not null,
  motivo text not null,
  situacao_final text,
  observacao text,
  ubs_id uuid not null references public.ubs(id),
  profissional_id uuid not null references auth.users(id),
  criado_em timestamptz not null default now()
);

create index if not exists gestante_altas_gestante_idx
  on public.gestante_altas(gestante_id, data_alta desc);

create table if not exists private.historico_clinico_gestantes (
  id bigint generated always as identity primary key,
  gestante_id uuid not null references public.pec_gestantes(id) on delete cascade,
  usuario_id uuid not null references auth.users(id),
  ubs_id uuid references public.ubs(id),
  acao text not null,
  origem text not null default 'manual',
  antes jsonb,
  depois jsonb,
  criado_em timestamptz not null default now()
);

revoke all on private.historico_clinico_gestantes
from public, anon, authenticated;

-- =========================================================
-- Catálogo de exames informado pela equipe
-- =========================================================

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

-- =========================================================
-- RLS das novas tabelas
-- =========================================================

alter table public.config_exames_pre_natal enable row level security;
alter table public.config_vacinas_gestante enable row level security;
alter table public.gestante_consultas enable row level security;
alter table public.gestante_exames enable row level security;
alter table public.gestante_vacinas enable row level security;
alter table public.gestante_altas enable row level security;

grant select on
  public.config_exames_pre_natal,
  public.config_vacinas_gestante,
  public.gestante_consultas,
  public.gestante_exames,
  public.gestante_vacinas,
  public.gestante_altas
to authenticated;

drop policy if exists "catalogo exames autenticados"
  on public.config_exames_pre_natal;
create policy "catalogo exames autenticados"
on public.config_exames_pre_natal
for select to authenticated
using (ativo = true);

drop policy if exists "catalogo vacinas autenticados"
  on public.config_vacinas_gestante;
create policy "catalogo vacinas autenticados"
on public.config_vacinas_gestante
for select to authenticated
using (ativo = true);

drop policy if exists "consultas da propria ubs"
  on public.gestante_consultas;
create policy "consultas da propria ubs"
on public.gestante_consultas
for select to authenticated
using (
  security.usuario_eh_admin()
  or exists (
    select 1
    from public.pec_gestantes g
    where g.id = gestante_id
      and g.ubs_id = security.usuario_ubs_id()
  )
);

drop policy if exists "exames da propria ubs"
  on public.gestante_exames;
create policy "exames da propria ubs"
on public.gestante_exames
for select to authenticated
using (
  security.usuario_eh_admin()
  or exists (
    select 1
    from public.pec_gestantes g
    where g.id = gestante_id
      and g.ubs_id = security.usuario_ubs_id()
  )
);

drop policy if exists "vacinas da propria ubs"
  on public.gestante_vacinas;
create policy "vacinas da propria ubs"
on public.gestante_vacinas
for select to authenticated
using (
  security.usuario_eh_admin()
  or exists (
    select 1
    from public.pec_gestantes g
    where g.id = gestante_id
      and g.ubs_id = security.usuario_ubs_id()
  )
);

drop policy if exists "altas da propria ubs"
  on public.gestante_altas;
create policy "altas da propria ubs"
on public.gestante_altas
for select to authenticated
using (
  security.usuario_eh_admin()
  or ubs_id = security.usuario_ubs_id()
);

-- =========================================================
-- Helpers de descriptografia JSON
-- =========================================================

create or replace function private.descriptografar_jsonb(
  p_valor bytea
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, extensions
as $$
declare
  v_texto text;
begin
  if p_valor is null then
    return '{}'::jsonb;
  end if;

  v_texto := extensions.pgp_sym_decrypt(
    p_valor,
    private.pii_key()
  );

  return coalesce(v_texto::jsonb, '{}'::jsonb);
exception
  when others then
    return '{}'::jsonb;
end
$$;

revoke all
on function private.descriptografar_jsonb(bytea)
from public, anon, authenticated;

-- =========================================================
-- Preserva campos corrigidos manualmente em novas importações PEC
-- =========================================================

create or replace function private.proteger_campos_manuais_pec()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_origem text := current_setting('app.origem_atualizacao', true);
begin
  if v_origem = 'manual' then
    return new;
  end if;

  if 'microarea_id' = any(old.bloqueios_manuais) then new.microarea_id := old.microarea_id; end if;
  if 'idade_anos' = any(old.bloqueios_manuais) then new.idade_anos := old.idade_anos; end if;
  if 'sexo' = any(old.bloqueios_manuais) then new.sexo := old.sexo; end if;
  if 'identidade_genero' = any(old.bloqueios_manuais) then new.identidade_genero := old.identidade_genero; end if;
  if 'raca_cor' = any(old.bloqueios_manuais) then new.raca_cor := old.raca_cor; end if;
  if 'bolsa_familia' = any(old.bloqueios_manuais) then new.bolsa_familia := old.bolsa_familia; end if;
  if 'vigencia_bolsa_familia' = any(old.bloqueios_manuais) then new.vigencia_bolsa_familia := old.vigencia_bolsa_familia; end if;
  if 'inicio_pre_natal' = any(old.bloqueios_manuais) then new.inicio_pre_natal := old.inicio_pre_natal; end if;
  if 'dum' = any(old.bloqueios_manuais) then new.dum := old.dum; end if;
  if 'dpp_dum' = any(old.bloqueios_manuais) then new.dpp_dum := old.dpp_dum; end if;
  if 'ig_dum_semanas' = any(old.bloqueios_manuais) then new.ig_dum_semanas := old.ig_dum_semanas; end if;
  if 'ig_dum_dias' = any(old.bloqueios_manuais) then new.ig_dum_dias := old.ig_dum_dias; end if;
  if 'ig_ecografia_semanas' = any(old.bloqueios_manuais) then new.ig_ecografia_semanas := old.ig_ecografia_semanas; end if;
  if 'ig_ecografia_dias' = any(old.bloqueios_manuais) then new.ig_ecografia_dias := old.ig_ecografia_dias; end if;
  if 'dpp_ecografia' = any(old.bloqueios_manuais) then new.dpp_ecografia := old.dpp_ecografia; end if;
  if 'peso_kg' = any(old.bloqueios_manuais) then new.peso_kg := old.peso_kg; end if;
  if 'altura_cm' = any(old.bloqueios_manuais) then new.altura_cm := old.altura_cm; end if;
  if 'pressao_arterial' = any(old.bloqueios_manuais) then new.pressao_arterial := old.pressao_arterial; end if;
  if 'data_ultima_pressao' = any(old.bloqueios_manuais) then new.data_ultima_pressao := old.data_ultima_pressao; end if;
  if 'data_ultimo_peso_altura' = any(old.bloqueios_manuais) then new.data_ultimo_peso_altura := old.data_ultimo_peso_altura; end if;
  if 'atendimentos_pre_natal' = any(old.bloqueios_manuais) then new.atendimentos_pre_natal := old.atendimentos_pre_natal; end if;
  if 'atendimentos_ate_12_semanas' = any(old.bloqueios_manuais) then new.atendimentos_ate_12_semanas := old.atendimentos_ate_12_semanas; end if;
  if 'ultima_consulta_pre_natal' = any(old.bloqueios_manuais) then new.ultima_consulta_pre_natal := old.ultima_consulta_pre_natal; end if;
  if 'atendimentos_odontologicos' = any(old.bloqueios_manuais) then new.atendimentos_odontologicos := old.atendimentos_odontologicos; end if;
  if 'dtpa' = any(old.bloqueios_manuais) then new.dtpa := old.dtpa; end if;
  if 'medicoes_altura_uterina' = any(old.bloqueios_manuais) then new.medicoes_altura_uterina := old.medicoes_altura_uterina; end if;
  if 'medicoes_pressao' = any(old.bloqueios_manuais) then new.medicoes_pressao := old.medicoes_pressao; end if;
  if 'medicoes_peso_altura' = any(old.bloqueios_manuais) then new.medicoes_peso_altura := old.medicoes_peso_altura; end if;
  if 'visitas_pre_natal' = any(old.bloqueios_manuais) then new.visitas_pre_natal := old.visitas_pre_natal; end if;
  if 'visitas_puerperio' = any(old.bloqueios_manuais) then new.visitas_puerperio := old.visitas_puerperio; end if;
  if 'atendimentos_puerperio' = any(old.bloqueios_manuais) then new.atendimentos_puerperio := old.atendimentos_puerperio; end if;
  if 'ultima_consulta_puerperio' = any(old.bloqueios_manuais) then new.ultima_consulta_puerperio := old.ultima_consulta_puerperio; end if;
  if 'situacao_acompanhamento' = any(old.bloqueios_manuais) then new.situacao_acompanhamento := old.situacao_acompanhamento; end if;
  if 'data_parto' = any(old.bloqueios_manuais) then new.data_parto := old.data_parto; end if;
  if 'tipo_parto' = any(old.bloqueios_manuais) then new.tipo_parto := old.tipo_parto; end if;
  if 'risco_gestacional' = any(old.bloqueios_manuais) then new.risco_gestacional := old.risco_gestacional; end if;

  new.bloqueios_manuais := old.bloqueios_manuais;
  new.fontes_campos := old.fontes_campos;
  new.atualizado_manualmente_em := old.atualizado_manualmente_em;
  new.atualizado_manualmente_por := old.atualizado_manualmente_por;
  new.alta_ativa := old.alta_ativa;
  new.alta_data := old.alta_data;
  new.alta_motivo := old.alta_motivo;
  new.alta_situacao_final := old.alta_situacao_final;
  new.alta_observacao := old.alta_observacao;

  return new;
end
$$;

drop trigger if exists trg_proteger_campos_manuais_pec
on public.pec_gestantes;

create trigger trg_proteger_campos_manuais_pec
before update on public.pec_gestantes
for each row
execute function private.proteger_campos_manuais_pec();

-- =========================================================
-- Sincroniza alguns campos importados do PEC com a estrutura V16
-- sem sobrescrever registros preenchidos manualmente.
-- =========================================================

create or replace function private.status_pec_para_exame(p_valor text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_valor is null or btrim(p_valor) in ('', '-') then 'nao_informado'
    when lower(p_valor) like '%realiz%' or lower(p_valor) like '%tratad%' then 'realizado'
    when lower(p_valor) like '%pend%' then 'pendente'
    when lower(p_valor) like '%nao_se_aplica%' or lower(p_valor) like '%não se aplica%' then 'nao_se_aplica'
    when lower(p_valor) like '%reagent%' or lower(p_valor) like '%alterad%' then 'resultado_alterado'
    else 'nao_informado'
  end
$$;

create or replace function private.sincronizar_resumo_pec_v16()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.gestante_exames (
    gestante_id, codigo, nome, trimestre, status,
    resultado_resumido, origem, atualizado_em
  )
  values
    (new.id, 'hiv_t1', 'Anti-HIV', 1, private.status_pec_para_exame(new.exame_hiv_primeiro), new.exame_hiv_primeiro, 'pec', now()),
    (new.id, 'sifilis_t1', 'Teste rápido de triagem para sífilis e/ou VDRL/RPR', 1, private.status_pec_para_exame(new.exame_sifilis_primeiro), new.exame_sifilis_primeiro, 'pec', now()),
    (new.id, 'hepatite_b_t1', 'Sorologia para hepatite B (HBsAg)', 1, private.status_pec_para_exame(new.exame_hepatite_b_primeiro), new.exame_hepatite_b_primeiro, 'pec', now()),
    (new.id, 'hepatite_c_t1', 'Sorologia para hepatite C', 1, private.status_pec_para_exame(new.exame_hepatite_c_primeiro), new.exame_hepatite_c_primeiro, 'pec', now()),
    (new.id, 'hiv_t3', 'Anti-HIV', 3, private.status_pec_para_exame(new.exame_hiv_terceiro), new.exame_hiv_terceiro, 'pec', now()),
    (new.id, 'sifilis_t3', 'VDRL / teste para sífilis', 3, private.status_pec_para_exame(new.exame_sifilis_terceiro), new.exame_sifilis_terceiro, 'pec', now())
  on conflict (gestante_id, codigo, trimestre)
  do update set
    status = excluded.status,
    resultado_resumido = excluded.resultado_resumido,
    atualizado_em = now()
  where public.gestante_exames.origem <> 'manual';

  insert into public.gestante_vacinas (
    gestante_id, codigo, nome, status, dose,
    observacao, origem, atualizado_em
  )
  values (
    new.id,
    'dtpa',
    'dTpa',
    case
      when new.dtpa is null or btrim(new.dtpa) in ('', '-') then 'nao_informado'
      when lower(new.dtpa) like '%realiz%' then 'realizada'
      when lower(new.dtpa) like '%pend%' then 'pendente'
      else 'nao_informado'
    end,
    'dose_gestacao_atual',
    new.dtpa,
    'pec',
    now()
  )
  on conflict (gestante_id, codigo, dose)
  do update set
    status = excluded.status,
    observacao = excluded.observacao,
    atualizado_em = now()
  where public.gestante_vacinas.origem <> 'manual';

  return new;
end
$$;

drop trigger if exists trg_sincronizar_resumo_pec_v16
on public.pec_gestantes;

create trigger trg_sincronizar_resumo_pec_v16
after insert or update of
  exame_hiv_primeiro,
  exame_sifilis_primeiro,
  exame_hepatite_b_primeiro,
  exame_hepatite_c_primeiro,
  exame_hiv_terceiro,
  exame_sifilis_terceiro,
  dtpa
on public.pec_gestantes
for each row
execute function private.sincronizar_resumo_pec_v16();

-- Migra os campos-resumo já existentes para a estrutura detalhada.
insert into public.gestante_exames (
  gestante_id, codigo, nome, trimestre, status,
  resultado_resumido, origem, atualizado_em
)
select
  g.id,
  x.codigo,
  x.nome,
  x.trimestre,
  private.status_pec_para_exame(x.valor),
  x.valor,
  'migracao',
  now()
from public.pec_gestantes g
cross join lateral (
  values
    ('hiv_t1', 'Anti-HIV', 1::smallint, g.exame_hiv_primeiro),
    ('sifilis_t1', 'Teste rápido de triagem para sífilis e/ou VDRL/RPR', 1::smallint, g.exame_sifilis_primeiro),
    ('hepatite_b_t1', 'Sorologia para hepatite B (HBsAg)', 1::smallint, g.exame_hepatite_b_primeiro),
    ('hepatite_c_t1', 'Sorologia para hepatite C', 1::smallint, g.exame_hepatite_c_primeiro),
    ('hiv_t3', 'Anti-HIV', 3::smallint, g.exame_hiv_terceiro),
    ('sifilis_t3', 'VDRL / teste para sífilis', 3::smallint, g.exame_sifilis_terceiro)
) as x(codigo, nome, trimestre, valor)
where x.valor is not null
  and btrim(x.valor) not in ('', '-')
on conflict (gestante_id, codigo, trimestre)
do nothing;

insert into public.gestante_vacinas (
  gestante_id, codigo, nome, status, dose,
  observacao, origem, atualizado_em
)
select
  g.id,
  'dtpa',
  'dTpa',
  case
    when lower(g.dtpa) like '%realiz%' then 'realizada'
    when lower(g.dtpa) like '%pend%' then 'pendente'
    else 'nao_informado'
  end,
  'dose_gestacao_atual',
  g.dtpa,
  'migracao',
  now()
from public.pec_gestantes g
where g.dtpa is not null
  and btrim(g.dtpa) not in ('', '-')
on conflict (gestante_id, codigo, dose)
do nothing;

-- =========================================================
-- Consulta clínica identificada e autorizada
-- =========================================================

create or replace function private.obter_gestante_clinica(
  p_usuario_id uuid,
  p_gestante_id uuid,
  p_exibir_identidade boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_perfil text;
  v_ubs_usuario uuid;
  v_ubs_gestante uuid;
  v_pode_identidade boolean;
  v_identidade jsonb;
  v_telefones jsonb;
  v_endereco jsonb;
  v_resultado jsonb;
begin
  select p.perfil::text, p.ubs_id
  into v_perfil, v_ubs_usuario
  from public.perfis p
  where p.id = p_usuario_id
    and p.ativo = true
    and p.status = 'ativo'
  limit 1;

  if not found then
    raise exception 'Usuário sem perfil ativo';
  end if;

  select g.ubs_id
  into v_ubs_gestante
  from public.pec_gestantes g
  where g.id = p_gestante_id;

  if not found then
    raise exception 'Gestante não encontrada';
  end if;

  if v_perfil <> 'administrador' and v_ubs_gestante <> v_ubs_usuario then
    raise exception 'Usuário sem autorização para esta gestante';
  end if;

  v_pode_identidade :=
    p_exibir_identidade
    and v_perfil in ('administrador', 'profissional_ubs', 'equipe_ubs');

  select
    case
      when v_pode_identidade then
        jsonb_build_object(
          'nome', coalesce(private.descriptografar_texto(i.nome_enc), ''),
          'dataNascimento', coalesce(private.descriptografar_texto(i.data_nascimento_enc), ''),
          'cpf', coalesce(private.descriptografar_texto(i.cpf_enc), ''),
          'cns', coalesce(private.descriptografar_texto(i.cns_enc), '')
        )
      else
        jsonb_build_object(
          'nome', 'Gestante ' || g.codigo,
          'dataNascimento', '',
          'cpf', '',
          'cns', ''
        )
    end,
    case
      when v_pode_identidade then private.descriptografar_jsonb(i.telefones_enc)
      else '{}'::jsonb
    end,
    case
      when v_pode_identidade then private.descriptografar_jsonb(i.endereco_enc)
      else '{}'::jsonb
    end
  into v_identidade, v_telefones, v_endereco
  from public.pec_gestantes g
  left join private.identidades_gestantes i
    on i.gestante_id = g.id
  where g.id = p_gestante_id;

  select jsonb_build_object(
    'id', g.id,
    'codigo', g.codigo,
    'ubsId', g.ubs_id,
    'ubsNome', u.nome,
    'microareaId', g.microarea_id,
    'microareaCodigo', m.codigo,
    'identificacao', v_identidade
      || jsonb_build_object(
        'telefoneCelular', coalesce(v_telefones->>'celular', ''),
        'telefoneResidencial', coalesce(v_telefones->>'residencial', ''),
        'telefoneContato', coalesce(v_telefones->>'contato', ''),
        'rua', coalesce(v_endereco->>'rua', ''),
        'numero', coalesce(v_endereco->>'numero', ''),
        'complemento', coalesce(v_endereco->>'complemento', ''),
        'bairro', coalesce(v_endereco->>'bairro', ''),
        'municipio', coalesce(v_endereco->>'municipio', ''),
        'uf', coalesce(v_endereco->>'uf', ''),
        'cep', coalesce(v_endereco->>'cep', ''),
        'sexo', coalesce(g.sexo, ''),
        'identidadeGenero', coalesce(g.identidade_genero, ''),
        'racaCor', coalesce(g.raca_cor, ''),
        'bolsaFamilia', g.bolsa_familia,
        'vigenciaBolsaFamilia', g.vigencia_bolsa_familia
      ),
    'gestacao', jsonb_build_object(
      'situacao', g.situacao_acompanhamento,
      'inicioPreNatal', g.inicio_pre_natal,
      'dum', g.dum,
      'dpp', coalesce(g.dpp_dum, g.dpp_ecografia),
      'igSemanas', coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas),
      'igDias', g.ig_dum_dias,
      'igEcografiaSemanas', g.ig_ecografia_semanas,
      'igEcografiaDias', g.ig_ecografia_dias,
      'dppEcografia', g.dpp_ecografia,
      'dataParto', g.data_parto,
      'tipoParto', coalesce(g.tipo_parto, ''),
      'pesoKg', g.peso_kg,
      'alturaCm', g.altura_cm,
      'pressaoArterial', coalesce(g.pressao_arterial, ''),
      'dataUltimaPressao', g.data_ultima_pressao,
      'dataUltimoPesoAltura', g.data_ultimo_peso_altura,
      'riscoGestacional', coalesce(g.risco_gestacional, '')
    ),
    'acompanhamento', jsonb_build_object(
      'atendimentosPreNatal', g.atendimentos_pre_natal,
      'atendimentosAte12Semanas', g.atendimentos_ate_12_semanas,
      'ultimaConsultaPreNatal', g.ultima_consulta_pre_natal,
      'atendimentosOdontologicos', g.atendimentos_odontologicos,
      'medicoesAlturaUterina', g.medicoes_altura_uterina,
      'medicoesPressao', g.medicoes_pressao,
      'medicoesPesoAltura', g.medicoes_peso_altura,
      'visitasPreNatal', g.visitas_pre_natal,
      'visitasPuerperio', g.visitas_puerperio,
      'atendimentosPuerperio', g.atendimentos_puerperio,
      'ultimaConsultaPuerperio', g.ultima_consulta_puerperio,
      'diasUltimoAtendimentoMedico', g.dias_ultimo_atendimento_medico,
      'diasUltimoAtendimentoEnfermagem', g.dias_ultimo_atendimento_enfermagem,
      'diasUltimoAtendimentoOdontologico', g.dias_ultimo_atendimento_odontologico,
      'diasUltimaVisita', g.dias_ultima_visita
    ),
    'consultas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'data', c.data_atendimento,
          'tipo', c.tipo_atendimento,
          'observacao', coalesce(c.observacao, ''),
          'origem', c.origem
        )
        order by c.data_atendimento
      )
      from public.gestante_consultas c
      where c.gestante_id = g.id
    ), '[]'::jsonb),
    'exames', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'codigo', e.codigo,
          'nome', e.nome,
          'trimestre', e.trimestre,
          'status', e.status,
          'dataSolicitacao', e.data_solicitacao,
          'dataRealizacao', e.data_realizacao,
          'resultado', coalesce(e.resultado_resumido, ''),
          'observacao', coalesce(e.observacao, ''),
          'origem', e.origem
        )
        order by e.trimestre, e.nome
      )
      from public.gestante_exames e
      where e.gestante_id = g.id
    ), '[]'::jsonb),
    'vacinas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', v.id,
          'codigo', v.codigo,
          'nome', v.nome,
          'status', v.status,
          'dose', v.dose,
          'dataAplicacao', v.data_aplicacao,
          'lote', coalesce(v.lote, ''),
          'unidadeAplicadora', coalesce(v.unidade_aplicadora, ''),
          'observacao', coalesce(v.observacao, ''),
          'origem', v.origem
        )
        order by v.nome
      )
      from public.gestante_vacinas v
      where v.gestante_id = g.id
    ), '[]'::jsonb),
    'alta', jsonb_build_object(
      'ativa', g.alta_ativa,
      'data', g.alta_data,
      'motivo', coalesce(g.alta_motivo, ''),
      'situacaoFinal', coalesce(g.alta_situacao_final, ''),
      'observacao', coalesce(g.alta_observacao, '')
    ),
    'origemCadastro', g.cadastro_origem,
    'bloqueiosManuais', to_jsonb(g.bloqueios_manuais),
    'atualizadoEm', g.atualizado_em
  )
  into v_resultado
  from public.pec_gestantes g
  join public.ubs u on u.id = g.ubs_id
  left join public.microareas m on m.id = g.microarea_id
  where g.id = p_gestante_id;

  if v_pode_identidade then
    insert into private.acessos_identidade_gestantes (
      usuario_id, ubs_id, perfil, finalidade, total_registros
    )
    values (
      p_usuario_id,
      v_ubs_gestante,
      v_perfil,
      'edicao_cadastro_clinico',
      1
    );
  end if;

  return v_resultado;
end
$$;

revoke all
on function private.obter_gestante_clinica(uuid, uuid, boolean)
from public, anon, authenticated;

-- =========================================================
-- Salvar cadastro clínico manual
-- =========================================================

create or replace function private.salvar_gestante_clinica(
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
  v_ubs_usuario uuid;
  v_ubs_id uuid;
  v_gestante_id uuid;
  v_existente boolean := false;
  v_codigo text;
  v_nome text;
  v_nascimento_text text;
  v_nascimento date;
  v_hash text;
  v_key text := private.pii_key();
  v_microarea_id uuid;
  v_antes jsonb;
  v_depois jsonb;
  v_item jsonb;
  v_alta_anterior boolean := false;
  v_alta_nova boolean := false;
  v_campos_manuais text[] := array[
    'microarea_id',
    'idade_anos',
    'sexo',
    'identidade_genero',
    'raca_cor',
    'bolsa_familia',
    'vigencia_bolsa_familia',
    'inicio_pre_natal',
    'dum',
    'dpp_dum',
    'ig_dum_semanas',
    'ig_dum_dias',
    'ig_ecografia_semanas',
    'ig_ecografia_dias',
    'dpp_ecografia',
    'peso_kg',
    'altura_cm',
    'pressao_arterial',
    'data_ultima_pressao',
    'data_ultimo_peso_altura',
    'atendimentos_pre_natal',
    'atendimentos_ate_12_semanas',
    'ultima_consulta_pre_natal',
    'atendimentos_odontologicos',
    'medicoes_altura_uterina',
    'medicoes_pressao',
    'medicoes_peso_altura',
    'visitas_pre_natal',
    'visitas_puerperio',
    'atendimentos_puerperio',
    'ultima_consulta_puerperio',
    'situacao_acompanhamento',
    'data_parto',
    'tipo_parto',
    'risco_gestacional'
  ];
begin
  select p.perfil::text, p.ubs_id
  into v_perfil, v_ubs_usuario
  from public.perfis p
  where p.id = p_usuario_id
    and p.ativo = true
    and p.status = 'ativo'
    and p.perfil::text in ('administrador', 'profissional_ubs', 'equipe_ubs')
  limit 1;

  if not found then
    raise exception 'Usuário sem autorização para cadastro clínico';
  end if;

  v_gestante_id := nullif(p_payload->>'id', '')::uuid;
  v_nome := btrim(coalesce(p_payload #>> '{identificacao,nome}', ''));
  v_nascimento_text := btrim(coalesce(p_payload #>> '{identificacao,dataNascimento}', ''));
  v_nascimento := private.parse_date(v_nascimento_text);

  if v_nome = '' then
    raise exception 'O nome da gestante é obrigatório';
  end if;

  if v_nascimento is null then
    raise exception 'A data de nascimento é obrigatória';
  end if;

  if v_gestante_id is not null then
    select g.ubs_id, g.codigo, g.alta_ativa
    into v_ubs_id, v_codigo, v_alta_anterior
    from public.pec_gestantes g
    where g.id = v_gestante_id;

    if not found then
      raise exception 'Gestante não encontrada';
    end if;

    if v_perfil <> 'administrador' and v_ubs_id <> v_ubs_usuario then
      raise exception 'Usuário sem autorização para editar esta gestante';
    end if;

    v_existente := true;
  else
    v_ubs_id := case
      when v_perfil = 'administrador'
        and nullif(p_payload->>'ubsId', '') is not null
      then (p_payload->>'ubsId')::uuid
      else v_ubs_usuario
    end;

    if v_ubs_id is null then
      raise exception 'Usuário sem UBS vinculada';
    end if;

    v_hash := private.identidade_hash(
      jsonb_build_object(
        'nome', v_nome,
        'data_nascimento', to_char(v_nascimento, 'DD/MM/YYYY'),
        'cpf', coalesce(p_payload #>> '{identificacao,cpf}', ''),
        'cns', coalesce(p_payload #>> '{identificacao,cns}', '')
      ),
      v_ubs_id
    );

    select i.gestante_id
    into v_gestante_id
    from private.identidades_gestantes i
    where i.identidade_hash = v_hash
    limit 1;

    if v_gestante_id is not null then
      raise exception 'GESTANTE_DUPLICADA:%', v_gestante_id;
    end if;

    v_gestante_id := gen_random_uuid();
    v_codigo := 'GST-' || upper(substr(replace(v_gestante_id::text, '-', ''), 1, 8));
  end if;

  v_microarea_id := nullif(p_payload->>'microareaId', '')::uuid;

  if v_microarea_id is not null and not exists (
    select 1
    from public.microareas m
    where m.id = v_microarea_id
      and m.ubs_id = v_ubs_id
  ) then
    raise exception 'Microárea inválida para a UBS';
  end if;

  if v_existente then
    select to_jsonb(g)
    into v_antes
    from public.pec_gestantes g
    where g.id = v_gestante_id;
  end if;

  perform set_config('app.origem_atualizacao', 'manual', true);

  insert into private.identidades_gestantes (
    gestante_id,
    identidade_hash,
    ubs_id,
    nome_enc,
    data_nascimento_enc,
    cpf_enc,
    cns_enc,
    telefones_enc,
    endereco_enc,
    bloqueios_manuais,
    atualizado_manualmente_em,
    atualizado_manualmente_por,
    atualizado_em
  )
  values (
    v_gestante_id,
    coalesce(
      v_hash,
      private.identidade_hash(
        jsonb_build_object(
          'nome', v_nome,
          'data_nascimento', to_char(v_nascimento, 'DD/MM/YYYY'),
          'cpf', coalesce(p_payload #>> '{identificacao,cpf}', ''),
          'cns', coalesce(p_payload #>> '{identificacao,cns}', '')
        ),
        v_ubs_id
      )
    ),
    v_ubs_id,
    extensions.pgp_sym_encrypt(v_nome, v_key, 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt(to_char(v_nascimento, 'DD/MM/YYYY'), v_key, 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt(coalesce(p_payload #>> '{identificacao,cpf}', ''), v_key, 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt(coalesce(p_payload #>> '{identificacao,cns}', ''), v_key, 'cipher-algo=aes256'),
    extensions.pgp_sym_encrypt(
      jsonb_build_object(
        'celular', coalesce(p_payload #>> '{identificacao,telefoneCelular}', ''),
        'residencial', coalesce(p_payload #>> '{identificacao,telefoneResidencial}', ''),
        'contato', coalesce(p_payload #>> '{identificacao,telefoneContato}', '')
      )::text,
      v_key,
      'cipher-algo=aes256'
    ),
    extensions.pgp_sym_encrypt(
      jsonb_build_object(
        'rua', coalesce(p_payload #>> '{identificacao,rua}', ''),
        'numero', coalesce(p_payload #>> '{identificacao,numero}', ''),
        'complemento', coalesce(p_payload #>> '{identificacao,complemento}', ''),
        'bairro', coalesce(p_payload #>> '{identificacao,bairro}', ''),
        'municipio', coalesce(p_payload #>> '{identificacao,municipio}', ''),
        'uf', coalesce(p_payload #>> '{identificacao,uf}', ''),
        'cep', coalesce(p_payload #>> '{identificacao,cep}', '')
      )::text,
      v_key,
      'cipher-algo=aes256'
    ),
    array[
      'nome',
      'data_nascimento',
      'cpf',
      'cns',
      'telefones',
      'endereco'
    ],
    now(),
    p_usuario_id,
    now()
  )
  on conflict (gestante_id)
  do update set
    identidade_hash = private.identidades_gestantes.identidade_hash,
    ubs_id = excluded.ubs_id,
    nome_enc = excluded.nome_enc,
    data_nascimento_enc = excluded.data_nascimento_enc,
    cpf_enc = excluded.cpf_enc,
    cns_enc = excluded.cns_enc,
    telefones_enc = excluded.telefones_enc,
    endereco_enc = excluded.endereco_enc,
    bloqueios_manuais = (
      select array_agg(distinct item)
      from unnest(
        coalesce(
          private.identidades_gestantes.bloqueios_manuais,
          '{}'::text[]
        )
        || excluded.bloqueios_manuais
      ) item
    ),
    atualizado_manualmente_em = now(),
    atualizado_manualmente_por = p_usuario_id,
    atualizado_em = now();

  v_alta_nova := coalesce((p_payload #>> '{alta,ativa}')::boolean, false);

  insert into public.pec_gestantes (
    id,
    codigo,
    ubs_id,
    microarea_id,
    idade_anos,
    ano_nascimento,
    sexo,
    identidade_genero,
    raca_cor,
    bolsa_familia,
    vigencia_bolsa_familia,
    inicio_pre_natal,
    situacao_acompanhamento,
    dum,
    ig_dum_semanas,
    ig_dum_dias,
    dpp_dum,
    ig_ecografia_semanas,
    ig_ecografia_dias,
    dpp_ecografia,
    data_parto,
    tipo_parto,
    peso_kg,
    altura_cm,
    pressao_arterial,
    data_ultima_pressao,
    data_ultimo_peso_altura,
    risco_gestacional,
    atendimentos_pre_natal,
    atendimentos_ate_12_semanas,
    ultima_consulta_pre_natal,
    atendimentos_odontologicos,
    medicoes_altura_uterina,
    medicoes_pressao,
    medicoes_peso_altura,
    visitas_pre_natal,
    visitas_puerperio,
    atendimentos_puerperio,
    ultima_consulta_puerperio,
    dias_ultimo_atendimento_medico,
    dias_ultimo_atendimento_enfermagem,
    dias_ultimo_atendimento_odontologico,
    dias_ultima_visita,
    alta_ativa,
    alta_data,
    alta_motivo,
    alta_situacao_final,
    alta_observacao,
    cadastro_origem,
    fontes_campos,
    bloqueios_manuais,
    atualizado_manualmente_em,
    atualizado_manualmente_por,
    atualizado_em
  )
  values (
    v_gestante_id,
    v_codigo,
    v_ubs_id,
    v_microarea_id,
    extract(year from age(current_date, v_nascimento))::integer,
    extract(year from v_nascimento)::integer,
    private.clean_text(p_payload #>> '{identificacao,sexo}'),
    private.clean_text(p_payload #>> '{identificacao,identidadeGenero}'),
    private.clean_text(p_payload #>> '{identificacao,racaCor}'),
    case
      when p_payload #>> '{identificacao,bolsaFamilia}' is null then null
      else (p_payload #>> '{identificacao,bolsaFamilia}')::boolean
    end,
    private.parse_date(p_payload #>> '{identificacao,vigenciaBolsaFamilia}'),
    private.parse_date(p_payload #>> '{gestacao,inicioPreNatal}'),
    case
      when v_alta_nova then 'alta'
      else coalesce(nullif(p_payload #>> '{gestacao,situacao}', ''), 'gestacao_em_curso')
    end,
    private.parse_date(p_payload #>> '{gestacao,dum}'),
    private.parse_int(p_payload #>> '{gestacao,igSemanas}'),
    private.parse_int(p_payload #>> '{gestacao,igDias}'),
    private.parse_date(p_payload #>> '{gestacao,dpp}'),
    private.parse_int(p_payload #>> '{gestacao,igEcografiaSemanas}'),
    private.parse_int(p_payload #>> '{gestacao,igEcografiaDias}'),
    private.parse_date(p_payload #>> '{gestacao,dppEcografia}'),
    private.parse_date(p_payload #>> '{gestacao,dataParto}'),
    private.clean_text(p_payload #>> '{gestacao,tipoParto}'),
    private.parse_numeric(p_payload #>> '{gestacao,pesoKg}'),
    private.parse_numeric(p_payload #>> '{gestacao,alturaCm}'),
    private.clean_text(p_payload #>> '{gestacao,pressaoArterial}'),
    private.parse_date(p_payload #>> '{gestacao,dataUltimaPressao}'),
    private.parse_date(p_payload #>> '{gestacao,dataUltimoPesoAltura}'),
    private.clean_text(p_payload #>> '{gestacao,riscoGestacional}'),
    private.parse_int(p_payload #>> '{acompanhamento,atendimentosPreNatal}'),
    private.parse_int(p_payload #>> '{acompanhamento,atendimentosAte12Semanas}'),
    private.parse_date(p_payload #>> '{acompanhamento,ultimaConsultaPreNatal}'),
    private.parse_int(p_payload #>> '{acompanhamento,atendimentosOdontologicos}'),
    private.parse_int(p_payload #>> '{acompanhamento,medicoesAlturaUterina}'),
    private.parse_int(p_payload #>> '{acompanhamento,medicoesPressao}'),
    private.parse_int(p_payload #>> '{acompanhamento,medicoesPesoAltura}'),
    private.parse_int(p_payload #>> '{acompanhamento,visitasPreNatal}'),
    private.parse_int(p_payload #>> '{acompanhamento,visitasPuerperio}'),
    private.parse_int(p_payload #>> '{acompanhamento,atendimentosPuerperio}'),
    private.parse_date(p_payload #>> '{acompanhamento,ultimaConsultaPuerperio}'),
    private.parse_int(p_payload #>> '{acompanhamento,diasUltimoAtendimentoMedico}'),
    private.parse_int(p_payload #>> '{acompanhamento,diasUltimoAtendimentoEnfermagem}'),
    private.parse_int(p_payload #>> '{acompanhamento,diasUltimoAtendimentoOdontologico}'),
    private.parse_int(p_payload #>> '{acompanhamento,diasUltimaVisita}'),
    v_alta_nova,
    private.parse_date(p_payload #>> '{alta,data}'),
    private.clean_text(p_payload #>> '{alta,motivo}'),
    private.clean_text(p_payload #>> '{alta,situacaoFinal}'),
    private.clean_text(p_payload #>> '{alta,observacao}'),
    case when v_existente then 'pec_complementado' else 'manual' end,
    jsonb_build_object(
      'ultima_atualizacao_manual', now(),
      'profissional_id', p_usuario_id
    ),
    v_campos_manuais,
    now(),
    p_usuario_id,
    now()
  )
  on conflict (id)
  do update set
    microarea_id = excluded.microarea_id,
    idade_anos = excluded.idade_anos,
    ano_nascimento = excluded.ano_nascimento,
    sexo = excluded.sexo,
    identidade_genero = excluded.identidade_genero,
    raca_cor = excluded.raca_cor,
    bolsa_familia = excluded.bolsa_familia,
    vigencia_bolsa_familia = excluded.vigencia_bolsa_familia,
    inicio_pre_natal = excluded.inicio_pre_natal,
    situacao_acompanhamento = excluded.situacao_acompanhamento,
    dum = excluded.dum,
    ig_dum_semanas = excluded.ig_dum_semanas,
    ig_dum_dias = excluded.ig_dum_dias,
    dpp_dum = excluded.dpp_dum,
    ig_ecografia_semanas = excluded.ig_ecografia_semanas,
    ig_ecografia_dias = excluded.ig_ecografia_dias,
    dpp_ecografia = excluded.dpp_ecografia,
    data_parto = excluded.data_parto,
    tipo_parto = excluded.tipo_parto,
    peso_kg = excluded.peso_kg,
    altura_cm = excluded.altura_cm,
    pressao_arterial = excluded.pressao_arterial,
    data_ultima_pressao = excluded.data_ultima_pressao,
    data_ultimo_peso_altura = excluded.data_ultimo_peso_altura,
    risco_gestacional = excluded.risco_gestacional,
    atendimentos_pre_natal = excluded.atendimentos_pre_natal,
    atendimentos_ate_12_semanas = excluded.atendimentos_ate_12_semanas,
    ultima_consulta_pre_natal = excluded.ultima_consulta_pre_natal,
    atendimentos_odontologicos = excluded.atendimentos_odontologicos,
    medicoes_altura_uterina = excluded.medicoes_altura_uterina,
    medicoes_pressao = excluded.medicoes_pressao,
    medicoes_peso_altura = excluded.medicoes_peso_altura,
    visitas_pre_natal = excluded.visitas_pre_natal,
    visitas_puerperio = excluded.visitas_puerperio,
    atendimentos_puerperio = excluded.atendimentos_puerperio,
    ultima_consulta_puerperio = excluded.ultima_consulta_puerperio,
    dias_ultimo_atendimento_medico = excluded.dias_ultimo_atendimento_medico,
    dias_ultimo_atendimento_enfermagem = excluded.dias_ultimo_atendimento_enfermagem,
    dias_ultimo_atendimento_odontologico = excluded.dias_ultimo_atendimento_odontologico,
    dias_ultima_visita = excluded.dias_ultima_visita,
    alta_ativa = excluded.alta_ativa,
    alta_data = excluded.alta_data,
    alta_motivo = excluded.alta_motivo,
    alta_situacao_final = excluded.alta_situacao_final,
    alta_observacao = excluded.alta_observacao,
    cadastro_origem = excluded.cadastro_origem,
    fontes_campos = coalesce(public.pec_gestantes.fontes_campos, '{}'::jsonb)
      || excluded.fontes_campos,
    bloqueios_manuais = (
      select array_agg(distinct item)
      from unnest(
        coalesce(public.pec_gestantes.bloqueios_manuais, '{}'::text[])
        || excluded.bloqueios_manuais
      ) item
    ),
    atualizado_manualmente_em = now(),
    atualizado_manualmente_por = p_usuario_id,
    atualizado_em = now();

  delete from public.gestante_consultas
  where gestante_id = v_gestante_id
    and origem = 'manual';

  for v_item in
    select value
    from jsonb_array_elements(
      coalesce(p_payload->'consultas', '[]'::jsonb)
    )
  loop
    if private.parse_date(v_item->>'data') is not null then
      insert into public.gestante_consultas (
        gestante_id,
        data_atendimento,
        tipo_atendimento,
        observacao,
        origem,
        profissional_id
      )
      values (
        v_gestante_id,
        private.parse_date(v_item->>'data'),
        coalesce(nullif(v_item->>'tipo', ''), 'pre_natal'),
        private.clean_text(v_item->>'observacao'),
        'manual',
        p_usuario_id
      );
    end if;
  end loop;

  for v_item in
    select value
    from jsonb_array_elements(
      coalesce(p_payload->'exames', '[]'::jsonb)
    )
  loop
    insert into public.gestante_exames (
      gestante_id,
      codigo,
      nome,
      trimestre,
      status,
      data_solicitacao,
      data_realizacao,
      resultado_resumido,
      observacao,
      origem,
      profissional_id,
      atualizado_em
    )
    values (
      v_gestante_id,
      v_item->>'codigo',
      v_item->>'nome',
      coalesce((v_item->>'trimestre')::smallint, 1),
      coalesce(nullif(v_item->>'status', ''), 'nao_informado'),
      private.parse_date(v_item->>'dataSolicitacao'),
      private.parse_date(v_item->>'dataRealizacao'),
      private.clean_text(v_item->>'resultado'),
      private.clean_text(v_item->>'observacao'),
      'manual',
      p_usuario_id,
      now()
    )
    on conflict (gestante_id, codigo, trimestre)
    do update set
      nome = excluded.nome,
      status = excluded.status,
      data_solicitacao = excluded.data_solicitacao,
      data_realizacao = excluded.data_realizacao,
      resultado_resumido = excluded.resultado_resumido,
      observacao = excluded.observacao,
      origem = 'manual',
      profissional_id = p_usuario_id,
      atualizado_em = now();
  end loop;

  for v_item in
    select value
    from jsonb_array_elements(
      coalesce(p_payload->'vacinas', '[]'::jsonb)
    )
  loop
    insert into public.gestante_vacinas (
      gestante_id,
      codigo,
      nome,
      status,
      dose,
      data_aplicacao,
      lote,
      unidade_aplicadora,
      observacao,
      origem,
      profissional_id,
      atualizado_em
    )
    values (
      v_gestante_id,
      v_item->>'codigo',
      v_item->>'nome',
      coalesce(nullif(v_item->>'status', ''), 'nao_informado'),
      coalesce(nullif(v_item->>'dose', ''), 'dose_unica'),
      private.parse_date(v_item->>'dataAplicacao'),
      private.clean_text(v_item->>'lote'),
      private.clean_text(v_item->>'unidadeAplicadora'),
      private.clean_text(v_item->>'observacao'),
      'manual',
      p_usuario_id,
      now()
    )
    on conflict (gestante_id, codigo, dose)
    do update set
      nome = excluded.nome,
      status = excluded.status,
      data_aplicacao = excluded.data_aplicacao,
      lote = excluded.lote,
      unidade_aplicadora = excluded.unidade_aplicadora,
      observacao = excluded.observacao,
      origem = 'manual',
      profissional_id = p_usuario_id,
      atualizado_em = now();
  end loop;

  -- Atualiza os campos-resumo já usados pelos cards e indicadores.
  update public.pec_gestantes g
  set
    atendimentos_pre_natal = coalesce((
      select count(*)::integer
      from public.gestante_consultas c
      where c.gestante_id = v_gestante_id
        and c.tipo_atendimento in ('pre_natal', 'rotina')
    ), g.atendimentos_pre_natal),
    ultima_consulta_pre_natal = coalesce((
      select max(c.data_atendimento)
      from public.gestante_consultas c
      where c.gestante_id = v_gestante_id
        and c.tipo_atendimento in ('pre_natal', 'rotina')
    ), g.ultima_consulta_pre_natal),
    exame_hiv_primeiro = coalesce((
      select e.status
      from public.gestante_exames e
      where e.gestante_id = v_gestante_id
        and e.codigo = 'hiv_t1'
      limit 1
    ), g.exame_hiv_primeiro),
    exame_sifilis_primeiro = coalesce((
      select e.status
      from public.gestante_exames e
      where e.gestante_id = v_gestante_id
        and e.codigo = 'sifilis_t1'
      limit 1
    ), g.exame_sifilis_primeiro),
    exame_hepatite_b_primeiro = coalesce((
      select e.status
      from public.gestante_exames e
      where e.gestante_id = v_gestante_id
        and e.codigo = 'hepatite_b_t1'
      limit 1
    ), g.exame_hepatite_b_primeiro),
    exame_hepatite_c_primeiro = coalesce((
      select e.status
      from public.gestante_exames e
      where e.gestante_id = v_gestante_id
        and e.codigo = 'hepatite_c_t1'
      limit 1
    ), g.exame_hepatite_c_primeiro),
    exame_hiv_terceiro = coalesce((
      select e.status
      from public.gestante_exames e
      where e.gestante_id = v_gestante_id
        and e.codigo = 'hiv_t3'
      limit 1
    ), g.exame_hiv_terceiro),
    exame_sifilis_terceiro = coalesce((
      select e.status
      from public.gestante_exames e
      where e.gestante_id = v_gestante_id
        and e.codigo = 'sifilis_t3'
      limit 1
    ), g.exame_sifilis_terceiro),
    dtpa = coalesce((
      select v.status
      from public.gestante_vacinas v
      where v.gestante_id = v_gestante_id
        and v.codigo = 'dtpa'
      limit 1
    ), g.dtpa),
    atualizado_em = now()
  where g.id = v_gestante_id;

  if v_alta_nova and not v_alta_anterior then
    insert into public.gestante_altas (
      gestante_id,
      data_alta,
      motivo,
      situacao_final,
      observacao,
      ubs_id,
      profissional_id
    )
    values (
      v_gestante_id,
      coalesce(
        private.parse_date(p_payload #>> '{alta,data}'),
        current_date
      ),
      coalesce(
        nullif(p_payload #>> '{alta,motivo}', ''),
        'Alta registrada'
      ),
      private.clean_text(p_payload #>> '{alta,situacaoFinal}'),
      private.clean_text(p_payload #>> '{alta,observacao}'),
      v_ubs_id,
      p_usuario_id
    );
  end if;

  select to_jsonb(g)
  into v_depois
  from public.pec_gestantes g
  where g.id = v_gestante_id;

  insert into private.historico_clinico_gestantes (
    gestante_id,
    usuario_id,
    ubs_id,
    acao,
    origem,
    antes,
    depois
  )
  values (
    v_gestante_id,
    p_usuario_id,
    v_ubs_id,
    case when v_existente then 'atualizacao_clinica' else 'cadastro_manual' end,
    'manual',
    v_antes,
    v_depois
  );

  return jsonb_build_object(
    'id', v_gestante_id,
    'codigo', v_codigo,
    'acao', case when v_existente then 'atualizada' else 'cadastrada' end
  );
end
$$;

revoke all
on function private.salvar_gestante_clinica(uuid, jsonb)
from public, anon, authenticated;

-- =========================================================
-- Listagem V16 para cards, incluindo altas e pendências
-- =========================================================

create or replace function private.listar_gestantes_autorizadas_v16(
  p_usuario_id uuid,
  p_exibir_identidade boolean default false
)
returns table (
  gestante_id uuid,
  codigo text,
  nome_visual text,
  ubs_nome text,
  microarea_codigo text,
  idade_anos integer,
  risco_gestacional text,
  ig_semanas integer,
  ig_dias integer,
  dpp date,
  atendimentos_pre_natal integer,
  atendimentos_ate_12_semanas integer,
  ultima_consulta_pre_natal date,
  atendimentos_odontologicos integer,
  dtpa text,
  pressao_arterial text,
  peso_kg numeric,
  altura_cm numeric,
  visitas_pre_natal integer,
  dias_ultima_visita integer,
  exame_hiv_primeiro text,
  exame_sifilis_primeiro text,
  exame_hepatite_b_primeiro text,
  exame_hepatite_c_primeiro text,
  exame_hiv_terceiro text,
  exame_sifilis_terceiro text,
  observacao text,
  alta_ativa boolean,
  alta_data date,
  alta_motivo text,
  pendencias_count integer,
  atualizado_em timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_perfil text;
  v_ubs_id uuid;
  v_ativo boolean;
  v_pode_ver_identidade boolean := false;
  v_total integer := 0;
begin
  select
    p.perfil::text,
    p.ubs_id,
    p.ativo and p.status = 'ativo'
  into
    v_perfil,
    v_ubs_id,
    v_ativo
  from public.perfis p
  where p.id = p_usuario_id
  limit 1;

  if not found or not coalesce(v_ativo, false) then
    raise exception 'Usuário inativo ou sem perfil autorizado';
  end if;

  v_pode_ver_identidade := v_perfil in (
    'administrador',
    'profissional_ubs',
    'equipe_ubs'
  );

  if v_perfil <> 'administrador' and v_ubs_id is null then
    raise exception 'Usuário sem UBS vinculada';
  end if;

  if p_exibir_identidade and v_pode_ver_identidade then
    select count(*)::integer
    into v_total
    from public.pec_gestantes g
    where v_perfil = 'administrador' or g.ubs_id = v_ubs_id;

    insert into private.acessos_identidade_gestantes (
      usuario_id,
      ubs_id,
      perfil,
      finalidade,
      total_registros
    )
    values (
      p_usuario_id,
      v_ubs_id,
      v_perfil,
      'visualizacao_operacional_da_lista_v16',
      v_total
    );
  end if;

  return query
  select
    g.id,
    g.codigo,
    case
      when p_exibir_identidade and v_pode_ver_identidade then
        coalesce(
          nullif(private.descriptografar_texto(i.nome_enc), ''),
          'Nome não disponível'
        )
      else
        'Gestante ' || g.codigo
    end,
    u.nome,
    m.codigo,
    g.idade_anos,
    g.risco_gestacional,
    coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas),
    coalesce(g.ig_dum_dias, g.ig_ecografia_dias),
    coalesce(g.dpp_dum, g.dpp_ecografia),
    g.atendimentos_pre_natal,
    g.atendimentos_ate_12_semanas,
    g.ultima_consulta_pre_natal,
    g.atendimentos_odontologicos,
    g.dtpa,
    g.pressao_arterial,
    g.peso_kg,
    g.altura_cm,
    g.visitas_pre_natal,
    g.dias_ultima_visita,
    g.exame_hiv_primeiro,
    g.exame_sifilis_primeiro,
    g.exame_hepatite_b_primeiro,
    g.exame_hepatite_c_primeiro,
    g.exame_hiv_terceiro,
    g.exame_sifilis_terceiro,
    coalesce(
      nullif(g.dados_extras ->> 'Cenário clínico de teste', ''),
      nullif(g.dados_extras ->> 'Cenario clinico de teste', ''),
      nullif(g.dados_extras ->> 'Observações', ''),
      nullif(g.dados_extras ->> 'Observacao', '')
    ),
    g.alta_ativa,
    g.alta_data,
    g.alta_motivo,
    (
      select count(*)::integer
      from public.config_exames_pre_natal ce
      where ce.ativo = true
        and ce.trimestre <= case
          when coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) <= 13 then 1
          when coalesce(g.ig_dum_semanas, g.ig_ecografia_semanas, 0) <= 27 then 2
          else 3
        end
        and not exists (
          select 1
          from public.gestante_exames ge
          where ge.gestante_id = g.id
            and ge.codigo = ce.codigo
            and ge.status in ('realizado', 'nao_se_aplica')
        )
    ),
    g.atualizado_em
  from public.pec_gestantes g
  join public.ubs u on u.id = g.ubs_id
  left join public.microareas m on m.id = g.microarea_id
  left join private.identidades_gestantes i on i.gestante_id = g.id
  where v_perfil = 'administrador' or g.ubs_id = v_ubs_id
  order by
    g.alta_ativa asc,
    case
      when lower(coalesce(g.risco_gestacional, '')) like '%alto%' then 1
      when lower(coalesce(g.risco_gestacional, '')) like '%inter%' then 2
      when lower(coalesce(g.risco_gestacional, '')) like '%habit%' then 3
      else 4
    end,
    g.atualizado_em desc;
end
$$;

revoke all
on function private.listar_gestantes_autorizadas_v16(uuid, boolean)
from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
