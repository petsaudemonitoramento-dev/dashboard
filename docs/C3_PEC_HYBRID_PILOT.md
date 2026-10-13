# MAE APS – Profissionais | Fluxo híbrido PEC + C3 (piloto sintético)

**Base técnica:** Nota Metodológica C3, Ministério da Saúde, versão disponibilizada em outubro de 2026.
Fonte: https://www.gov.br/saude/pt-br/composicao/saps/publicacoes/fichas-tecnicas/equipe-de-atencao-primaria-e-saude-da-familia/nota-metodologica-c3-cuidado-na-gestacao-e-puerperio/view

## Objetivo funcional

Importar os campos fornecidos pelo PEC sem exigir redigitação, sinalizar divergências e oferecer na mesma ficha clínica todos os 11 componentes A–K para acompanhamento. O C3 avalia o episódio gestacional e puerperal, não apenas a pessoa nem uma linha de CSV.

**Cobertura de campos ≠ pontuação oficial do SIAPS.** A nota condiciona critérios a datas, trimestre, CBO, tipo de atendimento, evento e vínculo da equipe. Um número agregado, como "7 consultas", é pista útil, mas não valida automaticamente esses requisitos. Nunca inventar data, consulta, profissional, vacina ou exame.

## C3: checklist oficial

| Boa prática | Pontos possíveis | Campos clínicos úteis | Necessidades de confirmação |
|---|---:|---|---|
| A - 1ª consulta até 12 semanas | 10 | data de início, consultas precoces, DUM/IG | data, IG, médica/enfermeira e vínculo |
| B - 7 consultas | 9 | total de consultas, eventos por data | 7 encontros elegíveis com profissional e período |
| C - 7 aferições PA | 9 | contagem, registros de PA | 7 eventos da gestação |
| D - 7 medições simultâneas peso+altura | 9 | contagem, datas | peso e altura no mesmo dia, 7 eventos |
| E - 3 visitas ACS/TACS pré-natais | 9 | contagem de visitas | pós-primeira consulta, motivo e CBO |
| F - dTpa após 20ª semana | 9 | vacinação, data | data aplicação e IG elegível |
| G - HIV/sífilis/hepatites B e C, 1º tri | 9 | exames por trimestre, data | todos os 4 com datas/critério de procedimento |
| H - HIV/sífilis, 3º tri | 9 | exames por trimestre, data | ambos com data e critérios |
| I - consulta puerperal | 9 | consulta/atendimento puerperal | data após parto e profissional habilitado |
| J - visita puerperal ACS/TACS | 9 | visitas puerperais | data no puerpério e profissional |
| K - atividade em saúde bucal | 9 | registros odontológicos | atividade elegível, profissional e gestação |

**Atenção:** nota também prevê particularidades para eAP tipo 76 nas práticas E e J; não simular visitas artificiais nem exibir pontuação oficial sem comprovar o tipo da equipe. Considerar desfecho da gestação e limite de 42 dias puerperais conforme nota.

## Política de ingestão

1. Analisar CSV **antes** de importar; nunca presumir que XLSX seja compatível.
2. Detectar delimitador e localização do cabeçalho. Normalizar acentos e pontuação.
3. Usar correspondência exata de aliases verificadas para preenchimento automático.
4. Coluna desconhecida: mostrar nome, sugerir equivalência, **não aplicar sugestão sem confirmação**.
5. Coluna duplicada/contraditória, chave obrigatória ausente, contagem impossível ou data inválida: bloquear até corrigir.
6. Colunas novas não conflitantes: permitir importação das conhecidas após conferência explícita; registrar aviso da estrutura nova.
7. Preserve informações manualmente conferidas ao reimportar: o dado do PEC não deve sobrescrever correção clínica sem revisão. Auditar esse comportamento no RPC de importação antes de uso real.
8. Não expor PII em mensagens de erro, preview, logs nem artefatos de CI.
9. Não atribuir status "cumprido" a critério de C3 com base apenas em um total agregado.

## Experimentos com pacientes fictícias

- Arquivo com cabeçalho deslocado para linha 26.
- CSV com variação segura de acentos/pontuação.
- Paciente sintética com dados completos no papel, mas evidência insuficiente de CBO/data.
- Paciente sintética com dados parciais a completar manualmente.
- Novos campos desconhecidos que não devem virar informação clínica inventada.
- Duplicidade semântica de colunas, datas impossíveis e contagens negativas.
- Sem dados identificáveis nas prévias ou relatórios de CI.
- Posteriormente: testes autenticados A×B, idempotência de reimportação, conflito manual/PEC e teste de edição e gravação end-to-end no Supabase efêmero. **Ainda não validados por esta suíte unitária.**

## Experiência da profissional

- Enviar CSV e clicar em "Analisar estrutura".
- Ver resumo claro de dados reconhecidos, novas colunas e erros.
- Se o formato estiver íntegro, importar sem confirmação adicional.
- Se houver colunas novas, conferir os nomes e confirmar uma única vez.
- Abrir ficha única e expandir "Indicador C3 · 11 boas práticas" somente quando precisar.
- Usar "Completar na ficha" que direciona à aba clínica existente, sem abrir um cadastro duplicado.
- Não obrigar a marcar "cumprido" quando faltar evidência.

## Critérios que ainda faltam para a cobertura completa do C3

- Persistência por gestação de eventos C3 detalhados (data, tipo, CBO e origem), com histórico de importação versus intervenção manual.
- Atribuição de status **comprovado, pendente, não aplicável** por prática, usando validação estrita e equipe eAP/eSF.
- Deduplicação por identidade legítima + episódio gestacional, reimportação sem apagar dados manuais.
- Mapeamento assistido confirmável para novos campos de PEC e exportação da revisão.
- Fluxos E2E autenticados e de escrita somente com fixtures sintéticas.
- Conciliação com a metodologia SIAPS e revisão por profissional responsável antes de qualquer alegação de equivalência oficial.

O painel e os testes adicionados nesta branch **não** cumprem sozinhos essas pendências. Esta é uma primeira iteração segura; não está autorizada para dados reais.
