export type VisitHistoryItem = {
  id: string;
  gestanteId: string;
  gestanteCodigo: string;
  gestanteNome: string;
  acsId: string;
  acsNome: string;
  microareaId: string;
  microareaCodigo: string;
  dataAcao: string;
  compareceu: boolean;
  motivoFalta: string | null;
  orientacoes: string[];
  sinaisAlerta: boolean;
  observacao: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

export type TeamPendingItem = {
  id: string;
  codigo: string;
  nome: string;
  risco: string | null;
  microareaId: string;
  microareaCodigo: string;
  ultimaVisita: string | null;
  ultimaCompareceu: boolean | null;
  ultimoAlerta: boolean | null;
  diasSemVisita: number;
  semVisita30d: boolean;
  altoRisco: boolean;
};

export type TeamFollowUp = {
  id: string;
  gestanteId: string;
  gestanteCodigo: string;
  gestanteNome: string;
  profissionalNome: string;
  tipo: string;
  observacao: string;
  criadoEm: string;
};

export type TeamVisitsData = {
  nome: string;
  ubsId: string;
  ubsNome: string;
  atualizadoEm: string;
  metricas: {
    gestantesAtivas: number;
    visitadas30Dias: number;
    pendentes30Dias: number;
    naoEncontradas30Dias: number;
    sinaisAlerta30Dias: number;
  };
  microareas: Array<{ id: string; codigo: string }>;
  agentes: Array<{
    id: string;
    nome: string;
    microareaId: string | null;
    microareaCodigo: string | null;
  }>;
  pendencias: TeamPendingItem[];
  historico: VisitHistoryItem[];
  acompanhamentos: TeamFollowUp[];
};
