# Fase 9 — avaliação de CSP avançada (sem alteração de runtime)

Data: 10/10/2026  
Base auditada: `main` em `8ee6a03f2d52cda6542127b5c74551f64b58aa5c`  
Domínio: https://painelprenatal.vercel.app  
Projeto: **somente Software dos Profissionais**. Não envolve Gestão/MAE APS.

## Parecer

**INVESTIGAÇÃO CONCLUÍDA. IMPLEMENTAÇÃO DE NONCES EM TODAS AS PÁGINAS NÃO APROVADA NESTE MOMENTO.**

Justificativa: o risco de regressão e a conversão de páginas públicas estáticas para renderização dinâmica têm custo operacional real; até aqui não existe prova de XSS explorável que exija migração emergencial. A decisão não encerra o assunto: recomenda-se experimento isolado e mensurável no navegador, sem tocar na Production.

## Evidências concretas

A CSP atual de Production (confirmada no cabeçalho de `/login` e `/api/health`) inclui:

- `script-src 'self' 'unsafe-inline'`
- `style-src 'self' 'unsafe-inline'`
- `connect-src 'self' https://bhkyfcnuxcvjgvusgpgm.supabase.co wss://bhkyfcnuxcvjgvusgpgm.supabase.co`
- `object-src 'none'`, `frame-ancestors 'none'` e `upgrade-insecure-requests`.
- **Sem** `unsafe-eval` em Production.
- HSTS, X-Frame-Options DENY e nosniff presentes.

O `next.config.ts` define atualmente uma CSP fixa por ambiente. O `src/proxy.ts` mantém cookies da sessão Supabase e x-request-id, mas **não gera nem propaga nonce**.

Inspeção de HTML retornado pelo domínio oficial (somente páginas públicas, sem autenticação):

| Página | HTTP | Scripts no HTML | Scripts inline | Com nonce | Política de cache |
| --- | ---: | ---: | ---: | ---: | --- |
| /login | 200 | 11 | 2 | 0 | public, max-age=0, must-revalidate |
| /cadastro | 200 | 10 | 2 | 0 | private, no-cache, no-store |
| /recuperar-senha | 200 | 10 | 2 | 0 | public, max-age=0, must-revalidate |

A inspeção não equivale a auditoria do código JavaScript nem demonstra vulnerabilidade XSS, mas comprova que remover `unsafe-inline` sem acomodar scripts inline legítimos tem risco de quebrar a hidratação.

## Opções comparadas

### A. Nonce criptográfico por requisição

- Melhor isolamento de scripts inline, quando a política e o nonce são implementados corretamente.
- Requer CSP e `x-nonce` por requisição no Proxy; Next.js aplica nonce apenas durante SSR.
- Segundo a documentação oficial do Next.js, páginas estáticas/ISR/PPR não possuem nonce por requisição: forçar rendering dinâmico pode elevar latência, invocações e custo de Vercel.
- Requer revisão do `src/proxy.ts`, login/cadastro/redefinição e demais fluxos, garantindo que cookies do Supabase e correlação x-request-id continuem intactos.

**Decisão:** não implantar globalmente sem prova de conceito e comparação de desempenho.

### B. SRI/hashes de build

- Next.js documenta suporte *experimental* a SRI para scripts de build no App Router.
- Pode manter static rendering e verificar integridade de arquivos JavaScript.
- Não resolve automaticamente scripts gerados dinamicamente nem todo script inline de hidratação.
- Exige comprovar suporte na versão instalada, gerar build e observar comportamento no navegador. A estabilidade da opção experimental ainda é risco.

**Decisão:** candidato a prova de conceito isolada, sem configuração automática em Production.

### C. Manter CSP atual com defesa em profundidade e experimentação progressiva

- Mantém os controles de Production já verificados, sem regressão de UX/cache.
- Proteção XSS é menos estrita enquanto `unsafe-inline` estiver permitido.
- Não justifica declarar CSP perfeita nem alterar a nota para 10.

**Decisão:** opção atual recomendada.

## Experimento controlado para decisão futura

