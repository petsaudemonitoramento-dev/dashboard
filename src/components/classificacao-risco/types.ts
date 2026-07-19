export type RiskGroupCode = "g1" | "g3" | "g4" | "g5";

export type RiskFactor = {
  codigo: string;
  grupo: RiskGroupCode;
  grupoTitulo: string;
  titulo: string;
  pontos: number;
  ordem: number;
  versao: string;
};

export type PrefilledFactor = {
  codigo: string;
  origem: "calculado" | "cadastro_clinico" | "pec" | "classificacao_anterior";
  detalhe: string;
};

export type RiskPatient = {
  id: string;
  codigo: string;
  nome: string;
  dataNascimento: string;
  idadeAnos: number | null;
  racaCor: string;
  ubsId: string;
  ubsNome: string;
  microarea: string | null;
  igSemanas: number | null;
  igDias: number | null;
  dum: string;
  dpp: string;
  pesoKg: number | null;
  alturaCm: number | null;
};

export type RiskProfessional = {
  id: string;
  nome: string;
  perfil: string;
  ubsId: string;
  ubsNome: string;
};

export type RiskUbsOption = {
  id: string;
  nome: string;
};

export type RiskPageData = {
  patient: RiskPatient | null;
  professional: RiskProfessional;
  ubsOptions: RiskUbsOption[];
  factors: RiskFactor[];
  prefilled: PrefilledFactor[];
  instrumentVersion: string;
};

export type RiskSaveResult = {
  classificacaoId: string;
  gestanteId: string;
  codigoGestante: string;
  score: number;
  imc: number | null;
  faixaImc: string;
  classificacao: string;
  conduta: string;
  realizadaEm: string;
};
