# MAE APS — avaliação preliminar de privacidade e referência PEC
Data da revisão: 13/10/2026. Escopo: software Profissionais, não o painel de Gestão.

## Conclusão
**NÃO ATESTADO como "100% LGPD".** Testes técnicos não são certificação legal.
O software manipula informações relativas à saúde/gestação: dados pessoais sensíveis
(art. 5º, II, e art. 11 da Lei nº 13.709/2018).

## Evidências técnicas já disponíveis
- Autenticação Supabase, validação de perfil, aprovação e credenciais de profissional.
- Escopo por gestante atribuída à profissional, UBS e RLS. Testes pgTAP em CI.
- Testes de permissões entre profissionais diferentes na mesma UBS, e de revogação de perfil.
- Importação PEC com verificação de cabeçalhos, detecção de colunas novas e duplicadas,
  contenção de identificadores indevidos em campos clínicos adicionais.
- Lotes PEC com hash, reimportação idempotente e proteção de dados editados manualmente.
- Política de liberação com CI, auditoria de dependências e scans de padrões de código perigosos.
- Exceções usadas exclusivamente no V2 fictício de homologação foram restauradas antes da
  publicação, e a conta fictícia foi bloqueada.

Esses controles **diminuem o risco**, sem comprovar isoladamente que todos os artigos
da LGPD e normas de saúde estão cumpridos.

## Itens obrigatórios para avaliar/documentar antes de atendimento real

| Domínio | Evidência/documento que precisa ser produzido ou validado | Responsável |
| --- | --- | --- |
| Papéis e responsabilidade | Definir controlador, operadores, encarregado/canal e instrumento com as UBS, Município e UFCG | Controlador/instituições |
| Base legal | Documentar hipótese dos arts. 7º e 11 para cada finalidade; não assumir consentimento como única base | Jurídico/DPO |
| Transparência | Aviso de privacidade verdadeiro e acessível, incluindo finalidade, categorias, compartilhamento, contatos e direitos | Controlador |
| Registro de operações | Inventário de dados, fluxo PEC → MAE APS → serviços em nuvem, perfis com acesso e integrações | Equipe e DPO |
| RIPD | Avaliar formalmente necessidade/risco de RIPD e produzi-lo quando cabível ou solicitado; recomendado pela ANPD para alto risco | Controlador |
| Ciclo de vida | Política de retenção, eliminação, backups, restauração e direitos dos titulares com restrições legais de prontuário | Controlador |
| Fornecedores e transferências | Contratos, papéis de Supabase/Vercel, regiões e possíveis transferências internacionais com base legal/salvaguardas | Controlador |
| Segurança operacional | Gestão de secrets, MFA de contas administrativas, revisão periódica de acesso, logs, rotina de patch e pentest | Técnico e DPO |
| Incidentes | Plano de resposta, contatos, matriz de impacto e fluxo de comunicação à ANPD/titulares | Controlador |
| Validação | Testes autenticados com profissionais reais, separação de UBS, incidentes de download/PDF e exclusão/retificação | Técnico e UBS |

## Texto da tela de login
- **Modelo de importação:** PEC/e-SUS APS, relatório *Acompanhamento de condições de saúde — Gestação e puerpério*.
- **Layout original validado:** 60 colunas; títulos na linha 26.
- **Versão exata do PEC:** NÃO IDENTIFICADA no arquivo de referência `Planilha ANONIMIZADA (2).xlsx`.
- A divulgação de outra versão do PEC pelo Ministério da Saúde **não prova** qual
  versão gerou esta planilha. Substituir a indicação somente quando a UBS
  fornecer versão por evidência (sobre/tela de sistema, exportação com metadado, manual do PEC).
- **Referência legal:** Lei nº 13.709, de 14 de agosto de 2018 (LGPD).
- **Não usar** os termos "certificado LGPD", "100% em conformidade", "homologado pela ANPD"
  ou equivalentes sem evidência institucional/jurídica pertinente.

## Fontes primárias
- Lei Geral de Proteção de Dados Pessoais:
  https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- ANPD — Guia de segurança para agentes de tratamento:
  https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte
- ANPD — RIPD:
  https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/relatorio-de-impacto-a-protecao-de-dados-pessoais-ripd

**Atenção:** esta revisão é preliminar, não um parecer de conformidade.
