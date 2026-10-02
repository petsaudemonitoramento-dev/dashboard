# Tarefa Codex — Profissionais V1: Hardening completo de segurança

## Contexto

Este branch implementa o software dos **Profissionais** do projeto Cuidado na Gestação na APS.

Branch de trabalho:

`profissionais-v1-seguranca`

A base veio do antigo dashboard clínico e já contém autenticação, importação PEC, gestantes, cadastro clínico, exames, vacinas, consultas, classificação de risco, alertas, auditoria e outras estruturas.

Este software é **separado do software da Gestão / MAE APS**.

A diferença crítica é que aqui haverá dados individualizados de saúde. A segurança deve ser superior à versão da Gestão.

---

# Objetivo principal

Transformar a base atual em uma aplicação clínica enxuta e segura onde:

> cada profissional autenticado acessa apenas as gestantes explicitamente vinculadas à sua responsabilidade.

Pertencer à mesma UBS NÃO é autorização suficiente para visualizar dados clínicos de outra gestante.

Nenhuma proteção pode depender somente do frontend.

---

# REGRAS INEGOCIÁVEIS

## 1. NÃO trabalhar diretamente em produção

- Não executar migrações destrutivas no banco de produção.
- Não apagar dados existentes.
- Não alterar credenciais reais.
- Não incluir service_role, database password, JWT secret ou qualquer segredo no repositório.
- Criar migrations/scripts versionados e testes.
- Caso uma mudança precise ser aplicada posteriormente no Supabase, documentar claramente.

## 2. RLS é a autoridade

Toda tabela exposta que contenha dados clínicos ou relações com gestantes deve ter RLS.

A regra padrão é:

`auth.uid() -> profissional -> vínculo explícito -> gestante`

Não aceitar como autorização final:

`auth.uid() -> mesma UBS -> gestante`

A UBS pode ser uma condição adicional, nunca o único vínculo clínico.

## 3. Evitar bypass de RLS

Auditar todas as APIs.

Não usar conexão PostgreSQL privilegiada como caminho normal para operações clínicas do usuário.

Preferência:

- Supabase SSR;
- sessão autenticada;
- RLS;
- RPC restrita somente quando necessário.

Se `SUPABASE_DATABASE_URL` continuar existindo para tarefas administrativas/migrations, ela NÃO deve ser usada para operações clínicas comuns.

## 4. SECURITY DEFINER

Auditar TODAS as funções `SECURITY DEFINER`.

Para cada função:

- justificar necessidade;
- definir `search_path` explicitamente;
- validar `auth.uid()`;
- limitar `EXECUTE`;
- revogar de `PUBLIC` quando necessário;
- preferir SECURITY INVOKER quando possível.

Nunca adicionar SECURITY DEFINER apenas para resolver erro de permissão.

## 5. Ownership explícito

Definir modelo inequívoco de ownership.

Preferir uma estrutura que suporte evolução futura, por exemplo:

- vínculo principal profissional ↔ gestante;
- possibilidade futura de compartilhamento autorizado e auditável;
- transferência de responsabilidade;
- histórico da alteração de responsável.

Não permitir que o usuário modifique o owner arbitrariamente em um UPDATE.

Toda mudança de responsabilidade deve ser validada e auditável.

## 6. APIs contra IDOR/BOLA

Testar todas as rotas que recebem IDs.

Alterar manualmente:

- gestante_id;
- classificacao_id;
- consulta_id;
- exame_id;
- vacina_id;
- IDs em URL;
- IDs em JSON/body;
- query params.

Um profissional nunca pode acessar recurso de outro profissional apenas conhecendo o UUID.

Resposta esperada: 403 ou 404 conforme decisão arquitetural consistente.

## 7. Importação PEC

A importação deve:

- aceitar apenas formatos previstos;
- validar MIME/extensão e tamanho;
- não confiar no nome do arquivo;
- não persistir arquivo bruto além do necessário;
- não imprimir planilha em logs;
- vincular a importação ao usuário;
- vincular as gestantes resultantes ao profissional autorizado;
- evitar que outro profissional da mesma UBS visualize o lote;
- registrar auditoria mínima sem PII desnecessária;
- ser resistente a arquivos malformados;
- ter limites para evitar DoS acidental.

