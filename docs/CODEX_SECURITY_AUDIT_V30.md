# Auditoria independente de segurança — Profissionais V30

## Estado da auditoria

- Status: baseline técnico e documental concluído; nenhuma conclusão de segurança emitida.
- Início da sessão: 07/10/2026 21:49:50 (America/Sao_Paulo; UTC-03:00).
- Branch-base: `audit/pre-codex-hardening`.
- Commit-base auditado: `296afbfb8572ec7b60a70c362d2c3c477f1fdfac`.
- Branch de trabalho: `codex/security-audit-v30`.
- Regra operacional: nenhum acesso de escrita ao Supabase remoto `dashboard-v2`; banco e testes devem usar exclusivamente o Supabase efêmero do CI ou ambiente local não vinculado.

## Estado inicial do GitHub Actions

O commit-base `296afbfb8572ec7b60a70c362d2c3c477f1fdfac` concluiu o workflow **Profissionais Security CI** com sucesso em 06/10/2026. Execução registrada: [run 37499444944](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/37499444944). Este resultado é apenas o ponto de partida e não constitui prova de segurança.

O primeiro commit da auditoria, `b598924548e11ffd32bab352f56b742763100152`, foi publicado em `origin/codex/security-audit-v30` e validado pelo [run 37711834136](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/37711834136), disparado manualmente porque o filtro de `push` do workflow não inclui a branch de auditoria. Os jobs **App quality** e **Supabase schema and security tests** passaram. As anotações não bloqueantes registraram a futura migração do runner `ubuntu-latest`, a transição das actions baseadas em Node.js 20 para Node.js 24 e duas ocorrências de navegação interna por `window.location.href`.

## Baseline auditado

- A branch `audit/pre-codex-hardening` acrescenta 102 commits após `profissionais-v1-seguranca`.
- O diff cumulativo contém 50 arquivos alterados, 5.161 adições e 1.462 remoções.
- O escopo inclui seis migrations novas de ownership, hardening, rate limiting, grants, RPCs autenticadas e lixeira, além de dois arquivos pgTAP, Route Handlers, validações, parser PEC e documentação de segurança.
- Foram lidos integralmente os seis documentos obrigatórios: `CODEX_PROFISSIONAIS_SECURITY_TASK.md`, `docs/SEGURANCA_PROFISSIONAIS.md`, `docs/AMBIENTES_E_CI.md`, `docs/SECURITY_AUDIT_PROFISSIONAIS.md`, `docs/DATA_ACCESS_MODEL.md` e `docs/PRE_PRODUCTION_SECURITY_CHECKLIST.md`.
- Os documentos são tratados apenas como descrição da arquitetura pretendida. Nenhuma afirmação documental foi aceita como evidência de segurança.
- O histórico completo dos 102 commits e a relação de arquivos alterados por commit foram examinados antes do início dos ataques adversariais.

## Findings

Nenhum finding classificado ainda. A persistência remota foi confirmada e a análise adversarial começará pelo modelo de ownership/RLS e pelo cenário A × B na mesma UBS.

## Testes adversariais

Ainda não iniciados.

## CI

| Verificação | Estado no commit `b598924` |
| --- | --- |
| GitHub Actions | sucesso — run 37711834136 |
| `npm ci` | sucesso no job App quality |
| lint | sucesso no job App quality |
| TypeScript | sucesso no job App quality |
| build | sucesso no job App quality |
| `supabase db lint --local --level error` | sucesso no job Supabase schema and security tests |
| `supabase test db` | sucesso no job Supabase schema and security tests |
| `npm audit` | auditoria de dependências de produção passou no CI; auditoria completa ainda pendente |

## Histórico dos checkpoints

### Checkpoint 0 — persistência inicial

- Base: `296afbfb8572ec7b60a70c362d2c3c477f1fdfac`.
- SHA: `b598924548e11ffd32bab352f56b742763100152`.
- Descrição: branch independente criada a partir da versão remota mais recente; relatório inicial criado e persistido antes da auditoria.
- Push: confirmado em `origin/codex/security-audit-v30` com o mesmo SHA.
- CI: sucesso — [run 37711834136](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/37711834136); jobs de aplicação e Supabase efêmero verdes.
- Próximo passo concluído: branches comparadas, commits novos examinados e documentos obrigatórios lidos integralmente.

### Checkpoint 1 — baseline de escopo e evidências

- SHA: será registrado no checkpoint seguinte após a publicação deste relatório.
- Descrição: inventário cumulativo das mudanças desde `profissionais-v1-seguranca`, leitura integral dos documentos obrigatórios e validação do CI do primeiro commit remoto.
- Testes: `git diff --check` e inspeção de secrets serão executados antes do commit; suíte completa validada no run 37711834136.
- CI: será disparado manualmente para o commit deste checkpoint, pois o workflow não executa automaticamente em pushes para a branch de auditoria.
- Próximo passo: auditar ownership/RLS, policies e o cenário A × B na mesma UBS, sem confiar nos testes existentes como prova.

## Parecer final

Ainda não emitido.
