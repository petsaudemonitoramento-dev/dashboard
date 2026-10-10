# Decisão de arquitetura — Fase 9 CSP do MAE APS – Profissionais

**Data:** 10/10/2026  
**Âncora das Fases 1–8:** `8ff1953b9a7db2b4ba4b8a7a6c38e7a758bd14a3`  
**Escopo:** decisão de engenharia e testes isolados, **não é autorização de produção**.

## 1. Evidências coletadas

| PoC | CI | Resultado verificável |
| --- | --- | --- |
| CSP estrita Report-Only inicial | [38086780347](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/38086780347) | 3 violações `script-src-elem`; 4 `style-src-attr`; login funciona; CI verde. |
| Nonce por request, browser sem enforcement | [38092201388](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/38092201388) | 11 scripts com nonce, 0 violações de script, 4 de atributo de estilo; nonce renovado entre respostas; 2 testes verdes. |
| Hashes calculados sobre HTML público estático | [38092189166](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/38092189166) | 2 scripts inline; hashes estáveis em 2 visitas ao mesmo build; zero violações na candidata; 215 bytes da CSP no ensaio; CI verde. |
| Hashes, bloqueio apenas no browser + 2 builds consecutivos | [38092315413](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/38092315413) | Login interativo com CSP hash estrita injetada no Chromium; 0 page errors. Hashes **diferiram entre 2 compilações do mesmo código**, apesar de serem estáveis entre visitas ao mesmo build. |
| Hashes com sonda não autorizada, browser-only | [38092532689](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/38092532689) | **CI verde**; CSP enforced somente no Chromium, script inline parser-inserted sem hash bloqueado, hidratação preservada, 0 erros de página; hashes divergiram após 2 builds. |
| Nonce com sonda não autorizada, browser-only | [38092520847](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/38092520847) | **CI verde**; 3 testes Playwright; CSP enforced somente no Chromium; script inline parser-inserted sem nonce bloqueado e hidratação preservada. |

**Veredito dos testes negativos:** as duas estratégias bloquearam scripts parser-inserted injetados artificialmente no HTML de teste sem autorização, sem prejudicar o login. A simulação com script criado programaticamente pelo contexto já confiável NÃO é prova de bloqueio sob `strict-dynamic`, pois a diretiva permite delegação de confiança. A defesa contra DOM-XSS e injeções no próprio código continua necessária.

Outros fatos:
- No `next build` de referência, `/login` é estática (`○`); no ensaio de nonce ela se torna dinâmica (`ƒ`). As páginas internas do dashboard já eram dinâmicas.
- A CSP original permaneceu em vigor na aplicação; controles estritos só foram simulados no navegador de teste e nunca promovidos para o domínio oficial.
- Nenhum ensaio acionou banco clínico hospedado, alterou migration de produção ou exigiu credenciais reais.

## 2. Conclusão de arquitetura

**GO para construir a migração gradual / NO-GO para trocar a CSP de produção hoje.**

A estratégia escolhida é **híbrida e em fases**, com um ramo estrito para scripts e um trabalho independente para estilos:

