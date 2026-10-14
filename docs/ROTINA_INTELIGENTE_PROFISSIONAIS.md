# MAE APS – Profissionais | Rotina Inteligente

## Escopo aprovado

Implementar as funcionalidades de organização individual abaixo, sem criar distribuição de trabalho entre profissionais nem exigir outro Supabase/Vercel:

1. **Minha rotina:** painel pessoal derivado apenas de \`profissionais_listar_gestantes_v30\` e agenda protegida por RLS. Não considera ausência de registro como procedimento não realizado.
2. **Linha do tempo:** consultas, exames e vacinas com **datas existentes e fonte visível** (PEC/manual/desconhecida); totais agregados sem datas aparecem separadamente, sem eventos artificiais.
3. **C3:** checklist A–K já implementado na ficha. "Algum registro relacionado" não representa cumprimento do critério ou pontuação SIAPS; clique leva à aba.
4. **Registro rápido:** abas diretas para consulta, exame e vacina dentro da ficha **autorizada**, aproveitando formulário, validações e auditoria existentes.
5. **Agenda e busca ativa:** atividades com gestante, categoria, data e status, sem campos narrativos desnecessários; concluir, reagendar, reabrir e excluir. Não envia notificações nem faz julgamento clínico.
6. **Revisão das importações:** compara estrutura, hash e quantidade de linhas com último lote **da mesma profissional/UBS**. Retorna número de fichas que já existiam antes do lote e quantas possuíam campos manuais protegidos, sem revelar pacientes de terceiros. Não inventa contagem de alterações clínicas efetivas.
7. **Resumo do atendimento:** página privada com consulta, exames, vacinação, boas práticas C3 e impressão A4 (impressão sob responsabilidade de profissional autorizado).

A estética segue princípios de interface clínica clara, em tons suaves, cartões brancos, tipografia funcional, estados de foco e design responsivo; não replica a interface do cure.med.

## Origem dos dados e isolamento

- A lista de pacientes é obtida via RPC com isolamento por **profissional responsável**, não por UBS em bloco.
- A agenda reside em \`public.rotina_profissional_tarefas_v1\`, com \`profissional_id = auth.uid()\` **E** \`security.usuario_pode_acessar_gestante_v30(gestante_id)\` em todas as políticas.
- Operações da agenda exigem usuário autenticado, perfil aprovado, rate-limit, validação de data e UUID, e guard CSRF.
- Status da agenda são **operacionais**, não evidências de que houve procedimento clínico.
- O resumo usa a mesma RPC clínica autorizada da ficha, nunca uma consulta aberta de todas as pacientes.
- Não são gravados nomes, diagnósticos ou observações livres nas tarefas da agenda.
- O PEC não é origem para o indicador institucional de gestão; fonte oficial para gestão permanece SIAPS.

## Testes de aceitação

Executar no Supabase descartável do próprio GitHub Actions:

- pgTAP existente e novo teste \`037_rotina_profissional_isolamento.sql\`: criar agenda de A, negar leitura/edição/exclusão para B da mesma UBS, revogar A e negar leitura, não permitir anon.
- 036 PEC: paciente fictícia + complemento manual + reenvio idêntico + exportação atualizada (mantendo proteção manual).
- TypeScript, ESLint, build e auditoria de dependências de produção.
- Testes públicos de acessibilidade já existentes. Eles **não substituem** testes autenticados com leitor de tela da nova tela.
- Smoke test autenticado com paciente 100% fictícia: abrir /dashboard, concluir/reagendar tarefa, abrir aba de consulta, linha do tempo, resumo A4, comparar PEC, conferir C3 e confirmar logout.

## Limites explícitos e pendências antes de produção clínica real

- A tela de "minha rotina" indica registros para conferência; não é motor automático de prioridade médica.
- A comparação com importação anterior de PEC só mostra metadados de estrutura e contagens prévias de fichas protegidas; ela **não** reconcilia individualmente cada evento clínico entre dois arquivos.
- A cobertura de campos A–K não comprova 100% do indicador oficial sem eventos detalhados, datas, CBO e regras SIAPS.
- A agenda não integra calendário externo nem dispara notificações, evitando exposição e custo.
- A migração da agenda deve ser aplicada **antes** da página do dashboard que a lê. Nunca testar escrita com pacientes reais.
- Os testes autenticados de ponta a ponta e uma breve validação com profissionais devem ocorrer antes de promover a versão candidata.
- Sem autorização explícita de merge ou publicação: PR draft e deploy oficial inalterados.

## Ordem segura de integração

Este PR depende da base do pacote PEC/C3 e da reimportação segura. Testar e integrar em cadeia, após checks verdes: segurança enxuta → PEC/C3 → reimportação protegida → Rotina Inteligente. **Não** executar migrações de PRs em produção isoladamente, sem revisão e plano de rollback.
