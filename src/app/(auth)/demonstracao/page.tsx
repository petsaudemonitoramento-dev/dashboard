import { GestarioShell } from "@/components/layout/gestario-shell";
import { parseGestarioPreferences } from "@/lib/gestario-preferences";
import { redirect } from "next/navigation";
import { ApprovalActions } from "@/components/auth/approval-actions";
import { createClient } from "@/lib/supabase/server";
import { DemoWorkspace } from "@/components/auth/demo-workspace";

export const dynamic = "force-dynamic";
export default async function DemoPage({searchParams}:{searchParams:Promise<{aba?:string}>}) {
  const params=await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email_confirmed_at) redirect("/login");
  const { data: profile, error } = await supabase.from("perfis")
    .select("nome_completo, perfil, cadastro_completo, aprovacao_status, perfil_solicitado, status, ativo, perfil_excluido_em")
    .eq("id", user.id).maybeSingle();
  if (error) throw new Error("Não foi possível verificar a conta.");
  if (!profile?.cadastro_completo) redirect("/completar-cadastro");
  if (profile.aprovacao_status === "aprovado" && profile.status === "ativo" && profile.ativo &&
      !profile.perfil_excluido_em && ["equipe_ubs", "administrador"].includes(profile.perfil)) redirect("/dashboard");
  if (profile.perfil !== "aluno" || profile.perfil_solicitado !== "equipe_ubs" ||
      profile.aprovacao_status !== "pendente" || profile.status !== "ativo" ||
      !profile.ativo || profile.perfil_excluido_em) redirect("/aguardando-aprovacao");
  if (process.env.GESTARIO_SELF_SERVICE_CLINICAL === "1") redirect("/completar-cadastro");
  return <GestarioShell demo preferences={parseGestarioPreferences(null)} name={profile.nome_completo} profile="aluno" alerts={[]} alertsError={false}>
    <DemoWorkspace tab={["inicio","importacoes","gestantes","agenda","perfil"].includes(params.aba??"")?params.aba:"inicio"} />
    <ApprovalActions refreshLabel="Verificar autorização assistencial" />
  </GestarioShell>;
}