1. Em branch isolada, criar modo **Report-Only** para testar uma política com nonce/hash em Preview de acesso restrito. Evitar endpoint de coleta que receba URLs completas, query strings, identificadores, cookies ou amostras de código.
2. Executar Playwright em GitHub Actions com Chromium, sem dados reais, incluindo navegação/hidratação, login, cadastro, recuperação e páginas clínicas simuladas com fixture sintética.
3. Comparar cache-control, tamanho do HTML, scripts bloqueados, comportamento de sessão Supabase, requests e tempo de resposta (amostragem e método consistentes).
4. Testar interface com teclado e axe; não confundir sucesso do build com sucesso de hidratação no navegador.
5. Só considerar CSP aplicada em modo enforce se **zero regressões funcionais**, nenhuma violação legítima não resolvida, sem alargamento de `connect-src`, e custo mensurado aceitável.

**Nunca** afrouxar CSP para fazer teste passar ou enviar PHI/PII em relatórios de violação. Não habilitar automaticamente `unsafe-eval` em Production.

## Estado do release pós-homologação em 10/10/2026

- Production READY no SHA `c9d462742e5166b3fa290141ffc62ac4193065b8`, branch `codex/post-homologation-quality-v30`.
- `main` está 8 commits à frente desse SHA, **somente com mudanças em workflows e Dependabot**, sem modificações no runtime verificadas no diff.
- Banco oficial `dashboard-v2`: 28 migrations; inclui checkpoint pré-qualidade, auditoria clínica, RLS initPlan e remoção seletiva V2.
- Checkpoint `backup_pre_quality_v30_20261010`: 8 definições de função legada, 7 triggers, 2 policies e histórico de migrations. **Não é backup completo nem backup offsite/Auth.**
- Última verificação operacional: `auth.users = 0`, `public.perfis = 0`, `public.pec_gestantes = 0`, `public.ubs = 3`.
- `/api/health` e `/login`: HTTP 200, headers esperados, runtime errors Vercel nas últimas 24h = 0.
- Security Advisor: avisos de `SECURITY DEFINER` públicas intencionais com allowlist e checagem de autorização; tabelas privadas com RLS deny-all informativas. Revisar alterações futuras.
- Performance Advisor continua com alertas informativos de índices/FKs e políticas redundantes; sem dados clínicos/carga não há base para uma onda de índices.

## Próximas prioridades para aproximar de 10/10

**Mais valiosas que migrar CSP imediatamente:**

1. **Restaurabilidade real:** criar backup externo e testar restauração hospedada incluindo Auth e Storage, observando retenção, escopo e custo. O RTO de 61 s refere-se ao Supabase efêmero do CI, não ao Supabase hospedado.
2. **Autenticação real:** validar confirmação de e-mail/SMTP, redirect, recuperação, login Google, aprovação administrativa e revogação com usuários sintéticos oficiais; depois limpar fixtures.
3. **Acessibilidade manual:** VoiceOver/NVDA, zoom 200%, teclado, foco/modal e fluxos clínicos. Playwright/axe nas rotas públicas não cobre tudo.
4. **Observabilidade:** verificar as primeiras execuções agendadas no `main`, falhas por autenticação/erro e fluxo de resposta a incidentes sem PHI.
5. **Supply chain:** avaliar PRs do Dependabot individualmente. PR de atualização de GitHub Actions tem CI verde e pode eliminar warnings de Node 20 após revisão; não executar auto-merge em massa.
6. **Risco residual CSP:** executar POC de Report-Only/SRI ou nonce com comparação de custos e UX; aplicar somente se passar gates.

## Fontes técnicas

- Next.js, *Content Security Policy*: https://nextjs.org/docs/app/guides/content-security-policy
- Projeto: `next.config.ts`, `src/proxy.ts`, `.github/workflows/profissionais-security-ci.yml`, `docs/CODEX_POST_HOMOLOGATION_V30.md`.

**Status:** avaliação concluída; **nenhuma alteração de CSP aplicada**. Não publicar o experimento sem validação e revisão.
