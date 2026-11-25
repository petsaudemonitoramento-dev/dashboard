# Gestário APS — conta autônoma e isolamento individual
Status: primeira etapa de implementação, PR #19. Não autoriza tratamento assistencial nem muda o banco em produção.

## Decisões
- Cadastro comum livre, email confirmado, profissão declarada, nome e email; UBS opcional. Sem CPF, data de nascimento ou conselho no novo fluxo.
- Demonstração sem dados reais, apenas fixtures fixas em memória, sem upload ou escrita clínica. A profissão declarada não autoriza nada.
- A aprovação clínica existente continua em vigor até a autorização institucional substituí-la. Nenhuma conta ganha perfil administrador automaticamente.
- A autorização institucional futura precisa ter emissor responsável e verificável, escopo, validade, revogação, trilha e vínculo com a conta confirmada; não basta autodeclaração. Preferir identidade institucional ou convite individual de uso único. MFA antes do uso real. Não existe integração institucional confirmada ainda.
- Cada profissional deve possuir suas próprias fichas; mesma gestante pode existir em contas diferentes. A identidade e deduplicação deverão ser escopadas pelo UUID do profissional, não pela UBS. Nenhuma sincronização ou informação de existência em outras contas.
- PEC permanece fonte oficial. Não ampliar acesso administrativo a fichas.

## Ativação do fluxo novo
A flag de servidor GESTARIO_AUTONOMOUS_SIGNUP permanece desativada por padrão. O SQL em database/PROPOSTA_ONBOARDING_AUTONOMO_V31.sql é uma proposta de migração, ainda não aplicada. Gerar migração com CLI e validar em ambiente isolado. Confirmar confirmação de email obrigatória, redirects OAuth e envio de email no Supabase; testar ambos os fluxos. A demonstração existente está disponível a contas comuns pendentes, ativas e confirmadas. Não usar a flag no banco compartilhado sem testes e revisão.
A política de privacidade, termos finais, controlador/operador, retenção, atendimento de titulares, transferência internacional, resposta a incidentes e RIPD dependem de definição institucional. A ciência registrada no protótipo é apenas da demonstração, não aceite de termos jurídicos finais.

## Bloqueios e testes de aceitação antes de produção
1. Inspecionar funções legadas de identidade, importação PEC, cadastro clínico e constraints/índices; migrar hash por profissional com HMAC e reindexação transacional, sem expor dados identificadores. Validar conflitos preexistentes e preservar IDs, vínculos, histórico, lixeira e criptografia. Não remover barreira antiga antes de substituir o dedupe.
2. Eliminar oráculo de existência entre contas: dois usuários na mesma UBS importam a mesma identidade, ambos recebem registros próprios; reimportação, edição, agenda, exclusão e restauração de A não afetam B. Testar importações concorrentes e reimportação após mudança de UBS.
3. Avaliar desatrelar UBS das regras clínicas e constraints sem permitir apropriação ou transferência indevida; trabalhar com UUID autenticado e ownership em RLS, RPCs e índices. Não fazer alteração apenas visual.
4. Testar cadastro livre por e-mail/Google, sem UBS; confirmar que ninguém se autoeleva; contas suspensas ou rejeitadas não recuperam acesso pelo onboarding; demonstração não consegue chamar RPCs de leitura/escrita clínicos nem alterar perfil.
5. Implementar autorização institucional (emissor aprovado, uso único/expiração/revogação, auditoria, MFA), validar API diretamente e revogar privilégios legados de aprovação por conselho somente após substituição segura. Contas existentes não serão reclassificadas automaticamente.
6. Validar separação do MAE APS, administrador sem acesso rotineiro a fichas, backups e exclusão conforme retenção, políticas e segurança. Executar CI, pgTAP, testes com dados sintéticos e revisão independente. NO-GO para produção até aprovação.
