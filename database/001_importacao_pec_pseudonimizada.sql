begin;

create extension if not exists pgcrypto;

create schema if not exists private;
create schema if not exists security;

revoke all on schema private from public, anon, authenticated;
revoke all on schema security from public, anon;

alter table public.perfis
  add column if not exists ubs_id uuid references public.ubs(id);

create index if not exists perfis_ubs_id_idx
  on public.perfis(ubs_id);

-- Cria uma chave aleatória no Supabase Vault uma única vez.
do $$
begin
  if not exists (
    select 1
    from vault.secrets
    where name = 'pec_pii_key'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'pec_pii_key',
      'Chave para criptografia dos identificadores importados do PEC'
    );
  end if;
end
$$;

create or replace function private.pii_key()
returns text
language sql
security definer
set search_path = pg_catalog, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'pec_pii_key'
  limit 1
$$;

revoke all on function private.pii_key() from public, anon, authenticated;

create or replace function private.clean_text(p_value text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(
      case
        when p_value is null then ''
        when btrim(p_value) in ('', '-', 'NULL', 'null', 'N/A') then ''
        else p_value
      end
    ),
    ''
  )
$$;

create or replace function private.parse_date(p_value text)
returns date
language plpgsql
immutable
as $$
declare
  v text := private.clean_text(p_value);
begin
  if v is null then
    return null;
  end if;

  if v ~ '^\d{2}/\d{2}/\d{4}$' then
    return to_date(v, 'DD/MM/YYYY');
  elsif v ~ '^\d{4}-\d{2}-\d{2}$' then
    return v::date;
  elsif v ~ '^\d{4}-\d{2}-\d{2}T' then
    return v::timestamptz::date;
  end if;

  return null;
exception
  when others then
    return null;
end
$$;

create or replace function private.parse_int(p_value text)
returns integer
language sql
immutable
as $$
  select case
    when private.clean_text(p_value) is null then null
    else nullif((regexp_match(private.clean_text(p_value), '-?\d+'))[1], '')::integer
  end
$$;

create or replace function private.parse_numeric(p_value text)
returns numeric
language plpgsql
immutable
as $$
declare
  v text := private.clean_text(p_value);
begin
  if v is null then
    return null;
  end if;

  v := replace(v, ' ', '');
  if v ~ '^\d{1,3}(\.\d{3})*,\d+$' then
    v := replace(replace(v, '.', ''), ',', '.');
  elsif v ~ '^\d+,\d+$' then
    v := replace(v, ',', '.');
  end if;

  return regexp_replace(v, '[^0-9\.-]', '', 'g')::numeric;
exception
  when others then
    return null;
end
$$;

create or replace function security.usuario_eh_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.perfis p
    where p.id = auth.uid()
      and p.ativo = true
      and p.status = 'ativo'
      and p.perfil = 'administrador'
  )
$$;

create or replace function security.usuario_ubs_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.ubs_id
  from public.perfis p
  where p.id = auth.uid()
    and p.ativo = true
    and p.status = 'ativo'
  limit 1
$$;

grant execute on function security.usuario_eh_admin() to authenticated;
grant execute on function security.usuario_ubs_id() to authenticated;

-- Resumo sem identificadores pessoais.
create table if not exists public.importacoes_pec_resumo (
  id uuid primary key default gen_random_uuid(),
  ubs_id uuid not null references public.ubs(id),
  usuario_id uuid not null references auth.users(id),
  arquivo_nome text not null,
  arquivo_sha256 text not null,
  linha_cabecalho integer not null,
  total_linhas integer not null default 0,
  total_processadas integer not null default 0,
  total_erros integer not null default 0,
  mapeamento jsonb not null default '{}'::jsonb,
  avisos jsonb not null default '[]'::jsonb,
  status text not null default 'processando'
    check (status in ('processando', 'concluida', 'concluida_com_erros', 'falhou')),
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);

