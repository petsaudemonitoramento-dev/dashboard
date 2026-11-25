"use client";
import {useEffect,useRef,type ReactNode} from "react";
import {useRouter,usePathname,useSearchParams} from "next/navigation";
import {X} from "lucide-react";
import styles from "./clinical-drawer.module.css";

export function ClinicalDrawer({title,children}:{title:string;children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null);
 const router=useRouter(),pathname=usePathname(),params=useSearchParams();
 useEffect(()=>{const element=dialog.current;if(element&&!element.open)element.showModal();return()=>{if(element?.open)element.close()}},[]);
 function close(){
   if(!window.confirm("Fechar a ficha? Alterações ainda não salvas serão descartadas."))return;
   const query=new URLSearchParams(params.toString());
   ["editar","risco","aba"].forEach(k=>query.delete(k));
   router.replace(pathname+(query.size?"?"+query.toString():""),{scroll:false});
 }
 return <dialog className={styles.drawer} ref={dialog} aria-labelledby="clinical-drawer-title" onCancel={e=>{e.preventDefault();close()}}>
   <header className={styles.header}><div><small>GESTÁRIO APS · MINHAS GESTANTES</small><h2 id="clinical-drawer-title">{title}</h2></div><button type="button" onClick={close} aria-label="Fechar ficha"><X size={22}/></button></header>
   <div className={styles.body}>{children}</div>
 </dialog>;
}
