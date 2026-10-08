# Auditoria de Segurança — Profissionais V30

## Parecer executivo

**Parecer:** `APROVADO PARA HOMOLOGAÇÃO`

A implementação auditada até o SHA `ab61d3445b194ffd11182a80106f004e96733ac4` passou no workflow **Profissionais Security CI** (run `37834086143`) com os dois jobs verdes:

- **App quality:** sucesso;
- **Supabase schema and security tests:** sucesso.

Não permanece finding **CRITICAL** ou **HIGH** aberto no código auditado. Os findings HIGH encontrados durante a auditoria foram corrigidos e possuem regressões/guardrails.

Este parecer significa **pronto para homologação controlada**, não “já aprovado para produção”. As migrations ainda não foram aplicadas ao `dashboard-v2` remoto nesta auditoria.

## Escopo e fonte de verdade

- Repositório: `petsaudemonitoramento-dev/dashboard`
- Base inicial do hardening: `audit/pre-codex-hardening`
- Auditoria independente inicial: `codex/security-audit-v30`
- Continuação de hardening: `audit/continue-security-v30`
- Auditoria residual Codex: `codex/security-audit-final-v30`
- Fechamento: `audit/finalize-security-v30`
- SHA de implementação auditada antes deste relatório: `ab61d3445b194ffd11182a80106f004e96733ac4`

Regra principal validada:

> Um profissional só pode acessar gestantes explicitamente vinculadas à sua responsabilidade. Pertencer à mesma UBS nunca é autorização clínica suficiente.

Nenhuma escrita foi realizada no Supabase remoto `dashboard-v2` durante a auditoria.

## Findings

| ID | Severidade | Componente | Finding | Correção | Evidência / regressão | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-V30-001 | HIGH | PEC / RLS | Profissional revogado conservava acesso ao próprio lote PEC usando JWT antigo. | Policies passaram a exigir usuário profissional ativo, completo e aprovado em todas as operações. | `20261008011000_fix_revoked_professional_pec_access.sql`; `011_revoked_professional_import_access.sql`. | **CORRIGIDO** |
| SEC-V30-002 | HIGH | Script administrativo | Bootstrap legado podia criar/alterar conta usando chave privilegiada, identidade hardcoded e credencial temporária reutilizável. | Script/comando/variável removidos e guardrail adicionado ao CI. | Commit `79a7ae7`; run `37821619995`. | **CORRIGIDO** |
| SEC-V30-003 | MEDIUM | Auth/perfil | Cadastro e conclusão de perfil ainda faziam leituras via PostgreSQL privilegiado. | Leituras migradas para Supabase SSR/Data API + RLS. | Commit `bcb3e2c`; run `37823251275`. | **CORRIGIDO** |
| SEC-V30-004 | MEDIUM | Avisos | `authenticated` ainda possuía DML direto em `avisos_ubs`, podendo contornar a RPC que registra auditoria. | DML direto revogado; escrita administrativa somente pela RPC auditada. | `20261008163000_restrict_notice_direct_writes.sql`; `016_admin_barrier.sql`. | **CORRIGIDO** |
| SEC-V30-005 | MEDIUM | Cadastro/Auth | Cadastro por e-mail marcava `email_confirm: true`, pulando prova de posse do endereço. | Usuário passa a nascer não confirmado e recebe confirmação pelo Supabase; CI impede reintrodução de auto-confirmação. | Rota `/api/auth/cadastro`; guardrail do workflow. | **CORRIGIDO** |
| SEC-V30-006 | HIGH | ACS legado / BOLA | `visitas_acs_v21` ainda permitia SELECT de equipe clínica por mesma UBS via Data API, embora UI/endpoint ACS estivessem desativados. | Grants de `anon/authenticated` removidos e policies legadas eliminadas. | `20261008170000_disable_legacy_acs_data_api.sql`; `018_legacy_acs_surface.sql`. | **CORRIGIDO** |
| SEC-V30-007 | MEDIUM | Cadastro/Auth | Resposta 409 específica permitia enumeração de e-mails cadastrados. | Resposta de duplicidade passou a ser neutra; confirmação pode ser reenviada sem revelar existência da conta. | Rota `/api/auth/cadastro`; UI de cadastro. | **CORRIGIDO** |
| SEC-V30-008 | LOW | PDF | Código da gestante era usado diretamente no nome do arquivo em `Content-Disposition`. | Nome do arquivo passou por normalização/allowlist antes de formar o header. | Rota do PDF, commit `5c2583d`. | **CORRIGIDO** |
| SEC-V30-009 | MEDIUM | Integridade clínica | RLS das tabelas filhas validava ownership da gestante, mas não impedia A de declarar `profissional_id=B` em registro da própria gestante. | INSERT/UPDATE agora exigem `profissional_id = auth.uid()`. | `20261008173000_enforce_child_record_authorship.sql`; `013_child_table_isolation.sql`. | **CORRIGIDO** |