## 8. Dados sensíveis / PII

Não registrar em console/logs:

- nome completo;
- CNS;
- CPF;
- telefone;
- endereço;
- data de nascimento completa quando não necessária;
- exames;
- diagnósticos;
- conteúdo clínico;
- conteúdo integral da planilha PEC.

Usar IDs técnicos e códigos de correlação em logs.

Remover logs existentes que possam expor dados.

## 9. Identidade da gestante

Manter dados identificáveis separados dos dados clínicos sempre que a arquitetura atual permitir.

O schema privado deve continuar realmente privado.

Revisar GRANT/REVOKE.

Nenhuma tabela privada contendo identidade deve ficar diretamente acessível a `anon` ou `authenticated`.

O acesso deve ser mediado de forma mínima e autorizada.

## 10. Sessão

Auditar:

- server client;
- browser client;
- cookies;
- middleware/proxy;
- callback;
- logout;
- expiração;
- sessão inválida;
- usuário desativado após login;
- profissional ainda não aprovado.

Não confiar somente no JWT antigo para decisões sensíveis caso o perfil tenha sido revogado/desativado.

## 11. Autorização

Autorização deve considerar, no mínimo:

- auth.uid();
- perfil ativo;
- aprovação;
- cadastro válido;
- papel correto;
- vínculo à gestante.

Não usar `user_metadata` como fonte de autorização.

## 12. CSRF / requests

Avaliar Server Actions e Route Handlers que modificam estado.

Adicionar proteção apropriada para o modelo do Next.js utilizado.

Validar Origin/host quando necessário em endpoints sensíveis.

## 13. Headers de segurança

Configurar uma política coerente para produção, quando compatível:

- Content-Security-Policy;
- X-Content-Type-Options;
- Referrer-Policy;
- Permissions-Policy;
- proteção contra framing via CSP frame-ancestors;
- HSTS apenas no ambiente de produção HTTPS.

Não quebrar Supabase/Auth com uma CSP impossível de manter.

## 14. Validação de entrada

Nenhum payload deve entrar diretamente em RPC/SQL sem validação estrutural.

Criar schemas de validação reutilizáveis.

Validar:

- UUID;
- strings;
- datas;
- números;
- enums;
- limites;
- campos extras inesperados.

Evitar mass assignment.

## 15. SQL injection

Auditar todo uso de `postgres`, SQL template e RPC.

Nunca interpolar SQL bruto vindo do usuário.

## 16. Rate limiting / abuso

Implementar ou preparar estratégia prática de rate limiting para:

- login/cadastro quando aplicável;
- importação;
- endpoints que geram PDF;
- buscas;
- operações pesadas.

Evitar implementar solução falsa apenas em memória local se a aplicação estiver serverless.

Se depender de infraestrutura externa, documentar claramente e deixar uma interface preparada.

## 17. PDFs

A rota de PDF deve revalidar autorização no servidor.

Nunca assumir que o usuário pode acessar um PDF só porque conseguiu abrir anteriormente a tela.

Não incluir dados de outra gestante por troca de ID.

## 18. Lixeira e exclusão

Excluir/restaurar deve respeitar ownership.

Hard delete deve ser restrito.

Toda exclusão permanente precisa de autorização forte e auditoria.

## 19. Auditoria

Criar/ajustar trilha de auditoria para eventos sensíveis:

- consulta de identidade quando viável;
- criação/edição clínica;
- classificação de risco;
- importação;
- exclusão/restauração;
- mudança de responsável;
- ações administrativas;
- tentativas proibidas relevantes quando apropriado.

Auditoria não pode ser editável pelo profissional comum.

Evitar armazenar payload clínico integral na auditoria.

## 20. Segredos

Auditar:

- .env.example;
- arquivos de configuração;
- histórico atual visível na branch;
- código cliente;
- NEXT_PUBLIC_*.

Nenhum segredo administrativo pode chegar ao bundle do navegador.

---

# MODELO FUNCIONAL NOVO

O produto deverá ser enxuto.

Menu alvo:

1. Início
2. Minhas gestantes
3. Importar PEC
4. Alertas
5. Atendimentos
6. Perfil

