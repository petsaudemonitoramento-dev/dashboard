import { redirect } from "next/navigation";
import { normalizeBirthDate } from "@/lib/validation/profile-input";
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
      .select("cadastro_completo, aprovacao_status, nome_completo, data_nascimento, ubs_solicitada_id, perfil, ativo, status, perfil_excluido_em")
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

  const selfService = process.env.GESTARIO_SELF_SERVICE_CLINICAL === "1";
  const profile = profileResult.data;
  const eligiblePending = selfService && user.email_confirmed_at && profile?.perfil === "aluno" && profile.aprovacao_status === "pendente" && profile.ativo && profile.status !== "bloqueado" && !profile.perfil_excluido_em;
  const ubsOptions = ubsResult.data ?? [];

  if (profile?.cadastro_completo && !eligiblePending) {
    if (profile.aprovacao_status === "aprovado") {
      redirect("/dashboard?entrada=1");
    }

    redirect("/aguardando-aprovacao");
  }

  const metadata = user.user_metadata ?? {};
  const autonomous = !selfService && process.env.GESTARIO_AUTONOMOUS_SIGNUP === "1";
  const suggestedName = String(
    profile?.nome_completo ?? metadata.full_name ??
      metadata.name ??
      metadata.nome_completo ??
      ""
  );

  return (
    <CompleteProfileForm
      email={user.email ?? ""}
      suggestedName={suggestedName}
      ubsOptions={ubsOptions}
      autonomous={autonomous}
      selfService={selfService}
      optionalUbs={!selfService && process.env.GESTARIO_UBS_OPTIONAL === "1"}
      previewOtherUbs={!selfService && (process.env.VERCEL_ENV === "preview" || process.env.GESTARIO_UBS_OPTION_PREVIEW === "1")}
      suggestedProfession={String(metadata.profissao_declarada ?? "")}
      suggestedUbs={String(profile?.ubs_solicitada_id ?? metadata.ubs_declarada ?? "")}
      suggestedBirthDate={normalizeBirthDate(profile?.data_nascimento ?? metadata.data_nascimento_declarada) ?? ""}
    />
  );
}
