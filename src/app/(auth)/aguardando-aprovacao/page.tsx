import { Clock3 } from "lucide-react";
import { redirect } from "next/navigation";
import { ApprovalActions } from "@/components/auth/approval-actions";
import { getPostgresClient } from "@/lib/db/postgres";
import { createClient } from "@/lib/supabase/server";
import { profileLabel } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function PendingApprovalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const sql = getPostgresClient();
  const rows = await sql`
    select
      p.nome_completo,
      p.cadastro_completo,
      p.aprovacao_status,
      p.perfil_solicitado,
      p.perfil_excluido_em,
      u.nome as ubs_nome
    from public.perfis p
    left join public.ubs u on u.id = p.ubs_solicitada_id
    where p.id = ${user.id}::uuid
    limit 1
  `;

  const profile = rows[0];

  if (!profile || !profile.cadastro_completo) {
    redirect("/completar-cadastro");
  }

  if (profile.aprovacao_status === "aprovado" && !profile.perfil_excluido_em) {
    redirect("/dashboard");
  }

  const statusMessage =
    profile.aprovacao_status === "rejeitado"
      ? "A solicitação não foi aprovada. Procure a gestão da UBS para revisar os dados."
      : profile.aprovacao_status === "desativado" ||
          profile.perfil_excluido_em
        ? "Este acesso foi desativado pela gestão."
        : "Seu cadastro foi concluído e aguarda aprovação da gestão.";

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
              {profileLabel(String(profile.perfil_solicitado ?? ""))}
            </strong>
          </div>
          <div>
            <span>UBS</span>
            <strong>{profile.ubs_nome ?? "Não informada"}</strong>
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
