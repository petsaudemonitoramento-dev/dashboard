"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut, Search } from "lucide-react";
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
  alertsError = false,
}: {
  name: string;
  profile: string;
  alerts?: ProfessionalAlert[];
  alertsError?: boolean;
}) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="app-header">
      <div className="search">
        <Search />
        <input
          aria-label="Pesquisar no sistema"
          placeholder="Pesquisar no sistema..."
        />
      </div>

      <div className="user">
        {profile === "equipe_ubs" && (
          <AlertBell initialAlerts={alerts} initialError={alertsError} />
        )}
        <span>
          <b>{name}</b>
          <small>{PROFILE_LABELS[profile] ?? profile}</small>
        </span>

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
