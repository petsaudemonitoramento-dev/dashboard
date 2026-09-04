# Escopo de estabelecimentos do painel de gestão (SIAPS)

Este documento especifica a regra que decide **quais estabelecimentos entram no
painel institucional de gestão** a partir dos relatórios do SIAPS. A regra é do
backend/camada analítica. Ela não pode ser implementada como filtro de tela.

Estado: proposta arquitetural. Nenhuma migração foi executada a partir deste
documento. O DDL aqui é referência para revisão, não schema definitivo.

Origem da decisão: orientação da gestão municipal de excluir policlínicas das
análises do indicador C3.

## 1. Decisão

Só entra no painel de gestão o registro cujo **CNES esteja classificado como UBS
elegível no cadastro territorial da plataforma**.

É uma allowlist, não uma blacklist. Um CNES desconhecido não entra por omissão:
ele fica pendente de classificação e bloqueia a publicação da competência
(seção 6).

## 2. Por que os campos do próprio SIAPS não resolvem

Verificado nas exportações reais de MAR, ABR, MAI e JUN de 2026 (relatório
Qualidade — Visão por Competência, indicador Cuidado na Gestação e Puerpério,
município 250400 / Campina Grande).

### 2.1. `TIPO DO ESTABELECIMENTO` não distingue

Nas 653 linhas das quatro competências, a coluna assume um único valor:

```
'CENTRO DE SAUDE/UNIDADE BASICA'   →   eSF: 637 | eAP: 16
```

O SIAPS classifica as policlínicas com o mesmo tipo das UBS. A coluna é inútil
para esta decisão.

### 2.2. `SIGLA DA EQUIPE` não é regra segura

Nas competências observadas há coincidência perfeita entre `eAP` e policlínica
(zero eAP fora de policlínica, zero eSF em policlínica). A coincidência é
circunstancial.

`eAP` é modalidade oficial da metodologia nacional — o Guia de Bolso cobre
eSF **e** eAP, e a Nota Técnica nº 30/2025-CGESCO/DESCO/SAPS/MS define
parâmetros próprios para eAP 30h e eAP 20h. Excluir por sigla removeria uma
modalidade inteira, o que é decisão diferente da que foi tomada, e faria
desaparecer em silêncio uma eAP legitimamente vinculada a uma UBS.

### 2.3. Nome do estabelecimento não é chave

`nome LIKE '%POLICLINICA%'` quebra com acentuação, abreviação, renomeação e com
policlínica que não tenha a palavra no nome. Serve como alerta auxiliar de
inconsistência de cadastro, nunca como regra oficial.

### 2.4. O CNES é a única chave estável

Observado: 98 CNES distintos, 91 UBS e 7 policlínicas, **sem nenhum CNES com
mais de um nome entre competências**.

Um mesmo CNES pode ter várias equipes. `POLICLINICA DR FRANCISCO PINTO`
(CNES 2362252) aparece com dois INE distintos (`0002256711`, `0002256703`).
A elegibilidade é propriedade do **estabelecimento** e se propaga a todas as
equipes dele.

Se algum dia for necessário excluir equipe individual dentro de um
estabelecimento elegível, isso exige mecanismo próprio. Não sobrecarregar este.

## 3. Modelo de dados

```sql
-- Identidade e vigência do estabelecimento
create table core.estabelecimentos (
  id                    uuid primary key default gen_random_uuid(),
  cnes                  text not null,
  nome                  text not null,          -- nome canônico da plataforma
  tipo_unidade          text not null,          -- 'UBS' | 'POLICLINICA' | ...
  distrito_id           uuid references core.distritos(id),
  vigencia_inicio       date not null,
  vigencia_fim          date,
  fonte_origem          text,                   -- 'seed:painel-indicadores-aps' | 'cadastro municipal'
  sincronizado_em       timestamptz,
  created_at            timestamptz not null default now()
);
create unique index on core.estabelecimentos (cnes) where vigencia_fim is null;

-- Decisão de escopo, versionada e auditável
create table core.estabelecimento_escopo (
  estabelecimento_id    uuid not null references core.estabelecimentos(id),
  escopo_versao_id      uuid not null references core.escopo_versoes(id),
  inclui_painel_gestao  boolean not null,
  motivo                text,                   -- 'POLICLINICA', 'FORA DA APS', ...
  classificado_por      uuid not null,
  classificado_em       timestamptz not null default now(),
  primary key (estabelecimento_id, escopo_versao_id)
);

create table core.escopo_versoes (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,           -- 'v1', 'v2', ...
  descricao     text not null,
  vigente       boolean not null default false,
  criado_em     timestamptz not null default now()
);
```

