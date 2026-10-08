# Checklist de Segurança Pré-Produção

Este checklist separa o que já foi validado em **GitHub Actions / Supabase efêmero** do que ainda precisa ser confirmado no ambiente real.

## Código e CI — concluído

- [x] ESLint sem erros.
- [x] TypeScript sem erros.
- [x] Next.js build concluído.
- [x] `npm ci` reproduzível.
- [x] Supabase efêmero inicia a partir das migrations.
- [x] `supabase db lint --local --level error` passa no CI.
- [x] pgTAP passa integralmente.
- [x] Nenhum teste foi desabilitado apenas para tornar o CI verde.
- [x] Node 22 usado no CI.
- [x] Audit de dependências de produção sem HIGH/CRITICAL.
- [x] `xlsx` ausente da árvore de dependências.
- [ ] Reavaliar `GHSA-vfj7-8cjw-p6xm` quando houver patch upstream para `braces` na cadeia de desenvolvimento.

## Isolamento — concluído em CI

- [x] Profissional A e B testados na mesma UBS.
- [x] A lê A e não lê B.
- [x] B lê B e não lê A.
- [x] A atualiza A e não atualiza B.
- [x] A não exclui B.
- [x] INSERT não permite owner diferente de `auth.uid()`.
- [x] Tabelas clínicas filhas impedem falsificação de `profissional_id`.
- [x] UUID de B em RPC/registro filho não concede acesso a A.
- [x] PDF revalida ownership.
- [x] Lixeira revalida ownership.
- [x] Usuário revogado perde autorização apesar de JWT antigo.
- [x] Perfil pendente, rejeitado, incompleto, inativo ou excluído não possui autorização clínica.
- [x] Superfície legada `visitas_acs_v21` removida de `anon/authenticated`.

## Banco — concluído no ambiente efêmero

- [x] RLS habilitado nas tabelas públicas clínicas.
- [x] Policies clínicas não usam “mesma UBS” como autorização final.
- [x] `WITH CHECK` protege ownership/autoria em INSERT/UPDATE.
- [x] `anon` não possui grants clínicos.
- [x] Tabelas privadas de identidade sem grants para `anon/authenticated`.
- [x] SECURITY DEFINER revisadas e protegidas por testes de allowlist.
- [x] SECURITY DEFINER relevantes têm `search_path` fixo.
- [x] EXECUTE revogado de PUBLIC onde aplicável.
- [x] Default privileges evitam exposição acidental de novas tabelas/funções.
- [x] Analytics publicado não é acessível a `anon/authenticated/service_role`; leitura fica no `metabase_reader`.
- [ ] Executar Security Advisor no `dashboard-v2` após aplicar as migrations.

## Auth — código concluído / ambiente real pendente

- [x] Cadastro não aceita papel administrativo fornecido pelo cliente.
- [x] Cadastro por senha não auto-confirma o e-mail.
- [x] Respostas de cadastro/recuperação evitam enumeração de conta.
- [x] Perfil precisa estar aprovado, completo e ativo.
- [x] Desativação com JWT antigo coberta por regressão.
- [x] Chave privilegiada não aparece no bundle do navegador e CI bloqueia uso fora da rota autorizada.
- [x] Callback OAuth restringe destinos.
- [ ] Habilitar/verificar proteção contra senhas vazadas no Supabase remoto.
- [ ] Confirmar que confirmação de e-mail está habilitada no `dashboard-v2`.
- [ ] Confirmar SMTP/template e entrega do e-mail de confirmação.
- [ ] Confirmar Redirect URLs do domínio oficial.
- [ ] Testar Google OAuth no domínio oficial.
- [ ] Confirmar/rotacionar qualquer credencial que possa ter sido usada pelo bootstrap legado removido.

## APIs — concluído em código/CI

- [x] Origin/Sec-Fetch-Site validados nas mutações sensíveis.
- [x] Content-Type validado.
- [x] Tamanho declarado e tamanho real de request limitados.
- [x] UUIDs validados antes de uso sensível.
- [x] Payloads clínicos passam por allowlist.
- [x] RPCs repetem validações críticas para impedir bypass do Route Handler.
- [x] Campos inesperados/mass assignment são rejeitados.
- [x] Mensagens cruas do PostgreSQL não chegam ao cliente.
- [x] Logger sanitizado usado em `src`; CI impede `console.log/warn/error` direto.
- [x] Rate limiting persistente ativo nos fluxos sensíveis definidos.
- [x] PDF revalida autorização no servidor.
- [x] Nome do arquivo PDF é sanitizado antes do `Content-Disposition`.
- [x] Hard delete tem autorização e confirmação próprias.

## PEC — concluído em código/CI

- [x] Versão atual aceita somente CSV.
- [x] XLS/XLSX não seguem parser SheetJS.
- [x] `xlsx@0.18.5` removido das dependências.
- [x] Limite de upload confirmado.
- [x] Limite de linhas confirmado.
- [x] Limite de colunas confirmado.
- [x] Limite de tamanho de célula confirmado.
- [x] CSV com aspas não fechadas é rejeitado.
- [x] Path traversal no nome é rejeitado.
- [x] Arquivo bruto não é logado.
- [x] Lote pertence ao profissional.
- [x] Importação não toma ownership de gestante de outro profissional.
- [x] Profissional revogado não conserva acesso ao próprio lote.

## Headers e navegador — implementação concluída / deploy pendente

- [x] CSP configurada no código.
- [x] `frame-ancestors 'none'` configurado.
- [x] `X-Frame-Options: DENY` configurado.
- [x] `X-Content-Type-Options: nosniff` configurado.
- [x] Referrer-Policy configurado.
- [x] Permissions-Policy configurado.
- [x] HSTS condicionado a produção.
- [x] `unsafe-eval` ausente em produção.
- [ ] Confirmar os headers efetivamente entregues pela Vercel.
- [ ] Confirmar Supabase Auth/OAuth com a CSP real.
- [ ] Reavaliar redução de `unsafe-inline` quando o stack permitir nonce/CSP mais estrita.

## Logs e observabilidade — código concluído / ambiente real pendente

- [x] Guardrail impede logs diretos em `src`.
- [x] Logger não imprime payload/exception completa.
- [x] Nenhum segredo privilegiado usa prefixo `NEXT_PUBLIC_`.
- [ ] Revisar logs reais da Vercel após homologação.
- [ ] Revisar logs reais do Supabase após homologação.
- [ ] Confirmar ausência de nome, CPF/CNS, telefone, endereço, exames e CSV nos logs reais.

## Publicação controlada — pendente

- [x] Branch de hardening revisada.
- [x] Auditoria independente e fechamento residual concluídos em CI.
- [ ] Fazer backup do `dashboard-v2`.
- [ ] Planejar rollback.
- [ ] Comparar migrations com `dashboard-v2`.
- [ ] Executar dry-run/revisão equivalente antes do push.
- [ ] Aplicar migrations somente após revisão humana.
- [ ] Não executar `db reset --linked`.
- [ ] Não enviar seed sintético para produção.
- [ ] Publicar/deployar em janela controlada.
- [ ] Executar smoke test com contas sintéticas A × B na mesma UBS.
- [ ] Confirmar headers, OAuth, confirmação de e-mail e rate limit na Vercel/Supabase reais.
- [ ] Rodar Security Advisor pós-migration.

## Critério final

**Código/CI:** aprovado para homologação.

**Produção:** dados reais só podem entrar após concluir os itens de ambiente real acima e confirmar que não existe caminho em que um profissional obtenha dados de outro profissional apenas por estar na mesma UBS ou por conhecer um UUID.
