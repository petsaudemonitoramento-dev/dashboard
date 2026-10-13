"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Activity, ArrowRight, Baby, CalendarClock, CheckCircle2,
  ClipboardList, FilePlus2, HeartPulse, RefreshCw, Search, Stethoscope,
  FileSpreadsheet, RotateCcw, Trash2, Plus, Clock3 } from "lucide-react";
import styles from "./professional-workspace.module.css";

export type WorkPatient = {
  id:string; codigo:string; nome:string; altoRisco:boolean;
  pendenciasExames:number; diasUltimaVisita:number|null;
  consultas:number|null; ultimaConsulta:string|null;
  dpp:string|null; emPuerperio:boolean;
};
export type FollowUp = {
  id:string; gestante_id:string;
  tipo:"consulta"|"exame"|"contato"|"visita"|"revisao";
  status:"pendente"|"adiada"|"concluida"; data_prevista:string;
};
const types:Record<FollowUp["tipo"],string> = {
  consulta:"Consulta / retorno",exame:"Conferir exame",
  contato:"Busca ativa / contato",visita:"Verificar visita",
  revisao:"Revisar cadastro / C3",
};
const today=()=>{
  const d=new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
};
function clinical(id:string,tab:"consultas"|"exames"|"gestacao"="consultas"){
  return "/dashboard/cadastro-clinico?gestante="+encodeURIComponent(id)+"&aba="+tab;
}
function dateBR(date:string|null){
  if(!date)return "Não informada";
  const p=date.slice(0,10).split("-");
  return p.length===3?p[2]+"/"+p[1]+"/"+p[0]:"Não informada";
}