`tipo_unidade` é descritivo. `inclui_painel_gestao` é a decisão. **Não derivar um
do outro em código** — é justamente o acoplamento que esta regra existe para
evitar. Uma policlínica pode um dia ser incluída sem deixar de ser policlínica.

### 3.1. Convenção de nomes

O schema `core` desta plataforma usa português, consistente com o schema atual
(`ubs`, `perfis`, `microareas`). O projeto `painel-indicadores-aps` usa inglês
(`districts`, `health_units`, `teams`). O ETL de seed traduz; os dois schemas não
precisam convergir, mas a escolha deve ser registrada e mantida.

## 4. Resolução na importação

```
linha do SIAPS (CNES, INE, estabelecimento, equipe, A..K, pontos, denominador)
        │
        ▼
  siaps.*_raw            grava TODAS as linhas, inclusive as excluídas
        │                (append-only, fiel ao arquivo)
        ▼
  resolve CNES em core.estabelecimentos (vigente na competência)
        │
   ┌────┴──────────────┬───────────────────────┐
   ▼                   ▼                       ▼
 elegível          não elegível            não encontrado
   │                   │                       │
 entra em          registrado com          pendência de
 analytics         motivo_exclusao         classificação
```

Nenhuma linha é descartada na ingestão. A exclusão acontece na normalização e
fica registrada por linha:

```
CNES 2362236 · POLICLINICA DA PALMEIRA
elegivel = false · motivo = 'POLICLINICA' · escopo_versao = 'v1'
```

Isso permite responder com precisão à pergunta que a gestão vai fazer:
“por que o SIAPS mostra 156 equipes e o painel considera 148?”

## 5. Aplicação uniforme e reprocessamento

A elegibilidade **não é aplicada por competência**. A versão de escopo vigente
vale para a série inteira.

Motivo: aplicar classificações diferentes em competências diferentes cria uma
quebra de universo invisível dentro da série — exatamente o problema que a
plataforma já evita no versionamento metodológico e na supersessão de
importações.

Portanto:

1. Todo fato em `analytics` carrega `escopo_versao_id`.
2. Alterar qualquer classificação cria **nova versão de escopo**.
3. Nova versão de escopo dispara **recomputo de todas as competências**.
4. A versão anterior não é apagada; permite auditar números já publicados.

## 6. Regra de publicação (fail-closed)

Um CNES desconhecido não pode ser resolvido pelo sistema por conta própria.

| Situação | Importação | Publicação da competência |
|---|---|---|
| Todos os CNES classificados | permitida | permitida |
| CNES não classificado com denominador = 0 | permitida | permitida, com nota |
| CNES não classificado com denominador > 0 | permitida | **bloqueada** |

A importação sempre conclui e o raw sempre é gravado. O que fica bloqueado é
marcar a competência como vigente para o painel enquanto houver estabelecimento
não classificado carregando população elegível — porque nesse estado o
denominador oficial está indefinido.

A classificação é feita uma vez pela gestão e passa a valer para as importações
seguintes.

## 7. Guarda de mudança de impacto

Hoje a exclusão das policlínicas altera o resultado em **exatamente 0,0000** nas
quatro competências, porque todas têm denominador zero. A regra é inofensiva
agora e deixa de ser no dia em que uma gestante for vinculada a uma equipe de
policlínica.

Alerta obrigatório na validação:

```
se estabelecimento.inclui_painel_gestao = false e denominador > 0
→ não excluir em silêncio; sinalizar na validação da importação
  "Policlínica X apareceu com N gestantes em <competência>.
   A exclusão passará a alterar o resultado oficial."
```

