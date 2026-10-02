import { redirect } from "next/navigation";
import { ClinicalForm } from "@/components/cadastro-clinico/clinical-form";
import type {
  ClinicalRecord,
  ExamConfig,
  MicroareaOption,
  UbsOption,
  VaccineConfig,
} from "@/components/cadastro-clinico/types";
import { getPostgresClient } from "@/lib/db/postgres";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{
    gestante?: string | string[];
  }>;
};

type ProfileRow = {
  nome_completo: string;
  perfil: string;
  ubs_id: string | null;
};

type UbsRow = {
  id: string;
  nome: string;
};

type MicroareaRow = {
  id: string;
  codigo: string;
};

type ExamConfigRow = {
  codigo: string;
  nome: string;
  trimestre: number;
  semana_inicio: number | null;
  semana_fim: number | null;
  condicao_aplicacao: string | null;
  ordem: number;
  versao_referencia: string;
};

type VaccineConfigRow = {
  codigo: string;
  nome: string;
  semana_inicio: number | null;
  semana_fim: number | null;
  condicao_aplicacao: string | null;
  ordem: number;
  versao_referencia: string;
};

function emptyRecord(ubsId: string, ubsName: string): ClinicalRecord {
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

function firstParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CadastroClinicoPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const gestanteId = firstParam(params.gestante);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileData, error: profileError } = await supabase
    .from("perfis")
    .select("nome_completo, perfil, ubs_id")
    .eq("id", user.id)
    .single();

  const profile = profileData as ProfileRow | null;

  if (profileError || !profile) {
    redirect("/login");
  }

  const sql = getPostgresClient();

  const ubsRows = await sql<UbsRow[]>`
    select id, nome
    from public.ubs
    where ativa = true
    order by nome
  `;

  const ubsOptions: UbsOption[] = ubsRows.map((row) => ({
    id: row.id,
    nome: row.nome,
  }));

  const profileUbs = profile.ubs_id
    ? ubsOptions.find((item) => item.id === profile.ubs_id) ?? null
    : null;

  let record: ClinicalRecord;

  if (gestanteId) {
    const accessRows = await sql<{ autorizado: boolean }[]>`
      select exists (
        select 1
        from public.pec_gestantes g
        join public.perfis p on p.id = ${user.id}::uuid
        where g.id = ${gestanteId}::uuid
          and g.excluida_em is null
          and p.ativo = true
          and p.status = 'ativo'
          and (
            p.perfil = 'administrador'
            or (
              g.ubs_id = p.ubs_id
              and g.profissional_responsavel_id = p.id
            )
          )
      ) as autorizado
    `;

    if (!accessRows[0]?.autorizado) {
      redirect("/dashboard/gestantes");
    }

    const rows = await sql<{ dados: ClinicalRecord }[]>`
      select private.obter_gestante_clinica_v30(
        ${user.id}::uuid,
        ${gestanteId}::uuid,
        true
      ) as dados
    `;

    if (!rows[0]?.dados) {
      redirect("/dashboard/gestantes");
    }

    record = rows[0].dados;
  } else {
    if (!profile.ubs_id || !profileUbs) {
      return (
        <>
          <section className="heading">
            <p>PET-Saúde UFCG</p>
            <h1>Cadastro clínico</h1>
            <span>Cadastro manual e acompanhamento das gestantes.</span>
          </section>

          <div className="pec-error">
            Seu perfil não possui uma UBS vinculada. Faça o vínculo antes
            de cadastrar uma nova gestante.
          </div>
        </>
      );
    }

    record = emptyRecord(profile.ubs_id, profileUbs.nome);
  }

  const selectedUbsId = record.ubsId || profile.ubs_id;

  const microareaRows = selectedUbsId
    ? await sql<MicroareaRow[]>`
        select id, codigo
        from public.microareas
        where ubs_id = ${selectedUbsId}::uuid
          and ativa = true
        order by codigo
      `
    : [];

  const examRows = await sql<ExamConfigRow[]>`
    select
      codigo,
      nome,
      trimestre,
      semana_inicio,
      semana_fim,
      condicao_aplicacao,
      ordem,
      versao_referencia
    from public.config_exames_pre_natal
    where ativo = true
    order by trimestre, ordem, nome
  `;

  const vaccineRows = await sql<VaccineConfigRow[]>`
    select
      codigo,
      nome,
      semana_inicio,
      semana_fim,
      condicao_aplicacao,
      ordem,
      versao_referencia
    from public.config_vacinas_gestante
    where ativo = true
    order by ordem, nome
  `;

  const examConfigs: ExamConfig[] = examRows.map((row) => ({
    codigo: row.codigo,
    nome: row.nome,
    trimestre: row.trimestre as 1 | 2 | 3,
    semanaInicio: row.semana_inicio,
    semanaFim: row.semana_fim,
    condicaoAplicacao: row.condicao_aplicacao,
    ordem: row.ordem,
    versaoReferencia: row.versao_referencia,
  }));

  const vaccineConfigs: VaccineConfig[] = vaccineRows.map((row) => ({
    codigo: row.codigo,
    nome: row.nome,
    semanaInicio: row.semana_inicio,
    semanaFim: row.semana_fim,
    condicaoAplicacao: row.condicao_aplicacao,
    ordem: row.ordem,
    versaoReferencia: row.versao_referencia,
  }));

  const microareas: MicroareaOption[] = microareaRows.map((row) => ({
    id: row.id,
    codigo: row.codigo,
  }));

  return (
    <>
      <section className="heading">
        <p>PET-Saúde UFCG</p>
        <h1>
          {record.id
            ? "Atualizar acompanhamento"
            : "Cadastro clínico manual"}
        </h1>
        <span>
          {record.id
            ? "Complete ou corrija os dados importados do PEC sem criar uma nova gestante."
            : "Cadastre uma gestante quando não houver importação disponível."}
        </span>
      </section>

      <ClinicalForm
        data={{
          record,
          examConfigs,
          vaccineConfigs,
          microareas,
          ubsOptions,
          professional: {
            id: user.id,
            nome: profile.nome_completo,
            perfil: String(profile.perfil),
            ubsId: profile.ubs_id,
            ubsNome: profileUbs?.nome ?? null,
          },
        }}
      />
    </>
  );
}
