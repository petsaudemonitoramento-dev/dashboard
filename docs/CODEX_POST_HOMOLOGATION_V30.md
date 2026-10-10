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
| PHV30-003 | MEDIUM | Disaster Recovery | O primeiro drill restaurou o dump, mas write_manifest enviava a evidência a stdout sem criar os arquivos comparados; o exercício terminava antes de validar dados, pgTAP e RTO. | Persistência dos manifestos, resumo sintético no Actions e reutilização das imagens no mesmo job serializado. | CORRIGIDO — runs 38076046395, 38076727196 e 38078250918 verdes. |
| PHV30-004 | MEDIUM | Dívida V2 / superfície privilegiada | Funções privadas service-role de módulos ACS/indicadores desativados e runners npm de SQL histórico permaneciam disponíveis sem consumidor V30. | Oito funções removidas com RESTRICT em migration nova; oito runners e comandos npm removidos; allowlist e guardrail endurecidos. | CORRIGIDO — run 38078250902, 193 asserções pgTAP. |

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

## Testes adicionados — Fase 1

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
| Fase 8 — remoções seguras | Commit c68ae874; Security CI 38078250902 (193 asserções), DR 38078250918 (RTO 61 s) e acessibilidade 38078250956 — todos verdes |

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

O RTO técnico é medido desde o início da destruição até o término das validações pós-restore. Ele não representa o RTO do ambiente hospedado e não substitui um exercício humano de backup gerenciado/PITR. O run 37925249488 encontrou respostas transitórias toomanyrequests no pull das imagens públicas; os retries internos do Supabase CLI recuperaram o download, e o segundo ambiente reutilizou as imagens no mesmo runner. A falha terminal ocorreu depois do restore: write_manifest emitia o manifesto em stdout, mas não o gravava no arquivo recebido, portanto a comparação tentou abrir dois arquivos inexistentes. A correção persiste os manifestos e mantém apenas um job serializado, sem cache volumoso nem novas tentativas cegas. O run 38076046395 concluiu em 3 min 18 s e comprovou schema idêntico, manifesto de dados idêntico, marcador restaurado, db lint e toda a suíte pgTAP verdes. O primeiro RTO técnico válido entre a destruição e o término das validações foi 68 segundos; o dump sintético tinha 13.716 bytes e foi removido sem publicação. O Security CI do mesmo SHA também passou no run 38076046401. Repetições após as migrations das Fases 6 e 8 passaram nos runs 38076727196 e 38078250918, com RTOs de 64 e 61 segundos. O RTO técnico mais recente desta rodada é 61 segundos.
## Fase 5 — Observabilidade econômica

A PR #1 foi revisada e integrada sem reimplementação. O monitor executa exatamente quatro requisições públicas, sem cookies, credenciais ou dados clínicos: health, login/headers, ACS legado 404 e API clínica 401. Valida request ID, CSP, HSTS, nosniff e proteção de frame. O run original 37926521017 e a repetição na branch integrada 38076746601 passaram.

O cron de quatro execuções diárias é de baixo custo, mas não está ativo enquanto o workflow existir somente fora da branch padrão main. O smoke pesado/manual continua separado.

## Fase 6 — Performance cirúrgica

A migration 20261009120000_perfis_rls_initplan.sql altera apenas a expressão da policy perfis_proprio_select de id = auth.uid() para id = (select auth.uid()). RLS, papel authenticated, comando SELECT e semântica de acesso ao próprio perfil foram preservados e cobertos por cinco novas asserções em 024_perfis_rls_initplan.sql. Nenhum índice adicional foi criado. Os runs 37926521004 e 38076727237 passaram; a suíte integrada totaliza 176 asserções pgTAP.

## Fase 7 — Supply Chain

Dependabot semanal foi configurado sem auto-merge, com limite de PRs e agrupamento econômico. O alvo é a linha homologada hardening/post-audit-v1. Como a configuração também depende de promoção à branch padrão para operação contínua, ela ainda não deve ser tratada como automação ativa. Toda atualização continua exigindo revisão e CI.

O gate semanal lê package-lock sem instalar dependências nem executar scripts de terceiros. Produção permanece com 0 HIGH/CRITICAL; cinco HIGH/CRITICAL de tooling de desenvolvimento seguem monitorados, sem npm audit fix --force nem downgrade incompatível. Os runs 37926377631 e 38076748817 passaram.

## Fase 8 — Eliminação segura da dívida V2

O inventário dirigido foi concluído antes de qualquer remoção. Funções V18/V19/V20/V22 que sustentam ownership, policies, auditoria, lixeira, credenciais e PEC foram classificadas como dependências vivas e preservadas. As views analytics V18 permanecem porque as publicações V26 dependem delas. As tabelas ACS/V29 também foram preservadas por retenção, analytics ou incerteza de conteúdo histórico.

A migration 20261010190000_retire_unused_v2_privileged_functions.sql remove, com RESTRICT, o subgrafo privado sem consumidor V30:

- registrar_acao_acs_v21;
- complementar_acao_acs_v21;
- obter_painel_acs_v21;
- obter_indicadores_aluno_v1;
- obter_indicadores_v18;
- obter_indicadores_v21;
- obter_inicio_v21;
- normalizar_data_cadastro_v21.

Cinco dessas funções ainda tinham EXECUTE de service_role; as demais eram helpers exclusivos do mesmo subgrafo. Nenhuma era chamada por runtime, RPC V30, trigger, policy ou view. RESTRICT fez a migration falhar fechada caso existisse dependência de catálogo não mapeada.

