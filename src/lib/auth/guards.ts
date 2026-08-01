import "server-only";

import { getPostgresClient } from "@/lib/db/postgres";
import { createClient } from "@/lib/supabase/server";
import { isUserProfile, type UserProfile } from "@/lib/auth/roles";

type ActiveProfileRow = {
  id: string;
  perfil: string;
  ubs_id: string | null;
  microarea_id: string | null;
};

export async function getActiveProfileContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const sql = getPostgresClient();
  const rows = await sql<ActiveProfileRow[]>`
    select
      p.id,
      p.perfil::text as perfil,
      p.ubs_id,
      p.microarea_id
    from public.perfis p
    where p.id = ${user.id}::uuid
      and p.status = 'ativo'
      and p.ativo = true
      and p.cadastro_completo = true
      and p.aprovacao_status = 'aprovado'
      and p.perfil_excluido_em is null
    limit 1
  `;

  const profile = rows[0];

  if (!profile || !isUserProfile(profile.perfil)) return null;

  return {
    user,
    sql,
    profile: {
      ...profile,
      perfil: profile.perfil as UserProfile,
    },
  };
}

export async function getManagementContext() {
  const context = await getActiveProfileContext();
  return context?.profile.perfil === "gestao_municipal" ? context : null;
}
