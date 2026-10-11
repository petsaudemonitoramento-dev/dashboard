# MAE APS – Profissionais | Fase 9 — Handoff da implementação híbrida

**Data:** 10/10/2026 (execução CI finalizada na madrugada UTC de 11/10)  
**Branch isolada:** `implementation/fase9-hybrid-ci-v30`  
**Base:** `experiment/fase9-csp-report-only-v30`, criada após o checkpoint de referência `8ff1953`.  
**CI comprovado:** [GitHub Actions #38099133823](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/38099133823) — SUCCESS.  
**Status de publicação:** **NÃO LIBERADO PARA PRODUÇÃO**.

## Alterações implementadas

- `src/lib/security/phase9-csp.ts`: cria nonce de 128 bits por navegação HTML, constrói CSP restritiva para **scripts**, mantém temporariamente a compatibilidade de estilos inline e preserva as fontes de comunicação Supabase/Metabase existentes.
- `src/proxy.ts`: encaminha o nonce e a CSP para o request de renderização Next.js 16 e aplica CSP à resposta real, mantendo refresh de autenticação Supabase e request ID.
- A ativação é **exclusiva de CI descartável**: `CSP_PHASE9_STAGING_ENFORCE=1`, `CI=true`, `VERCEL` ausente, `VERCEL_ENV` ausente e `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`. Qualquer condição diferente mantém a política vigente.
- Escopo dinâmico: `/cadastro`, `/completar-cadastro`, `/aguardando-aprovacao`, `/dashboard/**`. O nonce só é gerado para GET de HTML, não API, assets, RSC ou prefetch.
- Páginas públicas prerenderizadas (`/login`, `/recuperar-senha`, `/redefinir-senha`) continuam estáticas e com CSP atual. Não foi introduzido um gerador de hash permanente, pois o ensaio da Fase 9 demonstrou divergência de hashes entre builds iguais.
- Testes automatizados `tests/csp-phase9-staging/hybrid.spec.mjs` + configuração Playwright independente, sem screenshots, vídeos ou traces de pacientes.
- Workflow `.github/workflows/profissionais-phase9-hybrid-ci.yml` inicia Supabase descartável e verifica dependências, tipos, lint, build, banco, permissões e navegador.

## Evidência observada

| Gate | Evidência do CI #38099133823 | Resultado |
|---|---|---|
| Dependências de produção | `npm audit --omit=dev --audit-level=high` | 0 vulnerabilidades relatadas |
| Compilação | `npx tsc --noEmit`, ESLint, `npm run build` | Aprovados |
| Banco efêmero | `supabase db lint --local --level error` | Aprovado |
| Integridade/RLS | `supabase test db`, 15 arquivos de testes, 193 asserções | **193/193 aprovadas** |
| Browser | 6 testes Playwright/Chromium | **6/6 aprovados** |
| CSP real na rota dinâmica | `/cadastro` entregue com nonce novo, CSP restritiva em script e `no-store` | Aprovado |
| Hidratação | 10 scripts identificados com nonce válido | Aprovada |
| Script inline sem autorização | Injeção parser-inserted sem nonce no HTML **apenas do navegador de testes** | Bloqueada |
| Rota protegida sem sessão | `/dashboard` retorna ao login, sem dados clínicos expostos | Aprovado |
| Páginas estáticas | Login, recuperação e redefinição mantiveram política anterior, sem nonce | Aprovado |
| Interface | Nenhum erro de página no teste de cadastro | Aprovada |

### Latência — apenas referência local

CI local: 12 amostras por rota:
- `/login` (estática): p50 = 6 ms, p95 = 7 ms.
- `/cadastro` (dinâmica): p50 = 17 ms, p95 = 19 ms.

**Não usar esses números como ganho/perda atribuível à CSP.** São rotas diferentes em runner efêmero, não um A/B controlado do mesmo endpoint nem observação de CDN, cold start ou TTFB real da Vercel. Não há orçamento de performance de produção validado nesta rodada.

## Decisão e riscos remanescentes

**DECISÃO: manter a implantação controlada como candidata para homologação. Não integrar em produção agora.**

1. CSP de **scripts** com nonce nos módulos de renderização dinâmica já existentes: caminho preferencial após verificar no staging Vercel com **backend totalmente separado**.
2. Páginas públicas estáticas: não promover hashes calculados em runtime/manual. A geração segura e determinística por artefato de deploy ainda precisa ser resolvida ou comparada com a alternativa de tornar essas rotas dinâmicas.
3. CSS: estilos inline permanecem autorizados. A migração de `style-src`/`style-src-attr` requer revisão de componentes, incluindo `style={{...}}` em interfaces clínicas, e validação visual por rota.
4. O experimento não executou fluxo E2E autenticado de login Google/e-mail, cadastro real, aprovação, isolamento operacional por UBS, PDF, PEC, lixeira, atualizações clínicas ou auditoria de interface assistiva. O pgTAP protege regras de banco, mas não substitui esses E2E.
5. Não houve teste de custo de Vercel, cache/CDN no provedor, cold start, performance em mobile, rollback de deploy ou verificação manual VoiceOver/NVDA nesta rodada.
6. Nunca usar banco hospedado de produção ou usuários reais em experimentos CSP. Não enviar `securitypolicyviolation` com `documentURI`/PII para coletores externos.

## Próximos portões obrigatórios antes de uma release

- [ ] Criar ambiente de staging Vercel **separado do projeto e dos domínios oficiais**, associado a **Supabase exclusivamente de teste**. Remover então o gate CI-only na **cópia de staging** mediante revisão e criar conjunto próprio de secrets; jamais copiar secrets reais.
- [ ] Repetir o teste de enforcement na resposta real da plataforma para rotas clínicas autenticadas, PDFs, recuperação e OAuth, com perfis e dados exclusivamente sintéticos.
- [ ] Medir p50/p95 do **mesmo endpoint** e as taxas de cache/cold start em baseline vs candidato, mantendo número de amostras e parâmetros equivalentes.
- [ ] Corrigir e revisar os estilos inline, incluindo acessibilidade e layouts mobile, antes de restringir `style-src`.
- [ ] Resolver geração de hashes por build nas rotas estáticas ou documentar decisão de converter essas rotas para SSR nonce com custo aceito.
- [ ] Repetir Security CI completo, acessibilidade Playwright/axe, revisão manual assistiva, pgTAP e processos de recuperação.
- [ ] Preparar procedimento de rollback de headers e revisão formal para merge. **Sem promoção automática.**

## Restrições de reversão

O código introduzido nesta branch não precisa alterar o site oficial para ser testado e pode ser desligado no CI removendo `CSP_PHASE9_STAGING_ENFORCE`. A base produtiva mantém a CSP original. A estratégia deve falhar fechada quando o ambiente for Vercel ou quando a URL do Supabase não for `127.0.0.1:54321`.

## Links internos

- [Decisão original da Fase 9](https://github.com/petsaudemonitoramento-dev/dashboard/blob/experiment/fase9-csp-report-only-v30/docs/PHASE9_CSP_ARCHITECTURE_DECISION.md)
- [Branch atual de implementação](https://github.com/petsaudemonitoramento-dev/dashboard/tree/implementation/fase9-hybrid-ci-v30)
- [CI de homologação efêmera](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/38099133823)

**Resumo de governança:** a arquitetura de scripts dinâmicos foi implementada e aprovada em CI isolado; as etapas relativas a estilos, páginas estáticas e homologação integral na infraestrutura real ainda são pendentes e não devem ser rotuladas como concluídas.
