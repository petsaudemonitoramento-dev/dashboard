export const PROFESSIONAL_POSITIONS = ["medico", "enfermeiro"] as const;
export type ProfessionalPosition = (typeof PROFESSIONAL_POSITIONS)[number];

export type ProfessionalCouncil = "CRM" | "COREN";
export type ProfessionalCategory = "MEDICO" | "ENFERMEIRO";

export type ProfessionalCredentialInput = {
  cargoFuncao: ProfessionalPosition;
  conselho: ProfessionalCouncil;
  uf: string;
  numeroRegistro: string;
  categoria: ProfessionalCategory;
};

export const BRAZILIAN_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

const BRAZILIAN_STATE_SET = new Set<string>(BRAZILIAN_STATES);

export function credentialForPosition(position: ProfessionalPosition): {
  conselho: ProfessionalCouncil;
  categoria: ProfessionalCategory;
} {
  return position === "medico"
    ? { conselho: "CRM", categoria: "MEDICO" }
    : { conselho: "COREN", categoria: "ENFERMEIRO" };
}

export function parseProfessionalCredential(
  body: Record<string, unknown>,
  requestedProfile: string
): ProfessionalCredentialInput | null {
  if (requestedProfile !== "equipe_ubs") return null;

  const cargoFuncao = String(body.cargoFuncao ?? "")
    .trim()
    .toLowerCase();
  const uf = String(body.conselhoUf ?? "").trim().toUpperCase();
  const numeroRegistro = String(body.numeroRegistro ?? "").replace(/\D/g, "");

  if (!PROFESSIONAL_POSITIONS.includes(cargoFuncao as ProfessionalPosition)) {
    throw new Error("A equipe UBS aceita somente médico ou enfermeiro.");
  }

  if (!BRAZILIAN_STATE_SET.has(uf)) {
    throw new Error("Informe uma UF válida para o conselho profissional.");
  }

  if (!/^\d{3,15}$/.test(numeroRegistro)) {
    throw new Error("Informe um número de registro profissional válido.");
  }

  const position = cargoFuncao as ProfessionalPosition;
  const expected = credentialForPosition(position);
  const suppliedCouncil = String(body.conselho ?? "")
    .trim()
    .toUpperCase();
  const suppliedCategory = String(body.categoriaConselho ?? "")
    .trim()
    .toUpperCase();

  if (
    suppliedCouncil !== expected.conselho ||
    suppliedCategory !== expected.categoria
  ) {
    throw new Error("O conselho informado não corresponde à função solicitada.");
  }

  return {
    cargoFuncao: position,
    conselho: expected.conselho,
    uf,
    numeroRegistro,
    categoria: expected.categoria,
  };
}
