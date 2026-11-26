import { redirect } from "next/navigation";
import { workspaceToday } from "@/lib/workspace-date";
import { isUuid } from "@/lib/security/request";
import CadastroClinicoPage from "../cadastro-clinico/page";
import ClassificacaoRiscoPage from "../classificacao-risco/page";
import { ClinicalDrawer } from "@/components/gestantes/clinical-drawer";
import { GestantesGrid } from "@/components/gestantes/gestantes-grid";
import type { GestanteCardData } from "@/components/gestantes/gestantes-grid";
import { createClient } from "@/lib/supabase/server";
import { logServerFailure } from "@/lib/security/request";

type PageProps = {
  searchParams: Promise<{
    modo?: string | string[];
    editar?: string | string[];
    risco?: string | string[];
    aba?: string | string[];
  }>;
};

type DatabaseRow = {
  gestante_id: string;
  codigo: string;
  nome_visual: string;
  ubs_nome: string;
  microarea_codigo: string | null;
  idade_anos: number | null;
  risco_gestacional: string | null;
  ig_semanas: number | null;
  ig_dias: number | null;
  dpp: string | Date | null;
  atendimentos_pre_natal: number | null;
  atendimentos_ate_12_semanas: number | null;
  ultima_consulta_pre_natal: string | Date | null;
  atendimentos_odontologicos: number | null;
  dtpa: string | null;
  pressao_arterial: string | null;
  peso_kg: number | string | null;
  altura_cm: number | string | null;
  visitas_pre_natal: number | null;
  dias_ultima_visita: number | null;
  exame_hiv_primeiro: string | null;
  exame_sifilis_primeiro: string | null;
  exame_hepatite_b_primeiro: string | null;
  exame_hepatite_c_primeiro: string | null;
  exame_hiv_terceiro: string | null;
  exame_sifilis_terceiro: string | null;
  observacao: string | null;
  alta_ativa: boolean;
  alta_data: string | Date | null;
  alta_motivo: string | null;
  pendencias_count: number;
  atualizado_em: string | Date;
};

function dateToIso(value: string | Date | null): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function dateTimeToIso(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default async function GestantesPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const modeValue = Array.isArray(params.modo)
    ? params.modo[0]
    : params.modo;
  const presentationMode = modeValue === "apresentacao";
  const editId=typeof params.editar==="string"&&isUuid(params.editar)?params.editar:null;
  const riskId=typeof params.risco==="string"&&isUuid(params.risco)?params.risco:null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("perfis")
    .select("perfil, status, ativo, cadastro_completo, aprovacao_status, perfil_excluido_em")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    profile.perfil !== "equipe_ubs" ||
    !profile.ativo ||
    profile.status !== "ativo" ||
    profile.cadastro_completo !== true ||
    profile.aprovacao_status !== "aprovado" ||
    profile.perfil_excluido_em
  ) {
    redirect("/aguardando-aprovacao");
  }

  const canShowIdentity = true;
  const identifiedView = canShowIdentity && !presentationMode;

  let gestantes: GestanteCardData[] = [];
  let loadError: string | null = null;

  try {
      const { data, error } = await supabase.rpc(
        "profissionais_listar_gestantes_v30",
        { p_exibir_identidade: identifiedView }
      );

      if (error) {
        throw error;
      }

      const rows = (data ?? []) as DatabaseRow[];
      const {data:planned,error:plannedError}=await supabase.from("rotina_profissional_tarefas_v1").select("gestante_id,data_prevista").eq("profissional_id",user.id).eq("tipo","consulta").neq("status","concluida").gte("data_prevista",workspaceToday()).order("data_prevista",{ascending:true}).limit(500);
      const nextById=new Map<string,string>();
      for(const task of planned??[])if(!nextById.has(task.gestante_id))nextById.set(task.gestante_id,task.data_prevista);
gestantes = rows.map((row) => ({
        id: row.gestante_id,
        codigo: row.codigo,
        nomeVisual: row.nome_visual,
        ubsNome: row.ubs_nome,
        microarea: row.microarea_codigo,
        idadeAnos: row.idade_anos,
        risco: row.risco_gestacional,
        igSemanas: row.ig_semanas,
        igDias: row.ig_dias,
        dpp: dateToIso(row.dpp),
        consultas: row.atendimentos_pre_natal,
        consultasAte12Semanas: row.atendimentos_ate_12_semanas,
        ultimaConsulta: dateToIso(row.ultima_consulta_pre_natal),
        atendimentosOdontologicos: row.atendimentos_odontologicos,
        dtpa: row.dtpa,
        pressaoArterial: row.pressao_arterial,
        pesoKg: numberOrNull(row.peso_kg),
        alturaCm: numberOrNull(row.altura_cm),
        visitasPreNatal: row.visitas_pre_natal,
        diasUltimaVisita: row.dias_ultima_visita,
        exames: {
          hivPrimeiro: row.exame_hiv_primeiro,
          sifilisPrimeiro: row.exame_sifilis_primeiro,
          hepatiteBPrimeiro: row.exame_hepatite_b_primeiro,
          hepatiteCPrimeiro: row.exame_hepatite_c_primeiro,
          hivTerceiro: row.exame_hiv_terceiro,
          sifilisTerceiro: row.exame_sifilis_terceiro,
        },
        observacao: row.observacao,
        altaAtiva: row.alta_ativa,
        altaData: dateToIso(row.alta_data),
        altaMotivo: row.alta_motivo,
        pendencias: Number(row.pendencias_count ?? 0),
        atualizadoEm: dateTimeToIso(row.atualizado_em),
        proximoAtendimento: presentationMode?null:nextById.get(row.gestante_id)??null,
        agendaConsultada: !presentationMode&&!plannedError&&(planned?.length??0)<500,
      }));
  } catch (error) {
      logServerFailure("gestantes-page-load", error);
      loadError = "Não foi possível carregar as fichas neste momento.";
  }

  if (loadError) {
    return (
      <>
        <section className="heading">
          <p>GESTÁRIO APS · ACOMPANHAMENTO</p>
          <h1>Minhas gestantes</h1>
          <span>{loadError}</span>
        </section>
        <div className="pec-error">{loadError}</div>
      </>
    );
  }

return (
    <>
      <section className="heading">
        <p>GESTÁRIO APS · ACOMPANHAMENTO</p>
        <h1>Minhas gestantes</h1>
        <span>
          Acompanhe cada ficha com os dados essenciais à vista, sem precisar abrir várias telas.
        </span>
      </section>

      <GestantesGrid
        gestantes={gestantes}
        presentationMode={presentationMode || !canShowIdentity}
        canShowIdentity={canShowIdentity}
      />
      {!presentationMode&&(editId||riskId)&&<ClinicalDrawer title={editId?"Atualizar acompanhamento":"Classificação de risco"} key={editId??riskId}>
        {editId?<CadastroClinicoPage searchParams={Promise.resolve({gestante:editId,aba:params.aba})}/>:<ClassificacaoRiscoPage searchParams={Promise.resolve({gestante:riskId??undefined})}/>}
      </ClinicalDrawer>}
    </>
  );
}
