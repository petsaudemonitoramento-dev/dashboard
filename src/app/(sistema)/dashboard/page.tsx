import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ProfessionalWorkspace,
  type FollowUp,
  type WorkPatient,
} from "@/components/home/professional-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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

export default async function DashboardPage(){
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

  const [{data:listData,error:listError},{data:taskData,error:taskError}]=await Promise.all([
    supabase.rpc("profissionais_listar_gestantes_v30",{p_exibir_identidade:true}),
    supabase.from("rotina_profissional_tarefas_v1")
      .select("id,gestante_id,tipo,status,data_prevista")
      .eq("profissional_id",user.id)
      .order("data_prevista",{ascending:true})
      .limit(200),
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

  return <ProfessionalWorkspace nome={profile.nome_completo??"profissional"}
    patients={patients} tasks={tasks}/>;
}
