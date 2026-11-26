"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";
import {parseGestarioPreferences,type GestarioPreferences} from "@/lib/gestario-preferences";
export function ProfilePreferences({initial}:{initial:GestarioPreferences}){
 const [prefs,setPrefs]=useState(initial),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
 const router=useRouter();
 async function save(e:React.FormEvent){e.preventDefault();setSaving(true);setMessage("");
  try{const {error}=await createClient().auth.updateUser({data:{gestario_ui_v1:parseGestarioPreferences(prefs)}});if(error)throw error;setMessage("Preferências salvas na sua conta.");router.refresh()}catch{setMessage("Não foi possível salvar as preferências. Tente novamente.")}finally{setSaving(false)}}
 return <form className="ga-pref-form" onSubmit={save}>
  <label><span><strong>Pendências de exames</strong><small>Exibir lembretes documentais no sino.</small></span><input type="checkbox" checked={prefs.showExams} onChange={e=>setPrefs(p=>({...p,showExams:e.target.checked}))}/></label>
  <label><span><strong>Visitas a conferir</strong><small>Exibir lembretes de visitas no sino.</small></span><input type="checkbox" checked={prefs.showVisits} onChange={e=>setPrefs(p=>({...p,showVisits:e.target.checked}))}/></label>
  <label><span><strong>Risco registrado</strong><small>Avisos de risco permanecem visíveis.</small></span><input type="checkbox" checked readOnly disabled aria-label="Avisos de risco sempre ativos"/></label>
  <label><span><strong>Página ao entrar</strong><small>Escolha onde iniciar depois do login.</small></span><select value={prefs.start} onChange={e=>setPrefs(p=>({...p,start:e.target.value as GestarioPreferences["start"]}))}><option value="inicio">Início</option><option value="agenda">Agenda</option><option value="gestantes">Minhas gestantes</option></select></label>
  <button type="submit" disabled={saving}>{saving?"Salvando…":"Salvar preferências"}</button><p role="status">{message}</p>
  <p>Preferências de apresentação não alteram permissões, fichas clínicas nem registros. O sino não é um serviço de emergência.</p>
 </form>
}
