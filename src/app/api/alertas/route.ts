import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildProfessionalAlerts, type ProfessionalAlertSource } from "@/lib/alertas/professional-alerts";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Sessão inválida" }, { status: 401, headers });
    }
    const { data: profile, error: profileError } = await supabase
      .from("perfis")
      .select("perfil,status,ativo,cadastro_completo,aprovacao_status,perfil_excluido_em")
      .eq("id",user.id).maybeSingle();
    if (profileError || !profile || profile.perfil !== "equipe_ubs" ||
        profile.status !== "ativo" || !profile.ativo ||
        !profile.cadastro_completo || profile.aprovacao_status !== "aprovado" ||
        profile.perfil_excluido_em) {
      return NextResponse.json({ error: "Acesso não autorizado" },
        { status: 403, headers });
    }
    // O RPC faz a filtragem por profissional. Nunca consultar tabelas globais diretamente.
    const { data, error } = await supabase.rpc(
      "profissionais_listar_gestantes_v30", { p_exibir_identidade: true }
    );
    if (error) throw error;
    const alerts = buildProfessionalAlerts((data ?? []) as ProfessionalAlertSource[]);
    return NextResponse.json({ alerts, count: alerts.length }, { headers });
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar os avisos." },
      { status: 503, headers });
  }
}
