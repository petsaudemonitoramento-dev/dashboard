import { Clock3 } from "lucide-react";
import { redirect } from "next/navigation";
import { ApprovalActions } from "@/components/auth/approval-actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PROFILE_LABELS: Record<string, string> = {
  equipe_ubs: "Profissional da UBS",
  administrador: "Gestão (administrador)",
  profissional_ubs: "Profissional da UBS",
  acs: "ACS",
  aluno: "Aluno",
};

export default async function PendingApprovalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("perfis")
    .select(
      "nome_completo, cadastro_completo, aprovacao_status, perfil_solicitado, perfil_excluido_em, ubs_solicitada_id"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!profile || !profile.cadastro_completo) {
    redirect("/completar-cadastro");
  }

  if (
    profile.aprovacao_status === "aprovado" &&
    !profile.perfil_excluido_em
  ) {
    redirect("/dashboard");
  }

  let ubsNome: string | null = null;

  if (profile.ubs_solicitada_id) {
    const { data: ubs } = await supabase
      .from("ubs")
      .select("nome")
      .eq("id", profile.ubs_solicitada_id)
      .eq("ativa", true)
      .maybeSingle();

    ubsNome = ubs?.nome ?? null;
  }

  const statusMessage =
    profile.aprovacao_status === "rejeitado"
      ? "A solicitação não foi aprovada. Procure a gestão da UBS para revisar os dados."
      : profile.aprovacao_status === "desativado" ||
          profile.perfil_excluido_em
        ? "Este acesso foi desativado pela gestão."
        : "Seu cadastro foi concluído e aguarda aprovação da gestão.";

  const requestedProfile =
    typeof profile.perfil_solicitado === "string"
      ? profile.perfil_solicitado
      : "equipe_ubs";

  return (
    <main className="v20-auth-page">
      <section className="v20-auth-card v20-status-card">
        <div className="v20-auth-icon">
          <Clock3 size={28} />
        </div>
        <h1>Acesso ainda não liberado</h1>
        <p>{statusMessage}</p>

        <div className="v20-status-details">
          <div>
            <span>Nome</span>
            <strong>{profile.nome_completo}</strong>
          </div>
          <div>
            <span>Perfil solicitado</span>
            <strong>
              {PROFILE_LABELS[requestedProfile] ??
                requestedProfile}
            </strong>
          </div>
          <div>
            <span>UBS</span>
            <strong>{ubsNome ?? "Não informada"}</strong>
          </div>
          <div>
            <span>Situação</span>
            <strong>{profile.aprovacao_status}</strong>
          </div>
        </div>

        <ApprovalActions />
      </section>
    </main>
  );
}
