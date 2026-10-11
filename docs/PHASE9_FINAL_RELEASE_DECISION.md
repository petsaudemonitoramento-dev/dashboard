# MAE APS – Profissionais | Fase 9 — Decisão final de release

> Documento vivo da auditoria adversarial. Este checkpoint não autoriza publicação, promoção de deployment, merge em `main` nem alteração de banco remoto.

## Resumo executivo

**Decisão provisória: NO-GO.** O SHA candidato está comprovadamente verde em CI efêmero, porém a CSP híbrida ainda não foi homologada em staging Vercel isolado. O gate atual desabilita deliberadamente a política quando `VERCEL=1`; portanto o Preview existente não executa a CSP candidata. A URL do Preview está protegida por Vercel SSO e a resposta pública observável é da camada de proteção, não do aplicativo.

Este resultado distingue explicitamente os estados atuais:

1. PoC tecnicamente viável: **com evidência anterior**.
2. Implementação passando em CI local/efêmero: **com evidência anterior**.
3. Homologação completa em staging: **não demonstrada**.
4. Aprovação técnica para release: **não concedida**.
5. Autorização para publicar em produção: **fora do escopo e não concedida**.

## Escopo e estado reconstruído — Checkpoint A

Data da reconstrução: 2026-10-10, America/Sao_Paulo.

| Referência | SHA observado |
|---|---|
| Checkpoint consolidado Fases 1–8 | `8ff1953b9a7db2b4ba4b8a7a6c38e7a758bd14a3` |
| `audit/fase9-release-gate-v30` | `0bf74259d4f13e2f8089bb824eefccfd6030786d` |
| `implementation/fase9-hybrid-ci-v30` | `0bf74259d4f13e2f8089bb824eefccfd6030786d` |
| `experiment/fase9-csp-report-only-v30` | `c6727f222afabd5c67db3d3a422247d7676a64d0` |
| `main` (somente referência, não alterada) | `2edb572ad643946756938a1775ec65b5985ee944` |

A branch de auditoria contém os nove commits experimentais e os seis commits da implementação híbrida sobre o checkpoint `8ff1953`. Não há checkout, build, banco ou teste pesado no computador do usuário; as validações executáveis serão feitas em GitHub Actions e Supabase efêmero.

### Versões efetivas pelo lockfile

| Componente | Versão |
|---|---:|
| Next.js | 16.3.8 |
| React | 19.2.4 |
| TypeScript | 5.9.3 |
| ESLint | 9.39.5 |
| `@supabase/ssr` | 0.12.3 |
| `@supabase/supabase-js` | 2.110.7 |
| Playwright do workflow | 1.60.0, fixado e instalado sem alterar lockfile |
| Supabase CLI do workflow | 2.119.0, fixado |

### Arquitetura efetivamente implementada

- A política estrita de scripts é aplicada apenas a respostas HTML `GET` das rotas dinâmicas `/cadastro`, `/completar-cadastro`, `/aguardando-aprovacao` e `/dashboard/**`.
- O nonce é gerado por resposta com 16 bytes aleatórios e propagado pelo Proxy ao SSR via `x-nonce`; a resposta recebe CSP e `Cache-Control: private, no-store`.
- `script-src` usa `'self'`, nonce e `'strict-dynamic'`, sem `'unsafe-inline'` nas rotas candidatas.
- `/login`, `/recuperar-senha` e `/redefinir-senha` foram convertidas para renderização dinâmica por `connection()` e agora recebem nonce por resposta; hashes manuais deixaram de ser necessários nesse escopo.
- `style-src` ainda contém `'unsafe-inline'` em todo o escopo. A Fase 9 atual é, portanto, hardening de scripts em um subconjunto de rotas, não uma CSP totalmente estrita.
- RSC, prefetch e respostas não HTML não recebem nonce.
- O gate atual exige `CI=true`, rejeita `VERCEL=1`, rejeita qualquer `VERCEL_ENV` definido e exige Supabase em `http://127.0.0.1:54321`. Isso é fail-closed para CI, porém torna impossível habilitar a candidata num staging Vercel real.

