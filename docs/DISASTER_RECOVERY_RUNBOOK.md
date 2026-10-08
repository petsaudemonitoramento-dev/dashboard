# Disaster Recovery — Software dos Profissionais

## Princípio

Migration em banco clínico só é aceitável quando existe caminho de recuperação conhecido e testável.

## Backup do Supabase

Supabase oferece backups de banco conforme o plano. Projetos em planos com backup gerenciado podem restaurar snapshots disponíveis no Dashboard; Point-in-Time Recovery oferece granularidade maior quando habilitado.

Se o projeto não possuir backup gerenciado adequado, gerar backup lógico com Supabase CLI antes da janela e armazená-lo fora do projeto.

Nunca registrar senha do banco, access token ou URL com credencial no Git.

## Antes de migration

Registrar:

- project ref;
- SHA da aplicação;
- última migration remota;
- horário de início;
- responsável;
- mecanismo de backup disponível;
- ponto de restauração escolhido;
- janela de indisponibilidade aceitável.

Também exportar/registrar:

- migration history;
- lista de extensions;
- grants críticos;
- advisors;
- contagem de registros por tabelas críticas, sem exportar PII para logs.

## Estratégia de rollback

Preferência:

1. migration corretiva aditiva/reversível quando o banco continua íntegro;
2. rollback SQL previamente revisado quando a mudança permite;
3. restauração do backup quando houver corrupção/incompatibilidade grave.

Não executar rollback improvisado em produção.

## Quando interromper uma publicação

Interromper imediatamente se ocorrer:

- falha de migration no meio da sequência;
- RLS removida inesperadamente;
- grant clínico para `anon`;
- BOLA A × B;
- função SECURITY DEFINER exposta;
- Auth incapaz de bloquear usuário revogado;
- perda/corrupção de dados;
- erro 5xx generalizado após migration.

## Restore

Uma restauração pode provocar indisponibilidade. Planejar janela e comunicar antes de iniciar.

Após restore:

- validar migration history;
- validar Auth;
- validar RLS;
- executar A × B;
- executar Security Advisor;
- validar Vercel;
- revisar logs.

Backups de banco não devem ser presumidos como backup de objetos de Storage. Se o produto passar a utilizar Storage, criar política específica de backup dos objetos.

## Objetivos recomendados

Para homologação/piloto:

- RPO máximo recomendado: 24 h;
- RTO alvo: até 4 h.

Para operação clínica ampliada, avaliar PITR e reduzir o RPO de acordo com o risco operacional e o plano contratado.

## Exercício de recuperação

Antes de considerar a operação madura, executar pelo menos um restore em ambiente não produtivo e registrar:

- tempo total;
- passos necessários;
- falhas encontradas;
- validações pós-restore;
- RTO/RPO realmente obtidos.
