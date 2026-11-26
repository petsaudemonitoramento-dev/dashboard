# Conciliação do histórico de migrações — Gestário APS

2026-11-26. A fonte dos identificadores é o histórico do projeto Supabase dashboard-v2, já em produção. Não executar reparo destrutivo do histórico remoto.

| Arquivo anterior | Versão registrada no Supabase |
|---|---|
| 20261013143000 PEC V31 | 20261013202510 |
| 20261013180000 rotina V1 | 20261013202516 |
| 20261013224500 regra clínica estrita | 20261014015455 |

As três migrações acima têm SQL idêntico ao remoto; somente nome e ordenação foram alinhados. A migração 20261014230504 recupera as duas views analíticas exatamente como registradas, excluindo dados fictícios. A migração 20261126043751 é idêntica à proposta V32 aplicada em produção, inclusive o gate inicialmente desativado; a ativação em produção foi uma operação separada. Não ativar cadastro autônomo automaticamente em novos ambientes.

A versão histórica 20261013221840 corresponde a uma exceção temporária para smoke test, posteriormente revogada. O arquivo de compatibilidade é intencionalmente neutro: não recria o acesso temporário nem inclui identificadores de contas. O banco remoto conserva seu histórico original. Essa é a única diferença deliberada de conteúdo para os seis registros recuperados.

O CI deve executar a cadeia canônica e os testes de isolamento em banco efêmero; a proposta antiga de UBS opcional é testada somente nesse banco, seguida de restauração da migração V32 canônica. Não é necessário reaplicar migrações já registradas em produção.