A documentação oficial do Next.js confirma que nonces exigem renderização dinâmica, impedem cache/CDN de HTML e aumentam custo/latência. A documentação oficial da Vercel permite staging por ambiente customizado ou branch Preview com variáveis próprias; `VERCEL_ENV`, `VERCEL_TARGET_ENV`, `VERCEL_PROJECT_ID` e `VERCEL_PROJECT_PRODUCTION_URL` podem ser usados em um gate fail-closed. Uma futura habilitação segura deverá exigir simultaneamente ambiente não Production, projeto esperado, host esperado, backend Supabase de teste esperado e flag exclusiva do ambiente.

## Evidências reconstruídas

- GitHub Actions `38099393018`: job `114351987463`, sucesso no SHA candidato; `npm audit --omit=dev --audit-level=high`, TypeScript, ESLint, build, DB lint, 193 asserções pgTAP e 6 testes Playwright aprovados.
- O mesmo log registra `PHASE9_STAGING`: script inline sem nonce bloqueado, hidratação funcional, 10 scripts com nonce e zero erro de página.
- A amostra anterior de latência comparou endpoints diferentes (`/login` estático e `/cadastro` dinâmico); ela é indicativa, não é um A/B causal e não satisfaz o Gate I.
- GitHub Deployment `6988993418` vincula o SHA a um Preview do projeto Vercel **`painelprenatal`**, URL `painelprenatal-64engku90-petsaudemonitoramento-devs-projects.vercel.app`.
- Requisições públicas a `/`, `/cadastro`, `/login` e `/api/health` retornaram `302` para Vercel SSO. Não foi possível observar headers do aplicativo sem uma fonte de acesso já autorizada.
- O repositório não contém `.vercel/project.json` nem `vercel.json`. Os environments GitHub observados incluem `Production – painelprenatal`, mas não identificam um environment `maeaps`.
- Como o mesmo SHA tem status Vercel direcionado a `vercel.com/.../painelprenatal/...`, não há evidência de que o software candidato tenha sido homologado no projeto distinto `maeaps`.

Referências oficiais consultadas:

