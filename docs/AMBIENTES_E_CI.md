# Ambientes de desenvolvimento, CI e produção

## Fonte de código

Repositório:

`petsaudemonitoramento-dev/dashboard`

Branch de desenvolvimento do software dos Profissionais:

`profissionais-v1-seguranca`

A branch `main` permanece como referência histórica enquanto a nova arquitetura é construída e auditada.

## Supabase remoto oficial

O projeto remoto destinado ao software dos Profissionais é:

- nome: `dashboard-v2`
- project ref: `bhkyfcnuxcvjgvusgpgm`
- região: `sa-east-1`

Esse projeto NÃO é ambiente de desenvolvimento do Codex.

Durante a implementação, o Codex não deve receber token, senha de banco ou secret que permita alterar esse projeto.

## Ambiente principal de desenvolvimento

O ambiente principal é um Supabase efêmero criado dentro de GitHub Actions.

Fluxo:

```
Codex / commit
      ↓
branch profissionais-v1-seguranca
      ↓
GitHub Actions
      ↓
Supabase descartável no runner
      ↓
migrations
      ↓
seed estritamente sintético
      ↓
lint + pgTAP + testes de isolamento
      ↓
runner destruído
```

O banco criado no runner não contém dados do projeto remoto.

## Migrations recuperadas

As migrations em `supabase/migrations/` foram recuperadas diretamente de:

`supabase_migrations.schema_migrations`

do projeto `dashboard-v2`.

Foi recuperado somente SQL versionado. Não foi feito dump de dados.

As versões recuperadas são:

- 20260720114217 — clean_cumulative_schema
- 20260801195500 — professional_credentials_and_approval
- 20260801213000 — clinical_separation_and_ubs_scope
- 20260802131541 — fix_audit_identity_generation
- 20260802140000 — bootstrap_initial_governance
- 20260802213500 — publish_safe_metabase_analytics_v26

Não editar essas migrations retroativamente. Qualquer correção nova deve receber uma migration posterior.

## Drift conhecido no remoto

A inspeção mostrou objetos no `dashboard-v2` que não aparecem no histórico de migrations recuperado.

Entre eles:

- `public.acompanhamentos_visitas_equipe_v29_1`
- `private.auditoria_acompanhamentos_visitas_v29_1`
- `private.obter_painel_visitas_acs_v29_1`
- `private.obter_painel_visitas_equipe_v29_1`
- `private.registrar_acompanhamento_visita_v29_1`
- `public.keeper_ping`
- `public.rls_auto_enable`
- event trigger `ensure_rls`

Esses objetos NÃO foram incorporados automaticamente à baseline. O Codex deve avaliar quais pertencem ao produto dos Profissionais e normalizá-los através de migrations novas.

Não assumir que drift remoto é arquitetura aprovada.

## Findings de segurança que devem permanecer visíveis

Na inspeção atual do `dashboard-v2`:

- `public.acompanhamentos_visitas_equipe_v29_1` possui RLS habilitado, mas não possui policies;
- `private.auditoria_acompanhamentos_visitas_v29_1` está atualmente com RLS desabilitado no remoto.

A segunda condição foi sinalizada pelo Security Advisor como crítica. Ela deve ser tratada durante o hardening, mas não deve ser corrigida diretamente no remoto sem migration revisada e sem entender os acessos necessários.

## Seed

`supabase/seed.sql` é exclusivamente sintético.

É proibido colocar nele:

- dump remoto;
- nomes de pacientes;
- CNS;
- CPF;
- telefone;
- endereço;
- exames;
- informações clínicas;
- credenciais reais.

A chave `pec_pii_key` presente no seed é deliberadamente falsa e serve somente para CI/local.

## Codespaces

Codespaces é ambiente de suporte, não de produção.

O arquivo:

`.devcontainer/devcontainer.json`

prepara Node.js e Docker-in-Docker no computador em nuvem do Codespaces.

Se for necessário reproduzir interativamente o Supabase:

```bash
npx -y supabase@2.119.0 start
```

Isso consome recursos do Codespace, não do computador pessoal.

Quando o Codespace não estiver sendo usado, ele deve ser parado ou excluído para não consumir a cota gratuita.

## Regras de publicação no dashboard-v2

Comandos destrutivos contra remote são proibidos durante o desenvolvimento.

Especialmente:

```
supabase db reset --linked
```

Também é proibido ao Codex executar:

```
supabase db push
```

contra o `dashboard-v2` sem revisão humana.

A etapa futura de publicação deve ser:

```
nova migration
      ↓
CI passa
      ↓
auditoria humana
      ↓
Security Advisor
      ↓
db push --dry-run
      ↓
revisão do dry-run
      ↓
publicação controlada
```

## GitHub Actions

O workflow principal está em:

`.github/workflows/profissionais-security-ci.yml`

Ele usa uma versão fixa do Supabase CLI e não possui secrets do projeto remoto.

Portanto, a execução normal do CI não consegue escrever no `dashboard-v2`.

A suíte será ampliada pelo Codex com os testes A/B de isolamento entre profissionais.
