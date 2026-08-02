import { redirect } from "next/navigation";
import { getClinicalTeamContext } from "@/lib/auth/guards";

export default async function Page() {
  if (!(await getClinicalTeamContext())) redirect("/dashboard");

  return <section><p style={{color:"#623acb",fontWeight:700}}>Módulo do sistema</p><h1>Visitas domiciliares</h1><div style={{marginTop:24,padding:28,border:"1px solid #dedbea",borderRadius:18,background:"white"}}>Tela organizada e pronta para implementação.</div></section>;
}
