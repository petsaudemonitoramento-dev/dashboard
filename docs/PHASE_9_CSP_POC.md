# Fase 9 — Prova de conceito da CSP (MAE APS – Profissionais)

Data: 10/10/2026
Base imutável de referência: `8ff1953b9a7db2b4ba4b8a7a6c38e7a758bd14a3`
Branch experimental: `experiment/fase9-csp-report-only-v30`

## Fronteiras inegociáveis

- Não promover para `main`, não criar tag de release, não aplicar migration e não modificar o Supabase hospedado.
- Não promover deploy nem configurar domínio de produção; não executar o experimento sobre usuários ou dados clínicos reais.
- A CSP existente continua a ser aplicada normalmente. A política candidata utiliza SOMENTE `Content-Security-Policy-Report-Only`, que observa incompatibilidades sem bloquear conteúdo.
- A candidata só é ativada com `CSP_PHASE9_REPORT_ONLY=1` E contexto `CI=true` ou `VERCEL_ENV=preview`. `VERCEL_ENV=production` desliga o experimento mesmo com a flag definida.
- Nenhum `report-uri` ou `report-to` foi configurado para evitar vazamento de URLs clínicas ou conteúdo de navegação. O Playwright coleta unicamente contagens por diretiva de `SecurityPolicyViolationEvent`, sem conteúdo/identificadores do evento.

## Hipótese

A CSP atual protege a aplicação e retém `'unsafe-inline'` em `script-src` e `style-src`. A candidata remove ambos. A quantidade e a natureza das violações reportadas permitem estimar o custo da migração para nonces/hashes sem degradar fluxos clínicos nem alterar a política ativa.

## Experimento executável (isolado)

1. GitHub Actions `profissionais-phase9-csp-poc.yml`: Node 22, `npm ci`, TypeScript, ESLint, `next build` e Chromium headless com `next start`; ambiente com URL/chave Supabase de marcador, sem credenciais nem banco hospedado.
2. Conferência da rota pública `/login`: `main` visível e respostas HTTP válidas.
3. Conferência de cabeçalhos: CSP ativa mantém `'unsafe-inline'`; CSP candidata `Report-Only` exclui `'unsafe-inline'` e `'unsafe-eval'`.
4. Sonda inline inofensiva insere apenas `window.__phase9Probe=1` na página de testes: confirma que o código continua permitido pela política ativa e gera um evento de violação na candidata. Nenhuma informação sensível é coletada.
5. Registro somente das contagens agregadas por diretiva no log do CI. **Contagens reais e aprovação do CI devem ser verificadas após a execução**; criar o workflow não comprova que ele passou.

## Evidência da primeira execução

- GitHub Actions [run #38086780347](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/38086780347): **SUCCESS**.
- TypeScript, ESLint, Next.js build, instalação do Chromium e teste Playwright: **aprovados**.
- Captura agregada do navegador: `script-src-elem = 3`; `style-src-attr = 4`.
- O teste de sonda inline confirmou execução permitida pela CSP vigente e ao menos uma notificação na política candidata.
- Contagens obtidas unicamente na rota pública de login, com dados de marcador; ainda não é amostra de todos os módulos.
- Interpretação: `script-src-elem` requer avaliar scripts de hidratação e eventuais nonces/hashes; `style-src-attr` requer inspecionar atributos `style` e preferir classes CSS, pois nonces não autorizam automaticamente estilos inline em atributos.
- **Decisão após esta rodada: GO para diagnóstico controlado; NO-GO para aplicar CSP restritiva em produção** até testar autenticação e fluxos clínicos com usuários sintéticos e medir desempenho/cache.

## Alternativas avaliadas

| Abordagem | Benefício | Custo/risco | Decisão da PoC |
| --- | --- | --- | --- |
| CSP atual | Compatibilidade e cache atuais | `unsafe-inline` amplia a superfície de XSS | Preservar na produção |
| CSP restritiva `Report-Only` | Descobrir violações sem bloqueio | Não aplica a proteção proposta | **Implementada na branch experimental** |
| Nonce aleatório por requisição | Permite scripts inline específicos; viável para Next com renderização dinâmica | Pode exigir SSR/dinâmica, impactar cache, custo de funções e autenticação | Não ativado; investigar em segunda etapa após métricas |
| Hash de script estático | Permite conteúdo inline imutável sem nonce por requisição | HTML/inline emitido pelo Next/React pode variar; manutenção e hashes quebrados em releases | Não ativado; somente candidato onde o conteúdo for comprovadamente estável |

## Decisões de aceitação ou rejeição

**Avançar para ensaio isolado de nonces/hashes** somente se:
- CI da PoC verde, relatório de violações produzido e CSP original preservada.
- Rotas de login/cadastro/recuperação e fluxo público sem regressão funcional.
- Após isso, testes com Supabase **efêmero e dados sintéticos** validarem login, autorização/RLS, cadastro, fluxos clínicos, geração do PDF e logout.
- Métricas compararem build, resposta, renderização estática/dinâmica, latência p50/p95 e custo operacional sem degradação relevante ou exposição de dados.
- Projeto não exigir reescrita extensa de layout, cookies/Auth ou hidratação.

**Não promover para produção** se houver bloqueio de JS legítimo, falhas de autenticação/hidratação/PDF, vazamento de URL clínica em telemetria, regressão de cache/custo incompatível ou ausência de ensaio em ambiente efêmero.

## Como executar sem produção

- Fazer checkout da branch experimental e rodar o workflow `Profissionais Phase 9 CSP PoC` no GitHub Actions.
- Em execução local sem acessar qualquer Supabase real, fornecer URL e chave de **marcador**, `CI=true` e `CSP_PHASE9_REPORT_ONLY=1`; instalar Playwright e Chromium apenas no ambiente descartável.
- Para desligar: remover `CSP_PHASE9_REPORT_ONLY` ou defini-la como `0`; a CSP ativa não depende dessa variável.

## Limitações assumidas

Esta é a **primeira etapa da PoC**: detecção de violações e smoke público. Ainda não há aprovação de nonces/hashes, benchmark real de desempenho, nem homologação autenticada com dados sintéticos; esses testes são pré-requisito para decidir a adoção. A produção permanece inalterada.
