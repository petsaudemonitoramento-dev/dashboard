-- Profissionais V30.7.1 - checagem determinística da extensão CSV
begin;

create or replace function private.exigir_payload_pec_rpc_v30(
  p_arquivo_nome text,
  p_arquivo_sha256 text,
  p_linha_cabecalho integer,
  p_mapeamento jsonb,
  p_linhas jsonb,
  p_avisos jsonb
)
returns void
language plpgsql
set search_path = pg_catalog
as $$
begin
  if p_arquivo_nome is null
     or char_length(p_arquivo_nome) not between 1 and 180
     or right(lower(p_arquivo_nome), 4) <> '.csv'
     or position('/' in p_arquivo_nome) > 0
     or position(chr(92) in p_arquivo_nome) > 0
     or p_arquivo_nome ~ '[[:cntrl:]]'
  then
    raise exception 'Nome de arquivo PEC inválido';
  end if;

  if p_arquivo_sha256 is null
     or p_arquivo_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Hash do arquivo PEC inválido';
  end if;

  if p_linha_cabecalho is null
     or p_linha_cabecalho not between 1 and 100
  then
    raise exception 'Linha de cabeçalho PEC inválida';
  end if;

  if p_mapeamento is null
     or jsonb_typeof(p_mapeamento) <> 'object'
     or pg_column_size(p_mapeamento) > 262144
  then
    raise exception 'Mapeamento PEC inválido';
  end if;

  if p_linhas is null
     or jsonb_typeof(p_linhas) <> 'array'
     or jsonb_array_length(p_linhas) < 1
     or jsonb_array_length(p_linhas) > 10000
     or pg_column_size(p_linhas) > 20971520
  then
    raise exception 'Linhas PEC inválidas ou acima do limite';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_linhas) as item(value)
    where jsonb_typeof(value) <> 'object'
       or pg_column_size(value) > 131072
       or exists (
         select 1
         from jsonb_object_keys(value) as k(key)
         where key <> all (array[
           'linha',
           'raw',
           'canonical',
           'extras'
         ]::text[])
       )
       or jsonb_typeof(value->'canonical') <> 'object'
       or (
         value ? 'raw'
         and jsonb_typeof(value->'raw') <> 'object'
       )
       or (
         value ? 'extras'
         and jsonb_typeof(value->'extras') <> 'object'
       )
  ) then
    raise exception 'Estrutura de linha PEC inválida';
  end if;

  if p_avisos is null
     or jsonb_typeof(p_avisos) <> 'array'
     or jsonb_array_length(p_avisos) > 100
     or pg_column_size(p_avisos) > 262144
  then
    raise exception 'Avisos PEC inválidos';
  end if;
end
$$;

revoke all on function private.exigir_payload_pec_rpc_v30(
  text, text, integer, jsonb, jsonb, jsonb
)
from public, anon, authenticated, service_role;

commit;
