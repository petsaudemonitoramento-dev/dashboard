"use client";
import { useState } from "react";
import Link from "next/link";
import { ClinicalForm } from "@/components/cadastro-clinico/clinical-form";
import { demoRecords, demoClinicalData, emptyClinicalRecord } from "@/lib/demo/clinical-fixtures";
import type { ClinicalRecord } from "@/components/cadastro-clinico/types";

export function DemoWorkspace({ tab = "inicio" }: { tab?: string }) {
  const [records, setRecords] = useState<ClinicalRecord[]>(demoRecords);
  const [editing, setEditing] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const selected=editing===null?null:records[editing];
  function newRecord(){
    const record=emptyClinicalRecord("demo-ubs","UBS fictícia");
    record.identificacao.nome="Nova gestante fictícia";
    record.identificacao.dataNascimento="1998-01-01";
    record.microareaId="demo-area";
    record.codigo="DEMO-"+String(records.length+1).padStart(3,"0");
    setEditing(records.length);setRecords(prev=>[...prev,record]);
  }
  const panel={padding:20,border:"1px solid #dfd9ed",borderRadius:16,background:"white",marginBottom:16};
  return <div>
    <section className="heading"><p>GESTÁRIO APS · AMBIENTE DE TREINAMENTO</p><h1>{tab==="importacoes"?"Importar PEC":tab==="gestantes"?"Minhas gestantes":tab==="agenda"?"Agenda":tab==="perfil"?"Perfil":"Minha rotina"}</h1><span>Use somente exemplos fictícios. As alterações desta demonstração não são enviadas ao banco.</span></section>
    {tab==="inicio"&&<><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12}}>{[{name:"Minhas gestantes",value:records.length},{name:"Alto risco registrado",value:records.filter(r=>r.gestacao.riscoGestacional==="Alto risco").length},{name:"Agenda de hoje",value:completed?0:1},{name:"Consultas registradas",value:records.reduce((n,r)=>n+(r.acompanhamento.atendimentosPreNatal??0),0)}].map(item=><section key={item.name} style={panel}><p>{item.name}</p><h2 style={{fontSize:32,color:"#50409f"}}>{item.value}</h2></section>)}</div><section style={panel}><h2>Acompanhamento das gestantes</h2><p>Explore as fichas de exemplo para conhecer os dados clínicos e as boas práticas do C3.</p><Link className="v20-primary-button" href="/demonstracao?aba=gestantes">Abrir minhas gestantes</Link></section></>}
    {tab==="importacoes"&&<section style={panel}><h2>Importar relatório PEC</h2><p>Carregue três fichas sintéticas para simular uma importação. Arquivos reais não são aceitos neste ambiente.</p><button type="button" className="v20-primary-button" onClick={()=>{setRecords(demoRecords());setEditing(null)}}>Carregar exemplo fictício</button><p role="status">{records.length} fichas no ambiente.</p></section>}
    {tab==="gestantes"&&<><section style={panel}><div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><h2>Gestantes em acompanhamento</h2><button type="button" className="v20-primary-button" onClick={newRecord}>Nova gestante fictícia</button></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12,marginTop:16}}>{records.map((r,i)=><article key={r.codigo} style={{...panel,marginBottom:0}}><strong>{r.identificacao.nome}</strong><p>{r.codigo} · {r.gestacao.igSemanas??"—"} semanas</p><p>{r.gestacao.riscoGestacional||"Risco não informado"} · {r.acompanhamento.atendimentosPreNatal??0} consultas</p><button className="v20-secondary-button" type="button" onClick={()=>setEditing(i)}>Abrir ficha clínica</button></article>)}</div></section>{selected&&editing!==null&&<section style={panel}><div style={{display:"flex",justifyContent:"space-between",gap:12}}><h2>Ficha clínica fictícia</h2><button className="v20-secondary-button" type="button" onClick={()=>setEditing(null)}>Fechar ficha</button></div><ClinicalForm key={selected.codigo} data={demoClinicalData(selected)} onDemoSave={record=>setRecords(prev=>prev.map((r,i)=>i===editing?record:r))}/></section>}</>}
    {tab==="agenda"&&<section style={panel}><h2>Agenda de acompanhamento</h2><label><input type="checkbox" checked={completed} onChange={e=>setCompleted(e.target.checked)}/> Consulta fictícia de acompanhamento {completed?"(concluída)":"(pendente)"}</label></section>}
    {tab==="perfil"&&<section style={panel}><h2>Meu perfil</h2><p>Conta individual · acesso assistencial sujeito à autorização.</p><button type="button" className="v20-secondary-button" onClick={()=>{setRecords(demoRecords());setEditing(null);setCompleted(false)}}>Reiniciar exemplos</button></section>}
  </div>;
}
