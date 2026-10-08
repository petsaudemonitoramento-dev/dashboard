# Dívida técnica V2

## Objetivo

Remover progressivamente compatibilidades históricas sem alterar o comportamento já homologado.

## Superfícies desativadas

No produto Profissionais, permanecem como stubs/redirecionamentos:

- `/dashboard/mapa`;
- `/dashboard/indicadores`;
- `/dashboard/territorio`;
- `/dashboard/visitas`;
- `/dashboard/configuracoes`;
- `/api/acs/visitas`.

O CI executa `scripts/check-legacy-surface.mjs` para impedir reativação silenciosa.

Também é proibida referência runtime a:

- `visitas_acs_v21`;
- `acompanhamentos_visitas_equipe_v29_1`.

## Elementos que não devem ser removidos antes da homologação

Compatibilidades V18/V20/V21 que ainda são chamadas pelas wrappers V30 não devem ser apagadas apenas por serem antigas.

A regra é:

1. identificar dependências;
2. criar substituição V30;
3. testar em banco limpo;
4. testar A × B;
5. remover legado em migration própria.

## Pós-homologação

Criar uma fase de consolidação que:

- elimine funções não referenciadas;
- elimine policies antigas já substituídas;
- remova tabelas V2 sem uso;
- reduza scripts `aplicar-migracao-v*.mjs`;
- consolide documentação de funções públicas suportadas;
- mantenha migrations históricas imutáveis.

Não reescrever migrations já aplicadas em produção. Limpeza deve ocorrer por novas migrations aditivas.
