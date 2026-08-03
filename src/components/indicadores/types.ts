export type IndicatorItem = {
  rotulo: string;
  quantidade: number;
};

export type IndicatorNotice = {
  tipo: string;
  rotulo: string;
  quantidade: number;
};

export type IndicatorData = {
  escopo: "ubs" | "profissional";
  titulo: string;
  atualizadoEm: string;
  resumo: {
    total: number;
    ativas: number;
    altas: number;
    altoRisco: number;
    medioRisco: number;
    habitual: number;
    captacaoPrecoce: number;
    captacaoTardia: number;
    captacaoSemDados: number;
    acompanhamentoAtrasado: number;
    examesPendentes: number;
    dtpaPendente: number;
  };
  captacao: IndicatorItem[];
  consultas: IndicatorItem[];
  riscos: IndicatorItem[];
  trimestres: IndicatorItem[];
  microareas: IndicatorItem[];
  fatoresRisco: IndicatorItem[];
  avisos: IndicatorNotice[];
};
