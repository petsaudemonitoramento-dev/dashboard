# Baseline de Acessibilidade

## Escopo atual

Primeira revisão focada nos fluxos de maior uso:

- login;
- cadastro;
- navegação principal;
- lista de gestantes;
- importação PEC;
- feedback de erro/sucesso.

## Melhorias já incorporadas

- foco visível global para teclado;
- `aria-current="page"` no item ativo da navegação;
- mensagens de login anunciadas como `status`/`alert`;
- erros de cadastro anunciados por tecnologia assistiva;
- busca de gestantes com nome acessível explícito;
- quantidade de resultados em região `aria-live`;
- erros da modal de lixeira anunciados;
- erros do PEC anunciados;
- tabela de preview PEC com caption.

## Gate automatizado em cloud CI

O workflow profissionais-accessibility-ci.yml executa Playwright 1.60 + axe-core 4.13 em Chromium headless, com uma única worker e Supabase efêmero. O gate cobre:

- /login;
- /cadastro, com UBS sintética da seed de CI;
- /recuperar-senha;
- /redefinir-senha;
- violações axe com impacto serious ou critical;
- presença de landmark principal e título de nível 1;
- nomes acessíveis dos controles essenciais;
- progressão básica do foco por teclado.

As ferramentas de teste são instaladas no runner com versões exatas e sem alterar o lockfile da aplicação. Somente a URL e a chave publicável do Supabase efêmero são exportadas ao servidor Next.js; chaves privilegiadas não são fornecidas ao navegador.
## Homologação manual obrigatória

Testar:

1. toda a aplicação apenas com teclado;
2. ordem de foco previsível;
3. foco não preso/perdido em modais;
4. zoom do navegador em 200%;
5. viewport móvel estreito;
6. VoiceOver no iOS/macOS ou NVDA no Windows;
7. labels de campos;
8. botões de ícone;
9. contraste;
10. mensagens de erro que não dependam apenas de cor.

## Pendências de maturidade

- auditoria WCAG sistemática;
- gestão de foco completa nas modais;
- validação de contraste com ferramenta especializada;
- revisão de tabelas extensas e leitura por screen reader.

Acessibilidade é gate de qualidade, mas não deve ser tratada como substituto dos controles de segurança do backend.
