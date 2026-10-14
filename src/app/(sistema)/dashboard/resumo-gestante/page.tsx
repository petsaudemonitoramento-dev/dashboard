import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/security/request";
import type { ClinicalRecord } from "@/components/cadastro-clinico/types";
import { evaluateC3Coverage } from "@/lib/c3/coverage";
import { PrintSummaryButton } from "@/components/cadastro-clinico/print-summary-button";
import styles from "./summary.module.css";

export const dynamic="force-dynamic";
export const revalidate=0;
export const fetchCache="force-no-store";

function value(v:string|number|null|undefined):string {
  if(v===null||v===undefined||v==="")return "Não informado";
  return String(v);
}
function date(v:string|null|undefined):string{
  if(!v)return "Não informado";
  const [y,m,d]=v.slice(0,10).split("-");
  return y&&m&&d?d+"/"+m+"/"+y:"Não informado";
}
function hasCompleted(e:{status:string}){
  return e.status==="realizado"||e.status==="resultado_alterado";
}
export default async function ClinicalBrief({searchParams}:{
  searchParams:Promise<{gestante?:string|string[]}>;
}){
 const params=await searchParams;
 const id=Array.isArray(params.gestante)?params.gestante[0]:params.gestante;
 if(!id||!isUuid(id))redirect("/dashboard/gestantes");
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)redirect("/login");
 const {data:profile}=await supabase.from("perfis")
   .select("perfil,status,ativo,cadastro_completo,aprovacao_status,perfil_excluido_em")
   .eq("id",user.id).maybeSingle();
 if(!profile||profile.perfil!=="equipe_ubs"||profile.status!=="ativo"||
    !profile.ativo||!profile.cadastro_completo||
    profile.aprovacao_status!=="aprovado"||profile.perfil_excluido_em)
   redirect("/aguardando-aprovacao");
 const {data,error}=await supabase.rpc("profissionais_obter_gestante_clinica_v30",{
   p_gestante_id:id,p_exibir_identidade:true,
 });
 if(error||!data)redirect("/dashboard/gestantes");
 const r=data as ClinicalRecord;
 const coverage=evaluateC3Coverage(r);
 const pendingExams=(r.exames??[]).filter(e=>!hasCompleted(e)&&e.status!=="nao_se_aplica");
 const completeVaccines=(r.vacinas??[]).filter(v=>v.status==="realizada");
 return <div className={styles.page}>
   <div className={styles.toolbar}>
     <Link href={"/dashboard/cadastro-clinico?gestante="+encodeURIComponent(id)}>← Voltar à ficha</Link>
     <PrintSummaryButton/>
   </div>
   <article className={styles.paper}>
     <header><span>MAE APS · RESUMO PARA ATENDIMENTO</span><strong>{r.ubsNome}</strong></header>
     <h1>{r.identificacao.nome||r.codigo||"Gestante"}</h1>
     <p className={styles.subtitle}>Código {value(r.codigo)} · Gerado a partir dos registros disponíveis.
       Não substitui o prontuário oficial.</p>
     <div className={styles.stats}>
       <div><span>Situação</span><strong>{r.gestacao.situacao==="puerperio"?"Puerpério":"Gestação em curso"}</strong></div>
       <div><span>Risco registrado</span><strong>{value(r.gestacao.riscoGestacional)}</strong></div>
       <div><span>DPP informada</span><strong>{date(r.gestacao.dpp)}</strong></div>
       <div><span>Última consulta</span><strong>{date(r.acompanhamento.ultimaConsultaPreNatal)}</strong></div>
     </div>
     <div className={styles.grid}>
       <section><h2>Acompanhamento</h2>
         <p>Consultas pré-natais: <b>{value(r.acompanhamento.atendimentosPreNatal)}</b></p>
         <p>Consultas até 12 semanas: <b>{value(r.acompanhamento.atendimentosAte12Semanas)}</b></p>
         <p>Aferições PA: <b>{value(r.acompanhamento.medicoesPressao)}</b></p>
         <p>Peso + altura: <b>{value(r.acompanhamento.medicoesPesoAltura)}</b></p>
         <p>Visitas pré-natais: <b>{value(r.acompanhamento.visitasPreNatal)}</b></p>
         <p>Atendimentos no puerpério: <b>{value(r.acompanhamento.atendimentosPuerperio)}</b></p>
       </section>
       <section><h2>Para conferir</h2>
         <p><b>{pendingExams.length}</b> exames sem confirmação final nesta ficha.</p>
         <p><b>{completeVaccines.length}</b> vacina(s) registradas como realizadas.</p>
         <p><b>{coverage.semInformacao}</b> práticas C3 sem informação relacionada.</p>
         <p>Registrar e conferir não equivale a cumprimento oficial do C3.</p>
       </section>
     </div>
     <section className={styles.c3}><h2>C3 · Situação documental das 11 práticas</h2>
       <ul>{coverage.itens.map(item=><li key={item.codigo}>
         <span>{item.codigo} · {item.titulo}</span>
         <strong>{item.haRegistroRelacionado?"Conferir evidência":"Sem registro relacionado"}</strong>
       </li>)}</ul>
     </section>
     <footer>
       Resumo gerado exclusivamente para a profissional autorizada. Contagens do PEC podem não indicar
       datas, procedimentos e profissionais necessários para comprovar o indicador.
       Mantenha o documento sob guarda apropriada, conforme as regras da instituição.
     </footer>
   </article>
 </div>;
}
