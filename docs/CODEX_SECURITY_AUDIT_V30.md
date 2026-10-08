# Auditoria independente de segurança — Profissionais V30

## Estado da auditoria

- Status: auditoria final residual em andamento; nenhuma conclusão final emitida.
- Início da sessão: 07/10/2026 21:49:50 (America/Sao_Paulo; UTC-03:00).
- Início da auditoria residual: 08/10/2026 (America/Sao_Paulo; UTC-03:00).
- Branch-base atual: `audit/continue-security-v30`.
- Commit-base atual auditado: `c6624d8b65c664e8c0c19bdc4907a4cece07c82d`.
- Branch de trabalho atual: `codex/security-audit-final-v30`.
- Regra operacional: nenhum acesso de escrita ao Supabase remoto `dashboard-v2`; banco e testes devem usar exclusivamente o Supabase efêmero do CI ou ambiente local não vinculado.

## Estado inicial do GitHub Actions

O commit-base `296afbfb8572ec7b60a70c362d2c3c477f1fdfac` concluiu o workflow **Profissionais Security CI** com sucesso em 06/10/2026. Execução registrada: [run 37499444944](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/37499444944). Este resultado é apenas o ponto de partida e não constitui prova de segurança.

O primeiro commit da auditoria, `b598924548e11ffd32bab352f56b742763100152`, foi publicado em `origin/codex/security-audit-v30` e validado pelo [run 37711834136](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/37711834136), disparado manualmente porque o filtro de `push` do workflow não inclui a branch de auditoria. Os jobs **App quality** e **Supabase schema and security tests** passaram. As anotações não bloqueantes registraram a futura migração do runner `ubuntu-latest`, a transição das actions baseadas em Node.js 20 para Node.js 24 e duas ocorrências de navegação interna por `window.location.href`.

A fonte de verdade da auditoria residual, `c6624d8b65c664e8c0c19bdc4907a4cece07c82d`, passou nos dois jobs do [run 37725612249](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/37725612249). A branch `codex/security-audit-final-v30` foi criada desse SHA e publicada antes da nova análise.

## Baseline auditado

- A branch `audit/pre-codex-hardening` acrescenta 102 commits após `profissionais-v1-seguranca`.
- O diff cumulativo contém 50 arquivos alterados, 5.161 adições e 1.462 remoções.
- O escopo inclui seis migrations novas de ownership, hardening, rate limiting, grants, RPCs autenticadas e lixeira, além de dois arquivos pgTAP, Route Handlers, validações, parser PEC e documentação de segurança.
- Foram lidos integralmente os seis documentos obrigatórios: `CODEX_PROFISSIONAIS_SECURITY_TASK.md`, `docs/SEGURANCA_PROFISSIONAIS.md`, `docs/AMBIENTES_E_CI.md`, `docs/SECURITY_AUDIT_PROFISSIONAIS.md`, `docs/DATA_ACCESS_MODEL.md` e `docs/PRE_PRODUCTION_SECURITY_CHECKLIST.md`.
- Os documentos são tratados apenas como descrição da arquitetura pretendida. Nenhuma afirmação documental foi aceita como evidência de segurança.
- O histórico completo dos 102 commits e a relação de arquivos alterados por commit foram examinados antes do início dos ataques adversariais.

## Findings

| ID | Severidade | Componente | Descrição | Exploração | Evidência | Correção | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-V30-001 | HIGH | RLS de `importacoes_pec_resumo` | As policies de lotes PEC validavam apenas `usuario_id = auth.uid()` no `USING`, preservando leitura e `DELETE` após revogação. | Desativar A e reutilizar seu JWT para `SELECT`/`UPDATE`/`DELETE` no próprio lote. | `20261008011000_fix_revoked_professional_pec_access.sql` e `011_revoked_professional_import_access.sql`. | Helper de profissional ativo aplicado a todas as operações e regressão negativa pgTAP. | Corrigido antes da auditoria residual; CI da base verde. |
| SEC-V30-002 | HIGH | Script administrativo legado | Um comando npm ainda acionava script com chave privilegiada, identidade real hardcoded, senha temporária reutilizável e impressão da senha. A execução em ambiente configurado podia criar/alterar a conta e redefinir sua credencial. | Operador ou automação executa o comando legado com variáveis de produção; não foi executado durante a auditoria. | `package.json` e `scripts/criar-profissional-ubs.mjs` no SHA-base `c6624d8`. Valores sensíveis não são reproduzidos neste relatório. | Remover comando, script e variável obsoleta; adicionar guardrail no CI contra sua reintrodução. | Correção implementada neste checkpoint; testes/CI pendentes. |

