import "server-only";

import type { UserProfile } from "@/lib/auth/roles";
import type { getPostgresClient } from "@/lib/db/postgres";
import type {
  AcsVisit,
  AnalyticsDashboardData,
  AnalyticsSummary,
  AnalyticsTabId,
  BirthForecast,
  CategoryPoint,
  MicroareaIndicator,
  NullableNumber,
  PecQuality,
  PrivacyConfig,
  RiskFactor,
  UbsIndicator,
  UbsOption,
} from "./types";

type SqlClient = ReturnType<typeof getPostgresClient>;
type RawNumber = number | string | null;
type RawDate = Date | string | null;

type RawPrivacy = {
  k_minimo: number;
  regra: string;
  versao: string;
};

type RawSummary = {
  ubs_ativas: RawNumber;
  microareas_ativas: RawNumber;
  gestantes_ativas: RawNumber;
  altas: RawNumber;
  alto_risco: RawNumber;
  medio_risco: RawNumber;
  risco_habitual: RawNumber;
  captacao_precoce: RawNumber;
  captacao_tardia: RawNumber;
  consultas_meta: RawNumber;
  gestantes_com_exames_pendentes: RawNumber;
  total_exames_pendentes: RawNumber;
  dtpa_pendente: RawNumber;
  percentual_captacao_precoce: RawNumber;
  percentual_meta_consultas: RawNumber;
  atualizado_em: RawDate;
};

type RawUbs = {
  ubs_id: string;
  ubs_nome: string;
  nome_abreviado: string | null;
  codigo_interno: string | null;
  cnes: string | null;
  municipio: string | null;
  uf: string | null;
};

type RawUbsIndicator = {
  ubs_id: string;
  ubs_nome: string;
  nome_abreviado: string | null;
  municipio: string | null;
  uf: string | null;
  gestantes_ativas: RawNumber;
  altas: RawNumber;
  alto_risco: RawNumber;
  medio_risco: RawNumber;
  captacao_precoce: RawNumber;
  captacao_tardia: RawNumber;
  consultas_meta: RawNumber;
  gestantes_com_exames_pendentes: RawNumber;
  total_exames_pendentes: RawNumber;
  dtpa_pendente: RawNumber;
  percentual_captacao_precoce: RawNumber;
  percentual_meta_consultas: RawNumber;
  atualizado_em: RawDate;
};

type RawMicroarea = {
  ubs_id: string;
  ubs_nome: string;
  microarea_id: string;
  microarea_codigo: string;
  microarea_nome: string | null;
  gestantes_ativas: RawNumber;
  alto_risco: RawNumber;
  captacao_precoce: RawNumber;
  consultas_meta: RawNumber;
  gestantes_com_exames_pendentes: RawNumber;
  atualizado_em: RawDate;
};

type RawCategory = {
  ubs_id: string;
  ubs_nome: string;
  categoria: string;
  ordem: number;
  quantidade: RawNumber;
};

type RawRiskFactor = {
  ubs_id: string;
  ubs_nome: string;
  classificacao: string;
  grupo: string;
  fator_titulo: string;
  automatico: boolean;
  ocorrencias: RawNumber;
  pontos_acumulados: RawNumber;
  ultima_ocorrencia_em: RawDate;
};

type RawBirthForecast = {
  ubs_id: string;
  ubs_nome: string;
  mes_dpp: RawDate;
  quantidade: RawNumber;
};

type RawPecQuality = {
  ubs_id: string;
  ubs_nome: string;
  mes: RawDate;
  arquivos_importados: RawNumber;
  linhas_recebidas: RawNumber;
  linhas_processadas: RawNumber;
  linhas_com_erro: RawNumber;
  importacoes_concluidas: RawNumber;
  importacoes_com_erros: RawNumber;
  importacoes_falhas: RawNumber;
  percentual_processado: RawNumber;
  ultima_importacao_concluida_em: RawDate;
};

type RawAcsVisit = {
  ubs_id: string;
  ubs_nome: string;
  mes: RawDate;
  total_acoes: RawNumber;
  visitas_realizadas: RawNumber;
  nao_encontradas: RawNumber;
  com_sinais_alerta: RawNumber;
};

