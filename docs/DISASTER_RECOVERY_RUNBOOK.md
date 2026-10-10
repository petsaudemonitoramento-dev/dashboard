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
## Exercício automatizado em cloud CI

O workflow profissionais-disaster-recovery.yml executa o procedimento apenas em runner descartável do GitHub Actions e nunca recebe credenciais do projeto hospedado.

Fluxo automatizado:

1. cria o primeiro Supabase efêmero, aplica migrations e seed sintética;
2. adiciona um marcador sintético de recuperação;
3. gera dump lógico de schema e de dados dos schemas da aplicação;
4. registra manifesto de contagens por tabela;
5. destrói integralmente o primeiro ambiente com supabase stop --no-backup;
6. cria um segundo Supabase efêmero a partir das migrations;
7. limpa somente os schemas da aplicação no ambiente descartável;
8. restaura o dump lógico com triggers suspensos apenas na sessão de restore;
9. compara schema e manifesto, e valida o marcador sintético;
10. executa supabase db lint --local --level error e toda a suíte pgTAP;
11. registra o RTO técnico observado no resumo do workflow e em artefato textual;
12. remove o dump bruto antes do encerramento.

O RTO medido começa imediatamente antes da destruição do primeiro ambiente e termina depois das validações de segurança pós-restore. Ele mede o procedimento técnico no runner, não a indisponibilidade de produção.

Somente o resumo sem dados é publicado. Dumps, URLs de banco e credenciais efêmeras não são artefatos.

O job é serializado e mantém os dois ambientes no mesmo runner para reutilizar localmente as imagens já baixadas. O primeiro run, 37925249488, demonstrou que o Supabase CLI recuperou respostas transitórias de rate limit do registry com retries internos; não se adicionou cache volumoso de imagens nem loop externo de novas tentativas. A falha terminal desse run foi local ao script: o manifesto foi enviado a stdout em vez de ser persistido. O script agora grava os dois manifestos antes de compará-los e imprime somente o resumo sintético ao final.

### Limitações do exercício automatizado

O exercício prova migrations + restore lógico de dados da aplicação. Ele não substitui:

- teste humano de restauração de backup gerenciado/PITR do plano contratado;
- validação de Auth e configurações externas do projeto hospedado;
- backup de objetos do Storage;
- comunicação e tomada de decisão durante incidente real;
- medição de RPO/RTO com volume de produção.

Qualquer exercício no dashboard-v2 exige janela, aprovação humana, backup confirmado e ambiente não produtivo apropriado. Este workflow jamais deve ser adaptado para alvo linked.