Também foram removidos aplicar-migracao.mjs e aplicar-migracao-v15 até v21, além dos oito comandos npm db:migrate correspondentes. Esses runners executavam SQL histórico com sql.unsafe e SUPABASE_DATABASE_URL, duplicando o mecanismo canônico. Os SQLs de database permanecem como referência histórica, sem executor privilegiado exposto.

O teste 025_legacy_v2_retirement.sql adiciona 17 asserções: ausência das oito funções, preservação de tabelas e views, bloqueio de clientes na tabela ACS e presença das RPCs V30 de gestantes, PDF, PEC e lixeira. O guardrail do runtime impede o retorno dos runners/comandos, e a allowlist de SECURITY DEFINER foi reduzida para fazer a reintrodução das funções falhar.
## Cobertura adicionada nas Fases 2–8

- 022_database_surface_guardrails.sql: 12 guardrails globais de RLS, grants, schemas, SECURITY DEFINER, search_path, policies e default privileges.
- Playwright + axe: quatro rotas públicas, violações serious/critical, nomes acessíveis, landmarks e navegação básica por teclado.
- profissionais-disaster-recovery.yml e dr-ephemeral-exercise.sh: backup, destruição, restore, hashes, manifesto, marcador, db lint, pgTAP e RTO.
- 024_perfis_rls_initplan.sql: cinco asserções de equivalência da policy otimizada.
- public-monitor.mjs: quatro requests públicos sem secrets.
- check-supply-chain.mjs: gate HIGH/CRITICAL de produção e observação separada do tooling.
- 025_legacy_v2_retirement.sql: 17 asserções de remoção seletiva e preservação V30.
- check-legacy-surface.mjs: bloqueio de reintrodução de runners SQL diretos e comandos npm db:migrate.

## Histórico de checkpoints

| Checkpoint | SHA | Resultado |
| --- | --- | --- |
| A — DR corrigido | 4b64f00; documentação 61c0a9b | DR 38076046395 e Security CI 38076046401/38076418905 verdes; RTO inicial 68 s. |
| B — Fases 5–7 integradas | merge 20d8a499; documentação 0945f0b | Security 38076727237, DR 38076727196, acessibilidade 38076727255, monitor 38076746601 e supply chain 38076748817 verdes. |
| C — mapa de dependências V2 | 0c5ec10 | Security CI 38077901002 verde. |
| D — remoções seguras | c68ae874 | Security CI 38078250902, DR 38078250918 e acessibilidade 38078250956 verdes; 193 pgTAP e RTO 61 s. |

## Itens não corrigidos e justificativa

- Registros históricos já existentes podem conter snapshots clínicos. Não foram reescritos porque transformação retroativa exige política de retenção e auditoria humana.
- public.visitas_acs_v21 e private.auditoria_visitas_acs_v21 foram preservadas por analytics e retenção; a Data API continua bloqueada.
- public.acompanhamentos_visitas_equipe_v29_1 foi preservada porque pode existir apenas em ambientes históricos e seu conteúdo remoto não foi inspecionado.
- Os SQLs de database permanecem como referência histórica. Remoção/arquivamento exige decisão de governança documental.
- A auditoria manual com VoiceOver/NVDA, contraste, zoom e foco de modais continua necessária; axe não a substitui.
- O cron do monitor, o audit semanal e a configuração do Dependabot não operam automaticamente até promoção controlada à branch padrão.
- As ações checkout/setup-node/upload-artifact ainda geram aviso de compatibilidade Node 20 no runner atual; não houve atualização ampla de workflows nesta rodada.
- As cinco vulnerabilidades HIGH/CRITICAL de tooling de desenvolvimento dependem de correção upstream compatível; produção permanece com zero.
- A Fase 9 não foi executada por instrução. A CSP mantém unsafe-inline até avaliação separada.

## Avaliação técnica final

| Dimensão | Nota |
| --- | ---: |
| Segurança | 9,1 |
| Privacidade | 8,5 |
| Integridade | 8,8 |
| Confiabilidade | 8,8 |
| Recuperação | 8,7 |
| Observabilidade | 8,2 |
| Performance | 8,5 |
| Acessibilidade | 8,0 |
| Manutenibilidade | 8,7 |
| Supply Chain | 8,5 |

Média global: **8,58/10**.

## Exatamente o que ainda impede 10/10

- exercício humano de backup gerenciado/PITR, Storage, Auth e dependências externas com volume representativo;
- ativação controlada e observação dos schedules na branch padrão;
- auditoria assistiva manual completa;
- política humana de retenção/minimização para históricos anteriores à V30;
- decisão de retenção sobre tabelas V2 existentes somente em ambientes históricos;
- patch upstream seguro para a cadeia de tooling braces/micromatch;
- atualização das actions que ainda anunciam runtime Node 20;
- métricas reais de uso para decidir novos índices ou outras otimizações;
- hardening de unsafe-inline, deliberadamente separado como Fase 9.

## Estado final da rodada

Código, migrations e testes estão validados na branch de trabalho e prontos para revisão/publicação controlada. Nenhuma migration desta rodada foi aplicada ao dashboard-v2, nenhum dado remoto foi lido ou alterado e nenhuma publicação em Vercel Production foi realizada.

## Próximos passos

1. Revisar a migration de retirada V2 e a política de retenção com responsáveis humanos.
2. Promover por processo controlado somente após aprovação, backup e plano de rollback.
3. Ativar e observar monitor/Dependabot apenas quando os workflows chegarem à branch padrão.
4. Tratar acessibilidade manual, actions depreciadas e advisory de tooling em blocos independentes.
5. Avaliar a Fase 9 separadamente, como solicitado.