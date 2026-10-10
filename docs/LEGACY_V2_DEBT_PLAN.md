# Dívida técnica V2

## Objetivo

Remover progressivamente compatibilidades históricas sem alterar o comportamento já homologado.

## Superfícies desativadas

No produto Profissionais, permanecem como stubs/redirecionamentos:

- `/dashboard/mapa`;
- `/dashboard/indicadores`;
- `/dashboard/territorio`;
- `/dashboard/visitas`;
- `/dashboard/configuracoes`;
- `/api/acs/visitas`.

O CI executa `scripts/check-legacy-surface.mjs` para impedir reativação silenciosa.

Também é proibida referência runtime a:

- `visitas_acs_v21`;
- `acompanhamentos_visitas_equipe_v29_1`.

## Elementos que não devem ser removidos antes da homologação

Compatibilidades V18/V20/V21 que ainda são chamadas pelas wrappers V30 não devem ser apagadas apenas por serem antigas.

A regra é:

1. identificar dependências;
2. criar substituição V30;
3. testar em banco limpo;
4. testar A × B;
5. remover legado em migration própria.

## Pós-homologação

Criar uma fase de consolidação que:

- elimine funções não referenciadas;
- elimine policies antigas já substituídas;
- remova tabelas V2 sem uso;
- reduza scripts `aplicar-migracao-v*.mjs`;
- consolide documentação de funções públicas suportadas;
- mantenha migrations históricas imutáveis.

Não reescrever migrations já aplicadas em produção. Limpeza deve ocorrer por novas migrations aditivas.
## Inventário pós-homologação — 10/10/2026

A busca foi feita na árvore integrada da branch de qualidade, cobrindo runtime, migrations, pgTAP, scripts e workflows. Ausência de referência no frontend não foi usada isoladamente como prova.

### Remoção comprovadamente segura

| Superfície | Evidência | Decisão |
| --- | --- | --- |
| Funções privadas de ACS: registrar_acao_acs_v21, complementar_acao_acs_v21 e obter_painel_acs_v21 | Módulo e endpoint ACS estão desativados; não há referência no runtime, wrapper V30, trigger, policy ou view. As tabelas e analytics serão preservados. | Remover por migration nova com DROP FUNCTION RESTRICT e regressão pgTAP. |
| Funções privadas de indicadores/início: obter_indicadores_aluno_v1, obter_indicadores_v18, obter_indicadores_v21 e obter_inicio_v21 | Não há chamada no runtime nem em wrapper V30. As únicas chamadas entre elas formam um subgrafo fechado. Cinco funções do grupo ACS/indicadores/início ainda recebiam EXECUTE de service_role no schema privado. | Remover por migration nova com RESTRICT e retirar da allowlist estrutural. |
| Helper normalizar_data_cadastro_v21 | Única chamada restante é complementar_acao_acs_v21, removida no mesmo bloco. | Remover depois da função dependente, com RESTRICT. |
| Runners aplicar-migracao.mjs e aplicar-migracao-v15 até v21, mais scripts npm db:migrate* | Não integram runtime, CI ou wrappers. Executam SQL histórico com sql.unsafe contra SUPABASE_DATABASE_URL e duplicam o mecanismo canônico de migrations. | Remover runners e comandos npm; manter os SQL históricos como referência, sem executor privilegiado. |

### Dependência ainda necessária

| Superfície | Motivo para manter |
| --- | --- |
| security.usuario_pode_acessar_gestante_v18 | Compatibilidade viva: diversas policies ainda a chamam, e sua implementação delega ao modelo V30 de ownership individual. |
| definir_profissional_responsavel_v18 | Trigger de ownership na gestante; remoção alteraria integridade de INSERT. |
| hash_gestante_auditoria_v19 e bloquear_mutacao_auditoria_v22 | Trilha mínima e proteção append-only dependem deles. |
| Funções de lixeira V19 e helpers de autorização V19/V20 | Wrappers autenticados V30 ainda delegam a elas. |
| Funções de credencial/aprovação V22 | RPCs administrativas autenticadas ainda as usam. |
| importar_pec_impl_v22 | Corpo interno da importação V30, sem EXECUTE para clientes. |
| Funções clínicas/classificação V17 usadas por wrappers V30 | A cadeia V30 ainda depende delas; o nome antigo não autoriza remoção. |
| analytics.vw_indicadores_base_v18 e analytics.vw_fatores_risco_v18 | Views publicadas V26 dependem delas. |

### Uso incerto ou retenção relevante — preservar

| Superfície | Motivo |
| --- | --- |
| public.visitas_acs_v21 e private.auditoria_visitas_acs_v21 | A Data API está bloqueada e o runtime não grava, mas analytics publicado e eventual histórico retido ainda dependem das tabelas. |
| public.acompanhamentos_visitas_equipe_v29_1 | Só aparece em hardening condicional porque pode existir em ambientes históricos; conteúdo e retenção remota não foram inspecionados. |
| SQLs em database/ | São fontes históricas, não migrations atuais. Permanecem sem runners executáveis até decisão de arquivo/retensão. |
| Stubs de mapa, indicadores, território, visitas, configurações e ACS 404 | Mantêm comportamento explícito e são guardados pelo CI/monitor. Removê-los mudaria UX/contrato sem ganho relevante. |

As policies clínicas territoriais antigas já são removidas por migrations V30. Não foi encontrada policy clínica atual em que mesma UBS seja autorização final.