function nullableNumber(value: RawNumber): NullableNumber {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredNumber(value: RawNumber): number {
  return nullableNumber(value) ?? 0;
}

function isoDate(value: RawDate): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapCategory(row: RawCategory): CategoryPoint {
  return {
    ubsId: row.ubs_id,
    ubsNome: row.ubs_nome,
    categoria: row.categoria,
    ordem: row.ordem,
    quantidade: nullableNumber(row.quantidade),
  };
}

function publishedCategoryValue(
  rows: CategoryPoint[],
  category: string
): NullableNumber {
  const matching = rows.filter((row) => row.categoria === category);
  const published = matching
    .map((row) => row.quantidade)
    .filter((value): value is number => value !== null);

  if (published.length === 0) return null;
  return published.reduce((sum, value) => sum + value, 0);
}

function summaryFromMunicipal(
  row: RawSummary | undefined,
  capture: CategoryPoint[]
): AnalyticsSummary {
  return {
    ubsAtivas: nullableNumber(row?.ubs_ativas ?? null),
    microareasAtivas: nullableNumber(row?.microareas_ativas ?? null),
    gestantesAtivas: nullableNumber(row?.gestantes_ativas ?? null),
    altas: nullableNumber(row?.altas ?? null),
    altoRisco: nullableNumber(row?.alto_risco ?? null),
    medioRisco: nullableNumber(row?.medio_risco ?? null),
    riscoHabitual: nullableNumber(row?.risco_habitual ?? null),
    captacaoPrecoce: nullableNumber(row?.captacao_precoce ?? null),
    captacaoTardia: nullableNumber(row?.captacao_tardia ?? null),
    captacaoSemDados: publishedCategoryValue(capture, "Sem dados"),
    consultasMeta: nullableNumber(row?.consultas_meta ?? null),
    gestantesComExamesPendentes: nullableNumber(
      row?.gestantes_com_exames_pendentes ?? null
    ),
    totalExamesPendentes: nullableNumber(
      row?.total_exames_pendentes ?? null
    ),
    dtpaPendente: nullableNumber(row?.dtpa_pendente ?? null),
    percentualCaptacaoPrecoce: nullableNumber(
      row?.percentual_captacao_precoce ?? null
    ),
    percentualMetaConsultas: nullableNumber(
      row?.percentual_meta_consultas ?? null
    ),
    atualizadoEm: isoDate(row?.atualizado_em ?? null),
  };
}

function summaryFromUbs(
  row: UbsIndicator | undefined,
  microareas: MicroareaIndicator[],
  risk: CategoryPoint[],
  capture: CategoryPoint[]
): AnalyticsSummary {
  return {
    ubsAtivas: row ? 1 : 0,
    microareasAtivas: microareas.length,
    gestantesAtivas: row?.gestantesAtivas ?? null,
    altas: row?.altas ?? null,
    altoRisco: row?.altoRisco ?? null,
    medioRisco: row?.medioRisco ?? null,
    riscoHabitual: publishedCategoryValue(risk, "Risco habitual"),
    captacaoPrecoce: row?.captacaoPrecoce ?? null,
    captacaoTardia: row?.captacaoTardia ?? null,
    captacaoSemDados: publishedCategoryValue(capture, "Sem dados"),
    consultasMeta: row?.consultasMeta ?? null,
    gestantesComExamesPendentes:
      row?.gestantesComExamesPendentes ?? null,
    totalExamesPendentes: row?.totalExamesPendentes ?? null,
    dtpaPendente: row?.dtpaPendente ?? null,
    percentualCaptacaoPrecoce:
      row?.percentualCaptacaoPrecoce ?? null,
    percentualMetaConsultas: row?.percentualMetaConsultas ?? null,
    atualizadoEm: row?.atualizadoEm ?? null,
  };
}

const MANAGEMENT_TABS: AnalyticsTabId[] = [
  "overview",
  "ubs",
  "microareas",
  "risk",
  "prenatal",
  "pec",
  "acs",
];

const UBS_TABS: AnalyticsTabId[] = [
  "overview",
  "microareas",
  "risk",
  "prenatal",
  "pec",
  "acs",
];

export async function loadAnalyticsDashboard({
  sql,
  profile,
  ubsId,
}: {
  sql: SqlClient;
  profile: UserProfile;
  ubsId: string | null;
}): Promise<AnalyticsDashboardData> {
  const isManagement = profile === "gestao_municipal";
  const isTeam = profile === "equipe_ubs";
  const isStudent = profile === "aluno";

  if (!isManagement && !isTeam && !isStudent) {
    throw new Error("Perfil sem acesso à camada analítica.");
  }

  if (isTeam && !ubsId) {
    throw new Error("Perfil da equipe sem UBS vinculada.");
  }

  const scopedUbsId = isTeam ? ubsId : null;
  const allowDetailed = !isStudent;

  const privacyPromise = sql<RawPrivacy[]>`
    select k_minimo, regra, versao
    from analytics_publicado.vw_configuracao_privacidade
    limit 1
  `;

  const municipalSummaryPromise = isTeam
    ? Promise.resolve([] as RawSummary[])
    : sql<RawSummary[]>`
        select *
        from analytics_publicado.vw_resumo_municipal
        limit 1
      `;

  const ubsPromise = scopedUbsId
    ? sql<RawUbs[]>`
        select
          ubs_id,
          ubs_nome,
          nome_abreviado,
          codigo_interno,
          cnes,
          municipio,
          uf
        from analytics_publicado.vw_ubs
        where ubs_id = ${scopedUbsId}::uuid
        order by ubs_nome
      `
    : allowDetailed
      ? sql<RawUbs[]>`
          select
            ubs_id,
            ubs_nome,
            nome_abreviado,
            codigo_interno,
            cnes,
            municipio,
            uf
          from analytics_publicado.vw_ubs
          order by ubs_nome
        `
      : Promise.resolve([] as RawUbs[]);

  const ubsIndicatorsPromise = scopedUbsId
    ? sql<RawUbsIndicator[]>`
        select *
        from analytics_publicado.vw_indicadores_ubs
        where ubs_id = ${scopedUbsId}::uuid
        order by ubs_nome
      `
    : allowDetailed
      ? sql<RawUbsIndicator[]>`
          select *
          from analytics_publicado.vw_indicadores_ubs
          order by ubs_nome
        `
      : Promise.resolve([] as RawUbsIndicator[]);

  const microareasPromise = !allowDetailed
    ? Promise.resolve([] as RawMicroarea[])
    : scopedUbsId
      ? sql<RawMicroarea[]>`
          select *
          from analytics_publicado.vw_indicadores_microareas
          where ubs_id = ${scopedUbsId}::uuid
          order by microarea_codigo
        `
      : sql<RawMicroarea[]>`
          select *
          from analytics_publicado.vw_indicadores_microareas
          order by ubs_nome, microarea_codigo
        `;

  const riskPromise = scopedUbsId
    ? sql<RawCategory[]>`
        select *
        from analytics_publicado.vw_distribuicao_risco_ubs
        where ubs_id = ${scopedUbsId}::uuid
        order by ordem
      `
    : sql<RawCategory[]>`
        select *
        from analytics_publicado.vw_distribuicao_risco_ubs
        order by ubs_nome, ordem
      `;

  const capturePromise = scopedUbsId
    ? sql<RawCategory[]>`
        select *
        from analytics_publicado.vw_captacao_prenatal_ubs
        where ubs_id = ${scopedUbsId}::uuid
        order by ordem
      `
    : sql<RawCategory[]>`
        select *
        from analytics_publicado.vw_captacao_prenatal_ubs
        order by ubs_nome, ordem
      `;

  const consultationsPromise = !allowDetailed
    ? Promise.resolve([] as RawCategory[])
    : scopedUbsId
      ? sql<RawCategory[]>`
          select *
          from analytics_publicado.vw_consultas_prenatal_ubs
          where ubs_id = ${scopedUbsId}::uuid
          order by ordem
        `
      : sql<RawCategory[]>`
          select *
          from analytics_publicado.vw_consultas_prenatal_ubs
          order by ubs_nome, ordem
        `;

  const trimestersPromise = !allowDetailed
    ? Promise.resolve([] as RawCategory[])
    : scopedUbsId
      ? sql<RawCategory[]>`
          select *
          from analytics_publicado.vw_trimestres_ubs
          where ubs_id = ${scopedUbsId}::uuid
          order by ordem
        `
      : sql<RawCategory[]>`
          select *
          from analytics_publicado.vw_trimestres_ubs
          order by ubs_nome, ordem
        `;

  const riskFactorsPromise = !allowDetailed
    ? Promise.resolve([] as RawRiskFactor[])
    : scopedUbsId
      ? sql<RawRiskFactor[]>`
          select *
          from analytics_publicado.vw_fatores_risco_agrupados
          where ubs_id = ${scopedUbsId}::uuid
          order by ocorrencias desc, fator_titulo
        `
      : sql<RawRiskFactor[]>`
          select *
          from analytics_publicado.vw_fatores_risco_agrupados
          order by ocorrencias desc, fator_titulo
        `;

  const birthsPromise = !allowDetailed
    ? Promise.resolve([] as RawBirthForecast[])
    : scopedUbsId
      ? sql<RawBirthForecast[]>`
          select *
          from analytics_publicado.vw_previsao_partos_mensal
          where ubs_id = ${scopedUbsId}::uuid
          order by mes_dpp
        `
      : sql<RawBirthForecast[]>`
          select *
          from analytics_publicado.vw_previsao_partos_mensal
          order by mes_dpp, ubs_nome
        `;

  const pecPromise = !allowDetailed
    ? Promise.resolve([] as RawPecQuality[])
    : scopedUbsId
      ? sql<RawPecQuality[]>`
          select *
          from analytics_publicado.vw_qualidade_importacoes_pec
          where ubs_id = ${scopedUbsId}::uuid
          order by mes desc
        `
      : sql<RawPecQuality[]>`
          select *
          from analytics_publicado.vw_qualidade_importacoes_pec
          order by mes desc, ubs_nome
        `;

  const acsPromise = !allowDetailed
    ? Promise.resolve([] as RawAcsVisit[])
    : scopedUbsId
      ? sql<RawAcsVisit[]>`
          select *
          from analytics_publicado.vw_visitas_acs_mensal
          where ubs_id = ${scopedUbsId}::uuid
          order by mes desc
        `
      : sql<RawAcsVisit[]>`
          select *
          from analytics_publicado.vw_visitas_acs_mensal
          order by mes desc, ubs_nome
        `;

  const [
    privacyRows,
    municipalSummaryRows,
    rawUbs,
    rawUbsIndicators,
    rawMicroareas,
    rawRisk,
    rawCapture,
    rawConsultations,
    rawTrimesters,
    rawRiskFactors,
    rawBirths,
    rawPec,
    rawAcs,
  ] = await Promise.all([
    privacyPromise,
    municipalSummaryPromise,
    ubsPromise,
    ubsIndicatorsPromise,
    microareasPromise,
    riskPromise,
    capturePromise,
    consultationsPromise,
    trimestersPromise,
    riskFactorsPromise,
    birthsPromise,
    pecPromise,
    acsPromise,
  ]);

  const privacyRow = privacyRows[0];
  const privacy: PrivacyConfig = {
    kMinimo: privacyRow?.k_minimo ?? 5,
    regra:
      privacyRow?.regra ??
      "Valores clínicos em grupos pequenos não são publicados.",
    versao: privacyRow?.versao ?? "indisponível",
  };

  const ubs: UbsOption[] = rawUbs.map((row) => ({
    ubsId: row.ubs_id,
    ubsNome: row.ubs_nome,
    nomeAbreviado: row.nome_abreviado,
    codigoInterno: row.codigo_interno,
    cnes: row.cnes,
    municipio: row.municipio,
    uf: row.uf,
  }));

  const ubsIndicators: UbsIndicator[] = rawUbsIndicators.map((row) => ({
    ubsId: row.ubs_id,
    ubsNome: row.ubs_nome,
    nomeAbreviado: row.nome_abreviado,
    municipio: row.municipio,
    uf: row.uf,
    gestantesAtivas: nullableNumber(row.gestantes_ativas),
    altas: nullableNumber(row.altas),
    altoRisco: nullableNumber(row.alto_risco),
    medioRisco: nullableNumber(row.medio_risco),
    captacaoPrecoce: nullableNumber(row.captacao_precoce),
    captacaoTardia: nullableNumber(row.captacao_tardia),
    consultasMeta: nullableNumber(row.consultas_meta),
    gestantesComExamesPendentes: nullableNumber(
      row.gestantes_com_exames_pendentes
    ),
    totalExamesPendentes: nullableNumber(row.total_exames_pendentes),
    dtpaPendente: nullableNumber(row.dtpa_pendente),
    percentualCaptacaoPrecoce: nullableNumber(
      row.percentual_captacao_precoce
    ),
    percentualMetaConsultas: nullableNumber(
      row.percentual_meta_consultas
    ),
    atualizadoEm: isoDate(row.atualizado_em),
  }));

  const microareas: MicroareaIndicator[] = rawMicroareas.map((row) => ({
    ubsId: row.ubs_id,
    ubsNome: row.ubs_nome,
    microareaId: row.microarea_id,
    microareaCodigo: row.microarea_codigo,
    microareaNome: row.microarea_nome,
    gestantesAtivas: nullableNumber(row.gestantes_ativas),
    altoRisco: nullableNumber(row.alto_risco),
    captacaoPrecoce: nullableNumber(row.captacao_precoce),
    consultasMeta: nullableNumber(row.consultas_meta),
    gestantesComExamesPendentes: nullableNumber(
      row.gestantes_com_exames_pendentes
    ),
    atualizadoEm: isoDate(row.atualizado_em),
  }));

  const riskDistribution = rawRisk.map(mapCategory);
  const captureDistribution = rawCapture.map(mapCategory);
  const consultationDistribution = rawConsultations.map(mapCategory);
  const trimesterDistribution = rawTrimesters.map(mapCategory);

  const riskFactors: RiskFactor[] = rawRiskFactors.map((row) => ({
    ubsId: row.ubs_id,
    ubsNome: row.ubs_nome,
    classificacao: row.classificacao,
    grupo: row.grupo,
    fatorTitulo: row.fator_titulo,
    automatico: row.automatico,
    ocorrencias: requiredNumber(row.ocorrencias),
    pontosAcumulados: requiredNumber(row.pontos_acumulados),
    ultimaOcorrenciaEm: isoDate(row.ultima_ocorrencia_em),
  }));

  const birthForecast: BirthForecast[] = rawBirths.flatMap((row) => {
    const date = isoDate(row.mes_dpp);
    return date
      ? [{
          ubsId: row.ubs_id,
          ubsNome: row.ubs_nome,
          mesDpp: date,
          quantidade: requiredNumber(row.quantidade),
        }]
      : [];
  });

  const pecQuality: PecQuality[] = rawPec.flatMap((row) => {
    const date = isoDate(row.mes);
    return date
      ? [{
          ubsId: row.ubs_id,
          ubsNome: row.ubs_nome,
          mes: date,
          arquivosImportados: requiredNumber(row.arquivos_importados),
          linhasRecebidas: requiredNumber(row.linhas_recebidas),
          linhasProcessadas: requiredNumber(row.linhas_processadas),
          linhasComErro: requiredNumber(row.linhas_com_erro),
          importacoesConcluidas: requiredNumber(row.importacoes_concluidas),
          importacoesComErros: requiredNumber(row.importacoes_com_erros),
          importacoesFalhas: requiredNumber(row.importacoes_falhas),
          percentualProcessado: nullableNumber(row.percentual_processado),
          ultimaImportacaoConcluidaEm: isoDate(
            row.ultima_importacao_concluida_em
          ),
        }]
      : [];
  });

  const acsVisits: AcsVisit[] = rawAcs.flatMap((row) => {
    const date = isoDate(row.mes);
    return date
      ? [{
          ubsId: row.ubs_id,
          ubsNome: row.ubs_nome,
          mes: date,
          totalAcoes: requiredNumber(row.total_acoes),
          visitasRealizadas: nullableNumber(row.visitas_realizadas),
          naoEncontradas: nullableNumber(row.nao_encontradas),
          comSinaisAlerta: nullableNumber(row.com_sinais_alerta),
        }]
      : [];
  });

  const summary = isTeam
    ? summaryFromUbs(
        ubsIndicators[0],
        microareas,
        riskDistribution,
        captureDistribution
      )
    : summaryFromMunicipal(
        municipalSummaryRows[0],
        captureDistribution
      );

  return {
    scope: {
      kind: isManagement ? "municipal" : isTeam ? "ubs" : "student",
      title: isManagement
        ? "Visão municipal"
        : isTeam
          ? ubs[0]?.ubsNome ?? "UBS vinculada"
          : "Visão acadêmica agregada",
      ubsId: scopedUbsId,
      canFilterUbs: isManagement,
      allowedTabs: isManagement
        ? MANAGEMENT_TABS
        : isTeam
          ? UBS_TABS
          : ["overview"],
    },
    privacy,
    summary,
    ubs,
    ubsIndicators,
    microareas,
    riskDistribution,
    captureDistribution,
    consultationDistribution,
    trimesterDistribution,
    riskFactors,
    birthForecast,
    pecQuality,
    acsVisits,
  };
}
