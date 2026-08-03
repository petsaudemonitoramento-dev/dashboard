import "leaflet/dist/leaflet.css";

import { redirect } from "next/navigation";
import { TerritoryMap } from "@/components/mapa/territory-map";
import { getActiveProfileContext } from "@/lib/auth/guards";
import { profileLabel } from "@/lib/auth/roles";
import { getPostgresClient } from "@/lib/db/postgres";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ScopeRow = {
  dados: { ubsNome?: string | null; escopo?: string | null } | null;
};

const ALLOWED_PROFILES = new Set(["gestao_municipal", "equipe_ubs", "acs"]);

export default async function MapPage() {
  const context = await getActiveProfileContext();
  if (!context) redirect("/login");

  const { profile, user } = context;
  if (!ALLOWED_PROFILES.has(profile.perfil)) redirect("/dashboard");

  let ubsName: string | null = null;
  let scopeDescription = profileLabel(profile.perfil);

  try {
    const sql = getPostgresClient();
    const rows = await sql<ScopeRow[]>`
      select private.obter_inicio_v21(${user.id}::uuid) as dados
    `;
    ubsName = rows[0]?.dados?.ubsNome ?? null;
    scopeDescription = rows[0]?.dados?.escopo?.trim() || scopeDescription;
  } catch (error) {
    console.error("Não foi possível carregar o escopo do mapa V29:", error);
  }

  return (
    <TerritoryMap
      profile={profile.perfil}
      profileLabel={profileLabel(profile.perfil)}
      scopeDescription={scopeDescription}
      ubsName={ubsName}
    />
  );
}
