export type NullableNumber = number | null;

export type AnalyticsTabId =
  | "overview"
  | "ubs"
  | "microareas"
  | "risk"
  | "prenatal"
  | "pec"
  | "acs";

export type AnalyticsScope = {
  kind: "municipal" | "ubs" | "student";
  title: string;
  ubsId: string | null;
  canFilterUbs: boolean;
  allowedTabs: AnalyticsTabId[];
};

export type PrivacyConfig = {
  kMinimo: number;
  regra: string;
  versao: string;
};

export type AnalyticsSummary = {
  ubsAtivas: NullableNumber;
  microareasAtivas: NullableNumber;
  gestantesAtivas: NullableNumber;
  altas: NullableNumber;
  altoRisco: NullableNumber;
  medioRisco: NullableNumber;
  riscoHabitual: NullableNumber;
  captacaoPrecoce: NullableNumber;
  captacaoTardia: NullableNumber;
  captacaoSemDados: NullableNumber;
  consultasMeta: NullableNumber;
  gestantesComExamesPendentes: NullableNumber;
  totalExamesPendentes: NullableNumber;
  dtpaPendente: NullableNumber;
  percentualCaptacaoPrecoce: NullableNumber;
  percentualMetaConsultas: NullableNumber;
  atualizadoEm: string | null;
};

export type UbsOption = {
  ubsId: string;
  ubsNome: string;
  nomeAbreviado: string | null;
  codigoInterno: string | null;
  cnes: string | null;
  municipio: string | null;
  uf: string | null;
};

export type UbsIndicator = {
  ubsId: string;
  ubsNome: string;
  nomeAbreviado: string | null;
  municipio: string | null;
  uf: string | null;
  gestantesAtivas: NullableNumber;
  altas: NullableNumber;
  altoRisco: NullableNumber;
  medioRisco: NullableNumber;
  captacaoPrecoce: NullableNumber;
  captacaoTardia: NullableNumber;
  consultasMeta: NullableNumber;
  gestantesComExamesPendentes: NullableNumber;
  totalExamesPendentes: NullableNumber;
  dtpaPendente: NullableNumber;
  percentualCaptacaoPrecoce: NullableNumber;
  percentualMetaConsultas: NullableNumber;
  atualizadoEm: string | null;
};

export type MicroareaIndicator = {
  ubsId: string;
  ubsNome: string;
  microareaId: string;
  microareaCodigo: string;
  microareaNome: string | null;
  gestantesAtivas: NullableNumber;
  altoRisco: NullableNumber;
  captacaoPrecoce: NullableNumber;
  consultasMeta: NullableNumber;
  gestantesComExamesPendentes: NullableNumber;
  atualizadoEm: string | null;
};

export type CategoryPoint = {
  ubsId: string;
  ubsNome: string;
  categoria: string;
  ordem: number;
  quantidade: NullableNumber;
};

export type RiskFactor = {
  ubsId: string;
  ubsNome: string;
  classificacao: string;
  grupo: string;
  fatorTitulo: string;
  automatico: boolean;
  ocorrencias: number;
  pontosAcumulados: number;
  ultimaOcorrenciaEm: string | null;
};

export type BirthForecast = {
  ubsId: string;
  ubsNome: string;
  mesDpp: string;
  quantidade: number;
};

export type PecQuality = {
  ubsId: string;
  ubsNome: string;
  mes: string;
  arquivosImportados: number;
  linhasRecebidas: number;
  linhasProcessadas: number;
  linhasComErro: number;
  importacoesConcluidas: number;
  importacoesComErros: number;
  importacoesFalhas: number;
  percentualProcessado: NullableNumber;
  ultimaImportacaoConcluidaEm: string | null;
};

export type AcsVisit = {
  ubsId: string;
  ubsNome: string;
  mes: string;
  totalAcoes: number;
  visitasRealizadas: NullableNumber;
  naoEncontradas: NullableNumber;
  comSinaisAlerta: NullableNumber;
};

export type AnalyticsDashboardData = {
  scope: AnalyticsScope;
  privacy: PrivacyConfig;
  summary: AnalyticsSummary;
  ubs: UbsOption[];
  ubsIndicators: UbsIndicator[];
  microareas: MicroareaIndicator[];
  riskDistribution: CategoryPoint[];
  captureDistribution: CategoryPoint[];
  consultationDistribution: CategoryPoint[];
  trimesterDistribution: CategoryPoint[];
  riskFactors: RiskFactor[];
  birthForecast: BirthForecast[];
  pecQuality: PecQuality[];
  acsVisits: AcsVisit[];
};
