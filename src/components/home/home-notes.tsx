"use client";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { ClipboardList, Plus, X } from "lucide-react";
import styles from "./professional-workspace.module.css";

type Item = {id:string;text:string;done:boolean};
type Notes = {note:string;items:Item[]};
const EMPTY = '{"note":"","items":[]}';
const EVENT = "gestario-session-notes-updated";
function parse(raw:string):Notes {
  try {
    const data=JSON.parse(raw);
    return {
      note: typeof data.note==="string"?data.note.slice(0,1000):"",
      items: Array.isArray(data.items)?data.items.filter((i:unknown):i is Item=>{
        if(!i||typeof i!=="object")return false;
        const v=i as Partial<Item>;
        return typeof v.id==="string"&&typeof v.text==="string"&&typeof v.done==="boolean";
      }).slice(0,30).map((i:Item)=>({id:i.id,text:i.text.slice(0,120),done:i.done})):[],
    };
  }catch{return {note:"",items:[]}}
}

export function HomeNotes({accountId}:{accountId:string}) {
  // Session-only, account-scoped organizational notes; never stored in Supabase.
  const key="gestario:home-notes:v1:"+accountId;
  const read=useCallback(()=>{try{return sessionStorage.getItem(key)??EMPTY}catch{return EMPTY}},[key]);
  const subscribe=useCallback((notify:()=>void)=>{
    window.addEventListener(EVENT,notify);
    window.addEventListener("storage",notify);
    return ()=>{window.removeEventListener(EVENT,notify);window.removeEventListener("storage",notify)};
  },[]);
  const raw=useSyncExternalStore(subscribe,read,()=>EMPTY);
  const saved=useMemo(()=>parse(raw),[raw]);
  const [fallback,setFallback]=useState<Notes|null>(null);
  const [draft,setDraft]=useState("");
  const [error,setError]=useState(false);
  const data=fallback??saved;
  const completed=data.items.filter(i=>i.done).length;
  function write(next:Notes){
    try{
      sessionStorage.setItem(key,JSON.stringify(next));
      setFallback(null);setError(false);
      window.dispatchEvent(new Event(EVENT));
    }catch{setFallback(next);setError(true)}
  }
  function clear(){
    if(!window.confirm("Limpar todas as anotações e lembretes desta sessão?"))return;
    write({note:"",items:[]});setDraft("");
  }
  return <section className={styles.panel} aria-labelledby="home-notes-title">
    <header className={styles.panelHeader}>
      <div><h2 id="home-notes-title">Minhas anotações</h2><p>Lembretes rápidos e tarefas para não esquecer.</p></div>
      <span className={styles.notesIcon}><ClipboardList size={20}/></span>
    </header>
    <div className={styles.notesBody}>
      <label className={styles.notesLabel} htmlFor="home-note">Anotação rápida <small>{error?"Somente em memória":"Salvo nesta sessão"}</small></label>
      <textarea className={styles.notesText} id="home-note" maxLength={1000} value={data.note} placeholder="Escreva um lembrete de organização…" onChange={e=>write({...data,note:e.target.value})}/>
      <hr className={styles.notesDivider}/>
      <div className={styles.notesLabel}><span>Meu checklist</span><small aria-live="polite">{completed} de {data.items.length} concluídas</small></div>
      {data.items.length===0?<p className={styles.notesEmpty}>Nenhum lembrete adicionado.</p>:<ul className={styles.notesList}>
        {data.items.map(item=><li key={item.id}><label data-done={item.done}><input type="checkbox" checked={item.done} onChange={e=>write({...data,items:data.items.map(i=>i.id===item.id?{...i,done:e.target.checked}:i)})}/><span>{item.text}</span></label><button type="button" aria-label={"Remover lembrete: "+item.text} onClick={()=>write({...data,items:data.items.filter(i=>i.id!==item.id)})}><X size={15}/></button></li>)}
      </ul>}
      <form className={styles.notesAdd} onSubmit={e=>{e.preventDefault();const text=draft.trim();if(!text||data.items.length>=30)return;write({...data,items:[...data.items,{id:crypto.randomUUID(),text,done:false}]});setDraft("")}}>
        <input aria-label="Novo lembrete" placeholder="Adicionar um lembrete..." value={draft} maxLength={120} onChange={e=>setDraft(e.target.value)} disabled={data.items.length>=30}/>
        <button type="submit" aria-label="Adicionar lembrete" disabled={!draft.trim()||data.items.length>=30}><Plus size={18}/></button>
      </form>
      {error&&<p role="status" className={styles.notesNotice}>O navegador não permitiu salvar. As anotações atuais serão perdidas ao sair da página.</p>}
      <div className={styles.notesEnd}><p className={styles.notesNotice}>Somente lembretes administrativos. Não insira nomes, identificadores ou informações clínicas. Não sincroniza entre dispositivos; evite usar em computadores compartilhados.</p><button type="button" className={styles.notesClear} onClick={clear} disabled={!data.note&&!data.items.length}>Limpar</button></div>
    </div>
  </section>;
}