export function ProfessionalWorkspace({nome,patients,tasks}:{
  nome:string;patients:WorkPatient[];tasks:FollowUp[];
}){
 const router=useRouter();
 const [search,setSearch]=useState("");
 const [newOpen,setNewOpen]=useState(false);
 const [patient,setPatient]=useState(patients[0]?.id||"");
 const [kind,setKind]=useState<FollowUp["tipo"]>("consulta");
 const [due,setDue]=useState(today);
 const [rescheduling,setRescheduling]=useState<string|null>(null);
 const [newDue,setNewDue]=useState(today);
 const [busy,setBusy]=useState(false);
 const [feedback,setFeedback]=useState<string|null>(null);
 const now=today();
 const names=new Map(patients.map(p=>[p.id,p.nome]));
 const remaining=tasks.filter(t=>t.status!=="concluida");
 const dueCount=remaining.filter(t=>t.data_prevista<=now).length;
 const examsCount=patients.filter(p=>p.pendenciasExames>0).length;
 const riskCount=patients.filter(p=>p.altoRisco).length;
 const relevant=patients.filter(p=>p.altoRisco||p.pendenciasExames>0||
   (p.diasUltimaVisita!==null&&p.diasUltimaVisita>=30)||
   p.consultas===null||p.ultimaConsulta===null)
  .filter(p=>(p.nome+" "+p.codigo).toLowerCase().includes(search.toLowerCase()))
  .sort((a,b)=>Number(b.altoRisco)-Number(a.altoRisco)||
    b.pendenciasExames-a.pendenciasExames||a.nome.localeCompare(b.nome,"pt-BR"))
  .slice(0,15);
 const visibleTasks=[...tasks].sort((a,b)=>
   Number(a.status==="concluida")-Number(b.status==="concluida")||
   a.data_prevista.localeCompare(b.data_prevista)).slice(0,15);

 async function save(method:"POST"|"PATCH"|"DELETE",payload:Record<string,unknown>,ok:string){
   setBusy(true);setFeedback(null);
   try{
     const res=await fetch("/api/rotina",{
       method,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),
     });
     const body=await res.json() as {error?:string};
     if(!res.ok)throw new Error(body.error||"Não foi possível salvar.");
     setFeedback(ok);setNewOpen(false);setRescheduling(null);router.refresh();
   }catch(e){setFeedback(e instanceof Error?e.message:"Falha ao salvar a atividade.");}
   finally{setBusy(false)}
 }
 return <div className={styles.workspace}>
   <header className={styles.welcome}>
     <div><span className={styles.eyebrow}><HeartPulse size={16}/> MAE APS · Minha rotina</span>
       <h1>Olá, {nome.trim().split(/\s+/)[0]||"profissional"}.</h1>
       <p>Suas gestantes, pendências documentais e próximos acompanhamentos em um só lugar.</p>
     </div>
     <div className={styles.topActions}>
       <button type="button" onClick={()=>router.refresh()} className={styles.lightButton}><RefreshCw size={16}/> Atualizar</button>
       <Link className={styles.primaryButton} href="/dashboard/importacoes"><FileSpreadsheet size={16}/> Importar PEC</Link>
     </div>
   </header>
   <div className={styles.metrics}>
     {[
       {value:patients.length,label:"Minhas gestantes",hint:"Somente as suas fichas",icon:Baby,href:"/dashboard/gestantes"},
       {value:dueCount,label:"Atividades até hoje",hint:"Sem confirmação de conclusão",icon:CalendarClock,href:"#agenda"},
       {value:examsCount,label:"Exames a conferir",hint:"Sem registro ≠ não realizado",icon:ClipboardList,href:"#atencao"},
       {value:riskCount,label:"Alto risco registrado",hint:"Conforme ficha, sem diagnóstico novo",icon:Activity,href:"#atencao"},
     ].map(item=><Link className={styles.metric} href={item.href} key={item.label}>
       <span className={styles.metricIcon}><item.icon size={19}/></span>
       <span>{item.label}</span><strong>{item.value}</strong><small>{item.hint}</small>
     </Link>)}
   </div>
   <div className={styles.columns}>
     <section className={styles.panel} id="atencao">
       <header className={styles.panelHeader}>
         <div><h2>O que conferir</h2><p>Organização de registros; não é triagem de urgência.</p></div>
         <Search size={20}/>
       </header>
       <label className={styles.search}>
         <Search size={16}/><input aria-label="Buscar nas pendências" placeholder="Buscar gestante"
           value={search} onChange={e=>setSearch(e.target.value)}/>
       </label>
       <div className={styles.records}>
         {relevant.map(p=>{
           const reasons=[
             p.altoRisco?"Alto risco registrado":null,
             p.pendenciasExames?"Exames a confirmar":null,
             p.diasUltimaVisita!==null&&p.diasUltimaVisita>=30?"Revisar registro de visita":null,
             p.consultas===null||p.ultimaConsulta===null?"Verificar consultas":null,
           ].filter((x):x is string=>Boolean(x));
           return <article className={styles.record} key={p.id}>
             <div className={styles.avatar} aria-hidden="true">
               {p.nome.split(/\s+/).slice(0,2).map(x=>x.slice(0,1)).join("").toUpperCase()}
             </div>
             <div className={styles.recordBody}>
               <strong>{p.nome}</strong><small>{p.codigo}</small>
               <div className={styles.tags}>{reasons.map(x=><span key={x}>{x}</span>)}</div>
               <Link href={clinical(p.id,p.pendenciasExames?"exames":"consultas")}>
                 Abrir acompanhamento <ArrowRight size={14}/>
               </Link>
             </div>
           </article>;
         })}
         {!relevant.length&&<div className={styles.empty}>
           <CheckCircle2 size={24}/><strong>Nenhum item desta lista no momento.</strong>
           <p>Confira a ficha completa em cada atendimento.</p>
         </div>}
       </div>
       <Link className={styles.more} href="/dashboard/gestantes">Todas as gestantes <ArrowRight size={15}/></Link>
     </section>
     <section className={styles.panel} id="agenda">
       <header className={styles.panelHeader}>
         <div><h2>Agenda e busca ativa</h2><p>Registre o próximo passo sem preencher outra ficha.</p></div>
         <button className={styles.add} type="button" title="Adicionar atividade"
           aria-label="Adicionar atividade" disabled={!patients.length}
           onClick={()=>setNewOpen(!newOpen)}><Plus size={20}/></button>
       </header>
       {newOpen&&<form className={styles.newTask} onSubmit={e=>{
         e.preventDefault();void save("POST",{gestanteId:patient,tipo:kind,dataPrevista:due},"Atividade agendada.");
       }}>
         <label>Gestante<select required value={patient} onChange={e=>setPatient(e.target.value)}>
           {patients.map(p=><option value={p.id} key={p.id}>{p.nome}</option>)}</select></label>
         <label>Atividade<select value={kind} onChange={e=>setKind(e.target.value as FollowUp["tipo"])}>
           {Object.entries(types).map(([v,label])=><option value={v} key={v}>{label}</option>)}
         </select></label>
         <label>Data<input type="date" value={due} min="2020-01-01" max="2100-12-31"
           required onChange={e=>setDue(e.target.value)}/></label>
         <button type="submit" className={styles.primaryButton} disabled={busy}>Salvar na agenda</button>
       </form>}
       {feedback&&<p role="status" className={styles.feedback}>{feedback}</p>}
       <div className={styles.tasks}>
         {visibleTasks.map(t=><article className={styles.task} key={t.id}>
           <div className={styles.taskIcon}><Clock3 size={18}/></div>
           <div className={styles.taskMain}>
             <strong>{types[t.tipo]}</strong>
             <Link href={clinical(t.gestante_id,t.tipo==="exame"?"exames":"consultas")}>
               {names.get(t.gestante_id)||"Gestante vinculada"}
             </Link>
             <small>{dateBR(t.data_prevista)} · {t.status==="concluida"?"Concluída":
               t.status==="adiada"?"Reagendada":t.data_prevista<now?"Data anterior a hoje":"Pendente"}</small>
             {rescheduling===t.id&&<form className={styles.reschedule} onSubmit={e=>{
               e.preventDefault();void save("PATCH",{id:t.id,status:"adiada",dataPrevista:newDue},"Atividade reagendada.");
             }}><input aria-label="Nova data" type="date" value={newDue}
                 onChange={e=>setNewDue(e.target.value)} required/>
               <button type="submit" disabled={busy}>Confirmar</button></form>}
           </div>
           <div className={styles.taskButtons}>
             <button type="button" disabled={busy} title={t.status==="concluida"?"Reabrir":"Concluir"}
               aria-label={t.status==="concluida"?"Reabrir atividade":"Concluir atividade"}
               onClick={()=>void save("PATCH",{id:t.id,status:t.status==="concluida"?"pendente":"concluida"},
                 t.status==="concluida"?"Atividade reaberta.":"Atividade concluída.")}>
                 {t.status==="concluida"?<RotateCcw size={16}/>:<CheckCircle2 size={17}/>}
             </button>
             {t.status!=="concluida"&&<button type="button" disabled={busy}
               title="Reagendar" aria-label="Reagendar" onClick={()=>{setRescheduling(t.id);setNewDue(t.data_prevista);}}>
               <CalendarClock size={16}/></button>}
             <button type="button" disabled={busy} title="Remover" aria-label="Remover"
               onClick={()=>{if(window.confirm("Remover esta atividade da agenda?"))
                 void save("DELETE",{id:t.id},"Atividade removida.");}}>
               <Trash2 size={16}/></button>
           </div>
         </article>)}
         {!tasks.length&&<div className={styles.empty}>
           <CalendarClock size={24}/><strong>Sem atividades agendadas</strong>
           <p>Use + para planejar consultas, contatos ou revisões.</p>
         </div>}
       </div>
     </section>
   </div>
   <section className={styles.shortcuts}>
     <div><h2>Atalhos de atendimento</h2>
       <p>Acesse diretamente o que mais utiliza, sem um segundo prontuário.</p></div>
     <div className={styles.shortcutItems}>
       <Link href="/dashboard/gestantes"><Stethoscope size={19}/> Registrar consulta <ArrowRight size={14}/></Link>
       <Link href="/dashboard/cadastro-clinico"><FilePlus2 size={19}/> Nova gestante <ArrowRight size={14}/></Link>
       <Link href="/dashboard/importacoes"><FileSpreadsheet size={19}/> Revisar importação <ArrowRight size={14}/></Link>
     </div>
   </section>
   <p className={styles.disclaimer}>Agenda de organização, não substitui o prontuário oficial.
     Pendência de registro não significa procedimento não realizado.</p>
 </div>;
}
