# Bootstrap de um novo projeto Supabase

Este guia prepara um projeto vazio para receber a migração cumulativa do Dashboard 2.0. Ele não deve ser usado contra o banco remoto atual sem uma janela de mudança, backup verificado e aprovação específica.

Nenhuma chave, senha, segredo ou identificador real deve ser registrado neste documento, no Git, em logs de CI ou no seed.

## 1. Criar e isolar o projeto

1. Crie um projeto Supabase vazio dedicado ao novo ambiente.
2. Registre a região, a versão do PostgreSQL e o identificador do projeto no inventário operacional, fora do repositório quando forem informações sensíveis.
3. Não vincule a CLI ao projeto remoto existente.
4. Faça primeiro a reconstrução e os testes em um projeto local ou descartável.
5. Confirme que a migração cumulativa é a primeira migração de domínio aplicada. Ela não depende do baseline congelado nem das migrações V15–V21.

## 2. Habilitar dependências

No painel de extensões do novo projeto, confirme:

- Supabase Vault disponível e com a view `vault.decrypted_secrets`;
- `pgcrypto` disponível no schema `extensions`;
- Supabase Auth instalado, incluindo `auth.users`.

A migração verifica essas dependências e interrompe a transação se Auth ou Vault não estiverem disponíveis. Ela não cria segredo e não habilita Cron.

## 3. Criar a chave de PII no Vault

Crie manualmente um segredo criptograficamente forte no Vault com o nome exato:

`pec_pii_key`

Regras:

- gere o valor em um gerenciador de segredos;
- não reutilize senha de usuário, chave de API ou segredo de outro ambiente;
- não cole o valor em issue, chat, terminal gravado, pipeline ou arquivo `.env`;
- restrinja a visualização do segredo aos operadores autorizados;
- documente rotação, custódia e recuperação fora deste repositório;
- valide apenas a existência do nome, nunca imprima `decrypted_secret`.

As funções de identidade usam o nome do segredo em tempo de execução. Sem ele, operações de criptografia ou descriptografia devem falhar de forma fechada.

## 4. Reconstruir e verificar localmente

Em um ambiente local ou descartável:

1. aplique somente a migração `*_clean_cumulative_schema.sql`;
2. aplique o `supabase/seed.sql`;
3. execute `supabase/verification/verify_clean_cumulative_schema.sql`;
4. confirme 26 tabelas, duas views analytics e o enum com cinco perfis;
5. confirme a ausência das tabelas legadas e de `profissional_ubs`;
6. teste uma segunda execução do seed;
7. descarte o ambiente e repita a reconstrução do zero.

Não use `db reset --linked`, `migration repair` ou comandos remotos para esta validação.

## 5. Configurar Auth

No painel de Auth:

1. defina a URL pública canônica do aplicativo;
2. adicione separadamente as URLs de desenvolvimento, homologação e produção permitidas;
3. restrinja redirects a origens e caminhos conhecidos;
4. escolha a política de confirmação de e-mail;
5. configure duração de sessão, recuperação de senha e proteção contra abuso;
6. habilite MFA para administradores quando disponível;
7. revise templates de e-mail sem inserir dados clínicos.

Não insira linhas diretamente em `auth.users`. Usuários devem ser criados por fluxos oficiais do Supabase Auth. O perfil de aplicação correspondente deve usar o mesmo UUID e ser provisionado por um procedimento administrativo revisado.

## 6. Configurar Google OAuth

1. Crie um cliente OAuth separado por ambiente no Google Cloud.
2. Cadastre somente os domínios autorizados.
3. Copie a callback indicada pelo Supabase para as URIs de redirect do cliente.
4. Armazene o client secret somente no painel seguro do Supabase.
5. Habilite o provedor Google no Auth.
6. Teste login, logout, revogação e rejeição de redirect não cadastrado.
7. Confirme que o primeiro login não concede perfil funcional automaticamente.

## 7. Configurar o Next.js

Configure no provedor de deploy, sem gravar valores reais no repositório:

- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
- `SUPABASE_SECRET_KEY` somente no servidor;
- `SUPABASE_DATABASE_URL` somente no servidor;
- `METABASE_SITE_URL`, `METABASE_EMBED_SECRET`, `METABASE_UBS_DASHBOARD_ID` e `METABASE_PROFESSIONAL_DASHBOARD_ID` apenas quando o Metabase for provisionado.

A variável `SUPABASE_DATABASE_URL` é uma limitação relevante: a conexão direta normalmente usa um papel com capacidade de contornar RLS. Nesta etapa não foi criada uma role proprietária específica da aplicação. Até esse endurecimento posterior:

- mantenha a URL exclusivamente no servidor;
- use pooler e TLS conforme a recomendação do projeto;
- limite rede, rotação e acesso ao segredo;
- não aceite perfil, UBS ou microárea fornecidos pelo cliente como fonte de autorização;
- não execute SQL de domínio arbitrário pela conexão direta; use somente funções revisadas que recebam `p_usuario_id` e validem perfil ativo, aprovação e território;
- monitore chamadas e erros sem registrar dados pessoais;
- considere temporário e inadequado para produção o uso de uma conexão que seja owner ou possua `BYPASSRLS`;
- planeje uma role de execução sem ownership, sem `BYPASSRLS`, sem acesso direto ao Vault e com `EXECUTE` concedido apenas por assinatura exata.

Os auxiliares `private.pii_key()`, `private.descriptografar_texto(bytea)` e `private.descriptografar_jsonb(bytea)` são internos. A migração revoga sua execução de `PUBLIC`, `anon`, `authenticated` e `service_role`; a aplicação deve acessar PII somente por wrappers autorizados que validem `p_usuario_id` e retornem o mínimo necessário. Enquanto a conexão direta usar o papel proprietário, essa separação ainda não constitui uma barreira completa contra SQL arbitrário.

No endurecimento posterior da conexão direta:

1. crie uma role de login não proprietária e sem `BYPASSRLS`;
2. conceda `CONNECT` ao banco e `USAGE` apenas nos schemas estritamente necessários;
3. revogue acesso a `vault`, `auth`, `storage` e às tabelas de domínio; conceda `USAGE` em `private` somente se os wrappers permanecerem nesse schema;
4. conceda `EXECUTE` somente aos wrappers aprovados, por assinatura exata, sem conceder acesso às tabelas subjacentes;
5. mantenha os auxiliares criptográficos sem `EXECUTE` direto;
6. teste tentativas de leitura direta, troca de `p_usuario_id`, UBS e microárea;
7. rotacione `SUPABASE_DATABASE_URL` após a troca de role.

O frontend ainda precisa substituir `profissional_ubs` por `equipe_ubs` antes da troca de projeto. A chamada atual `private.esvaziar_lixeira_v19()` é incompatível: ela deve passar o UUID do usuário para `private.esvaziar_lixeira_v19(uuid)`. O filtro opcional administrativo de indicadores usa a assinatura `private.obter_indicadores_v21(uuid, text, uuid)`; chamadas existentes com dois argumentos continuam válidas pelo valor default, mas não filtram automaticamente pela UBS do perfil.

## 8. Provisionar Metabase posteriormente

A migração cria somente:

- `analytics.vw_indicadores_base_v18`;
- `analytics.vw_fatores_risco_v18`.

Ela não cria `metabase_reader`, credencial, job Cron ou grant amplo. Em uma mudança separada:

1. crie um usuário técnico exclusivo, sem ownership e sem BYPASSRLS;
2. conceda CONNECT ao banco e USAGE apenas em `analytics`;
3. conceda SELECT somente nas duas views aprovadas;
4. configure SSL, allowlist de rede e rotação da senha;
5. verifique que nenhuma coluna de identidade aparece nas views;
6. configure embedding e dashboards somente depois da revisão de privacidade;
7. teste que Metabase não acessa `public`, `private`, `auth`, `storage` ou Vault.

## 9. Checklist de prontidão

O projeto só está pronto quando:

- a reconstrução do zero e a verificação terminam sem exceções;
- o seed idempotente contém 1 UBS fictícia, 3 microáreas, 27 exames, 6 vacinas e 73 fatores validados;
- não existem usuários ou dados pessoais no seed;
- `anon` e `authenticated` não possuem TRUNCATE, TRIGGER, REFERENCES ou MAINTAIN;
- `PUBLIC`, `anon` e `authenticated` não possuem `CREATE` nos schemas `public`, `private`, `security` ou `analytics`;
- nenhuma função privada ou de trigger é executável por `anon` ou `authenticated`;
- `service_role` não executa diretamente os auxiliares criptográficos nem funções de trigger;
- as tabelas de auditoria são append-only para `service_role`, sem `UPDATE` ou `DELETE`;
- tabelas privadas permanecem sem policies, com RLS habilitado e sem grants para os papéis de API;
- o segredo `pec_pii_key` existe sem ter sido exposto;
- redirects e Google OAuth foram testados;
- os cinco perfis funcionais foram testados com cenários positivos e negativos;
- indicadores de aluno negam grupos menores que cinco e não exibem microárea;
- a incompatibilidade do frontend foi corrigida e revisada;
- backup, rollback operacional e plano de corte foram aprovados;
- o banco remoto existente permanece intacto até a decisão formal de migração.