## Ownership e IDOR/BOLA

O cenário A × B usa dois profissionais da **mesma UBS**.

Os testes comprovam que A:

- vê a própria gestante e não vê B;
- não altera nem exclui a gestante de B;
- não insere consulta, exame, vacina, alta, classificação ou item apontando para B;
- não lê, altera ou apaga os registros filhos de B;
- não obtém relatório/PDF da classificação de B;
- não move, restaura ou exclui definitivamente a gestante de B;
- não toma ownership durante importação PEC;
- não falsifica a autoria B em registros da própria gestante.

A compatibilidade `security.usuario_pode_acessar_gestante_v18` delega ao modelo V30, de forma que policies legadas que ainda referenciam V18 herdam o ownership individual.

## Revogação e estados de autorização

Foram cobertos:

- profissional ativo/aprovado/completo;
- cadastro incompleto;
- aprovação pendente;
- perfil rejeitado;
- perfil inativo;
- perfil logicamente excluído;
- profissional revogado com JWT antigo;
- administrador revogado.

Um profissional revogado perde:

- SELECT clínico;
- acesso às tabelas filhas;
- acesso ao lote PEC;
- relatório/PDF;
- escrita clínica;
- RPCs que dependem da autorização V30.

O teste `017_authorization_states.sql` impede regressões nos estados pendente/rejeitado/incompleto/inativo/excluído.

## SECURITY DEFINER e grants

A suíte `014_privileged_function_surface.sql` foi endurecida para usar **allowlist exata**, e não prefixo genérico.

Validações permanentes:

- `anon` não executa SECURITY DEFINER privada;
- `authenticated` não executa helpers privados;
- SECURITY DEFINER relevantes têm `search_path` explícito;
- `anon` não executa RPCs privilegiadas públicas;
- `authenticated` só executa as RPCs V30 explicitamente aprovadas;
- helpers do schema `security` também possuem allowlist explícita;
- RPCs profissionais derivam identidade de `auth.uid()`;
- RPCs administrativas revalidam administrador ativo a partir de `auth.uid()`.

Os default privileges do banco revogam privilégios de cliente por padrão para novas tabelas/funções criadas pelo papel `postgres`.

## PostgreSQL privilegiado

No runtime web, `getPostgresClient` permanece somente em:

- `src/lib/security/rate-limit.ts`;
- `src/lib/db/postgres.ts`.

O uso é restrito ao rate limiter persistente e chama `private.consumir_rate_limit_v30` com identificador previamente hasheado. Não lê nem grava dado clínico.

O CI falha caso `getPostgresClient` reapareça em outro arquivo de `src`.

Os scripts `aplicar-migracao*.mjs` são utilitários operacionais manuais e não integram o runtime web.

## PEC

A versão auditada:

- aceita apenas CSV;
- não possui `xlsx` na árvore;
- rejeita XLS/XLSX pelo fluxo atual;
- limita request e arquivo;
- limita linhas, colunas e tamanho de célula;
- rejeita CSV com aspas não fechadas;
- normaliza nome de arquivo e rejeita traversal;
- não executa fórmulas;
- não registra arquivo bruto em logs;
- vincula o lote ao profissional atual;
- impede takeover de gestante pertencente a outro profissional;
- bloqueia usuário revogado.

O workflow contém guardrail que falha se `xlsx` reaparecer.

## Auth e sessão

Foram endurecidos:

- login server-side com rate limit;
- cadastro público fixo em `equipe_ubs`;
- confirmação obrigatória de posse do e-mail no fluxo de senha;
- resposta neutra contra enumeração de contas;
- recuperação de senha com resposta neutra;
- redefinição protegida por sessão;
- callback OAuth com destinos em allowlist;
- conclusão de perfil via RPC usando `auth.uid()`;
- perfil pendente/inativo/rejeitado não recebe acesso clínico.

A chave `SUPABASE_SECRET_KEY` fica restrita à rota server-only de cadastro e o CI impede seu aparecimento em outro arquivo de `src`.

## CSRF, validação e limites

As mutações sensíveis usam `mutationRequestError` para:

