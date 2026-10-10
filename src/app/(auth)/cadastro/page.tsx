import { RegisterForm } from "@/components/auth/register-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CadastroPage() {
  const supabase = await createClient();
  const { data: ubsOptions, error } = await supabase
    .from("ubs")
    .select("id, nome")
    .eq("ativa", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as UBS ativas.");
  }

  return <RegisterForm ubsOptions={ubsOptions ?? []} />;
}
