# Qualidade Pós-Homologação — Profissionais V30

Data de início: 09/10/2026

## Escopo e fonte de verdade

- Repositório: petsaudemonitoramento-dev/dashboard
- Branch-base: hardening/post-audit-v1
- SHA-base: 47b544194e9efa4575e7a5208bd7b49f2e36d3b4
- Branch de trabalho: codex/post-homologation-quality-v30
- Supabase remoto protegido: dashboard-v2 (bhkyfcnuxcvjgvusgpgm)
- CI inicial da base: run 37863928345, concluído com sucesso.

Nenhum teste pesado é executado no computador do usuário. Banco, lint, TypeScript, build, Playwright e exercícios de recuperação são executados somente em GitHub Actions com dados sintéticos e Supabase efêmero.

## Findings novos

| ID | Severidade | Fase | Descrição | Correção | Status |
| --- | --- | --- | --- | --- | --- |
| PHV30-001 | MEDIUM | Auditabilidade clínica | Consultas, exames, vacinas, altas e mutações diretas não possuíam uma trilha uniforme. Os históricos legados de gestante e classificação ainda aceitavam snapshots/payloads clínicos completos, ampliando a cópia de dados sensíveis. | Nova trilha privada append-only com ator derivado de auth.uid(), horário, ação, recurso, identificador mínimo e HMAC da gestante. Triggers legados passam a descartar novos snapshots/payloads clínicos completos. | CORRIGIDO — CI verde no run 37881333306. |

## Fase 1 — Auditabilidade clínica e integridade

Auditoria dirigida concluída para:

- gestante;
- consultas;
- exames;
- vacinas;
- alta;
- classificação de risco;
- lixeira e hard delete;
- importação PEC;
- aprovação e revogação de profissionais.

A migration 20261009010000_minimal_clinical_audit_trail.sql adiciona private.auditoria_eventos_clinicos_v30, sem chaves estrangeiras que apaguem a evidência durante hard delete. A tabela:

- não armazena nome, CPF, CNS, telefone, endereço, diagnóstico, observação, resultado, arquivo PEC ou payload clínico;
- registra auth.uid() quando há sessão e mantém contexto técnico do papel de banco para operações internas;
- usa HMAC do UUID da gestante;
- possui RLS sem policy de cliente;
- revoga tabela, sequence e funções de PUBLIC, anon, authenticated e service_role;
- bloqueia UPDATE, DELETE e TRUNCATE, inclusive para o owner;
- cobre INSERT/UPDATE/DELETE nas superfícies clínicas e mudanças administrativas de aprovação/revogação.

Os registros históricos preexistentes não são reescritos. Somente novos inserts nos históricos legados têm os blobs antes, depois e payload neutralizados.

## Testes adicionados

supabase/tests/database/021_clinical_audit_integrity.sql valida:

- cobertura das oito superfícies auditadas;
- preservação de auth.uid() em mutações clínicas, aprovação e revogação;
- envio/restauração de lixeira e hard delete;
- permanência do evento após hard delete;
- ausência de payload clínico e nome de arquivo PEC;
- allowlist de metadados operacionais;
- RLS e ausência de privilégios para anon/authenticated;
- ausência de EXECUTE nas funções internas;
- bloqueio append-only de UPDATE, DELETE e TRUNCATE;
- neutralização de novos payloads nos históricos legados.

## Resultados do CI

| Check | Resultado |
| --- | --- |
| CI inicial da base | Sucesso — run 37863928345 |
| Fase 1 — migration/pgTAP | Sucesso — run 37881333306 |
| App quality | Sucesso — run 37881333306 |
| Supabase schema/security | Sucesso — run 37881333306 |

## Fase 2 — Guardrail global da superfície do banco

Foi adicionado o teste estrutural 022_database_surface_guardrails.sql. Ele falha automaticamente diante de:

- tabela nova em public sem RLS;
- grant de anon fora da allowlist pública ubs/microareas em modo SELECT;
- escrita de authenticated fora das oito tabelas clínicas explicitamente allowlisted;
- acesso de cliente a relações, sequences ou CREATE nos schemas private/security;
- SECURITY DEFINER nova fora da allowlist nominal;
- SECURITY DEFINER sem search_path fixo;
- policy clínica permissiva sem vínculo individual por owner/auth.uid();
- default privilege que volte a expor tabelas ou funções a PUBLIC, anon ou authenticated.

O teste mantém USAGE de authenticated em security somente porque as policies e helpers RLS o exigem; CREATE continua revogado. Resultado do CI deste checkpoint: pendente.
## Itens não corrigidos e justificativa

- Registros históricos já existentes podem conter snapshots clínicos. Não foram reescritos porque apagar ou transformar retroativamente uma trilha aplicada exige política de retenção e auditoria humana.
- As fases 3 a 9 ainda não foram executadas neste checkpoint.
- A auditoria manual VoiceOver/NVDA continua necessária; axe/Playwright não a substitui.
- A remoção de unsafe-inline depende de avaliação de custo e compatibilidade com SSR/static rendering.

## Avaliação provisória

Notas serão recalculadas ao final. Não representam parecer final enquanto as fases e o CI estiverem pendentes.

| Dimensão | Nota provisória |
| --- | ---: |
| Segurança | 8,8 |
| Privacidade | 8,3 |
| Integridade | 8,5 |
| Confiabilidade | 8,4 |
| Recuperação | 6,5 |
| Observabilidade | 7,2 |
| Performance | 8,0 |
| Acessibilidade | 6,8 |
| Manutenibilidade | 8,0 |
| Supply Chain | 8,0 |

Média provisória: **7,85/10**.

## O que ainda impede 10/10

- guardrails estruturais globais do banco ainda não foram adicionados;
- acessibilidade automatizada e homologação manual assistiva ainda não foram concluídas;
- restore descartável ainda não mede RTO;
- observabilidade agendada ainda não existe;
- warnings de performance ainda precisam de triagem baseada em ganho comprovável;
- advisory de desenvolvimento de braces depende de solução upstream compatível;
- dívida V2 ainda requer prova estática antes de qualquer remoção;
- CSP ainda usa unsafe-inline;
- política humana de retenção para históricos clínicos anteriores à minimização ainda não foi definida.

## Próximo passo

Executar o CI da fase 2. Somente após os guardrails estruturais verdes, iniciar a fase 3 de acessibilidade automatizada.