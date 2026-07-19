import { redirect } from "next/navigation";
import { CompleteProfileForm } from "@/components/auth/complete-profile-form";
import { getPostgresClient } from "@/lib/db/postgres";
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

  const sql = getPostgresClient();
  const [profiles, ubsOptions] = await Promise.all([
    sql`
      select cadastro_completo, aprovacao_status
      from public.perfis
      where id = ${user.id}::uuid
      limit 1
    `,
    sql<{ id: string; nome: string }[]>`
      select id, nome
      from public.ubs
      where ativa = true
      order by nome
    `,
  ]);

  const profile = profiles[0];

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
