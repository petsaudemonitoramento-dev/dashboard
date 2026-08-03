import { redirect } from "next/navigation";
import { SettingsPage } from "@/components/configuracoes/settings-page";
import { APP_CONFIG } from "@/config/app";
import { getActiveProfileContext } from "@/lib/auth/guards";
import { profileLabel } from "@/lib/auth/roles";
import { getPostgresClient } from "@/lib/db/postgres";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type HomeRow = {
  dados: {
    nome?: string | null;
    ubsNome?: string | null;
    escopo?: string | null;
  } | null;
};

function metadataName(metadata: Record<string, unknown> | undefined): string {
  const candidates = [
    metadata?.nome_completo,
    metadata?.full_name,
    metadata?.name,
    metadata?.nome,
  ];

  const value = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0
  );

  return value?.trim() ?? "";
}

export default async function SettingsRoute() {
  const context = await getActiveProfileContext();
  if (!context) redirect("/login");

  const { profile, user } = context;
  let displayName =
    metadataName(user.user_metadata) ||
    user.email?.split("@")[0] ||
    "Usuário";
  let ubsName: string | null = null;
  let scopeDescription = profileLabel(profile.perfil);

  if (profile.perfil !== "administrador") {
    try {
      const sql = getPostgresClient();
      const rows = await sql<HomeRow[]>`
        select private.obter_inicio_v21(${user.id}::uuid) as dados
      `;

      displayName = rows[0]?.dados?.nome?.trim() || displayName;
      ubsName = rows[0]?.dados?.ubsNome ?? null;
      scopeDescription = rows[0]?.dados?.escopo?.trim() || scopeDescription;
    } catch (error) {
      console.error(
        "Não foi possível carregar o contexto das configurações:",
        error
      );
    }
  }

  return (
    <SettingsPage
      account={{
        displayName,
        email: user.email ?? "E-mail não informado",
        profile: profile.perfil,
        profileLabel: profileLabel(profile.perfil),
        scopeDescription,
        status: "Ativa",
        ubsName,
      }}
      system={{ developer: APP_CONFIG.developer, version: APP_CONFIG.version }}
    />
  );
}
