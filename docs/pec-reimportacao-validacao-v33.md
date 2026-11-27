# Conciliação PEC por diário — critérios de homologação

O SQL em `docs/sql/pec-reimportacao-diario-v33-candidata.sql` é candidato de migração, não aplicado em produção. A aplicação mantém as regras de acesso e os espaços individuais. Não publicar antes dos testes abaixo.

- Importar 10 fichas fictícias e reimportar o mesmo arquivo: 10 fichas, zero duplicações; a importação atualiza as fichas existentes e mantém o histórico.
- Reimportar CSV atualizado com CPF/CNS estável, nome ou data corrigida, consultas novas: mesma ficha, dados PEC disponíveis atualizados e aviso no cartão.
- Alterar apenas um identificador ou apresentar CPF e CNS divergentes: não mesclar duas pessoas; informar revisão de identidade.
- Reimportar dados vazios: preservar informações anteriores, campos manuais e histórico, incluindo agenda, observações, classificação de risco e alta.
- Criar ficha manual com CPF/CNS de ficha já existente: detectar duplicidade; não criar segunda.
- Tentar importar ficha na lixeira: exigir restauração, sem ressuscitar automaticamente.
- Importar simultaneamente dois CSVs diferentes na mesma conta: serializar por diário e conferir que nenhuma duplicação ocorre.
- Importar mesmo CSV com duas contas fictícias distintas, inclusive com a mesma UBS real: cada uma mantém 10 fichas privadas, sem acesso à outra; hashes das identidades novas devem diferir por profissional.
- Importar arquivo A, depois B com dados atualizados e reenviar A: o último envio confirmado atualiza os campos PEC disponíveis da própria ficha, sem reaproveitar o cache histórico de A. Preservar campos manuais e não alterar fichas de outro usuário.
- Verificar que trocar dados do usuário 2 e reimportar não altera nenhuma ficha, data de atualização ou aviso do usuário 1.
- Revisar custo da busca criptografada para arquivos grandes; executar regressão TypeScript, testes de RLS, testes SQL e navegação autenticada antes de promover.
- Conferir cartões de gestantes reimportadas: data da última importação e lembrete de revisão dos dados complementares. O aviso é informativo persistente, não confirmação de revisão.
