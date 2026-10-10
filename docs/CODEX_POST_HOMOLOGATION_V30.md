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
| PHV30-002 | MEDIUM | Acessibilidade pública | Recuperação e redefinição de senha dependiam apenas de placeholder para identificar campos, sem label associado; mensagens também não possuíam semântica consistente de status/alerta. | Labels explícitos, relações aria-labelledby e regiões vivas; novo gate Playwright + axe no GitHub Actions. | CORRIGIDO — security CI 37924447481 e accessibility CI 37924447488 verdes. |

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
| App quality | Sucesso — último run da Fase 3: 37924447481 |
| Supabase schema/security | Fase 1: sucesso — run 37881333306; Fase 2: sucesso, 171 asserções — run 37923003584 |
| Playwright + axe (4 rotas públicas) | Sucesso — run 37924447488 |
| Disaster Recovery efêmero | Sucesso — run 38076046395; backup/restore, schema, dados, marcador, db lint e pgTAP; RTO técnico de 68 s |
| Security CI após correção do DR | Sucesso — run 38076046401 |
| Integração das Fases 5–7 | Merge 20d8a499; Security CI 38076727237 (176 asserções), DR 38076727196, acessibilidade 38076727255, monitor 38076746601 e supply chain 38076748817 — todos verdes |

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

O teste mantém USAGE de authenticated em security somente porque as policies e helpers RLS o exigem; CREATE continua revogado. O run 37882033548 confirmou app quality, migrations, db lint e 170 de 171 asserções. O run diagnóstico 37922318014 manteve app quality e db lint verdes, mas encontrou um parêntese duplicado no SQL do próprio teste antes de executar as quatro asserções finais; a sintaxe foi corrigida no checkpoint seguinte. O run 37922619276 identificou exatamente private.importar_pec_impl_v22(uuid, uuid, text, text, integer, jsonb, jsonb, jsonb). A revisão confirmou que é o corpo legado renomeado ainda necessário à cadeia interna de importação, que preserva search_path fixo e possui EXECUTE revogado de PUBLIC, anon, authenticated e service_role. A função foi então incluída explicitamente na allowlist. A validação final da Fase 2 passou no run 37923003584: app quality, migrations, db lint e todas as 171 asserções pgTAP ficaram verdes no Supabase efêmero.
## Fase 3 — Acessibilidade automatizada

Foi criado um workflow econômico e independente, limitado a Chromium headless, uma worker e quatro rotas públicas. O job sobe Supabase efêmero para renderizar /cadastro com dados exclusivamente sintéticos; apenas URL e chave publicável são exportadas. O gate verifica impactos axe serious/critical, nomes acessíveis, landmark principal, título e navegação básica por Tab.

A inspeção dirigida encontrou e corrigiu ausência de labels nos campos de recuperação/redefinição e padronizou anúncios de status/erro. A homologação manual com VoiceOver/NVDA, contraste, zoom e modais continua obrigatória. O run 37924020645 carregou as quatro páginas e validou seus labels, mas falhou antes do axe porque o teste usava uma expressão regular inválida como tipo de role do Playwright. Os roles foram tornados explícitos. O run 37924447488 aprovou os quatro testes em Chromium e o run 37924447481 manteve lint, TypeScript, build, migrations, db lint e pgTAP verdes.
## Fase 4 — Disaster Recovery executável

Foi adicionado um exercício isolado no GitHub Actions que cria dois ambientes Supabase efêmeros, produz backup lógico com dados sintéticos, destrói o primeiro, restaura no segundo, compara schema/manifesto, valida um marcador sintético e repete db lint + pgTAP. O dump bruto permanece apenas no diretório temporário do runner e é removido; o artefato contém somente métricas e hashes.

O RTO técnico é medido desde o início da destruição até o término das validações pós-restore. Ele não representa o RTO do ambiente hospedado e não substitui um exercício humano de backup gerenciado/PITR. O run 37925249488 encontrou respostas transitórias toomanyrequests no pull das imagens públicas; os retries internos do Supabase CLI recuperaram o download, e o segundo ambiente reutilizou as imagens no mesmo runner. A falha terminal ocorreu depois do restore: write_manifest emitia o manifesto em stdout, mas não o gravava no arquivo recebido, portanto a comparação tentou abrir dois arquivos inexistentes. A correção persiste os manifestos e mantém apenas um job serializado, sem cache volumoso nem novas tentativas cegas. O run 38076046395 concluiu em 3 min 18 s e comprovou schema idêntico, manifesto de dados idêntico, marcador restaurado, db lint e toda a suíte pgTAP verdes. O RTO técnico observado entre a destruição e o término das validações foi 68 segundos; o dump sintético tinha 13.716 bytes e foi removido sem publicação. O Security CI do mesmo SHA também passou no run 38076046401.
## Fase 5 — Observabilidade econômica

