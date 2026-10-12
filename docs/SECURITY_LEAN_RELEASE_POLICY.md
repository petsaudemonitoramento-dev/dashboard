# MAE APS – Profissionais | Segurança proporcional e de baixo custo

**Escopo:** evolução incremental a partir da \`main\`, sem criar outro projeto Vercel ou Supabase e sem promover a CSP experimental da Fase 9.

## Decisão de arquitetura

A Fase 9 concluiu sua auditoria com **NO-GO para promover o pacote completo da CSP baseada em nonce**. O CI efêmero validou a prova de conceito, mas não houve homologação completa na infraestrutura Vercel com banco isolado. Isso não significa que a CSP atual esteja aprovada para todos os cenários.

Esta integração reaproveita **somente correções independentes**, com baixo risco de regressão:

- Correção de validação de origem de POSTs sob proxy/reverse proxy, com comparação por \`Host\` e protocolo, **sem confiar em \`X-Forwarded-Host\`**. A verificação de \`Sec-Fetch-Site\` e as demais proteções foram mantidas.
- \`script-src-attr 'none'\`: bloqueia handlers HTML inline em navegadores que suportam CSP3, sem forçar páginas públicas para renderização dinâmica. **Não remove** \`script-src 'unsafe-inline'\`, mantido pela arquitetura atual.
- Ajustes previamente testados de contraste textual na interface clínica.
- Testes direcionados de origem e scanner simples para impedir a reintrodução de padrões JS de alto risco.

**Não transportar:** código \`phase9-csp.ts\`, dinâmica nonce, branches experimentais, regras de TLS sem vínculo com testes efêmeros, scripts extensivos de benchmark e staging, nem o bloqueio de CSS \`unsafe-inline\`.

## Proteções essenciais mantidas

- Supabase Auth, RBAC e RLS, incluindo isolamento por profissional, UBS e permissão.
- Segredos apenas no servidor; não divulgar \`service_role\`, URL do banco nem chaves de administração a componentes do navegador.
- \`npm audit --omit=dev --audit-level=high\`, TypeScript, ESLint, build, pgTAP e DB lint já existentes no Security CI.
- Proteções de CSRF, tamanho de carga, rate limit, controle de acesso a PDFs, importação PEC e trilhas de auditoria.
- HTTPS, HSTS em Production, no-sniff, frame protection e CSP vigente.
- CI de acessibilidade e rotinas de monitoramento/recuperação já configurados no repositório.

## Release de custo baixo

1. Abrir PR **draft** para \`main\`. Não implantar automaticamente antes da conclusão dos checks.
2. Exigir Security CI verde (incluindo banco descartável, testes de origem e scanner JS) e Accessibility CI, quando disponível.
3. Revisar o diff; não aceitar falhas novas de RLS, autenticação, CSRF ou isolamento.
4. Fazer verificação manual curta, **com contas e registros sintéticos existentes** e **sem alterar dados reais**, das telas de login, dashboard, gestantes, PDFs e importação PEC. Se essa verificação exigir escrita e não houver ambiente seguro para fazê-la, limitar-se a consultas não destrutivas e registrar o fluxo como não validado.
5. Identificar o SHA anterior para rollback, decidir janela de manutenção e exigir aprovação humana explícita antes de merge/promoção.
6. Após publicação autorizada, conferir headers HTTP efetivos, acesso restrito a PDFs e ausência de regressões de login.

## Limitações declaradas

- Sem staging isolado, não há comprovação completa de implantação, CDN, cold start, OAuth real ou fluxos de escrita clínica.
- Testes automáticos não certificam conformidade integral à LGPD; dados de saúde exigem minimização, política de retenção, controle de acesso, incident response e gestão de acesso organizacional.
- **Nunca executar testes destrutivos com dados reais.**
- Novos testes automatizados devem usar o Supabase efêmero que o próprio GitHub Actions já inicializa; não é necessário banco hospedado novo.
- A implantação futura da CSP completa é uma decisão independente e continua bloqueada até evidência apropriada.

**Regra operacional:** segurança essencial é requisito permanente; staging duplicado e CSP extremamente restritiva são opcionais nesta etapa, mas o risco residual deve ser visível para quem autoriza o piloto.
