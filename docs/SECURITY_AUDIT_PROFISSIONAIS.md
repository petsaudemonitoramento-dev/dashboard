# Auditoria de Segurança — Software dos Profissionais

## Estado desta revisão

Esta revisão foi executada na branch:

`audit/pre-codex-hardening`

sobre a base do software **Cuidado na Gestação na APS — Profissionais**.

Nenhuma migration desta branch foi aplicada ao projeto remoto `dashboard-v2` durante o hardening. O banco remoto continua sendo destino futuro de publicação controlada.

## Modelo de ameaça prioritário

O risco principal deste produto é quebra de isolamento horizontal entre profissionais que trabalham na mesma UBS.

Cenário que deve ser impossível:

1. Profissional A e Profissional B pertencem à mesma UBS.
2. A conhece ou descobre o UUID de uma gestante de B.
3. A tenta acessar a gestante de B por URL, API, SQL exposto, PDF ou importação.
4. O sistema autoriza porque ambos pertencem à mesma UBS.

A arquitetura V30 elimina a UBS como autorização clínica suficiente. A UBS continua sendo uma condição adicional de consistência, mas o vínculo obrigatório é o `profissional_responsavel_id`.

## Arquitetura de autorização V30

A regra central é:

`auth.uid() -> perfil profissional ativo/aprovado -> profissional_responsavel_id -> gestante`

A função:

`security.usuario_pode_acessar_gestante_v30(uuid)`

é usada como barreira de RLS para a tabela principal de gestantes.

A compatibilidade com policies legadas que chamavam V18 foi mantida por um wrapper que delega à regra V30.

## Correções implementadas

### Ownership e RLS

- substituição da autorização clínica ampla por UBS por ownership individual;
- policies de `pec_gestantes` para SELECT/INSERT/UPDATE/DELETE com vínculo explícito ao usuário autenticado;
- importações PEC visíveis somente ao usuário que realizou o lote;
- grants explícitos somente ao papel `authenticated`, mantendo `anon` sem acesso;
- teste pgTAP com dois profissionais da mesma UBS.

### Wrappers para legado privilegiado

Foram criados wrappers V30 para:

- salvar cadastro clínico;
- obter cadastro clínico;
- salvar classificação de risco;
- gerar relatório de classificação;
- listar gestantes do profissional;
- importar PEC.

Os wrappers verificam ownership antes de delegar às funções legadas.

Isto é uma etapa de contenção. A meta arquitetural continua sendo remover a conexão PostgreSQL privilegiada dos fluxos clínicos comuns e usar sessão Supabase + RLS sempre que tecnicamente possível.

### Entrada HTTP

Foi criada proteção comum para:

- origem da requisição;
- `Sec-Fetch-Site`;
- Content-Type;
- Content-Length;
- UUID;
- JSON inválido;
- logging sem payload clínico.

Rotas clínicas deixam de devolver mensagens cruas do banco ao navegador.

### Validação

Cadastro clínico e classificação de risco passam por allowlist antes do SQL.

Foram definidos limites para:

- strings;
- datas;
- números;
- arrays de consultas/exames/vacinas;
- observações;
- UUID;
- quantidade de fatores.

Campos inesperados não são repassados automaticamente para o banco.

### Rate limiting

Foi implementado rate limiting persistente em PostgreSQL.

A tabela técnica:

`private.rate_limits_v30`

não armazena e-mail, nome ou conteúdo clínico. O ator é representado por hash SHA-256.

Há limitação para:

- cadastro público;
- gravação clínica;
- classificação de risco;
- importação PEC;
- geração de PDF;
- operações de lixeira.

### Importação PEC

O parser antigo utilizava `xlsx@0.18.5` sobre arquivo não confiável.

O caminho XLS/XLSX foi removido do produto e o importador V30 aceita somente CSV.

O parser CSV possui limites para:

- tamanho total do upload;
- quantidade de linhas;
- quantidade de colunas;
- tamanho de célula;
- aspas malformadas.

O arquivo bruto não é mantido como artefato persistente pela aplicação.

### Headers

Foram adicionados:

