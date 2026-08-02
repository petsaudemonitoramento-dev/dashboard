# Roteiro futuro de testes da matriz final de autorização

Este roteiro deve ser executado somente em uma reconstrução local descartável e
não vinculada a qualquer projeto Supabase. Ele não foi executado durante a
criação das migrações. Não use usuários, credenciais profissionais, dados PEC ou
segredos reais.

## Pré-condições

1. Criar um projeto Supabase exclusivamente local e confirmar que ele não está
   vinculado ao projeto remoto.
2. Aplicar, no ambiente descartável, a migração cumulativa e as migrações
   incrementais de credenciais e separação clínica.
3. Executar o seed fictício já versionado.
4. Criar usuários sintéticos pelo fluxo suportado pelo Supabase Auth. Não inserir
   linhas manualmente em `auth.users`.
5. Criar pelo menos duas UBS fictícias e duas microáreas por UBS.
6. Usar UUIDs, nomes, e-mails, CRM e COREN exclusivamente sintéticos.
7. Encerrar cada cenário de mutação em uma transação com `ROLLBACK`.

## Identidades sintéticas necessárias

Preparar contas independentes para:

- administrador técnico;
- gestão municipal;
- médico de `equipe_ubs` com CRM validado;
- enfermeiro de `equipe_ubs` com COREN/Enfermeiro validado;
- equipe com credencial pendente, rejeitada e expirada;
- ACS da UBS A/microárea A1 e ACS da UBS A/microárea A2;
- aluno da UBS A;
- contas pendente, inativa, incompleta e rejeitada;
- alvo separado para testar autoaprovação e concorrência.

Nenhuma fixture deve reproduzir CPF, CNS, telefone, endereço, nome ou condição
clínica de pessoa real.

## Testes como `authenticated`

Em cada cenário, iniciar uma transação, assumir `authenticated` e configurar os
claims locais para o UUID sintético. Confirmar explicitamente o `auth.uid()` antes
de consultar qualquer tabela. Finalizar sempre com `ROLLBACK`.

Validar:

1. Administrador e gestão recebem zero linhas nas tabelas clínicas, de identidade,
   importação PEC e lixeira, mesmo quando tentam consultar IDs conhecidos.
2. Aluno recebe zero registros individuais e não consegue inferir grupos abaixo
   do limite mínimo definido pelas views agregadas.
3. Equipe da UBS A lê e altera registros da UBS A, inclusive registros cuja
   autoria pertence a outro profissional elegível da mesma UBS.
4. Equipe da UBS A recebe zero linhas e falha em qualquer mutação da UBS B.
5. Equipe sem credencial validada, inativa, incompleta, pendente ou rejeitada
   recebe zero linhas e não consegue importar PEC.
6. ACS A1 acessa apenas o fluxo territorial da UBS A/microárea A1; registros da
   microárea A2 e da UBS B permanecem invisíveis.
7. ACS não cria nem altera consulta, exame, vacina, classificação de risco ou
   cadastro clínico.
8. `anon` não obtém acesso a tabelas pessoais, clínicas ou privadas.
9. Nenhuma das roles `anon` ou `authenticated` possui `TRUNCATE`, `TRIGGER`,
   `REFERENCES` ou `MAINTAIN`.

## Testes como `service_role`

`service_role` ignora RLS; portanto, não basta testar consultas diretas. Chamar
cada função privada com `p_usuario_id` sintético e confirmar que a própria função
valida perfil, situação, credencial e território.

Validar:

1. `private.importar_pec` aceita somente médico ou enfermeiro elegível da UBS
   informada pelo servidor.
2. A função rejeita administrador, gestão, ACS, aluno, perfil legado, UBS alheia e
   qualquer estado de conta ou credencial inelegível.
3. O antigo `private.importar_pec_impl_v22` não possui `EXECUTE` para
   `service_role`, `authenticated` ou `anon`.
4. Funções clínicas e de lixeira rejeitam administrador e gestão mesmo quando o
   chamador conhece um UUID clínico válido.
5. Alterações realizadas por equipe registram o UUID autor nos campos e tabelas
   de auditoria, sem limitar a leitura geral da própria UBS a esse autor.
6. Funções de gestão rejeitam qualquer `p_gestor_id` que não corresponda a uma
   gestão municipal ativa, aprovada e completa.
7. Autoaprovação falha; duas decisões concorrentes sobre a mesma solicitação
   resultam em uma única decisão e uma única trilha coerente de auditoria.
8. Falha entre atualização do perfil e auditoria reverte toda a transação.

## Casos de credencial

- Médico: somente CRM, categoria `MEDICO`, UF válida e número numérico.
- Enfermeiro: somente COREN, categoria `ENFERMEIRO`, UF válida e número numérico.
- Técnico e auxiliar de enfermagem: aprovação como `equipe_ubs` deve falhar.
- O trio conselho/UF/número não pode ser associado a duas contas.
- Credenciais pendente, rejeitada e expirada não liberam acesso clínico.
- A fonte de validação deve ser `portal_cfm` para CRM e `consulta_cofen` para
  COREN.

Não guardar capturas completas dos portais, CPF ou outros documentos. Registrar
somente decisão, fonte oficial controlada, ator e timestamps previstos no schema.

## Critérios de encerramento

1. Executar `supabase/verification/verify_final_authorization_matrix.sql` e
   investigar qualquer linha retornada pelas consultas marcadas como “zero”.
2. Confirmar que todas as mutações de cenário terminaram em `ROLLBACK`.
3. Descartar o projeto local e todas as fixtures sintéticas.
4. Não promover migrações ao remoto até revisão humana separada dos resultados.
