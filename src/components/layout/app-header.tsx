"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { LogOut, Search, Menu, UserRound, Settings } from "lucide-react";
import { AlertBell } from "./alert-bell";
import type { ProfessionalAlert } from "@/lib/alertas/professional-alerts";

const PROFILE_LABELS: Record<string, string> = {
  administrador: "Gestão",
  profissional_ubs: "Profissional UBS",
  equipe_ubs: "Equipe UBS",
  acs: "ACS",
  aluno: "Aluno",
};

export function AppHeader({
  name,
  profile,
  alerts = [],
  alertsError = false, onMenu,
}: {
  name: string;
  profile: string;
  alerts?: ProfessionalAlert[];
  alertsError?: boolean; onMenu?:()=>void;
}) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="app-header">
      <div className="ga-header-left"><button className="ga-icon" type="button" aria-label="Alternar menu lateral" aria-controls="gestario-sidebar" onClick={onMenu}><Menu size={20}/></button>
      {profile==="equipe_ubs"&&<Link href="/dashboard/gestantes" className="search"><Search/><span>Pesquisar gestantes...</span></Link>}</div>

      <div className="user">
        {profile === "equipe_ubs" && (
          <AlertBell initialAlerts={alerts} initialError={alertsError} />
        )}
        <Link href="/dashboard/perfil" className="ga-icon" aria-label={`Perfil: ${name} — ${PROFILE_LABELS[profile]??profile}`} title="Meu perfil"><UserRound size={20}/></Link>
        <Link href="/dashboard/perfil#seguranca" className="ga-icon" aria-label="Configurações da conta" title="Configurações"><Settings size={20}/></Link>

        <button
          aria-label="Sair da conta"
          onClick={signOut}
          title="Sair"
          type="button"
        >
          <LogOut />
        </button>
      </div>
    </header>
  );
}