Dentro da ficha da gestante:

- Resumo
- Consultas
- Exames
- Vacinas
- Classificação de risco
- Histórico

Remover/ocultar do produto dos profissionais recursos exclusivos de Gestão:

- comparação municipal;
- território municipal amplo;
- dashboards gerenciais;
- indicadores consolidados entre UBS;
- administração municipal;
- recursos de gestão que não pertençam à rotina individual.

Não apagar código útil sem necessidade; separar/deprecar com cuidado.

---

# REUSO DA SEGURANÇA DA GESTÃO

Auditar a implementação do projeto de Gestão/dashboard-v3 e reaproveitar padrões sólidos quando compatíveis, incluindo:

- autenticação server-side;
- autorização;
- validação;
- headers;
- organização de API;
- tratamento de erros;
- políticas e práticas de segurança;
- testes;
- gerenciamento de secrets.

Não copiar cegamente: este sistema exige isolamento individual mais rigoroso.

---

# TESTES OBRIGATÓRIOS

Criar testes automatizados para um cenário mínimo:

Profissional A e Profissional B pertencem à MESMA UBS.

Gestante A pertence ao Profissional A.
Gestante B pertence ao Profissional B.

Validar:

### SELECT
A vê A.
A não vê B.
B vê B.
B não vê A.

### UPDATE
A atualiza A.
A não atualiza B.

### DELETE
A pode executar somente a operação autorizada sobre A.
A não remove B.

### INSERT
A não consegue criar registro clínico apontando para B.

### IDs
Troca manual de UUID retorna acesso negado.

### APIs
Testar diretamente Route Handlers, não apenas UI.

### RPC
Testar RPCs diretamente usando contexto de usuário.

### PDF
A não gera PDF de B.

### PEC
Lote importado por A não se torna automaticamente visível para B.

### usuário revogado
Usuário desativado perde acesso mesmo com sessão previamente existente conforme arquitetura escolhida.

---

# SECURITY REVIEW AUTOMÁTICO

Ao final:

- rodar lint;
- rodar TypeScript;
- rodar testes;
- rodar build;
- executar/adaptar testes de segurança;
- analisar dependências;
- verificar RLS;
- revisar funções privilegiadas;
- revisar views;
- revisar GRANTs;
- revisar logs.

Se houver Supabase CLI disponível:

- executar advisors apropriados;
- documentar findings.

---

# ENTREGÁVEIS

Criar:

`docs/SECURITY_AUDIT_PROFISSIONAIS.md`

Com:

- arquitetura final;
- modelo de ameaça;
- superfícies de ataque;
- tabela de riscos;
- correções realizadas;
- itens pendentes;
- decisões arquiteturais;
- checklist pré-homologação.

Criar:

`docs/DATA_ACCESS_MODEL.md`

Explicando:

- quem acessa o quê;
- ownership;
- compartilhamento;
- transferência;
- admin;
- UBS;
- dados privados;
- auditoria.

Criar:

`docs/PRE_PRODUCTION_SECURITY_CHECKLIST.md`

Checklist objetivo antes de aceitar dados reais.

---

# DEFINIÇÃO DE PRONTO

A tarefa NÃO está concluída apenas porque a interface funciona.

Está concluída quando:

1. um profissional não consegue obter dados de outro profissional da mesma UBS;
2. o isolamento é imposto pelo banco;
3. APIs revalidam autorização;
4. não há bypass privilegiado como fluxo clínico padrão;
5. testes de isolamento passam;
6. build passa;
7. não existem secrets expostos;
8. logs não contêm PII clínica;
9. funções privilegiadas foram auditadas;
10. existe documentação suficiente para auditoria humana posterior.

---

# IMPORTANTE

Não introduzir complexidade desnecessária.

Segurança deve ser concreta, testável e baseada em mecanismos reais do Next.js, PostgreSQL e Supabase.

Não criar controles cosméticos apenas para marcar checklist.

Não fazer alterações destrutivas em produção.

Ao final, gerar um resumo separado com:

- arquivos alterados;
- migrations criadas;
- riscos corrigidos;
- riscos ainda pendentes;
- decisões que precisam de revisão humana.
