import { isUuid } from "@/lib/security/request";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function stringValue(
  value: unknown,
  maxLength: number,
  allowEmpty = true
): string {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim();
  if (!allowEmpty && !normalized) {
    throw new Error("Campo obrigatório ausente.");
  }

  return normalized.slice(0, maxLength);
}

function nullableNumber(
  value: unknown,
  min: number,
  max: number
): number | null {
  if (value === null || value === "" || value === undefined) {
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error("Valor numérico fora do intervalo permitido.");
  }

  return number;
}

function dateValue(value: unknown): string {
  const date = stringValue(value, 10);
  if (date && !DATE_PATTERN.test(date)) {
    throw new Error("Data inválida.");
  }
  return date;
}

function uuidValue(value: unknown, required = false): string {
  const normalized = stringValue(value, 36);
  if (!normalized && !required) {
    return "";
  }
  if (!isUuid(normalized)) {
    throw new Error("Identificador inválido.");
  }
  return normalized;
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function sanitizeClinicalPayload(
  raw: Record<string, unknown>
): JsonObject {
  const identificacao = objectValue(raw.identificacao);
  const gestacao = objectValue(raw.gestacao);
  const acompanhamento = objectValue(raw.acompanhamento);
  const alta = objectValue(raw.alta);

  const consultasRaw = Array.isArray(raw.consultas)
    ? raw.consultas.slice(0, 300)
    : [];
  const examesRaw = Array.isArray(raw.exames)
    ? raw.exames.slice(0, 300)
    : [];
  const vacinasRaw = Array.isArray(raw.vacinas)
    ? raw.vacinas.slice(0, 100)
    : [];

  const id = raw.id ? uuidValue(raw.id) : "";
  const ubsId = uuidValue(raw.ubsId, true);
  const microareaId = uuidValue(raw.microareaId, true);

  const situacao = stringValue(gestacao.situacao, 32);
  if (!["gestacao_em_curso", "puerperio"].includes(situacao)) {
    throw new Error("Situação gestacional inválida.");
  }

  return {
    ...(id ? { id } : {}),
    ubsId,
    microareaId,
    identificacao: {
      nome: stringValue(identificacao.nome, 160, false),
      dataNascimento: dateValue(identificacao.dataNascimento),
      cpf: stringValue(identificacao.cpf, 20),
      cns: stringValue(identificacao.cns, 24),
      telefoneCelular: stringValue(
        identificacao.telefoneCelular,
        32
      ),
      telefoneResidencial: stringValue(
        identificacao.telefoneResidencial,
        32
      ),
      telefoneContato: stringValue(
        identificacao.telefoneContato,
        32
      ),
      rua: stringValue(identificacao.rua, 180),
      numero: stringValue(identificacao.numero, 32),
      complemento: stringValue(identificacao.complemento, 120),
      bairro: stringValue(identificacao.bairro, 120),
      municipio: stringValue(identificacao.municipio, 120),
      uf: stringValue(identificacao.uf, 2).toUpperCase(),
      cep: stringValue(identificacao.cep, 16),
      sexo: stringValue(identificacao.sexo, 48),
      identidadeGenero: stringValue(
        identificacao.identidadeGenero,
        80
      ),
      racaCor: stringValue(identificacao.racaCor, 48),
      bolsaFamilia: boolOrNull(identificacao.bolsaFamilia),
      vigenciaBolsaFamilia: dateValue(
        identificacao.vigenciaBolsaFamilia
      ),
    },
    gestacao: {
      situacao,
      inicioPreNatal: dateValue(gestacao.inicioPreNatal),
      dum: dateValue(gestacao.dum),
      dpp: dateValue(gestacao.dpp),
      igSemanas: nullableNumber(gestacao.igSemanas, 0, 45),
      igDias: nullableNumber(gestacao.igDias, 0, 6),
      igEcografiaSemanas: nullableNumber(
        gestacao.igEcografiaSemanas,
        0,
        45
      ),
      igEcografiaDias: nullableNumber(
        gestacao.igEcografiaDias,
        0,
        6
      ),
      dppEcografia: dateValue(gestacao.dppEcografia),
      dataParto: dateValue(gestacao.dataParto),
      tipoParto: stringValue(gestacao.tipoParto, 80),
      pesoKg: nullableNumber(gestacao.pesoKg, 20, 400),
      alturaCm: nullableNumber(gestacao.alturaCm, 50, 250),
      pressaoArterial: stringValue(
        gestacao.pressaoArterial,
        32
      ),
      dataUltimaPressao: dateValue(
        gestacao.dataUltimaPressao
      ),
      dataUltimoPesoAltura: dateValue(
        gestacao.dataUltimoPesoAltura
      ),
      riscoGestacional: stringValue(
        gestacao.riscoGestacional,
        80
      ),
    },
    acompanhamento: {
      atendimentosPreNatal: nullableNumber(
        acompanhamento.atendimentosPreNatal,
        0,
        200
      ),
      atendimentosAte12Semanas: nullableNumber(
        acompanhamento.atendimentosAte12Semanas,
        0,
        200
      ),
      ultimaConsultaPreNatal: dateValue(
        acompanhamento.ultimaConsultaPreNatal
      ),
      atendimentosOdontologicos: nullableNumber(
        acompanhamento.atendimentosOdontologicos,
        0,
        200
      ),
      medicoesAlturaUterina: nullableNumber(
        acompanhamento.medicoesAlturaUterina,
        0,
        500
      ),
      medicoesPressao: nullableNumber(
        acompanhamento.medicoesPressao,
        0,
        500
      ),
      medicoesPesoAltura: nullableNumber(
        acompanhamento.medicoesPesoAltura,
        0,
        500
      ),
      visitasPreNatal: nullableNumber(
        acompanhamento.visitasPreNatal,
        0,
        500
      ),
      visitasPuerperio: nullableNumber(
        acompanhamento.visitasPuerperio,
        0,
        500
      ),
      atendimentosPuerperio: nullableNumber(
        acompanhamento.atendimentosPuerperio,
        0,
        500
      ),
      ultimaConsultaPuerperio: dateValue(
        acompanhamento.ultimaConsultaPuerperio
      ),
      diasUltimoAtendimentoMedico: nullableNumber(
        acompanhamento.diasUltimoAtendimentoMedico,
        0,
        5000
      ),
      diasUltimoAtendimentoEnfermagem: nullableNumber(
        acompanhamento.diasUltimoAtendimentoEnfermagem,
        0,
        5000
      ),
      diasUltimoAtendimentoOdontologico: nullableNumber(
        acompanhamento.diasUltimoAtendimentoOdontologico,
        0,
        5000
      ),
      diasUltimaVisita: nullableNumber(
        acompanhamento.diasUltimaVisita,
        0,
        5000
      ),
    },
    consultas: consultasRaw.map((entry) => {
      const item = objectValue(entry);
      return {
        data: dateValue(item.data),
        tipo: stringValue(item.tipo, 48),
        observacao: stringValue(item.observacao, 1000),
      };
    }),
    exames: examesRaw.map((entry) => {
      const item = objectValue(entry);
      const trimestre = nullableNumber(item.trimestre, 1, 3);
      return {
        codigo: stringValue(item.codigo, 80, false),
        nome: stringValue(item.nome, 160, false),
        trimestre: trimestre ?? 1,
        status: stringValue(item.status, 40),
        dataSolicitacao: dateValue(item.dataSolicitacao),
        dataRealizacao: dateValue(item.dataRealizacao),
        resultado: stringValue(item.resultado, 1000),
        observacao: stringValue(item.observacao, 1000),
      };
    }),
    vacinas: vacinasRaw.map((entry) => {
      const item = objectValue(entry);
      return {
        codigo: stringValue(item.codigo, 80, false),
        nome: stringValue(item.nome, 160, false),
        status: stringValue(item.status, 40),
        dose: stringValue(item.dose, 80),
        dataAplicacao: dateValue(item.dataAplicacao),
        lote: stringValue(item.lote, 120),
        unidadeAplicadora: stringValue(
          item.unidadeAplicadora,
          180
        ),
        observacao: stringValue(item.observacao, 1000),
      };
    }),
    alta: {
      ativa: alta.ativa === true,
      data: dateValue(alta.data),
      motivo: stringValue(alta.motivo, 160),
      situacaoFinal: stringValue(alta.situacaoFinal, 240),
      observacao: stringValue(alta.observacao, 1000),
    },
  };
}

export function sanitizeRiskPayload(
  raw: Record<string, unknown>
): JsonObject {
  const gestanteId =
    raw.gestanteId === null || raw.gestanteId === ""
      ? null
      : uuidValue(raw.gestanteId, true);

  const cadastroMinimoRaw =
    raw.cadastroMinimo === null
      ? null
      : objectValue(raw.cadastroMinimo);

  const items = Array.isArray(raw.itens)
    ? raw.itens.slice(0, 150).map((entry) => {
        const item = objectValue(entry);
        return {
          codigo: stringValue(item.codigo, 100, false),
          origem: stringValue(item.origem, 48),
          detalheOrigem: stringValue(
            item.detalheOrigem,
            500
          ),
          automatico: item.automatico === true,
        };
      })
    : [];

  const trimester = nullableNumber(raw.trimestre, 1, 3) ?? 1;
  const ubsAtendimentoId =
    raw.ubsAtendimentoId === null ||
    raw.ubsAtendimentoId === ""
      ? null
      : uuidValue(raw.ubsAtendimentoId, true);

  return {
    gestanteId,
    cadastroMinimo:
      gestanteId || !cadastroMinimoRaw
        ? null
        : {
            nome: stringValue(
              cadastroMinimoRaw.nome,
              160,
              false
            ),
            dataNascimento: dateValue(
              cadastroMinimoRaw.dataNascimento
            ),
            dum: dateValue(cadastroMinimoRaw.dum),
            igSemanas: nullableNumber(
              cadastroMinimoRaw.igSemanas,
              0,
              45
            ),
            igDias: nullableNumber(
              cadastroMinimoRaw.igDias,
              0,
              6
            ),
            pesoKg: nullableNumber(
              cadastroMinimoRaw.pesoKg,
              20,
              400
            ),
            alturaCm: nullableNumber(
              cadastroMinimoRaw.alturaCm,
              50,
              250
            ),
          },
    trimestre: trimester,
    pesoKg: nullableNumber(raw.pesoKg, 20, 400),
    alturaCm: nullableNumber(raw.alturaCm, 50, 250),
    ubsAtendimentoId,
    ubsAtendimentoExterna: stringValue(
      raw.ubsAtendimentoExterna,
      180
    ),
    observacao: stringValue(raw.observacao, 2000),
    itens: items,
  };
}