- [Next.js — Content Security Policy](https://nextjs.org/docs/app/guides/content-security-policy)
- [Vercel — System environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)
- [Vercel — Environments e staging](https://vercel.com/docs/deployments/environments)
- [Supabase — Testing overview](https://supabase.com/docs/guides/local-development/testing/overview)
- [Supabase — SSR client e validação de identidade](https://supabase.com/docs/guides/auth/server-side/creating-a-client)

## Inventário de riscos P0–P3

| ID | Prioridade | Risco e evidência | Tratamento |
|---|---|---|---|
| F9-001 | P0 | O gate original CI-only impossibilitava a candidata em Vercel. | **Corrigido em código:** Preview só habilita com coincidência exata de environment, target, project ID, branch, host e Supabase sintético; Production e o projeto remoto conhecido são negados. Homologação real continua obrigatória. |
| F9-002 | P0 | Não há evidência de Vercel + Supabase de teste isolados, deploy identificado e headers reais da candidata. | Gate H fica BLOCKED até existir ambiente inequivocamente isolado e acessível. |
| F9-003 | P1 | Deployment observado pertence a `painelprenatal`, enquanto o contexto também menciona `maeaps`; vínculo correto não foi comprovado. | Exigir confirmação do projeto, ambiente e SHA antes de qualquer homologação. |
| F9-004 | P1 | A implementação original mantinha `script-src 'unsafe-inline'` nas rotas públicas; estilos ainda mantêm `'unsafe-inline'`. | **Scripts corrigidos:** as três rotas públicas agora são dynamic+nonce. Estilos continuam como risco residual e impedem declarar CSP integralmente estrita. |
| F9-005 | P1 | Os 6 Playwright não exercitam sessão autenticada nem fluxos clínicos sob a CSP candidata. | Criar fixtures exclusivamente sintéticas no Supabase efêmero e ampliar E2E sem service role no browser. |
| F9-006 | P1 | A medição anterior compara endpoints diferentes e não mede Vercel, cache ou cold start. | Implementar A/B do mesmo endpoint/build sob condições equivalentes; staging permanece necessário. |
| F9-007 | P1 | Rollback de policy/deployment/cache/sessão não foi ensaiado. | Criar exercício reversível em CI e runbook por SHA; não testar em Production. |
| F9-008 | P2 | Nonce torna as rotas selecionadas dinâmicas, removendo cache de HTML e podendo elevar invocações/custo. | Medir no mesmo endpoint e documentar consequência operacional. |
| F9-009 | P2 | Diretivas específicas `script-src-attr` e `style-src-attr` não estão declaradas; herdam fallbacks. | Testar handlers/atributos e tornar a intenção explícita quando compatível. |
| F9-010 | P2 | `strict-dynamic` altera o fallback em navegadores compatíveis e exige teste real de scripts parser-inserted e navegação. | Cobrir comportamento negativo e compatibilidade no Chromium; registrar limites de browser. |
| F9-011 | P3 | `npm ci` anterior reportou cinco advisories HIGH somente em ferramentas de desenvolvimento; runtime audit reportou zero. | Não usar `--force`; acompanhar upstream e manter gate de runtime. |

## Matriz formal de decisão

| Gate | Criticidade | Evidência | Resultado | Bloqueador | Ação |
|---|---|---|---|---|---|
| A — Arquitetura | Alta | Branches, SHAs, versões, commits, workflow e deployment reconstruídos neste checkpoint | PASS | Não | Prosseguir para auditoria adversarial da implementação |
| B — CSP | Crítica | Run `38102293195`: 20 testes do gate, 7 Playwright; script e handler inline bloqueados, nonce único de 128 bits, query/redirect cobertos | PASS | Não no escopo CI; Gate H ainda bloqueia release | Repetir os mesmos testes no staging isolado quando provisionado |
| C — Cache e hashes | Alta | Run `38102720660`: dois builds independentes mantiveram auth dinâmica, IDs distintos e `no-store`; hashes manuais eliminados | BLOCKED | Sim: CDN/cache Vercel não observado no app por falta de staging acessível | Validar headers e cache efetivos no staging isolado |
| D — Estilos | Alta | Run `38149208336`: 21 estilos estáticos migrados; allowlist exata de 3 estilos dinâmicos e 1 iframe | BLOCKED | Sim: `style-src`/`style-src-attr` ainda exigem `unsafe-inline` e não houve validação visual em staging | Preservar exceções explícitas; validar páginas internas e staging antes de endurecer estilos |
| E — Autorização | Crítica | 193 pgTAP anteriores; E2E autenticado sob CSP não executado nesta auditoria | NOT RUN | Sim | Reexecutar RLS e adicionar E2E sintético viável |
| F — Fluxos clínicos | Crítica | Não exercitados pelo Playwright atual | NOT RUN | Sim | Cobrir fluxos executáveis em CI sintético e registrar limitações |
| G — Regressão/acessibilidade | Alta | Baseline anterior existe; nova validação pendente | NOT RUN | Sim | Reexecutar qualidade, Playwright e axe |
| H — Staging isolado | Crítica | Preview protegido de `painelprenatal`; CSP desativada por código; backend isolado não provado | BLOCKED | Sim | Provisionamento/configuração humana de staging separado, sem dados/secrets reais |
| I — Desempenho | Alta | Run `38102720660`: A/B do mesmo build e `/login`, 60 amostras/variante; p95 TTFB 9,29 ms baseline e 10,75 ms candidata | BLOCKED | Sim: cold start, CDN, custo e capacidade Vercel indisponíveis | Repetir no staging isolado sob condições equivalentes |
| J — Rollback | Crítica | Nenhum ensaio reproduzível identificado | NOT RUN | Sim | Implementar ensaio e runbook em CI/staging |

## Histórico de checkpoints

### Checkpoint A — reconstrução do estado real

- Objetivo: confirmar branches, SHAs, arquitetura, versões, CI e deployment antes de alterar segurança.
- Alterações: criação deste relatório e habilitação do workflow híbrido para a branch de auditoria.
- Comandos/evidências: GitHub API/Actions/Deployments, leitura integral dos documentos Fase 9, consulta a documentação oficial, headers públicos do Preview.
- Resultado: arquitetura reconstruída; dois bloqueadores P0 demonstrados; decisão provisória NO-GO.
- Próxima dependência: executar o CI no novo SHA e implementar testes fail-closed do gate de staging antes de qualquer tentativa de homologação.

## Correções implementadas na auditoria

- O gate deixou de ser exclusivamente CI-only. Em Vercel ele somente abre quando `VERCEL_ENV=preview` e há igualdade exata entre valores configurados e observados para target environment, project ID, branch, hostname e origem Supabase sintética.
- O projeto remoto oficial conhecido `bhkyfcnuxcvjgvusgpgm` é explicitamente recusado pelo gate de staging mesmo se houver configuração equivocada coincidente.
- O gate permanece compatível com o Supabase efêmero de CI e nunca abre em Production.
- `script-src-attr 'none'` passou a declarar e impor o bloqueio de event handlers; `style-src-attr 'unsafe-inline'` documenta a exceção de estilos ainda necessária.
- A origem websocket local/HTTPS agora é derivada corretamente como `ws:`/`wss:`.
- Verificações estáticas e unitárias baratas rodam antes de qualquer download/inicialização do Supabase, reduzindo custo e impacto de limites do Docker Hub.

### Evidência do Checkpoint B

- Commit funcional: `1fae714b0cafb53398ad98db667fdd752c5e934b` (inclui correções iniciadas em `f6f25d4` e `e93da19`).
- GitHub Actions: [run 38102293195](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/38102293195), sucesso em 3m34s.
- Gate fail-closed: 20/20 testes Node aprovados, incluindo negativas para Production, target, project ID, branch, host, wildcard, flag, backend divergente e Supabase remoto conhecido.
- CSP em navegador: 7/7 Playwright aprovados; script sem nonce e `onerror` inline bloqueados, query string não criou HTML executável, redirect manteve nonce/no-store, hidratação e formulário sintético permaneceram funcionais.
- Banco: 15 arquivos, 193 asserções pgTAP, `Result: PASS`; DB lint aprovado no Supabase efêmero.
- Qualidade: TypeScript, ESLint e build aprovados; runtime `npm audit --omit=dev --audit-level=high` encontrou zero vulnerabilidades.
- Inventário estático: 77 arquivos; zero sinks proibidos (`dangerouslySetInnerHTML`, `innerHTML=`, `document.write`, `eval`, `new Function`, `<script>` literal); 23 propriedades React `style` então detectadas e 1 iframe exigiam avaliação no Gate D; o scanner também tinha um ponto cego para `style={...}`, corrigido no Checkpoint D.
- Run `38102100187` falhou no primeiro scanner por defeito de caminho do próprio teste, depois corrigido; não foi falha do produto. O log também registrou rate limit transitório do Docker Hub, do qual `supabase start` recuperou.

### Checkpoint B — CSP e ativação segura de staging

- Objetivo: remover a impossibilidade técnica de homologação sem permitir ativação acidental em Production.
- Alterações: gate Vercel fail-closed, diretiva explícita de event handlers, testes unitários adversariais, novos probes em navegador e inventário estático.
- Resultado: Gate B PASS no escopo CI/efêmero. Isso não substitui o Gate H; nenhum environment Vercel ou Supabase remoto foi criado/alterado.
- Riscos restantes: estilos inline, páginas públicas estáticas com script unsafe-inline, ausência de staging isolado e ausência de E2E clínico autenticado sob a candidata.
- Próxima dependência: Gate C/D e construção de E2E sintético autenticado sem service role no browser.
### Checkpoint C — páginas públicas, cache e desempenho comparável

- Commit funcional: `edb300ab376d3538fa66d3da9179d6811164f802`.
- GitHub Actions: [run 38102720660](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/38102720660), sucesso em 4m04s.
- Decisão arquitetural: dynamic+nonce para `/login`, `/recuperar-senha` e `/redefinir-senha`. A alternativa de hashes manuais foi rejeitada porque os artefatos anteriores já demonstraram deriva entre builds e não havia geração atômica vinculada ao deploy.
- Reprodutibilidade: dois builds limpos no mesmo run classificaram as três rotas como dinâmicas, sem HTML estático; IDs `eeRcSajjfGJTc2JeI4BzE` e `BkebHDnG1lZQ0C5bvIfRE` confirmaram artefatos distintos sem alterar o modo de renderização.
- Navegador: 7/7 testes passaram; login, recuperação e redefinição hidrataram sob nonce, sem submissão nem dados reais.
- A/B local do mesmo endpoint e build: 10 warm-ups e 60 amostras por variante, concorrência 1. Baseline `/login`: p50/p95 TTFB 6,81/9,29 ms; candidata: 6,97/10,75 ms. Total p95: 10,14/12,21 ms. Headers medianos: 1280/1384 bytes. Todas as 60 respostas candidatas tiveram nonce e `no-store`.
- Limite de regressão CI derivado do baseline: p95 máximo 29,29 ms (maior entre 3× baseline e baseline + 20 ms); candidata passou. Esse limite detecta regressão grosseira no componente, não é orçamento de Production.
- Limitação: não houve acesso ao aplicativo atrás do SSO Vercel; cold start, CDN, custo e capacidade continuam indisponíveis. Gates C e I permanecem BLOCKED, sem PASS parcial.
- Próxima dependência: reduzir estilos inline estáticos e separar os três estilos realmente dinâmicos de gráficos.
### Checkpoint D — estilos inline e superfície renderizada

- Objetivo: distinguir estilos estáticos removíveis de valores realmente calculados e impedir que a superfície cresça silenciosamente.
- Commit funcional: `1f83948059ac36e24c413e0a8a63f84806dfd32c`.
- Correção: 21 estilos inline estáticos das páginas Início, Alertas, Atendimentos, Perfil e Administração foram movidos para CSS, preservando os mesmos valores; não houve refatoração visual ampla.
- Finding de ferramenta: o scanner anterior reconhecia apenas `style={{...}}` e omitia `style={...}`. O padrão agora cobre qualquer prop React `style` e exige allowlist exata por arquivo e quantidade.
- Exceções aprovadas somente para inventário: 3 estilos calculados no dashboard de indicadores (largura de barras/segmentos e variáveis do donut) e 1 iframe Metabase, todos no mesmo componente. Qualquer nova ocorrência ou mudança de quantidade reprova o gate barato.
- GitHub Actions: [run 38149208336](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/38149208336), sucesso. Scanner: 78 arquivos, zero sinks proibidos, 3 props `style`, 1 iframe, zero inventário não aprovado. TypeScript, ESLint, dois builds, benchmark, DB lint, 193 pgTAP e 7 Playwright aprovados; runtime audit com zero vulnerabilidades.
- Limitação: a policy ainda declara `style-src 'unsafe-inline'` e `style-src-attr 'unsafe-inline'`; remover essas exceções quebraria os três gráficos dinâmicos. Sem staging e revisão visual das telas internas, Gate D é **BLOCKED**, não PASS.
- Próxima dependência: E2E autenticado sintético sob CSP, acessibilidade das telas internas e validação visual/humana em staging isolado.
## Decisão atual

**NO-GO.** Esta é uma decisão de release readiness, não uma rejeição da viabilidade da PoC. A política de scripts em CI mostrou mérito, mas a evidência indispensável de staging isolado está ausente e a própria implementação impede sua ativação em Vercel. A decisão somente poderá mudar depois que todos os gates obrigatórios estiverem PASS; qualquer FAIL ou BLOCKED preservará o NO-GO.