# Checklist de Segurança Pré-Produção

Use este checklist antes de qualquer dado real.

## Código e CI

- [ ] ESLint sem erros.
- [ ] TypeScript sem erros.
- [ ] Next.js build concluído.
- [ ] `npm ci` reproduzível.
- [ ] Supabase local inicia a partir de banco vazio.
- [ ] `supabase db lint --local --level error` passa.
- [ ] pgTAP passa integralmente.
- [ ] Nenhum teste está desabilitado apenas para tornar o CI verde.
- [ ] Node do CI está em versão compatível com as dependências atuais.

## Isolamento

- [ ] Profissional A e B testados na mesma UBS.
- [ ] A lê A e não lê B.
- [ ] B lê B e não lê A.
- [ ] A atualiza A e não atualiza B.
- [ ] A não exclui B.
- [ ] INSERT não permite owner diferente de `auth.uid()`.
- [ ] Troca manual de UUID na URL não concede acesso.
- [ ] Troca manual de UUID no JSON não concede acesso.
- [ ] Usuário revogado deixa de acessar imediatamente segundo a arquitetura definida.

## Banco

- [ ] RLS habilitado em todas as tabelas públicas clínicas.
- [ ] Policies não usam “mesma UBS” como autorização final.
- [ ] `WITH CHECK` protege owner em INSERT/UPDATE.
- [ ] `anon` não possui grants clínicos.
- [ ] Tabelas privadas de identidade sem grants para `anon/authenticated`.
- [ ] SECURITY DEFINER revisadas uma a uma.
- [ ] SECURITY DEFINER têm `search_path` fixo.
- [ ] EXECUTE revogado de PUBLIC onde aplicável.
- [ ] Views expostas revisadas quanto a SECURITY INVOKER/RLS.
- [ ] Security Advisor remoto sem achado crítico não explicado.

## Auth

- [ ] Proteção contra senhas vazadas habilitada no Supabase remoto.
- [ ] Cadastro não permite solicitar papel administrativo pelo cliente.
- [ ] Perfil precisa estar aprovado e ativo.
- [ ] Desativação de usuário foi testada com sessão existente.
- [ ] Chave privilegiada não aparece no bundle do navegador.
- [ ] Nenhum segredo foi commitado.
- [ ] URLs de callback/OAuth revisadas para domínio oficial.

## APIs

- [ ] Origin/Sec-Fetch-Site validados nas mutações sensíveis.
- [ ] Content-Type validado.
- [ ] Tamanho de request limitado.
- [ ] UUIDs validados antes do cast SQL.
- [ ] Payloads passam por allowlist.
- [ ] Campos inesperados são descartados.
- [ ] Mensagens cruas do PostgreSQL não chegam ao cliente.
- [ ] Logs não imprimem payload clínico.
- [ ] Rate limiting persistente ativo nas rotas pesadas.
- [ ] PDF revalida autorização no servidor.
- [ ] Hard delete tem autorização e auditoria próprias.

## PEC

- [ ] Produção aceita somente CSV na versão atual.
- [ ] XLS/XLSX rejeitados.
- [ ] `xlsx@0.18.5` removido das dependências.
- [ ] Limite de upload confirmado.
- [ ] Limite de linhas confirmado.
- [ ] Limite de colunas confirmado.
- [ ] Limite de tamanho de célula confirmado.
- [ ] CSV malformado testado.
- [ ] Arquivo bruto não é logado.
- [ ] Lote pertence ao profissional.
- [ ] Importação não toma ownership de gestante de outro profissional.

## Headers e navegador

- [ ] CSP testada no deploy real.
- [ ] Supabase Auth continua funcionando com CSP.
- [ ] Metabase não é necessário no produto dos Profissionais ou `frame-src` está restrito corretamente.
- [ ] `frame-ancestors 'none'` confirmado.
- [ ] `nosniff` confirmado.
- [ ] Referrer-Policy confirmado.
- [ ] Permissions-Policy confirmado.
- [ ] HSTS presente somente em HTTPS de produção.

## Logs e observabilidade

- [ ] Logs da Vercel revisados.
- [ ] Logs do Supabase revisados.
- [ ] Sem nome de gestante em erro.
- [ ] Sem CPF/CNS.
- [ ] Sem telefone/endereço.
- [ ] Sem resultado de exame.
- [ ] Sem planilha PEC.
- [ ] Eventos de segurança usam IDs técnicos/códigos mínimos.

## Publicação controlada

- [ ] Branch de hardening revisada.
- [ ] Auditoria independente concluída.
- [ ] Migrations comparadas com `dashboard-v2`.
- [ ] `supabase db push --dry-run` executado.
- [ ] Dry-run revisado manualmente.
- [ ] Backup/rollback planejado.
- [ ] Nenhum `db reset --linked`.
- [ ] Nenhum seed sintético enviado à produção.
- [ ] Publicação realizada em janela controlada.
- [ ] Smoke test pós-publicação concluído.

## Critério final

Dados reais só podem entrar quando não existir caminho conhecido em que um profissional obtenha dados de outro profissional apenas por estar na mesma UBS ou por conhecer um UUID.
