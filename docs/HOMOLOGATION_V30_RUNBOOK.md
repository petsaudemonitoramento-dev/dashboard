# Homologação V30 — Software dos Profissionais

## Objetivo

Aplicar e validar a linha V30 no projeto Supabase `dashboard-v2` sem misturar homologação com desenvolvimento e sem inserir dados reais antes dos gates de segurança.

## Estado remoto observado em 08/10/2026

Projeto Supabase:

- nome: `dashboard-v2`
- ref: `bhkyfcnuxcvjgvusgpgm`
- região: `sa-east-1`
- PostgreSQL: 17.6
- status: `ACTIVE_HEALTHY`

Migrations registradas remotamente:

1. `20260720114217_clean_cumulative_schema`
2. `20260801195500_professional_credentials_and_approval`
3. `20260801213000_clinical_separation_and_ubs_scope`
4. `20260802131541_fix_audit_identity_generation`
5. `20260802140000_bootstrap_initial_governance`
6. `20260802213500_publish_safe_metabase_analytics_v26`

As migrations V30 validadas no CI ainda não estavam aplicadas no remoto no momento deste levantamento.

## Security Advisor antes da homologação

Baseline observado:

- leaked password protection: desativada;
- quatro helpers privados com `search_path` mutável no schema remoto antigo;
- tabela `private.auditoria_acompanhamentos_visitas_v29_1` com RLS desabilitado;
- múltiplos avisos de RLS habilitado sem policy em tabelas privadas;
- policies permissivas antigas e redundantes ainda presentes no schema remoto.

A tabela privada com RLS desabilitado foi verificada em modo somente leitura:

- `anon`: sem SELECT/INSERT/UPDATE/DELETE;
- `authenticated`: sem SELECT/INSERT/UPDATE/DELETE;
- schema `private`: sem USAGE para `anon` e `authenticated`;
- `service_role`: acesso esperado.

Portanto não foi identificada exposição ativa por Data API nessa tabela no baseline, mas RLS deve ser habilitado como defesa em profundidade no processo de atualização.

## Gate 0 — antes de qualquer migration

- confirmar branch/commit aprovado;
- confirmar CI verde no mesmo SHA;
- confirmar backup disponível;
- definir rollback;
- congelar mudanças concorrentes de schema;
- não usar dados reais novos durante a janela;
- não executar `db reset --linked`;
- não aplicar seed sintético no remoto.

## Gate 1 — backup e recuperação

Seguir `docs/DISASTER_RECOVERY_RUNBOOK.md`.

Nenhuma migration V30 deve ser aplicada sem um ponto de recuperação aceitável.

## Gate 2 — comparação do schema

Comparar:

- migrations locais aprovadas;
- migration history remota;
- funções SECURITY DEFINER;
- policies RLS;
- grants de `anon` e `authenticated`;
- tabelas/views legadas;
- índices relevantes.

Toda diferença inesperada deve ser explicada antes do push.

## Gate 3 — aplicação controlada

Aplicar somente as migrations já aprovadas em Git e testadas no Supabase efêmero.

Nunca editar o banco manualmente para “fazer passar” e deixar o Git divergente.

Registrar:

- horário;
- SHA;
- migrations aplicadas;
- operador;
- resultado.

## Gate 4 — pós-migration imediato

Executar novamente:

- Security Advisor;
- Performance Advisor;
- inventário de grants;
- inventário de SECURITY DEFINER;
- verificação de RLS nas tabelas públicas;
- checagem de migration history.

Bloqueadores:

- HIGH/CRITICAL de segurança inexplicado;
- tabela pública clínica sem RLS;
- policy por mesma UBS permitindo acesso clínico;
- função privilegiada inesperadamente executável por `anon`;
- migration parcialmente aplicada.

## Gate 5 — Auth

Confirmar no Supabase hospedado:

- confirmação de e-mail ativa;
- e-mail de confirmação entregue;
- Redirect URLs restritas;
- Google OAuth funcional no domínio correto;
- leaked password protection habilitada;
- usuário pendente não recebe autorização clínica;
- usuário revogado perde acesso apesar de sessão antiga.

## Gate 6 — Vercel

Executar o workflow manual:

`Profissionais Homologation Public Smoke`

Ele valida:

- `/api/health`;
- CSP;
- nosniff;
- frame protection;
- Referrer-Policy;
- Permissions-Policy;
- HSTS;
- correlation ID;
- endpoint ACS legado em 404;
- carga pública controlada.

## Gate 7 — smoke clínico A × B

Criar apenas contas sintéticas de homologação:

- Profissional A;
- Profissional B;
- mesma UBS;
- Gestante A vinculada a A;
- Gestante B vinculada a B.

Tentar deliberadamente:

- A listar B;
- A abrir UUID de B;
- A salvar ficha de B;
- A inserir consulta/exame/vacina de B;
- A gerar PDF de B;
- A mover B para lixeira;
- A consultar lote PEC de B;
- A falsificar `profissional_id=B`;
- A operar após ser revogado.

Qualquer sucesso indevido reprova a homologação.

## Gate 8 — observabilidade

Confirmar:

- `x-request-id` presente;
- erros correlacionáveis por request ID;
- nenhum payload clínico nos logs;
- nenhum token/senha nos logs;
- 403/429/5xx observáveis sem PII.

## Critério de aprovação

Somente liberar dados reais quando todos os gates forem concluídos e o parecer continuar sem HIGH/CRITICAL aberto.