1. **Páginas dinâmicas clínicas e autenticadas:** estudar `script-src` com nonce único por requisição gerado no `proxy.ts` e propagado na CSP de request para que Next.js 16 atribua nonce ao HTML renderizado no servidor. Implementação restrita a branch/staging até homologação. Preservar `strict-dynamic` apenas quando demonstrar compatibilidade, com fallback explícito por navegador. A inserção programática por script já confiável pode herdar confiança; nonce não substitui escaping/sanitização.
2. **Páginas estáticas públicas (`/login`, `/recuperar-senha`, `/redefinir-senha`):** priorizar preservação de cache. Hashes de scripts inline podem funcionar, mas **jamais fixados manualmente**, pois mudaram entre compilações. Somente adotar se houver integração determinística *pós-build* que gere e associe hashes a cada artefato efetivamente entregue pela Vercel, e um gate de navegador estrito nesse artefato. Se a solução suportada pela plataforma não for simples/robusta, comparar a alternativa nonce+SSR com orçamento de desempenho antes de decidir.
3. **CSS e estilos inline:** não retirar `'unsafe-inline'` de `style-src` de uma vez. A PoC observou 4 eventos `style-src-attr` só no login, e há `style={{...}}` em páginas clínicas. Migrar primeiro atributos para classes/variáveis CSS sob revisão de layout; analisar estilos gerados pelo Next/React separadamente. Nonces em tags `<style>` não autorizam automaticamente *style attributes*.
4. **Aplicação consistente:** garantir segurança de URLs Supabase/WS, imagens e fonts, frames Metabase, OAuth, PDFs e downloads sem abrir domínios desnecessários. Preservar `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, HSTS e demais headers; `unsafe-eval` permanece apenas para desenvolvimento.
5. **Sem telemetria sensível:** continuar contando diretivas localmente/CI; não enviar URIs completas, parâmetros de gestantes ou dados do navegador a sistemas externos sem avaliação de privacidade.

## 3. Portões de adoção antes de produção

**Gate A — Proteção efetiva:** teste de navegador com CSP enforced deve bloquear código inline sem nonce/hash e manter hidratação, links, formulários e logout. Executar em mais de uma rota, não apenas login.

**Gate B — Dados isolados:** rodar o sistema em ambiente de staging com Supabase efêmero exclusivamente com dados e perfis fictícios. Cobrir RBAC/RLS entre UBS, login/logout/recuperação/OAuth em contexto apropriado, cadastros, alertas, PDF de risco, importador PEC, lixeira e erros esperados. Reexecutar suíte pgTAP e Security CI.

**Gate C — Custo e compatibilidade:** comparar p50/p95 de TTFB, cold-start, cache/CDN, build, bundle, erros do navegador e funções serverless entre static+hash e dynamic+nonce. Declarar orçamento quantitativo a partir de baseline real, não valor presumido. Next.js exige SSR dinâmico para nonces; validar a passagem da CSP de request no ambiente Vercel, não só em `next start` local.

**Gate D — Acessibilidade e interface:** repetir Playwright/axe em login, cadastro, recuperação e recuperação de senha; homologar manualmente VoiceOver/NVDA, mobile, foco de modais e zoom.

**Gate E — Liberação humana:** preparar branch de release revisada, CI completo, ambiente de staging de verdade, plano de rollback de headers. **Só** depois de aceitação expressa atualizar a `main`/produção. Nunca inferir 10/10 apenas do CSP CI.

## 4. Rollback e política de falha

- Se scripts legítimos forem bloqueados, falhar o gate e manter a CSP atual em produção. Não introduzir `unsafe-inline` silenciosamente na política nova.
- Se hash divergir do HTML servido por qualquer build/deploy/rollback, rejeitar release.
- Se nonce for ausente/reciclado ou degradar o cache das páginas públicas, não impor a política e investigar.
- Não mover migrations, apagar históricos, exportar PII nem atualizar `VERCEL_ENV=production` como parte desta PoC.

## 5. Artefatos em branches independentes

- [Monitoramento original](https://github.com/petsaudemonitoramento-dev/dashboard/tree/experiment/fase9-csp-report-only-v30)
- [Experiência nonce, SSR e segurança de scripts](https://github.com/petsaudemonitoramento-dev/dashboard/tree/experiment/fase9-nonce-ci-v30)
- [Experiência hash, estática, dupla compilação e CSP do navegador](https://github.com/petsaudemonitoramento-dev/dashboard/tree/experiment/fase9-hash-ci-v30)

**Status desta decisão:** arquitetura recomendada estabelecida; promoção estrita ainda bloqueada pelos gates de integração, produção-like staging, performance e acessibilidade.