-- Tabela clínica pseudonimizada, visível no sistema segundo a UBS do usuário.
create table if not exists public.pec_gestantes (
  id uuid primary key,
  codigo text not null unique,
  ubs_id uuid not null references public.ubs(id),
  microarea_id uuid references public.microareas(id),

  idade_anos integer,
  ano_nascimento integer,
  sexo text,
  identidade_genero text,
  raca_cor text,
  bolsa_familia boolean,
  vigencia_bolsa_familia date,

  risco_gestacional text,
  dum date,
  ig_dum_semanas integer,
  ig_dum_dias integer,
  dpp_dum date,
  ig_ecografia_semanas integer,
  ig_ecografia_dias integer,
  dpp_ecografia date,

  peso_kg numeric(7,2),
  altura_cm numeric(7,2),
  pressao_arterial text,
  data_ultima_pressao date,
  data_ultimo_peso_altura date,

  atendimentos_pre_natal integer,
  atendimentos_ate_12_semanas integer,
  ultima_consulta_pre_natal date,
  atendimentos_odontologicos integer,
  dtpa text,
  medicoes_altura_uterina integer,
  medicoes_pressao integer,
  medicoes_peso_altura integer,

  exame_hiv_primeiro text,
  exame_sifilis_primeiro text,
  exame_hepatite_b_primeiro text,
  exame_hepatite_c_primeiro text,
  exame_hiv_terceiro text,
  exame_sifilis_terceiro text,

  visitas_pre_natal integer,
  visitas_puerperio integer,
  atendimentos_puerperio integer,
  ultima_consulta_puerperio date,

  dias_ultimo_atendimento_medico integer,
  dias_ultimo_atendimento_enfermagem integer,
  dias_ultimo_atendimento_odontologico integer,
  dias_ultima_visita integer,

  dados_extras jsonb not null default '{}'::jsonb,
  importacao_id uuid references public.importacoes_pec_resumo(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists pec_gestantes_ubs_idx
  on public.pec_gestantes(ubs_id);

create index if not exists pec_gestantes_microarea_idx
  on public.pec_gestantes(microarea_id);

create index if not exists pec_gestantes_risco_idx
  on public.pec_gestantes(risco_gestacional);

-- Identificadores ficam fora do schema exposto e criptografados.
create table if not exists private.identidades_gestantes (
  gestante_id uuid primary key,
  identidade_hash text not null unique,
  ubs_id uuid not null references public.ubs(id),

  nome_enc bytea,
  data_nascimento_enc bytea,
  cpf_enc bytea,
  cns_enc bytea,
  telefones_enc bytea,
  endereco_enc bytea,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Os dados crus entram aqui durante a transação e são apagados após o processamento.
create table if not exists private.importacao_pec_linhas_raw (
  id bigint generated always as identity primary key,
  importacao_id uuid not null references public.importacoes_pec_resumo(id) on delete cascade,
  numero_linha integer not null,
  dados_raw jsonb not null,
  criado_em timestamptz not null default now()
);

create table if not exists private.importacao_pec_erros (
  id bigint generated always as identity primary key,
  importacao_id uuid not null references public.importacoes_pec_resumo(id) on delete cascade,
  numero_linha integer not null,
  codigo_erro text,
  mensagem text not null,
  criado_em timestamptz not null default now()
);

revoke all on all tables in schema private from public, anon, authenticated;

create or replace function private.identidade_hash(
  p_canonical jsonb,
  p_ubs_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_base text;
begin
  v_base := concat_ws(
    '|',
    p_ubs_id::text,
    regexp_replace(coalesce(p_canonical->>'cpf', ''), '\D', '', 'g'),
    regexp_replace(coalesce(p_canonical->>'cns', ''), '\D', '', 'g'),
    lower(unaccent(coalesce(p_canonical->>'nome', ''))),
    coalesce(p_canonical->>'data_nascimento', '')
  );

  if regexp_replace(v_base, '[|\s]', '', 'g') = p_ubs_id::text then
    raise exception 'Linha sem identificador suficiente';
  end if;

  return encode(
    hmac(v_base, private.pii_key(), 'sha256'),
    'hex'
  );
end
$$;

create extension if not exists unaccent;

create or replace function private.importar_pec(
  p_ubs_id uuid,
  p_usuario_id uuid,
  p_arquivo_nome text,
  p_arquivo_sha256 text,
  p_linha_cabecalho integer,
  p_mapeamento jsonb,
  p_linhas jsonb,
  p_avisos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_importacao_id uuid;
  v_item jsonb;
  v_canonical jsonb;
  v_extras jsonb;
  v_raw_id bigint;
  v_linha integer;
  v_hash text;
  v_gestante_id uuid;
  v_codigo text;
  v_microarea_id uuid;
  v_key text := private.pii_key();
  v_processadas integer := 0;
  v_erros integer := 0;
  v_data_nascimento date;
  v_idade integer;
begin
  if not exists (
    select 1
    from public.perfis p
    where p.id = p_usuario_id
      and p.ativo = true
      and p.status = 'ativo'
      and (
        p.perfil = 'administrador'
        or p.ubs_id = p_ubs_id
      )
  ) then
    raise exception 'Usuário sem autorização para importar nesta UBS';
  end if;

  insert into public.importacoes_pec_resumo (
    ubs_id,
    usuario_id,
    arquivo_nome,
    arquivo_sha256,
    linha_cabecalho,
    total_linhas,
    mapeamento,
    avisos
  )
  values (
    p_ubs_id,
    p_usuario_id,
    p_arquivo_nome,
    p_arquivo_sha256,
    p_linha_cabecalho,
    jsonb_array_length(p_linhas),
    coalesce(p_mapeamento, '{}'::jsonb),
    coalesce(p_avisos, '[]'::jsonb)
  )
  returning id into v_importacao_id;

  for v_item in
    select value
    from jsonb_array_elements(p_linhas)
  loop
    v_linha := coalesce((v_item->>'linha')::integer, 0);
    v_canonical := coalesce(v_item->'canonical', '{}'::jsonb);
    v_extras := coalesce(v_item->'extras', '{}'::jsonb);

    insert into private.importacao_pec_linhas_raw (
      importacao_id,
      numero_linha,
      dados_raw
    )
    values (
      v_importacao_id,
      v_linha,
      coalesce(v_item->'raw', '{}'::jsonb)
    )
    returning id into v_raw_id;

    begin
      v_hash := private.identidade_hash(v_canonical, p_ubs_id);
      v_data_nascimento := private.parse_date(v_canonical->>'data_nascimento');

      v_idade := private.parse_int(v_canonical->>'idade_texto');
      if v_idade is null and v_data_nascimento is not null then
        v_idade := extract(year from age(current_date, v_data_nascimento))::integer;
      end if;

      select ig.gestante_id
      into v_gestante_id
      from private.identidades_gestantes ig
      where ig.identidade_hash = v_hash;

      if v_gestante_id is null then
        v_gestante_id := gen_random_uuid();
      end if;

      v_codigo := 'GST-' || upper(substr(replace(v_gestante_id::text, '-', ''), 1, 8));

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
        atualizado_em
      )
      values (
        v_gestante_id,
        v_hash,
        p_ubs_id,
        pgp_sym_encrypt(coalesce(v_canonical->>'nome', ''), v_key, 'cipher-algo=aes256'),
        pgp_sym_encrypt(coalesce(v_canonical->>'data_nascimento', ''), v_key, 'cipher-algo=aes256'),
        pgp_sym_encrypt(coalesce(v_canonical->>'cpf', ''), v_key, 'cipher-algo=aes256'),
        pgp_sym_encrypt(coalesce(v_canonical->>'cns', ''), v_key, 'cipher-algo=aes256'),
        pgp_sym_encrypt(
          jsonb_build_object(
            'celular', v_canonical->>'telefone_celular',
            'residencial', v_canonical->>'telefone_residencial',
            'contato', v_canonical->>'telefone_contato'
          )::text,
          v_key,
          'cipher-algo=aes256'
        ),
        pgp_sym_encrypt(
          jsonb_build_object(
            'rua', v_canonical->>'rua',
            'numero', v_canonical->>'numero',
            'complemento', v_canonical->>'complemento',
            'bairro', v_canonical->>'bairro',
            'municipio', v_canonical->>'municipio',
            'uf', v_canonical->>'uf',
            'cep', v_canonical->>'cep'
          )::text,
          v_key,
          'cipher-algo=aes256'
        ),
        now()
      )
      on conflict (identidade_hash)
      do update set
        ubs_id = excluded.ubs_id,
        nome_enc = excluded.nome_enc,
        data_nascimento_enc = excluded.data_nascimento_enc,
        cpf_enc = excluded.cpf_enc,
        cns_enc = excluded.cns_enc,
        telefones_enc = excluded.telefones_enc,
        endereco_enc = excluded.endereco_enc,
        atualizado_em = now()
      returning gestante_id into v_gestante_id;

      select m.id
      into v_microarea_id
      from public.microareas m
      where m.ubs_id = p_ubs_id
        and regexp_replace(coalesce(m.codigo, ''), '\D', '', 'g')
          = regexp_replace(coalesce(v_canonical->>'microarea', ''), '\D', '', 'g')
      limit 1;

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
        risco_gestacional,
        dum,
        ig_dum_semanas,
        ig_dum_dias,
        dpp_dum,
        ig_ecografia_semanas,
        ig_ecografia_dias,
        dpp_ecografia,
        peso_kg,
        altura_cm,
        pressao_arterial,
        data_ultima_pressao,
        data_ultimo_peso_altura,
        atendimentos_pre_natal,
        atendimentos_ate_12_semanas,
        ultima_consulta_pre_natal,
        atendimentos_odontologicos,
        dtpa,
        medicoes_altura_uterina,
        medicoes_pressao,
        medicoes_peso_altura,
        exame_hiv_primeiro,
        exame_sifilis_primeiro,
        exame_hepatite_b_primeiro,
        exame_hepatite_c_primeiro,
        exame_hiv_terceiro,
        exame_sifilis_terceiro,
        visitas_pre_natal,
        visitas_puerperio,
        atendimentos_puerperio,
        ultima_consulta_puerperio,
        dias_ultimo_atendimento_medico,
        dias_ultimo_atendimento_enfermagem,
        dias_ultimo_atendimento_odontologico,
        dias_ultima_visita,
        dados_extras,
        importacao_id,
        atualizado_em
      )
      values (
        v_gestante_id,
        v_codigo,
        p_ubs_id,
        v_microarea_id,
        v_idade,
        case when v_data_nascimento is null then null else extract(year from v_data_nascimento)::integer end,
        private.clean_text(v_canonical->>'sexo'),
        private.clean_text(v_canonical->>'identidade_genero'),
        private.clean_text(v_canonical->>'raca_cor'),
        case
          when lower(coalesce(v_canonical->>'bolsa_familia', '')) in ('sim', 'true', '1') then true
          when lower(coalesce(v_canonical->>'bolsa_familia', '')) in ('nao', 'não', 'false', '0') then false
          else null
        end,
        private.parse_date(v_canonical->>'vigencia_bolsa_familia'),
        private.clean_text(v_canonical->>'risco_gestacional'),
        private.parse_date(v_canonical->>'dum'),
        private.parse_int(v_canonical->>'ig_dum_semanas'),
        private.parse_int(v_canonical->>'ig_dum_dias'),
        private.parse_date(v_canonical->>'dpp_dum'),
        private.parse_int(v_canonical->>'ig_ecografia_semanas'),
        private.parse_int(v_canonical->>'ig_ecografia_dias'),
        private.parse_date(v_canonical->>'dpp_ecografia'),
        private.parse_numeric(v_canonical->>'peso_kg'),
        private.parse_numeric(v_canonical->>'altura_cm'),
        private.clean_text(v_canonical->>'pressao_arterial'),
        private.parse_date(v_canonical->>'data_ultima_pressao'),
        private.parse_date(v_canonical->>'data_ultimo_peso_altura'),
        private.parse_int(v_canonical->>'atendimentos_pre_natal'),
        private.parse_int(v_canonical->>'atendimentos_ate_12_semanas'),
        private.parse_date(v_canonical->>'ultima_consulta_pre_natal'),
        private.parse_int(v_canonical->>'atendimentos_odontologicos'),
        private.clean_text(v_canonical->>'dtpa'),
        private.parse_int(v_canonical->>'medicoes_altura_uterina'),
        private.parse_int(v_canonical->>'medicoes_pressao'),
        private.parse_int(v_canonical->>'medicoes_peso_altura'),
        private.clean_text(v_canonical->>'exame_hiv_primeiro'),
        private.clean_text(v_canonical->>'exame_sifilis_primeiro'),
        private.clean_text(v_canonical->>'exame_hepatite_b_primeiro'),
        private.clean_text(v_canonical->>'exame_hepatite_c_primeiro'),
        private.clean_text(v_canonical->>'exame_hiv_terceiro'),
        private.clean_text(v_canonical->>'exame_sifilis_terceiro'),
        private.parse_int(v_canonical->>'visitas_pre_natal'),
        private.parse_int(v_canonical->>'visitas_puerperio'),
        private.parse_int(v_canonical->>'atendimentos_puerperio'),
        private.parse_date(v_canonical->>'ultima_consulta_puerperio'),
        private.parse_int(v_canonical->>'dias_ultimo_atendimento_medico'),
        private.parse_int(v_canonical->>'dias_ultimo_atendimento_enfermagem'),
        private.parse_int(v_canonical->>'dias_ultimo_atendimento_odontologico'),
        private.parse_int(v_canonical->>'dias_ultima_visita'),
        v_extras,
        v_importacao_id,
        now()
      )
      on conflict (id)
      do update set
        codigo = excluded.codigo,
        ubs_id = excluded.ubs_id,
        microarea_id = excluded.microarea_id,
        idade_anos = excluded.idade_anos,
        ano_nascimento = excluded.ano_nascimento,
        sexo = excluded.sexo,
        identidade_genero = excluded.identidade_genero,
        raca_cor = excluded.raca_cor,
        bolsa_familia = excluded.bolsa_familia,
        vigencia_bolsa_familia = excluded.vigencia_bolsa_familia,
        risco_gestacional = excluded.risco_gestacional,
        dum = excluded.dum,
        ig_dum_semanas = excluded.ig_dum_semanas,
        ig_dum_dias = excluded.ig_dum_dias,
        dpp_dum = excluded.dpp_dum,
        ig_ecografia_semanas = excluded.ig_ecografia_semanas,
        ig_ecografia_dias = excluded.ig_ecografia_dias,
        dpp_ecografia = excluded.dpp_ecografia,
        peso_kg = excluded.peso_kg,
        altura_cm = excluded.altura_cm,
        pressao_arterial = excluded.pressao_arterial,
        data_ultima_pressao = excluded.data_ultima_pressao,
        data_ultimo_peso_altura = excluded.data_ultimo_peso_altura,
        atendimentos_pre_natal = excluded.atendimentos_pre_natal,
        atendimentos_ate_12_semanas = excluded.atendimentos_ate_12_semanas,
        ultima_consulta_pre_natal = excluded.ultima_consulta_pre_natal,
        atendimentos_odontologicos = excluded.atendimentos_odontologicos,
        dtpa = excluded.dtpa,
        medicoes_altura_uterina = excluded.medicoes_altura_uterina,
        medicoes_pressao = excluded.medicoes_pressao,
        medicoes_peso_altura = excluded.medicoes_peso_altura,
        exame_hiv_primeiro = excluded.exame_hiv_primeiro,
        exame_sifilis_primeiro = excluded.exame_sifilis_primeiro,
        exame_hepatite_b_primeiro = excluded.exame_hepatite_b_primeiro,
        exame_hepatite_c_primeiro = excluded.exame_hepatite_c_primeiro,
        exame_hiv_terceiro = excluded.exame_hiv_terceiro,
        exame_sifilis_terceiro = excluded.exame_sifilis_terceiro,
        visitas_pre_natal = excluded.visitas_pre_natal,
        visitas_puerperio = excluded.visitas_puerperio,
        atendimentos_puerperio = excluded.atendimentos_puerperio,
        ultima_consulta_puerperio = excluded.ultima_consulta_puerperio,
        dias_ultimo_atendimento_medico = excluded.dias_ultimo_atendimento_medico,
        dias_ultimo_atendimento_enfermagem = excluded.dias_ultimo_atendimento_enfermagem,
        dias_ultimo_atendimento_odontologico = excluded.dias_ultimo_atendimento_odontologico,
        dias_ultima_visita = excluded.dias_ultima_visita,
        dados_extras = excluded.dados_extras,
        importacao_id = excluded.importacao_id,
        atualizado_em = now();

      delete from private.importacao_pec_linhas_raw
      where id = v_raw_id;

      v_processadas := v_processadas + 1;
    exception
      when others then
        delete from private.importacao_pec_linhas_raw
        where id = v_raw_id;

        insert into private.importacao_pec_erros (
          importacao_id,
          numero_linha,
          codigo_erro,
          mensagem
        )
        values (
          v_importacao_id,
          v_linha,
          sqlstate,
          left(sqlerrm, 1000)
        );

        v_erros := v_erros + 1;
    end;
  end loop;

  update public.importacoes_pec_resumo
  set
    total_processadas = v_processadas,
    total_erros = v_erros,
    status = case
      when v_erros = 0 then 'concluida'
      when v_processadas > 0 then 'concluida_com_erros'
      else 'falhou'
    end,
    concluido_em = now()
  where id = v_importacao_id;

  return jsonb_build_object(
    'importacao_id', v_importacao_id,
    'total', jsonb_array_length(p_linhas),
    'processadas', v_processadas,
    'erros', v_erros
  );
end
$$;

revoke all on function private.importar_pec(
  uuid, uuid, text, text, integer, jsonb, jsonb, jsonb
) from public, anon, authenticated;

alter table public.pec_gestantes enable row level security;
alter table public.importacoes_pec_resumo enable row level security;

revoke all on public.pec_gestantes from anon, authenticated;
revoke all on public.importacoes_pec_resumo from anon, authenticated;

grant select on public.pec_gestantes to authenticated;
grant select on public.importacoes_pec_resumo to authenticated;

drop policy if exists "usuarios veem gestantes da propria ubs"
  on public.pec_gestantes;

create policy "usuarios veem gestantes da propria ubs"
on public.pec_gestantes
for select
to authenticated
using (
  security.usuario_eh_admin()
  or ubs_id = security.usuario_ubs_id()
);

drop policy if exists "usuarios veem importacoes da propria ubs"
  on public.importacoes_pec_resumo;

create policy "usuarios veem importacoes da propria ubs"
on public.importacoes_pec_resumo
for select
to authenticated
using (
  security.usuario_eh_admin()
  or ubs_id = security.usuario_ubs_id()
);

-- UBS e microáreas solicitadas.
do $$
declare
  v_ubs_id uuid;
  v_codigo text;
begin
  select id into v_ubs_id
  from public.ubs
  where lower(nome) = lower('Antonio Aurelio Ventura (Cinza)')
  limit 1;

  if v_ubs_id is null then
    insert into public.ubs (nome, ativa)
    values ('Antonio Aurelio Ventura (Cinza)', true)
    returning id into v_ubs_id;
  else
    update public.ubs
    set ativa = true
    where id = v_ubs_id;
  end if;

  foreach v_codigo in array array['07', '08', '09', '10']
  loop
    if not exists (
      select 1
      from public.microareas m
      where m.ubs_id = v_ubs_id
        and regexp_replace(coalesce(m.codigo, ''), '\D', '', 'g')
          = regexp_replace(v_codigo, '\D', '', 'g')
    ) then
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'microareas'
          and column_name = 'nome'
      ) then
        execute format(
          'insert into public.microareas (ubs_id, codigo, nome, ativa)
           values ($1, $2, $3, true)'
        )
        using v_ubs_id, v_codigo, 'Microárea ' || v_codigo;
      else
        execute format(
          'insert into public.microareas (ubs_id, codigo, ativa)
           values ($1, $2, true)'
        )
        using v_ubs_id, v_codigo;
      end if;
    end if;
  end loop;
end
$$;

commit;
