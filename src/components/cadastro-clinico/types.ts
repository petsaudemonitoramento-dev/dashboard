export type ExamConfig = {
  codigo: string;
  nome: string;
  trimestre: 1 | 2 | 3;
  semanaInicio: number | null;
  semanaFim: number | null;
  condicaoAplicacao: string | null;
  ordem: number;
  versaoReferencia: string;
};

export type VaccineConfig = {
  codigo: string;
  nome: string;
  semanaInicio: number | null;
  semanaFim: number | null;
  condicaoAplicacao: string | null;
  ordem: number;
  versaoReferencia: string;
};

export type MicroareaOption = {
  id: string;
  codigo: string;
};

export type UbsOption = {
  id: string;
  nome: string;
};

export type ConsultationItem = {
  id?: string;
  data: string;
  tipo: string;
  observacao: string;
  origem?: string;
};

export type ExamItem = {
  id?: string;
  codigo: string;
  nome: string;
  trimestre: 1 | 2 | 3;
  status:
    | "nao_informado"
    | "pendente"
    | "solicitado"
    | "realizado"
    | "resultado_alterado"
    | "nao_se_aplica";
  dataSolicitacao: string;
  dataRealizacao: string;
  resultado: string;
  observacao: string;
  origem?: string;
};

export type VaccineItem = {
  id?: string;
  codigo: string;
  nome: string;
  status:
    | "nao_informado"
    | "pendente"
    | "agendada"
    | "realizada"
    | "nao_se_aplica";
  dose: string;
  dataAplicacao: string;
  lote: string;
  unidadeAplicadora: string;
  observacao: string;
  origem?: string;
};

export type ClinicalRecord = {
  id?: string;
  codigo?: string;
  ubsId: string;
  ubsNome: string;
  microareaId: string;
  microareaCodigo?: string | null;
  identificacao: {
    nome: string;
    dataNascimento: string;
    cpf: string;
    cns: string;
    telefoneCelular: string;
    telefoneResidencial: string;
    telefoneContato: string;
    rua: string;
    numero: string;
    complemento: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    sexo: string;
    identidadeGenero: string;
    racaCor: string;
    bolsaFamilia: boolean | null;
    vigenciaBolsaFamilia: string;
  };
  gestacao: {
    situacao: "gestacao_em_curso" | "puerperio";
    inicioPreNatal: string;
    dum: string;
    dpp: string;
    igSemanas: number | null;
    igDias: number | null;
    igEcografiaSemanas: number | null;
    igEcografiaDias: number | null;
    dppEcografia: string;
    dataParto: string;
    tipoParto: string;
    pesoKg: number | null;
    alturaCm: number | null;
    pressaoArterial: string;
    dataUltimaPressao: string;
    dataUltimoPesoAltura: string;
    riscoGestacional: string;
  };
  acompanhamento: {
    atendimentosPreNatal: number | null;
    atendimentosAte12Semanas: number | null;
    ultimaConsultaPreNatal: string;
    atendimentosOdontologicos: number | null;
    medicoesAlturaUterina: number | null;
    medicoesPressao: number | null;
    medicoesPesoAltura: number | null;
    visitasPreNatal: number | null;
    visitasPuerperio: number | null;
    atendimentosPuerperio: number | null;
    ultimaConsultaPuerperio: string;
    diasUltimoAtendimentoMedico: number | null;
    diasUltimoAtendimentoEnfermagem: number | null;
    diasUltimoAtendimentoOdontologico: number | null;
    diasUltimaVisita: number | null;
  };
  consultas: ConsultationItem[];
  exames: ExamItem[];
  vacinas: VaccineItem[];
  alta: {
    ativa: boolean;
    data: string;
    motivo: string;
    situacaoFinal: string;
    observacao: string;
  };
  origemCadastro?: string;
  atualizadoEm?: string;
};

export type ClinicalPageData = {
  record: ClinicalRecord;
  examConfigs: ExamConfig[];
  vaccineConfigs: VaccineConfig[];
  microareas: MicroareaOption[];
  ubsOptions: UbsOption[];
  professional: {
    id: string;
    nome: string;
    perfil: string;
    ubsId: string | null;
    ubsNome: string | null;
  };
};
