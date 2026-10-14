import Link from "next/link";
import { CalendarDays, ClipboardList, FileText, Syringe } from "lucide-react";
import type { ClinicalRecord } from "./types";
import styles from "./patient-timeline.module.css";

type Event = {id:string;date:string;title:string;kind:string;origin:string};
const knownOrigin = (value:string|undefined) => value==="pec"?"Importado do PEC":
  value==="manual"?"Registro manual":"Fonte não informada";
const displayDate=(value:string)=> {
  const parts=value.slice(0,10).split("-");
  return parts.length===3?parts[2]+"/"+parts[1]+"/"+parts[0]:"Data não informada";
};
export function getClinicalTimeline(record:ClinicalRecord):Event[]{
 const items:Event[]=[];
 for(const c of record.consultas||[]){
   if(c.data)items.push({id:"consulta-"+(c.id||c.data),
     date:c.data,title:c.tipo==="puerperio"?"Consulta puerperal":"Consulta / atendimento",
     kind:"consulta",origin:knownOrigin(c.origem)});
 }
 for(const e of record.exames||[]){
   const date=e.dataRealizacao||e.dataSolicitacao;
   if(date)items.push({id:"exame-"+e.codigo+"-"+e.trimestre,
     date,title:e.nome+" · "+(e.dataRealizacao?"Data de realização":"Data de solicitação"),
     kind:"exame",origin:knownOrigin(e.origem)});
 }
 for(const v of record.vacinas||[]){
   if(v.dataAplicacao)items.push({id:"vacina-"+v.codigo,date:v.dataAplicacao,
     title:v.nome,kind:"vacina",origin:knownOrigin(v.origem)});
 }
 return items.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20);
}
export function PatientTimeline({record}:{record:ClinicalRecord}){
 const items=getClinicalTimeline(record);
 const a=record.acompanhamento;
 return <details className={styles.box}>
   <summary><span><CalendarDays size={19}/><strong>Linha do tempo da gestação</strong></span>
     <small>{items.length?String(items.length)+" eventos com data":"Sem eventos datados"}</small></summary>
   <p className={styles.help}>Somente registros com data conhecida aparecem na linha do tempo.
     As contagens agregadas do PEC são exibidas abaixo, sem criar datas artificiais.</p>
   <ol className={styles.timeline}>
     {items.map(item=><li key={item.id}>
       <div className={styles.marker}>
         {item.kind==="vacina"?<Syringe size={15}/>:item.kind==="exame"?<FileText size={15}/>:<CalendarDays size={15}/>}
       </div>
       <div><strong>{item.title}</strong><p>{displayDate(item.date)}
         <span className={styles.source}>{item.origin}</span></p></div>
     </li>)}
   </ol>
   {!items.length&&<p className={styles.empty}>Ainda não há eventos com data suficiente para organizar cronologicamente.</p>}
   <div className={styles.summary}>
     <div><ClipboardList size={17}/><strong>Totais informados no acompanhamento</strong></div>
     <p>Consultas pré-natais: {a.atendimentosPreNatal??"não informado"} · Aferições de PA:
       {" "}{a.medicoesPressao??"não informado"} · Visitas pré-natais:
       {" "}{a.visitasPreNatal??"não informado"}</p>
     <small>Totais não comprovam, sozinhos, CBO, datas e elegibilidade do C3.</small>
     {record.id&&<Link href={"/dashboard/resumo-gestante?gestante="+encodeURIComponent(record.id)}>
       Abrir resumo para o atendimento
     </Link>}
   </div>
 </details>;
}
