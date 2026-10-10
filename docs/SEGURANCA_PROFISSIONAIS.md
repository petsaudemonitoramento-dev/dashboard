# Arquitetura de Segurança — Software dos Profissionais

## Objetivo

Este documento define a linha de base de segurança para o software dos profissionais do projeto **Cuidado na Gestação na APS**.

O sistema dos profissionais é independente do software da Gestão. Ele trabalha com dados individuais de gestantes e, por isso, deve aplicar isolamento de acesso por profissional desde o banco de dados.

## Regra central de acesso

A regra padrão deve ser:

> Um profissional autenticado só pode visualizar ou alterar gestantes explicitamente vinculadas à sua responsabilidade profissional.

Pertencer à mesma UBS, por si só, não deve conceder acesso aos dados clínicos de outra gestante.

Exceções precisam ser explícitas, auditáveis e justificadas por papel/função.

## Escopo funcional reaproveitado

A base atual pode reaproveitar:

- autenticação e fluxo de aprovação;
- cadastro e listagem de gestantes;
- importação PEC;
- cadastro clínico;
- consultas;
- exames;
- vacinação;
- classificação de risco;
- alertas;
- histórico e auditoria;
- geração de PDF da classificação de risco;
- componentes visuais e estrutura Next.js.

Recursos voltados à Gestão, território municipal, comparação entre UBS e indicadores consolidados não fazem parte do núcleo deste software.

## Regras obrigatórias de segurança

### 1. Isolamento por ownership

Toda tabela clínica relacionada a uma gestante deve herdar o acesso da gestante principal.

O vínculo de responsabilidade deve ser explícito, usando o identificador do profissional autenticado.

Nenhuma autorização clínica deve depender apenas de `ubs_id`.

### 2. RLS como barreira principal

Tabelas expostas ao Data API devem ter RLS habilitado e políticas específicas.

As políticas devem validar:

- usuário autenticado;
- perfil ativo e aprovado;
- vínculo profissional;
- ownership da gestante;
- ownership também em INSERT/UPDATE via `WITH CHECK`.

A interface não é uma barreira de segurança.

### 3. Backend sem bypass amplo de RLS

Rotas que manipulam dados de saúde não devem depender de uma conexão Postgres privilegiada para executar operações comuns do usuário.

Prioridade:

1. Supabase SSR com sessão do usuário;
2. RLS;
3. RPCs restritas quando uma operação transacional exigir função de banco.

Funções `SECURITY DEFINER` devem ser exceção, ficar em schema não exposto, ter `search_path` fixo e validação explícita de `auth.uid()`.

### 4. Identidade e dados sensíveis

Dados identificáveis devem permanecer em estrutura privada e separados dos dados clínicos quando possível.

A aplicação deve expor apenas o mínimo necessário para a função do profissional.

Logs da aplicação não devem registrar:

- nome completo;
- CNS/CPF;
- telefone;
- endereço;
- resultados clínicos;
- conteúdo integral de planilhas PEC.

### 5. Importação PEC

O fluxo deve:

1. validar o arquivo;
2. limitar formato e tamanho;
3. processar o mínimo necessário;
4. evitar retenção desnecessária do arquivo bruto;
5. vincular registros ao profissional responsável;
6. auditar a importação sem copiar dados clínicos para logs;
7. impedir que outro profissional da mesma UBS acesse o lote importado.

### 6. Sessão e autenticação

- usar apenas chave publicável no navegador;
- nunca expor `service_role` ou segredo do banco ao cliente;
- exigir perfil aprovado e ativo;
- habilitar proteção contra senhas vazadas antes de uso real;
- revisar duração e revogação de sessões antes da homologação.

### 7. Auditoria

Registrar ações sensíveis, no mínimo:

- visualização de identidade quando aplicável;
- criação e alteração clínica;
- importações;
- exclusão/restauração;
- classificação de risco;
- mudança de responsabilidade da gestante;
- ações administrativas excepcionais.

A auditoria não deve ser editável pelo profissional comum.

## Achados da auditoria inicial — 02/10/2026

A base atual já possui RLS em todas as tabelas públicas identificadas.

Pontos que precisam de correção antes de dados reais:

1. Algumas políticas atuais ainda autorizam acesso por UBS/território, o que é mais amplo que o modelo individual deste software.
2. A tabela `public.acompanhamentos_visitas_equipe_v29_1` possui RLS habilitado, mas não possui política.
3. Há funções auxiliares em `private` sem `search_path` fixo.
4. A proteção contra senhas vazadas do Supabase Auth está desabilitada.
5. Existem diversas funções `SECURITY DEFINER`; cada uma deve ser revisada quanto a EXECUTE, validação de usuário e necessidade real.
6. Algumas rotas usam conexão Postgres direta via `SUPABASE_DATABASE_URL`; isso pode contornar RLS dependendo da role utilizada e deve ser removido do fluxo comum de dados clínicos.

## Fases de implementação

### Fase A — Segurança estrutural

- ownership explícito por profissional;
- revisão de RLS;
- revisão de funções privilegiadas;
- eliminação de bypass de RLS nas rotas clínicas;
- hardening do Auth;
- testes de isolamento entre usuários.

### Fase B — Produto enxuto

Menu principal sugerido:

- Início;
- Minhas gestantes;
- Importar PEC;
- Alertas;
- Atendimentos;
- Perfil.

Cadastro clínico, exames, vacinas e classificação de risco ficam dentro da ficha de cada gestante.

### Fase C — Homologação

Antes de qualquer dado real:

- executar Security Advisor sem achados críticos relevantes;
- executar testes com dois profissionais da mesma UBS e garantir isolamento;
- testar acesso cruzado por ID;
- testar APIs diretamente, sem interface;
- revisar logs;
- revisar variáveis e segredos;
- validar política de retenção e exclusão;
- registrar versão homologada.

## Critério de segurança mínimo

O sistema não deve receber dados reais enquanto for possível que:

- um profissional altere o ID na URL/API e acesse outra gestante;
- um profissional veja todas as gestantes da UBS sem vínculo explícito;
- uma rota clínica dependa apenas de checagem no frontend;
- credenciais privilegiadas sejam usadas como caminho normal da aplicação;
- logs exponham dados pessoais ou clínicos.
