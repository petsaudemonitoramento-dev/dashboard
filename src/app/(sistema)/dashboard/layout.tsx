import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";

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

  return (
    <div className="shell">
      <AppSidebar profile={String(profile.perfil)} />
      <div className="main">
        <AppHeader
          name={profile.nome_completo}
          profile={String(profile.perfil)}
        />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
