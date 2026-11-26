import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { normalizeBirthDate } from "@/lib/validation/profile-input";
import { parseUbsChoice } from "@/lib/validation/ubs-choice";
import { logServerFailure } from "@/lib/security/request";

// Metadata is only a source of self-declared form values and acknowledgment.
// The database checks the authenticated identity and confirmed email, and owns
// the decision to create an individual workspace. No clinical role in metadata.
export async function activateIndividualWorkspace(supabase: Awaited<ReturnType<typeof createClient>>, user: User | null) {
  if (process.env.GESTARIO_SELF_SERVICE_CLINICAL !== "1" || !user?.email_confirmed_at) return;
  const { data: profile, error } = await supabase.from("perfis")
    .select("nome_completo,data_nascimento,ubs_solicitada_id,perfil,aprovacao_status,ativo,status,perfil_excluido_em")
    .eq("id", user.id).maybeSingle();
  if (error) { logServerFailure("individual-workspace-read",error); return; }
  if (profile && (profile.perfil !== "aluno" || profile.aprovacao_status !== "pendente" || !profile.ativo || profile.status === "bloqueado" || profile.perfil_excluido_em)) return;
  const m=user.user_metadata ?? {};
  if (m.workspace_notice_v32 !== true) return; // legacy accounts acknowledge once, not administrative approval
  const name=String(m.full_name ?? profile?.nome_completo ?? "").replace(/\s+/g," ").trim();
  const birth=normalizeBirthDate(m.data_nascimento_declarada ?? profile?.data_nascimento);
  const ubs=parseUbsChoice(m.ubs_declarada ?? profile?.ubs_solicitada_id,true);
  if(name.length<5||name.length>160||!birth||ubs===undefined)return;
  const {error:activationError}=await supabase.rpc("gestario_ativar_conta_individual_v32",{
    p_nome_completo:name,p_data_nascimento:birth,p_ubs_id:ubs,p_ciencia:true,
  });
  if(activationError)logServerFailure("individual-workspace-activation",activationError);
}
