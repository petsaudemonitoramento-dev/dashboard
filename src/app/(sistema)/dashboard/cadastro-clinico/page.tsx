import { redirect } from "next/navigation";
import { ClinicalForm } from "@/components/cadastro-clinico/clinical-form";
import type {
  ClinicalRecord,
  ExamConfig,
  MicroareaOption,
  UbsOption,
  VaccineConfig,
} from "@/components/cadastro-clinico/types";
import { isUuid } from "@/lib/security/request";
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
  status: string;
  ativo: boolean;
  cadastro_completo: boolean;
  aprovacao_status: string;
  perfil_excluido_em: string | null;
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

  if (gestanteId && !isUuid(gestanteId)) {
    redirect("/dashboard/gestantes");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileData, error: profileError } = await supabase
    .from("perfis")
    .select("nome_completo, perfil, ubs_id, status, ativo, cadastro_completo, aprovacao_status, perfil_excluido_em")
    .eq("id", user.id)
    .single();

  const profile = profileData as ProfileRow | null;

  if (
    profileError ||
    !profile ||
    profile.perfil !== "equipe_ubs" ||
    profile.status !== "ativo" ||
    !profile.ativo ||
    profile.cadastro_completo !== true ||
    profile.aprovacao_status !== "aprovado" ||
    profile.perfil_excluido_em
  ) {
    redirect("/aguardando-aprovacao");
  }

  const { data: ubsData, error: ubsError } =
    await supabase
      .from("ubs")
      .select("id, nome")
      .eq("ativa", true)
      .order("nome");

  if (ubsError) {
    throw ubsError;
  }

  const ubsRows = (ubsData ?? []) as UbsRow[];
  const ubsOptions: UbsOption[] = ubsRows.map((row) => ({
    id: row.id,
    nome: row.nome,
  }));

  const profileUbs = profile.ubs_id
    ? ubsOptions.find((item) => item.id === profile.ubs_id) ?? null
    : null;

  let record: ClinicalRecord;

  if (gestanteId) {
    const { data: recordData, error: recordError } =
      await supabase.rpc(
        "profissionais_obter_gestante_clinica_v30",
        {
          p_gestante_id: gestanteId,
          p_exibir_identidade: true,
        }
      );

    if (recordError || !recordData) {
      redirect("/dashboard/gestantes");
    }

    record = recordData as ClinicalRecord;
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

  const [
    { data: microareaData, error: microareaError },
    { data: examData, error: examError },
    { data: vaccineData, error: vaccineError },
  ] = await Promise.all([
    selectedUbsId
      ? supabase
          .from("microareas")
          .select("id, codigo")
          .eq("ubs_id", selectedUbsId)
          .eq("ativa", true)
          .order("codigo")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("config_exames_pre_natal")
      .select(
        "codigo, nome, trimestre, semana_inicio, semana_fim, condicao_aplicacao, ordem, versao_referencia"
      )
      .eq("ativo", true)
      .order("trimestre")
      .order("ordem")
      .order("nome"),
    supabase
      .from("config_vacinas_gestante")
      .select(
        "codigo, nome, semana_inicio, semana_fim, condicao_aplicacao, ordem, versao_referencia"
      )
      .eq("ativo", true)
      .order("ordem")
      .order("nome"),
  ]);

  if (microareaError || examError || vaccineError) {
    throw microareaError ?? examError ?? vaccineError;
  }

  const microareaRows = (microareaData ?? []) as MicroareaRow[];
  const examRows = (examData ?? []) as ExamConfigRow[];
  const vaccineRows = (vaccineData ?? []) as VaccineConfigRow[];

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
