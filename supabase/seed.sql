-- ============================================================
-- SEED EXCLUSIVAMENTE LOCAL/CI
-- ============================================================
-- Nunca inserir aqui dados, dumps, nomes, documentos ou informações
-- clínicas provenientes do dashboard-v2 remoto.
--
-- A chave abaixo NÃO é segredo de produção. Ela existe apenas para
-- permitir que funções de criptografia sejam exercitadas em ambientes
-- efêmeros e descartáveis.

do $seed$
begin
  if not exists (
    select 1
    from vault.secrets
    where name = 'pec_pii_key'
  ) then
    perform vault.create_secret(
      '0000000000000000000000000000000000000000000000000000000000000000',
      'pec_pii_key',
      'Synthetic local/CI key - never use in production'
    );
  end if;
end;
$seed$;

insert into public.ubs (
  id,
  nome,
  nome_abreviado,
  codigo_interno,
  municipio,
  uf,
  ativa
)
values (
  '00000000-0000-4000-8000-000000000101'::uuid,
  'UBS Teste Segurança CI',
  'UBS CI',
  'CI-UBS-001',
  'Campina Grande',
  'PB',
  true
)
on conflict (id) do nothing;
