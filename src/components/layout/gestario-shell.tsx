"use client";
import { useEffect, useState } from "react";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import type { ProfessionalAlert } from "@/lib/alertas/professional-alerts";
export function GestarioShell({children,name,profile,alerts,alertsError}:{children:React.ReactNode;name:string;profile:string;alerts:ProfessionalAlert[];alertsError:boolean}){
 const [collapsed,setCollapsed]=useState(false),[mobileOpen,setMobileOpen]=useState(false);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==="Escape")setMobileOpen(false)};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[]);
 function toggle(){if(window.matchMedia("(max-width:930px)").matches)setMobileOpen(v=>!v);else setCollapsed(v=>!v)}
 return <div className={`shell gestario-shell ${collapsed?"ga-collapsed":""} ${mobileOpen?"ga-mobile-open":""}`}><AppSidebar profile={profile} onNavigate={()=>setMobileOpen(false)}/>{mobileOpen&&<button className="ga-backdrop" aria-label="Fechar menu" onClick={()=>setMobileOpen(false)} type="button"/>}<div className="main"><AppHeader name={name} profile={profile} alerts={alerts} alertsError={alertsError} onMenu={toggle}/><main className="content">{children}</main></div></div>
}