A PR #1 foi revisada e integrada sem reimplementação. O monitor executa exatamente quatro requisições públicas, sem cookies, credenciais ou dados clínicos: health, login/headers, ACS legado 404 e API clínica 401. Valida request ID, CSP, HSTS, nosniff e proteção de frame. O run original 37926521017 e a repetição na branch integrada 38076746601 passaram.

O cron de quatro execuções diárias é de baixo custo, mas não está ativo enquanto o workflow existir somente fora da branch padrão main. O smoke pesado/manual continua separado.

## Fase 6 — Performance cirúrgica

A migration 20261009120000_perfis_rls_initplan.sql altera apenas a expressão da policy perfis_proprio_select de id = auth.uid() para id = (select auth.uid()). RLS, papel authenticated, comando SELECT e semântica de acesso ao próprio perfil foram preservados e cobertos por cinco novas asserções em 024_perfis_rls_initplan.sql. Nenhum índice adicional foi criado. Os runs 37926521004 e 38076727237 passaram; a suíte integrada totaliza 176 asserções pgTAP.

## Fase 7 — Supply Chain

Dependabot semanal foi configurado sem auto-merge, com limite de PRs e agrupamento econômico. O alvo é a linha homologada hardening/post-audit-v1. Como a configuração também depende de promoção à branch padrão para operação contínua, ela ainda não deve ser tratada como automação ativa. Toda atualização continua exigindo revisão e CI.

O gate semanal lê package-lock sem instalar dependências nem executar scripts de terceiros. Produção permanece com 0 HIGH/CRITICAL; cinco HIGH/CRITICAL de tooling de desenvolvimento seguem monitorados, sem npm audit fix --force nem downgrade incompatível. Os runs 37926377631 e 38076748817 passaram.

## Fase 8 — Dívida V2: mapeamento

O inventário dirigido foi concluído antes de qualquer remoção. Funções V18/V19/V20/V22 que sustentam ownership, policies, auditoria, lixeira, credenciais e PEC foram classificadas como dependências vivas. As views analytics V18 também permanecem porque as publicações V26 dependem delas. Tabelas ACS/V29 foram preservadas por retenção e uso analytics ou por incerteza de conteúdo histórico.

Dois blocos foram classificados como remoção segura para o próximo checkpoint: oito funções privadas que formam um subgrafo fechado de módulos ACS/indicadores/início desativados, sem referência no runtime, wrappers V30, triggers, policies ou views; e oito runners manuais npm que executam SQL histórico via SUPABASE_DATABASE_URL fora do mecanismo canônico de migrations. A remoção das funções será RESTRICT, em migration nova, para que qualquer dependência de catálogo não detectada faça o CI falhar.

## Itens não corrigidos e justificativa

- Registros históricos já existentes podem conter snapshots clínicos. Não foram reescritos porque apagar ou transformar retroativamente uma trilha aplicada exige política de retenção e auditoria humana.
- O mapeamento da Fase 8 foi concluído; as remoções seguras ainda precisam de migration, regressões e CI. A Fase 9 está explicitamente fora desta rodada.
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
| Recuperação | 8,4 |
| Observabilidade | 8,0 |
| Performance | 8,4 |
| Acessibilidade | 7,8 |
| Manutenibilidade | 8,0 |
| Supply Chain | 8,4 |

Média provisória: **8,30/10**.

## O que ainda impede 10/10

- homologação manual assistiva com VoiceOver/NVDA, contraste, zoom e gestão de foco em modais ainda não foi concluída;
- o RTO técnico efêmero foi medido, mas ainda falta exercício humano de backup gerenciado/PITR com volume e dependências representativos;
- monitor e auditoria de dependências estão validados, mas seus agendamentos só ficam ativos após promoção controlada dos workflows à branch padrão;
- warnings de performance ainda precisam de triagem baseada em ganho comprovável;
- advisory de desenvolvimento de braces depende de solução upstream compatível;
- dívida V2 ainda requer prova estática antes de qualquer remoção;
- CSP ainda usa unsafe-inline;
- política humana de retenção para históricos clínicos anteriores à minimização ainda não foi definida.

## Próximo passo

Implementar somente os dois blocos de remoção comprovadamente segura, com migration RESTRICT, regressão pgTAP e CI completo.