Sem esse alerta, o painel pode divergir do SIAPS sem que ninguém perceba.

## 8. Contrato de interface

### 8.1. Pré-importação

Os contadores devem refletir **o arquivo enviado**, nunca números vindos de
outra fonte ou data:

```
Relatório identificado: C3 — Cuidado na Gestação e Puerpério — JUN/2026
Dado preliminar · gerado pelo SIAPS em 04/09/2026 19:20

  156 registros de equipe encontrados no arquivo
✓ 148 equipes elegíveis (UBS)
ⓘ   8 registros excluídos — estabelecimentos classificados como policlínica
⚠   0 estabelecimentos sem classificação territorial

  [ Ver registros excluídos ]
```

### 8.2. Rodapé do painel

> Universo: equipes vinculadas a UBS elegíveis do município. Estabelecimentos
> classificados como policlínica são excluídos por decisão da gestão municipal
> (8 registros em JUN/2026, sem população elegível — não alteram o resultado).

### 8.3. Tela de escopo

Lista auditável dos CNES excluídos, com motivo, quem classificou, quando e sob
qual versão de escopo. A exclusão precisa ser verificável, não folclore.

## 9. Números observados (fixtures de regressão)

Extraídos das exportações reais. Servem como teste de não-regressão do parser e
do motor.

| Competência | Filtro do arquivo | Registros | Elegíveis (UBS) | Excluídos | CNES UBS | Denominador | C3 municipal |
|---|---|---|---|---|---|---|---|
| MAR/26 | eSF | 187 | 187 | 0 | 91 | 2492 | 37,2251 |
| ABR/26 | eSF | 153 | 153 | 0 | 91 | 2423 | 37,5093 |
| MAI/26 | eAP, eSF | 157 | 149 | 8 | 91 | 2467 | 37,4856 |
| JUN/26 | eAP, eSF | 156 | 148 | 8 | 91 | 2443 | 36,8314 |

Observações:

- O C3 municipal é idêntico com e sem as policlínicas nas quatro competências
  (delta 0,0000), porque o denominador delas é zero.
- O número de CNES de UBS é estável (91) inclusive durante a redução de equipes
  ocorrida na competência de abril. Quem gira é equipe, não estabelecimento.
- Não confundir com os números do cadastro municipal informados pela gestão
  (86 prédios sede, 146 equipes, referentes a setembro/2026): “prédio sede” não
  é CNES e a data de referência é outra. O painel deve exibir sempre a contagem
  derivada da competência importada.

## 10. Casos de teste obrigatórios

1. Linha de policlínica é gravada no raw e ausente em `analytics`.
2. Motivo de exclusão é recuperável por linha excluída.
3. CNES desconhecido com denominador 0 permite publicar; com denominador > 0
   bloqueia.
4. Policlínica com denominador > 0 dispara alerta de mudança de impacto.
5. eAP vinculada a CNES de UBS elegível **entra** no indicador.
6. Estabelecimento com duas equipes (ex.: CNES 2362252) é excluído por inteiro,
   sem sobrar equipe órfã.
7. Mudança de classificação gera nova versão de escopo e recomputa a série.
8. Recomposição `SUM(pontos)/SUM(denominador)` sobre o conjunto elegível
   reproduz os valores da seção 9.

## 11. O que não fazer

```sql
-- não
where estabelecimento not like '%POLICLINICA%'
where sigla_equipe = 'eSF'
where tipo_estabelecimento <> 'CENTRO DE SAUDE/UNIDADE BASICA'
```

Nenhum dos três é regra oficial. O primeiro é frágil, o segundo exclui
modalidade legítima, o terceiro não discrimina nada nos dados reais.

## 12. Catálogo de referência

`siaps_catalogo_cnes_observado.csv` traz os 98 CNES observados nas quatro
competências, com a classificação proposta a partir do nome do estabelecimento.

É **ponto de partida para conferência**, não a allowlist definitiva. A allowlist
oficial deve vir do cadastro territorial atualizado do município e ser
reconciliada com esta lista antes da primeira publicação.
