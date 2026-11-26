import type { ClinicalRecord, ClinicalPageData } from "@/components/cadastro-clinico/types";

export function emptyClinicalRecord(ubsId: string, ubsName: string): ClinicalRecord {
  return {
    ubsId,
    ubsNome: ubsName,
    microareaId: "",
    identificacao: {
      nome: "",
      dataNascimento: "",
      cpf: "",
      cns: "",
      telefoneCelular: "",
      telefoneResidencial: "",
      telefoneContato: "",
      rua: "",
      numero: "",
      complemento: "",
      bairro: "",
      municipio: "Campina Grande",
      uf: "PB",
      cep: "",
      sexo: "Feminino",
      identidadeGenero: "",
      racaCor: "",
      bolsaFamilia: null,
      vigenciaBolsaFamilia: "",
    },
    gestacao: {
      situacao: "gestacao_em_curso",
      inicioPreNatal: "",
      dum: "",
      dpp: "",
      igSemanas: null,
      igDias: null,
      igEcografiaSemanas: null,
      igEcografiaDias: null,
      dppEcografia: "",
      dataParto: "",
      tipoParto: "",
      pesoKg: null,
      alturaCm: null,
      pressaoArterial: "",
      dataUltimaPressao: "",
      dataUltimoPesoAltura: "",
      riscoGestacional: "",
    },
    acompanhamento: {
      atendimentosPreNatal: 0,
      atendimentosAte12Semanas: 0,
      ultimaConsultaPreNatal: "",
      atendimentosOdontologicos: 0,
      medicoesAlturaUterina: 0,
      medicoesPressao: 0,
      medicoesPesoAltura: 0,
      visitasPreNatal: 0,
      visitasPuerperio: 0,
      atendimentosPuerperio: 0,
      ultimaConsultaPuerperio: "",
      diasUltimoAtendimentoMedico: null,
      diasUltimoAtendimentoEnfermagem: null,
      diasUltimoAtendimentoOdontologico: null,
      diasUltimaVisita: null,
    },
    consultas: [],
    exames: [],
    vacinas: [],
    alta: {
      ativa: false,
      data: "",
      motivo: "",
      situacaoFinal: "",
      observacao: "",
    },
  };
}


export function demoRecords(): ClinicalRecord[] {
  return [24,31,12].map((weeks,index)=>{
    const record=emptyClinicalRecord("demo-ubs","UBS fictícia");
    record.codigo="DEMO-"+String(index+1).padStart(3,"0");
    record.microareaId="demo-area";
    record.identificacao.nome="Gestante fictícia "+["A","B","C"][index];
    record.identificacao.dataNascimento="1998-01-01";
    record.gestacao.igSemanas=weeks;
    record.gestacao.igDias=0;
    record.gestacao.pesoKg=65+index*5;
    record.gestacao.alturaCm=160+index*2;
    record.gestacao.pressaoArterial=index===1?"140/90":"110/70";
    record.gestacao.riscoGestacional=index===1?"Alto risco":"Habitual";
    record.acompanhamento.atendimentosPreNatal=[4,6,2][index];
    return record;
  });
}
export function demoClinicalData(record: ClinicalRecord): ClinicalPageData {
  return {record,professional:{id:"demo",nome:"Profissional fictício",perfil:"equipe_ubs",ubsId:"demo-ubs",ubsNome:"UBS fictícia"},ubsOptions:[{id:"demo-ubs",nome:"UBS fictícia"}],microareas:[{id:"demo-area",codigo:"01"}],examConfigs:[{codigo:"demo-hiv",nome:"HIV (exemplo)",trimestre:1,semanaInicio:null,semanaFim:null,condicaoAplicacao:null,ordem:1,versaoReferencia:"exemplo"},{codigo:"demo-sifilis",nome:"Sífilis (exemplo)",trimestre:3,semanaInicio:null,semanaFim:null,condicaoAplicacao:null,ordem:2,versaoReferencia:"exemplo"}],vaccineConfigs:[{codigo:"demo-dtpa",nome:"dTpa (exemplo)",semanaInicio:20,semanaFim:null,condicaoAplicacao:null,ordem:1,versaoReferencia:"exemplo"}]};
}