## Testes adversariais

### Lotes PEC, mesma UBS e usuário revogado

O teste `011_revoked_professional_import_access.sql` cria dados exclusivamente sintéticos:

- Profissionais A e B na mesma UBS;
- lote PEC pertencente a A;
- B não consegue ler nem apagar o lote de A;
- depois da desativação de A, o JWT anterior de A ainda consegue ler e apagar o lote, reproduzindo SEC-V30-001.

No estado-base residual, o teste já foi convertido em regressão negativa e confirma que profissional revogado não lê, atualiza nem apaga o próprio lote.

### Bootstrap administrativo legado

A reprodução contra Supabase foi deliberadamente evitada porque alteraria conta e credencial. A exploração foi demonstrada por alcançabilidade estática: havia comando npm público no repositório, fallback de senha reutilizável, identidade fixa, chamada `auth.admin` e log da senha. A regressão exige ausência do comando, do script e da variável associada.

## CI

| Verificação | Estado no commit-base residual `c6624d8` |
| --- | --- |
| GitHub Actions | sucesso — run 37725612249 |
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

- SHA: `0e8b7d927f5950720bb4dfaf4cc57c1893c9797b`.
- Descrição: inventário cumulativo das mudanças desde `profissionais-v1-seguranca`, leitura integral dos documentos obrigatórios e validação do CI do primeiro commit remoto.
- Testes: `git diff --check` e inspeção de secrets sem ocorrências; suíte completa validada no CI.
- CI: sucesso — [run 37712175688](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/37712175688); aplicação e Supabase efêmero verdes.
- Próximo passo concluído: iniciada auditoria adversarial de ownership/RLS e revogação.

### Checkpoint 2 — finding SEC-V30-001 e reprodução

- SHA: será registrado no checkpoint seguinte após a publicação deste relatório.
- Descrição: identificado acesso residual a lotes PEC por profissional revogado; adicionada reprodução pgTAP com controles A × B na mesma UBS.
- Testes: validação estrutural e `git diff --check` serão executados antes do commit; execução pgTAP ocorrerá no Supabase efêmero do CI.
- CI: pendente de publicação.
- Próximo passo: confirmar a reprodução no CI e, se confirmada, criar migration aditiva que bloqueie `SELECT`, `UPDATE` e `DELETE` para profissionais revogados.

### Checkpoint residual 0 — persistência da auditoria final

- SHA-base: `c6624d8b65c664e8c0c19bdc4907a4cece07c82d`.
- Descrição: branch `codex/security-audit-final-v30` criada diretamente da fonte de verdade remota e publicada sem alterações locais.
- Push: confirmado no GitHub com o mesmo SHA.
- CI da base: sucesso — [run 37725612249](https://github.com/petsaudemonitoramento-dev/dashboard/actions/runs/37725612249).
- Próximo passo concluído: iniciada varredura global residual.

### Checkpoint residual 1 — SEC-V30-002

- SHA: será registrado no checkpoint seguinte após a publicação.
- Descrição: removido bootstrap administrativo legado capaz de redefinir credencial conhecida e expor senha em logs; guardrail adicionado ao CI.
- Testes: guardrails locais, lint, TypeScript e build serão registrados antes do commit; GitHub Actions será disparado manualmente.
- CI: pendente.
- Próximo passo: confirmar o checkpoint e continuar a varredura por conexões privilegiadas, superfícies `SECURITY DEFINER`, logs/PII e secrets.

## Parecer final

Ainda não emitido.
