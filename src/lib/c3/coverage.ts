import type { ClinicalRecord } from "../../components/cadastro-clinico/types";

type Tab = "gestacao" | "consultas" | "exames" | "vacinas";
export type C3CoverageItem = {
  codigo: string;
  pontosPossiveis: number;
  titulo: string;
  requisito: string;
  area: Tab;
  haRegistroRelacionado: boolean;
  orientacao: string;
};

const positive = (value: number | null | undefined) => typeof value === "number" && value > 0;
const nonEmpty = (value: string | null | undefined) => typeof value === "string" && value.trim().length > 0;

export function evaluateC3Coverage(record: ClinicalRecord): {
  versao: "C3-2026";
  itens: C3CoverageItem[];
  informados: number;
  semInformacao: number;
  pontuacaoOficialCalculada: false;
} {
  const a = record.acompanhamento;
  const g = record.gestacao;
  const exams = record.exames ?? [];
  const vaccines = record.vacinas ?? [];
  const consultations = record.consultas ?? [];
  const performed = (trimestre: number, words: string[]) =>
    exams.some((e) => e.trimestre === trimestre &&
      words.some((w) => `${e.codigo} ${e.nome}`.toLowerCase().includes(w)) &&
      ["realizado", "resultado_alterado"].includes(e.status));
  const gLab = [
    performed(1, ["hiv"]),
    performed(1, ["sifilis", "sífilis"]),
    performed(1, ["hepatite b", "hbsag", "hbv"]),
    performed(1, ["hepatite c", "anti-hcv", "hcv"]),
  ].filter(Boolean).length;
  const hLab = [
    performed(3, ["hiv"]),
    performed(3, ["sifilis", "sífilis"]),
  ].filter(Boolean).length;
  const dtpa = vaccines.some((v) =>
    `${v.codigo} ${v.nome}`.toLowerCase().includes("dtpa") &&
    v.status === "realizada");
  const add = (
    codigo: string, titulo: string, requisito: string,
    area: Tab, haRegistroRelacionado: boolean, orientacao: string
  ): C3CoverageItem => ({
    codigo, titulo, requisito, area, haRegistroRelacionado, orientacao,
    pontosPossiveis: codigo === "A" ? 10 : 9,
  });
  const itens = [
    add("A", "Captação até a 12ª semana", "Primeira consulta médica ou de enfermagem até a 12ª semana", "consultas",
      positive(a.atendimentosAte12Semanas) || nonEmpty(g.inicioPreNatal),
      "Conferir data, idade gestacional, vínculo e profissional da primeira consulta."),
    add("B", "7 consultas pré-natais", "Pelo menos 7 consultas médicas/de enfermagem na gestação", "consultas",
      positive(a.atendimentosPreNatal) || consultations.some((c) => c.tipo === "pre_natal"),
      "Conferir 7 eventos válidos, datas, profissional e gestação correspondente."),
    add("C", "7 aferições de pressão", "Pelo menos 7 registros de pressão arterial na gestação", "gestacao",
      positive(a.medicoesPressao), "Confirmar as 7 aferições e respectivos registros/datas."),
    add("D", "7 medições de peso e altura", "7 registros simultâneos de peso e altura na gestação", "gestacao",
      positive(a.medicoesPesoAltura), "Verificar peso e altura registrados no mesmo dia; medida isolada não basta."),
    add("E", "3 visitas pré-natais", "3 visitas ACS/TACS após a primeira consulta", "consultas",
      positive(a.visitasPreNatal), "Verificar motivos, datas, CBO e se foram após a primeira consulta."),
    add("F", "Vacinação dTpa", "Registro de dTpa a partir da 20ª semana da gestação", "vacinas",
      dtpa, "Conferir aplicação, data, semana gestacional e registro compatível."),
    add("G", "Exames do 1º trimestre", "Sífilis, HIV, hepatites B e C no 1º trimestre", "exames",
      gLab > 0, `Registros dos 4 exames encontrados na ficha: ${gLab}/4. Confirmar realização, datas e trimestre.`),
    add("H", "Exames do 3º trimestre", "Sífilis e HIV no 3º trimestre", "exames",
      hLab > 0, `Registros dos 2 exames encontrados na ficha: ${hLab}/2. Confirmar realização, datas e trimestre.`),
    add("I", "Consulta no puerpério", "Uma consulta médica/de enfermagem no puerpério", "consultas",
      positive(a.atendimentosPuerperio) || consultations.some((c) => c.tipo === "puerperio"),
      "Conferir desfecho da gestação, data e profissional."),
    add("J", "Visita no puerpério", "Uma visita de ACS/TACS no puerpério", "consultas",
      positive(a.visitasPuerperio), "Conferir data no período puerperal, motivo e profissional."),
    add("K", "Atividade em saúde bucal", "Atividade por dentista ou TSB durante a gestação", "consultas",
      positive(a.atendimentosOdontologicos),
      "Confirmar a atividade válida, profissional habilitado e data da gestação."),
  ];
  const informados = itens.filter((item) => item.haRegistroRelacionado).length;
  return {
    versao: "C3-2026",
    itens,
    informados,
    semInformacao: itens.length - informados,
    pontuacaoOficialCalculada: false,
  };
}
