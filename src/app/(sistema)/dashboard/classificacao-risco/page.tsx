import { redirect } from "next/navigation";
import { RiskClassificationForm } from "@/components/classificacao-risco/risk-classification-form";
import type {
  PrefilledFactor,
  RiskFactor,
  RiskPageData,
  RiskPatient,
} from "@/components/classificacao-risco/types";
import { isUuid } from "@/lib/security/request";
import { createClient } from "@/lib/supabase/server";

const INSTRUMENT_VERSION =
  "SES-PB — Instrumento de Classificação de Risco Gestacional na APS — outubro de 2024";

type PageProps = {
  searchParams: Promise<{
    gestante?: string | string[];
  }>;
};

type ClinicalRecord = {
  id: string;
  codigo: string;
  ubsId: string;
  ubsNome: string;
  microareaCodigo?: string | null;
  identificacao: {
    nome?: string;
    dataNascimento?: string;
    racaCor?: string;
  };
  gestacao: {
    dum?: string;
    dpp?: string;
    igSemanas?: number | null;
    igDias?: number | null;
    pesoKg?: number | string | null;
    alturaCm?: number | string | null;
  };
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function asIsoDate(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ageFromBirthDate(value: string): number | null {
  if (!value) return null;
  const birth = new Date(`${value}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function buildPrefill(
  patient: RiskPatient | null,
  extras: unknown,
  previous: PrefilledFactor[]
): PrefilledFactor[] {
  const result = new Map<string, PrefilledFactor>();
  const add = (item: PrefilledFactor) => {
    if (!result.has(item.codigo)) result.set(item.codigo, item);
  };

  previous.forEach(add);

  if (!patient) return [...result.values()];

  const age = patient.idadeAnos ?? ageFromBirthDate(patient.dataNascimento);
  if (age !== null && age <= 15) {
    add({ codigo: "g1_idade_15", origem: "calculado", detalhe: `Idade calculada: ${age} anos.` });
  }
  if (age !== null && age >= 40) {
    add({ codigo: "g1_idade_40", origem: "calculado", detalhe: `Idade calculada: ${age} anos.` });
  }

  const race = normalize(patient.racaCor);
  if (race === "preta" || race === "negra") {
    add({ codigo: "g1_raca_negra", origem: "cadastro_clinico", detalhe: `Raça/cor registrada: ${patient.racaCor}.` });
  }

  const explicitText = normalize(JSON.stringify(extras ?? {}));
  const mappings: Array<[string, string[], string]> = [
    ["g1_tabagista", ["tabagista ativo", "tabagismo referido"], "Tabagismo explicitamente registrado."],
    ["g3_aids_hiv", ["aids/hiv", "hiv reagente em acompanhamento", "diagnostico de hiv"], "HIV explicitamente registrado em campo clínico."],
    ["g3_hepatites", ["hepatite b em acompanhamento", "hepatites encaminhar ao infectologista"], "Hepatite explicitamente registrada em campo clínico."],
    ["g4_pre_eclampsia", ["historico de pre-eclampsia", "pre-eclampsia em gestacao anterior"], "Antecedente de pré-eclâmpsia explicitamente registrado."],
    ["g5_diabetes_gestacional", ["diabetes mellitus gestacional", "diabetes gestacional"], "Diabetes gestacional explicitamente registrada."],
    ["g5_gemelar", ["gestacao gemelar", "gestação gemelar"], "Gestação gemelar explicitamente registrada."],
    ["g5_itu_repeticao", ["infeccao urinaria de repeticao", "itu de repeticao"], "Infecção urinária de repetição explicitamente registrada."],
  ];

  for (const [codigo, terms, detalhe] of mappings) {
    if (terms.some((term) => explicitText.includes(normalize(term)))) {
      add({ codigo, origem: "pec", detalhe });
    }
  }

  return [...result.values()];
}

export default async function ClassificacaoRiscoPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const gestanteIdValue = Array.isArray(params.gestante)
    ? params.gestante[0]
    : params.gestante;

  if (gestanteIdValue && !isUuid(gestanteIdValue)) {
    redirect("/dashboard/gestantes");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData, error: profileError } =
    await supabase
      .from("perfis")
      .select(
        "id, nome_completo, perfil, ubs_id, status, ativo, cadastro_completo, aprovacao_status, perfil_excluido_em"
      )
      .eq("id", user.id)
      .maybeSingle();

  if (
    profileError ||
    !profileData ||
    profileData.perfil !== "equipe_ubs" ||
    !profileData.ubs_id ||
    profileData.status !== "ativo" ||
    !profileData.ativo ||
    profileData.cadastro_completo !== true ||
    profileData.aprovacao_status !== "aprovado" ||
    profileData.perfil_excluido_em
  ) {
    redirect("/aguardando-aprovacao");
  }

  const [
    { data: ubsData, error: ubsError },
    { data: factorData, error: factorError },
    { data: profileUbsData, error: profileUbsError },
  ] = await Promise.all([
    supabase
      .from("ubs")
      .select("id, nome")
      .eq("ativa", true)
      .order("nome"),
    supabase
      .from("config_fatores_risco_gestacional")
      .select(
        "codigo, grupo, grupo_titulo, titulo, pontos, ordem, versao, grupo_ordem"
      )
      .eq("ativo", true)
      .eq("versao", INSTRUMENT_VERSION)
      .order("grupo_ordem")
      .order("ordem"),
    supabase
      .from("ubs")
      .select("nome")
      .eq("id", profileData.ubs_id)
      .maybeSingle(),
  ]);

  if (ubsError || factorError || profileUbsError || !profileUbsData) {
    throw ubsError ?? factorError ?? profileUbsError ??
      new Error("UBS do profissional não encontrada.");
  }

  const profile = {
    id: profileData.id,
    nome: profileData.nome_completo,
    perfil: String(profileData.perfil),
    ubs_id: profileData.ubs_id,
    ubs_nome: profileUbsData.nome,
  };

  const ubsOptions = (ubsData ?? []).map((row) => ({
    id: row.id,
    nome: row.nome,
  }));

  const factors: RiskFactor[] = (factorData ?? []).map((row) => ({
    codigo: row.codigo,
    grupo: row.grupo as RiskFactor["grupo"],
    grupoTitulo: row.grupo_titulo,
    titulo: row.titulo,
    pontos: row.pontos,
    ordem: row.ordem,
    versao: row.versao,
  }));

  let patient: RiskPatient | null = null;
  let extras: unknown = {};
  let previous: PrefilledFactor[] = [];

  if (gestanteIdValue) {
    const { data: recordData, error: recordError } =
      await supabase.rpc(
        "profissionais_obter_gestante_clinica_v30",
        {
          p_gestante_id: gestanteIdValue,
          p_exibir_identidade: true,
        }
      );

    if (recordError || !recordData) {
      redirect("/dashboard/gestantes");
    }

    const record = recordData as ClinicalRecord;
    const dataNascimento = asIsoDate(
      record.identificacao?.dataNascimento
    );

    patient = {
      id: record.id,
      codigo: record.codigo,
      nome:
        record.identificacao?.nome ||
        `Gestante ${record.codigo}`,
      dataNascimento,
      idadeAnos: ageFromBirthDate(dataNascimento),
      racaCor: record.identificacao?.racaCor ?? "",
      ubsId: record.ubsId,
      ubsNome: record.ubsNome,
      microarea: record.microareaCodigo ?? null,
      igSemanas: numberOrNull(record.gestacao?.igSemanas),
      igDias: numberOrNull(record.gestacao?.igDias),
      dum: asIsoDate(record.gestacao?.dum),
      dpp: asIsoDate(record.gestacao?.dpp),
      pesoKg: numberOrNull(record.gestacao?.pesoKg),
      alturaCm: numberOrNull(record.gestacao?.alturaCm),
    };

    const { data: extrasRow } = await supabase
      .from("pec_gestantes")
      .select("dados_extras")
      .eq("id", record.id)
      .maybeSingle();

    extras = extrasRow?.dados_extras ?? {};

    const { data: latestClassification } = await supabase
      .from("classificacoes_risco_gestacional")
      .select("id, realizada_em")
      .eq("gestante_id", record.id)
      .eq("status", "finalizada")
      .order("realizada_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestClassification) {
      const { data: previousItems, error: previousError } =
        await supabase
          .from("classificacao_risco_itens")
          .select("fator_codigo, grupo, pontos, fator_titulo")
          .eq(
            "classificacao_id",
            latestClassification.id
          )
          .neq("fator_codigo", "g2_imc")
          .order("grupo")
          .order("pontos", { ascending: false })
          .order("fator_titulo");

      if (previousError) {
        throw previousError;
      }

      const detailDate = new Intl.DateTimeFormat(
        "pt-BR",
        {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "America/Sao_Paulo",
        }
      ).format(new Date(latestClassification.realizada_em));

      previous = (previousItems ?? []).map((item) => ({
        codigo: item.fator_codigo,
        origem: "classificacao_anterior",
        detalhe:
          `Selecionado na classificação de ${detailDate}.`,
      }));
    }
  }

  const pageData: RiskPageData = {
    patient,
    professional: {
      id: profile.id,
      nome: profile.nome,
      perfil: profile.perfil,
      ubsId: profile.ubs_id,
      ubsNome: profile.ubs_nome,
    },
    ubsOptions,
    factors,
    prefilled: buildPrefill(patient, extras, previous),
    instrumentVersion: INSTRUMENT_VERSION,
  };

  return (
    <>
      <section className="heading">
        <p>PET-Saúde UFCG</p>
        <h1>Classificação de risco gestacional</h1>
        <span>Instrumento oficial da Paraíba — versão outubro de 2024.</span>
      </section>
      <RiskClassificationForm data={pageData} />
    </>
  );
}
