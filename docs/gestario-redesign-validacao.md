# Validação do redesign — PR 19
- Cards fixos de 565px, grid responsivo pelo espaço disponível, sem carrossel. Paginação de 12 fichas. Rolagem apenas interna ao conteúdo clínico.
- Painel lateral reutiliza as páginas clínicas e as RPCs existentes; as regras atuais de acesso continuam em vigor. Testar salvamento, cancelamento, foco e tela móvel.
- Próxima consulta usa a agenda da conta. Informações a conferir são campos registrados/ausentes, não diagnóstico ou lista completa do C3.
- Horários: proposta SQL em database/PROPOSTA_AGENDA_HORARIOS_V31.sql. Não aplicada no banco compartilhado. Após validar em ambiente isolado e confirmar RLS, ativar GESTARIO_AGENDA_HORARIOS=1 exclusivamente no ambiente migrado. Registros antigos mantêm hora nula.
- Preferências de apresentação ficam no metadado gestario_ui_v1, nunca usado para permissões. Avisos de risco permanecem visíveis. Testar login por senha e Google, persistência, atualização do sino e isolamento. Não altera nome oficial ou credenciais.
- Ainda pendentes: edição de dados oficiais do perfil com autorização apropriada; arquivo vetorial original do banner; competência PEC separada; persistência segura das anotações; testes autenticados em dispositivos. Sem publicação em produção.
