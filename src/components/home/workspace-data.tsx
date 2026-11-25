import { redirect } from "next/navigation";
import { workspaceToday } from "@/lib/workspace-date";
import { createClient } from "@/lib/supabase/server";
import {
  ProfessionalWorkspace,
  type FollowUp,
  type WorkPatient,
} from "@/components/home/professional-workspace";


type HomeRow = {
  gestante_id:string;
  codigo:string;
  nome_visual:string;
  risco_gestacional:string|null;
  pendencias_count:number;
  dias_ultima_visita:number|null;
  atendimentos_pre_natal:number|null;
  ultima_consulta_pre_natal:string|null;
  dpp:string|null;
  alta_ativa:boolean;
};

export async function WorkspaceData({agendaOnly=false}:{agendaOnly?:boolean}={}){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const {data:profile}=await supabase.from("perfis")
    .select("nome_completo,perfil,status,ativo,cadastro_completo,aprovacao_status,perfil_excluido_em")
    .eq("id",user.id).maybeSingle();
  if(profile?.perfil==="administrador"&&profile.status==="ativo"&&
    profile.ativo&&profile.cadastro_completo===true&&
    profile.aprovacao_status==="aprovado"&&!profile.perfil_excluido_em)
      redirect("/dashboard/autorizacoes");
  if(!profile||profile.perfil!=="equipe_ubs"||profile.status!=="ativo"||
    !profile.ativo||!profile.cadastro_completo||
    profile.aprovacao_status!=="aprovado"||profile.perfil_excluido_em)
      redirect("/aguardando-aprovacao");

  const day=workspaceToday();
  const monthStart=day.slice(0,7)+"-01";
  const [year,month]=day.split("-").map(Number);
  const nextMonth=`${month===12?year+1:year}-${String(month===12?1:month+1).padStart(2,"0")}-01`;
  let taskQuery=supabase.from("rotina_profissional_tarefas_v1")
    .select("id,gestante_id,tipo,status,data_prevista").eq("profissional_id",user.id);
  if(!agendaOnly)taskQuery=taskQuery.or(`data_prevista.gte.${day},status.neq.concluida`);
  const [{data:listData,error:listError},{data:taskData,error:taskError},monthly,todayCount,completedCount]=await Promise.all([
    supabase.rpc("profissionais_listar_gestantes_v30",{p_exibir_identidade:true}),
    taskQuery.order("data_prevista",{ascending:true}).limit(200),
    agendaOnly?Promise.resolve({count:null,error:null}):supabase.from("gestante_consultas")
      .select("id",{count:"exact",head:true}).eq("profissional_id",user.id).gte("data_atendimento",monthStart).lt("data_atendimento",nextMonth),
    agendaOnly?Promise.resolve({count:null,error:null}):supabase.from("rotina_profissional_tarefas_v1")
      .select("id",{count:"exact",head:true}).eq("profissional_id",user.id).eq("data_prevista",day),
    agendaOnly?Promise.resolve({count:null,error:null}):supabase.from("rotina_profissional_tarefas_v1")
      .select("id",{count:"exact",head:true}).eq("profissional_id",user.id).eq("data_prevista",day).eq("status","concluida"),
  ]);
  if(listError)throw listError;
  if(taskError)throw taskError;

  const patients:WorkPatient[]=((listData??[]) as HomeRow[])
    .filter(p=>!p.alta_ativa)
    .map(p=>({
      id:p.gestante_id,codigo:p.codigo,
      nome:p.nome_visual,
      altoRisco:(p.risco_gestacional??"").toLowerCase().includes("alto"),
      pendenciasExames:Number(p.pendencias_count??0),
      diasUltimaVisita:p.dias_ultima_visita,
      consultas:p.atendimentos_pre_natal,
      ultimaConsulta:p.ultima_consulta_pre_natal,
      dpp:p.dpp,
      emPuerperio:false,
    }));
  const patientSet=new Set(patients.map(x=>x.id));
  const tasks=((taskData??[]) as FollowUp[]).filter(t=>patientSet.has(t.gestante_id));

  return <ProfessionalWorkspace nome={profile.nome_completo??"profissional"} accountId={user.id}
    patients={patients} tasks={tasks} monthlyVisits={monthly.error?null:monthly.count}
    todayTotal={todayCount.error?null:todayCount.count} todayCompleted={completedCount.error?null:completedCount.count}
    agendaOnly={agendaOnly}/>;
}
