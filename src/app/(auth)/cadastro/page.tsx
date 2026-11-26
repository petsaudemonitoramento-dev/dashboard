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

  const selfService = process.env.GESTARIO_SELF_SERVICE_CLINICAL === "1";
  return <RegisterForm selfService={selfService} ubsOptions={ubsOptions ?? []} autonomous={!selfService && process.env.GESTARIO_AUTONOMOUS_SIGNUP === "1"} optionalUbs={!selfService && process.env.GESTARIO_UBS_OPTIONAL === "1"} previewOtherUbs={!selfService && (process.env.VERCEL_ENV === "preview" || process.env.GESTARIO_UBS_OPTION_PREVIEW === "1")} />;
}