- rejeitar `Sec-Fetch-Site: cross-site`;
- validar `Origin` quando presente;
- validar Content-Type;
- aplicar limite declarado e limite real durante leitura do body.

Payloads clínicos e de risco usam allowlists; IDs são validados antes de casts/uso; limites também existem nas RPCs para que chamar a RPC diretamente não contorne o Route Handler.

## Logs, PII e secrets

O CI impede:

- `console.log/warn/error` direto em `src`, exceto o logger sanitizado;
- conexão PostgreSQL privilegiada fora do rate limiter;
- `SUPABASE_SECRET_KEY` fora da rota server-only autorizada;
- credenciais privilegiadas com prefixo `NEXT_PUBLIC_`;
- retorno do bootstrap legado com senha reutilizável.

`logServerFailure` registra contexto técnico/código e não imprime payload clínico ou a exception completa.

## Páginas e superfícies legadas

No produto profissional:

- indicadores, território, mapa, visitas e configurações redirecionam;
- endpoint ACS legado responde 404;
- usuários, autorizações e UBS dependem das RPCs administrativas e falham para profissional comum/admin revogado;
- `visitas_acs_v21` não possui mais acesso pela Data API para `anon/authenticated`;
- analytics publicado é exclusivo do papel `metabase_reader`.

## Dependências

No run `37834086143`:

- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilidades de produção**;
- audit completo: **5 HIGH apenas na cadeia de desenvolvimento** `eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces`.

O finding upstream é `GHSA-vfj7-8cjw-p6xm`. No momento desta auditoria não existe release corrigida de `braces`; o próprio npm sugere `--force` com downgrade incompatível do `eslint-config-next`. Por isso não foi aplicado `npm audit fix --force`.

Essa ressalva afeta tooling de lint/build, não o bundle/runtime de produção, e deve ser reavaliada quando houver patch upstream.

## Headers/CSP

O código configura:

- Content-Security-Policy;
- `frame-ancestors 'none'`;
- `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- Referrer-Policy;
- Permissions-Policy;
- HSTS somente em produção;
- COOP.

`unsafe-eval` não é incluído em produção. `unsafe-inline` ainda existe para compatibilidade com o stack Next.js atual e fica registrado como hardening futuro de baixa severidade.

A resposta real entregue pela Vercel deve ser verificada na homologação.

## Rate limiting

O rate limiter é persistente em PostgreSQL, possui retenção testada e usa hashes para o ator.

O deploy esperado é Vercel; a confiança em `x-forwarded-for` deve ser confirmada no ambiente real. Não foi substituído por contador em memória.

## Resultado do CI

Run consolidado de implementação: **37834086143**

SHA: `ab61d3445b194ffd11182a80106f004e96733ac4`

Resultados:

- `npm ci`: sucesso;
- audit de produção: 0 vulnerabilidades;
- audit completo: ressalva de tooling descrita acima;
- guardrails de segurança: sucesso;
- ESLint: sucesso;
- TypeScript: sucesso;
- Next.js build: sucesso;
- Supabase efêmero a partir das migrations: sucesso;
- `supabase db lint --local --level error`: sucesso;
- pgTAP: sucesso;
- migration list: sucesso.

## Pendências que exigem ambiente real

Antes de produção:

1. Fazer backup e plano de rollback do `dashboard-v2`.
2. Comparar/dry-run das migrations contra `bhkyfcnuxcvjgvusgpgm`.
3. Aplicar migrations somente após revisão humana.
4. Executar Security Advisor após a migration e tratar achados críticos não explicados.
5. Habilitar/verificar proteção contra senhas vazadas.
6. Confirmar que confirmação de e-mail está habilitada e que SMTP/template funcionam.
7. Adicionar/confirmar domínio oficial nas Redirect URLs do Auth.
8. Testar Google OAuth no domínio oficial.
9. Confirmar headers/CSP efetivamente entregues pela Vercel.
10. Revisar logs Vercel/Supabase para ausência de PII.
11. Executar smoke test com contas sintéticas A × B na mesma UBS.
12. Confirmar/rotacionar qualquer credencial histórica que possa ter sido usada pelo bootstrap legado removido.
13. Não executar `db reset --linked` e não enviar seed sintético para produção.
14. Acompanhar patch upstream de `braces`/cadeia ESLint.

## Critério final

A auditoria não encontrou, no estado aprovado para homologação, caminho conhecido em que um profissional obtenha dados de outro profissional apenas por pertencer à mesma UBS ou conhecer um UUID.

**PARECER FINAL: `APROVADO PARA HOMOLOGAÇÃO`**
