import Link from "next/link";
import { redirect } from "next/navigation";
import { ApprovalActions } from "@/components/auth/approval-actions";
import { createClient } from "@/lib/supabase/server";
import { DEMO_NOTICE } from "@/lib/validation/demo-onboarding";
import { DemoWorkspace } from "@/components/auth/demo-workspace";

export const dynamic = "force-dynamic";
export default async function DemoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email_confirmed_at) redirect("/login");
  const { data: profile, error } = await supabase.from("perfis")
    .select("perfil, cadastro_completo, aprovacao_status, perfil_solicitado, status, ativo, perfil_excluido_em")
    .eq("id", user.id).maybeSingle();
  if (error) throw new Error("Não foi possível verificar a conta.");
  if (!profile?.cadastro_completo) redirect("/completar-cadastro");
  if (profile.aprovacao_status === "aprovado" && profile.status === "ativo" && profile.ativo &&
      !profile.perfil_excluido_em && ["equipe_ubs", "administrador"].includes(profile.perfil)) redirect("/dashboard");
  if (profile.perfil !== "aluno" || profile.perfil_solicitado !== "equipe_ubs" ||
      profile.aprovacao_status !== "pendente" || profile.status !== "ativo" ||
      !profile.ativo || profile.perfil_excluido_em) redirect("/aguardando-aprovacao");
  return <main className="v20-auth-page">
    <section className="v20-auth-card" style={{maxWidth: 960, width: "100%"}}>
      <header><div><h1>Gestário APS · Demonstração</h1><p>{DEMO_NOTICE}</p></div></header>
      <DemoWorkspace />
      <p>Os exemplos são fixos e não são armazenados no banco. Acesso assistencial ainda não habilitado.</p>
      <ApprovalActions refreshLabel="Verificar autorização" />
      <Link href="/login">Voltar ao login</Link>
    </section>
  </main>;
}
