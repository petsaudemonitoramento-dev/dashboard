import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseGestarioPreferences } from "@/lib/gestario-preferences";
import { GestarioShell } from "@/components/layout/gestario-shell";
import { buildProfessionalAlerts, type ProfessionalAlert, type ProfessionalAlertSource } from "@/lib/alertas/professional-alerts";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("perfis")
    .select(`
      nome_completo,
      perfil,
      status,
      ativo,
      ubs_id,
      cadastro_completo,
      aprovacao_status,
      perfil_excluido_em
    `)
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.cadastro_completo) {
    redirect("/completar-cadastro");
  }

  if (
    profile.aprovacao_status !== "aprovado" ||
    profile.status !== "ativo" ||
    !profile.ativo ||
    profile.perfil_excluido_em
  ) {
    redirect("/aguardando-aprovacao");
  }

  if (
    profile.perfil !== "equipe_ubs" &&
    profile.perfil !== "administrador"
  ) {
    redirect("/login");
  }

  // O mesmo RPC já usado na lista de gestantes aplica o escopo por profissional.
  // Falhas do contador não devem derrubar a navegação inteira.
  let alerts: ProfessionalAlert[] = [];
  let alertsError = false;
  if (profile.perfil === "equipe_ubs") {
    const { data, error } = await supabase.rpc(
      "profissionais_listar_gestantes_v30",
      { p_exibir_identidade: true }
    );
    if (error) alertsError = true;
    else alerts = buildProfessionalAlerts((data ?? []) as ProfessionalAlertSource[]);
  }

  return (
    <GestarioShell preferences={parseGestarioPreferences(user.user_metadata?.gestario_ui_v1)} name={profile.nome_completo} profile={String(profile.perfil)} alerts={alerts} alertsError={alertsError}>{children}</GestarioShell>
  );
}