- Content-Security-Policy;
- X-Content-Type-Options;
- Referrer-Policy;
- Permissions-Policy;
- X-Frame-Options;
- Cross-Origin-Opener-Policy;
- X-DNS-Prefetch-Control;
- HSTS apenas em produção.

### Produto dos Profissionais

O menu normal foi reduzido a:

1. Início
2. Minhas gestantes
3. Importar PEC
4. Alertas
5. Atendimentos
6. Perfil

O Início foi refeito para calcular indicadores somente sobre as gestantes do próprio profissional.

Recursos legados de gestão permanecem no código para reversibilidade/auditoria, mas não compõem o fluxo normal do produto.

## Riscos ainda pendentes

### 1. Conexão PostgreSQL privilegiada

Ainda existem fluxos clínicos que usam `SUPABASE_DATABASE_URL` no servidor.

Os wrappers V30 reduzem a possibilidade de IDOR, mas isto ainda é um bypass arquitetural de RLS e deve ser alvo da auditoria seguinte.

Recomendação final: migrar operações comuns para Supabase SSR/RPC autenticada por `auth.uid()`, deixando conexão privilegiada apenas para tarefas administrativas controladas.

### 2. Funções SECURITY DEFINER legadas

O banco histórico contém várias funções privilegiadas.

As funções V30 relevantes receberam wrappers e `search_path` explícito, mas ainda é necessária uma revisão completa do conjunto legado antes de homologação.

### 3. Hard delete

A lixeira foi protegida no endpoint, porém as funções V19 de exclusão/restauração são legadas. A auditoria final deve confirmar que todas validam ownership individual ou substituí-las por wrappers V30.

### 4. Auth remoto

A proteção contra senhas vazadas do Supabase Auth estava desabilitada na inspeção inicial.

Isto exige configuração no projeto remoto antes de dados reais.

### 5. Drift do dashboard-v2

O remoto possui objetos V29.1 que não fazem parte da baseline recuperada.

A migration V30 aplica defesa em profundidade quando esses objetos existirem, mas a decisão funcional sobre manter/remover esse drift precisa ser tomada antes do push.

### 6. Testes de Route Handlers

A suíte de banco cobre o isolamento A×B. Ainda é desejável adicionar testes HTTP automatizados para:

- troca de UUID em ficha clínica;
- troca de UUID em classificação;
- PDF de classificação de outra profissional;
- importação contendo gestante de outro owner;
- usuário revogado;
- hard delete.

## Superfícies de ataque relevantes

| Superfície | Risco principal | Mitigação atual |
|---|---|---|
| Listagem clínica | BOLA/IDOR | ownership V30 + RLS |
| Ficha clínica | alteração de UUID | validação + wrapper V30 |
| Classificação | classificação de paciente alheia | validação + wrapper V30 |
| PDF | exfiltração por UUID | UUID + autorização server-side |
| PEC | arquivo malformado / takeover de owner | CSV limitado + ownership + rate limit |
| Cadastro | abuso / tentativa de privilégio | proxy + rate limit + normalização no banco |
| Logs | PII | helper de logging sem payload |
| Frontend | acesso por URL escondida | páginas clínicas revalidam perfil/owner |
| Banco | mesma UBS como autorização | removida da regra clínica central |

## Decisões arquiteturais

- mesma UBS nunca é autorização suficiente;
- administrador não é caminho normal do software dos Profissionais;
- novos cadastros externos são normalizados para solicitação `equipe_ubs`;
- XLS/XLSX ficam desativados até existir parser auditado;
- rate limit precisa ser persistente, não em memória local;
- erros internos do banco não devem chegar ao cliente;
- nenhuma publicação remota ocorre automaticamente pelo CI.

## Gate para homologação

O software não deve receber dados reais até que:

- CI esteja totalmente verde;
- teste A×B passe;
- Security Advisor remoto seja revisado;
- migrations tenham `db push --dry-run` revisado;
- proteção contra senhas vazadas esteja habilitada;
- funções SECURITY DEFINER legadas tenham revisão final;
- auditor independente confirme que não há IDOR conhecido;
- logs e Vercel/Supabase estejam revisados para ausência de PII;
- plano de rollback esteja documentado.
