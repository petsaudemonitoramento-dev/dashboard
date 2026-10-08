import { redirect } from "next/navigation";
import { CompleteProfileForm } from "@/components/auth/complete-profile-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CompleteProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [profileResult, ubsResult] = await Promise.all([
    supabase
      .from("perfis")
      .select("cadastro_completo, aprovacao_status")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("ubs")
      .select("id, nome")
      .eq("ativa", true)
      .order("nome"),
  ]);

  if (profileResult.error || ubsResult.error) {
    throw new Error("Não foi possível carregar o cadastro.");
  }

  const profile = profileResult.data;
  const ubsOptions = ubsResult.data ?? [];

  if (profile?.cadastro_completo) {
    if (profile.aprovacao_status === "aprovado") {
      redirect("/dashboard");
    }

    redirect("/aguardando-aprovacao");
  }

  const metadata = user.user_metadata ?? {};
  const suggestedName = String(
    metadata.full_name ??
      metadata.name ??
      metadata.nome_completo ??
      ""
  );

  return (
    <CompleteProfileForm
      email={user.email ?? ""}
      suggestedName={suggestedName}
      ubsOptions={ubsOptions}
    />
  );
}
