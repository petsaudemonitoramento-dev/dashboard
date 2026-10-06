# Modelo de Acesso a Dados

## Princípio

O software dos Profissionais utiliza isolamento individual.

A relação principal é:

`profissional -> gestante sob responsabilidade`

A UBS é informação organizacional e condição de consistência. Ela não substitui o vínculo individual.

## Profissional autenticado

Para acessar dados clínicos, o perfil deve simultaneamente:

- existir;
- estar ativo;
- estar aprovado;
- ter cadastro completo;
- ter papel `equipe_ubs`;
- não estar marcado como excluído;
- possuir vínculo com UBS;
- ser o `profissional_responsavel_id` da gestante.

## Gestante

A tabela principal usa:

`pec_gestantes.profissional_responsavel_id`

como owner clínico atual.

Um profissional não pode:

- listar gestantes de outro profissional;
- editar outra gestante da mesma UBS;
- transferir ownership por payload comum;
- importar silenciosamente uma gestante já vinculada a outro profissional.

## Mesmo território

Duas pessoas da mesma UBS continuam isoladas.

Exemplo:

- Profissional A — UBS X — Gestante A
- Profissional B — UBS X — Gestante B

Resultado esperado:

- A lê A;
- A não lê B;
- B lê B;
- B não lê A.

## Inserção

Um INSERT autenticado só é aceito quando:

- owner = `auth.uid()`;
- UBS = UBS do perfil;
- perfil continua ativo/aprovado.

## Atualização

UPDATE exige:

- acesso ao registro existente;
- owner continua igual a `auth.uid()`;
- UBS continua igual à UBS autorizada.

Uma atualização clínica comum não pode transferir owner.

## Exclusão

DELETE/RLS segue ownership.

No produto, o fluxo preferencial é lixeira/soft delete. Hard delete deve permanecer excepcional e auditável.

## Dados filhos

Consultas, exames, vacinas, classificações e outros dados dependentes devem sempre herdar autorização da gestante principal.

Qualquer policy que autorize um dado filho apenas por UBS deve ser considerada incorreta para este produto.

## Importações PEC

Cada lote possui `usuario_id`.

Somente o próprio usuário autenticado deve ver seu lote.

Uma importação não pode sobrescrever uma gestante cujo owner seja outro profissional.

## Identidade

Dados identificáveis ficam em schema privado.

`anon` e `authenticated` não devem receber acesso direto às tabelas privadas de identidade.

Quando identidade é necessária, o acesso ocorre por função server-side autorizada e deve gerar auditoria quando aplicável.

## Administrador

Administrador não é papel normal do produto dos Profissionais.

As estruturas administrativas herdadas existem para governança e compatibilidade, mas não devem permitir que o frontend clínico use um bypass permanente.

Operações administrativas excepcionais devem ser:

- explícitas;
- justificadas;
- auditadas;
- separadas do fluxo clínico diário.

## Compartilhamento futuro

Compartilhamento não está implementado nesta versão.

Se for necessário no futuro, não reutilizar `ubs_id` como compartilhamento implícito.

Criar relação explícita contendo, no mínimo:

- gestante;
- profissional autorizado;
- tipo de acesso;
- quem concedeu;
- data de início;
- data de expiração opcional;
- motivo;
- revogação.

## Transferência futura

Transferência de responsabilidade deve ser uma operação específica.

Ela deve:

1. validar o owner atual;
2. validar o novo profissional;
3. garantir coerência de UBS ou registrar exceção;
4. registrar owner anterior;
5. registrar novo owner;
6. registrar quem autorizou;
7. registrar data/motivo;
8. invalidar compartilhamentos incompatíveis.

Nunca aceitar transferência apenas porque o cliente enviou outro `profissional_responsavel_id`.

## Auditoria

A auditoria pode guardar IDs técnicos e metadados mínimos, mas não deve copiar o payload clínico integral sem necessidade.

Eventos prioritários:

- acesso a identidade;
- gravação clínica;
- classificação;
- importação;
- exclusão/restauração;
- mudança de owner;
- ação administrativa;
- tentativa proibida relevante.

## Regra para novas funcionalidades

Antes de criar nova tabela clínica, responder:

1. Qual gestante é a dona lógica desse registro?
2. Como a policy chega de `auth.uid()` até essa gestante?
3. O `WITH CHECK` impede reassignment?
4. Um profissional B da mesma UBS consegue descobrir esse registro?
5. Há caminho privilegiado que ignora a policy?

Se as cinco respostas não estiverem claras, a funcionalidade não está pronta.
