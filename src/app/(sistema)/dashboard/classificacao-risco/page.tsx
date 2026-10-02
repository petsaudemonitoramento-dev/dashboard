import { redirect } from "next/navigation";
import { RiskClassificationForm } from "@/components/classificacao-risco/risk-classification-form";
import type {
  PrefilledFactor,
  RiskFactor,
  RiskPageData,
  RiskPatient,
} from "@/components/classificacao-risco/types";
import { getPostgresClient } from "@/lib/db/postgres";
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

  const sql = getPostgresClient();
  const profileRows = await sql<{
    id: string;
    nome: string;
    perfil: string;
    ubs_id: string | null;
    ubs_nome: string | null;
  }[]>`
    select
      p.id,
      p.nome_completo as nome,
      p.perfil::text as perfil,
      p.ubs_id,
      u.nome as ubs_nome
    from public.perfis p
    left join public.ubs u on u.id = p.ubs_id
    where p.id = ${user.id}::uuid
      and p.ativo = true
      and p.status = 'ativo'
      and p.perfil = 'equipe_ubs'::public.perfil_usuario
      and p.cadastro_completo = true
      and p.aprovacao_status = 'aprovado'
      and p.perfil_excluido_em is null
    limit 1
  `;

  const profile = profileRows[0];
  if (!profile || !profile.ubs_id || !profile.ubs_nome) redirect("/login");

  const ubsOptions = await sql<{ id: string; nome: string }[]>`
    select id, nome
    from public.ubs
    where ativa = true
    order by nome
  `;

  const factors = await sql<RiskFactor[]>`
    select
      codigo,
      grupo,
      grupo_titulo as "grupoTitulo",
      titulo,
      pontos,
      ordem,
      versao
    from public.config_fatores_risco_gestacional
    where ativo = true
      and versao = ${INSTRUMENT_VERSION}
    order by grupo_ordem, ordem
  `;

  let patient: RiskPatient | null = null;
  let extras: unknown = {};
  let previous: PrefilledFactor[] = [];

  if (gestanteIdValue) {
    const accessRows = await sql<{ autorizado: boolean }[]>`
      select exists (
        select 1
        from public.pec_gestantes g
        join public.perfis p on p.id = ${user.id}::uuid
        where g.id = ${gestanteIdValue}::uuid
          and g.excluida_em is null
          and p.ativo = true
          and p.status = 'ativo'
          and p.perfil = 'equipe_ubs'::public.perfil_usuario
          and g.ubs_id = p.ubs_id
          and g.profissional_responsavel_id = p.id
          and p.cadastro_completo = true
          and p.aprovacao_status = 'aprovado'
          and p.perfil_excluido_em is null
      ) as autorizado
    `;

    if (!accessRows[0]?.autorizado) {
      redirect("/dashboard/gestantes");
    }

    const recordRows = await sql<{ record: ClinicalRecord }[]>`
      select private.obter_gestante_clinica_v30(
        ${user.id}::uuid,
        ${gestanteIdValue}::uuid,
        true
      ) as record
    `;
    const record = recordRows[0]?.record;
    if (!record) redirect("/dashboard/gestantes");

    const dataNascimento = asIsoDate(record.identificacao?.dataNascimento);
    patient = {
      id: record.id,
      codigo: record.codigo,
      nome: record.identificacao?.nome || `Gestante ${record.codigo}`,
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

    const extrasRows = await sql<{ dados_extras: unknown }[]>`
      select dados_extras
      from public.pec_gestantes
      where id = ${record.id}::uuid
      limit 1
    `;
    extras = extrasRows[0]?.dados_extras ?? {};

    previous = await sql<PrefilledFactor[]>`
      select
        i.fator_codigo as codigo,
        'classificacao_anterior'::text as origem,
        concat(
          'Selecionado na classificação de ',
          to_char(c.realizada_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
          '.'
        ) as detalhe
      from public.classificacoes_risco_gestacional c
      join public.classificacao_risco_itens i
        on i.classificacao_id = c.id
      where c.gestante_id = ${record.id}::uuid
        and c.status = 'finalizada'
        and i.fator_codigo <> 'g2_imc'
        and c.id = (
          select c2.id
          from public.classificacoes_risco_gestacional c2
          where c2.gestante_id = ${record.id}::uuid
            and c2.status = 'finalizada'
          order by c2.realizada_em desc
          limit 1
        )
      order by i.grupo, i.pontos desc, i.fator_titulo
    `;
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
