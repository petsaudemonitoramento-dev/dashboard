import { createHmac } from "node:crypto";

export type MetabaseScope = "ubs" | "profissional";

export type MetabaseViewConfig = {
  configured: boolean;
  embedUrl: string | null;
  externalUrl: string | null;
  dashboardId: string | null;
  missing: string[];
};

function base64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(
  payload: Record<string, unknown>,
  secret: string
): string {
  const header = base64Url(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  );
  const body = base64Url(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  const signature = createHmac("sha256", secret)
    .update(unsigned)
    .digest();

  return `${unsigned}.${base64Url(signature)}`;
}

function cleanUrl(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/\/+$/, "");
  return normalized || null;
}

export function buildMetabaseViewConfig({
  scope,
  userId,
  ubsId,
}: {
  scope: MetabaseScope;
  userId: string;
  ubsId: string | null;
}): MetabaseViewConfig {
  const siteUrl = cleanUrl(process.env.METABASE_SITE_URL);
  const embedSecret = process.env.METABASE_EMBED_SECRET?.trim() || null;
  const dashboardId = (
    scope === "ubs"
      ? process.env.METABASE_UBS_DASHBOARD_ID
      : process.env.METABASE_PROFESSIONAL_DASHBOARD_ID
  )?.trim() || null;

  const missing: string[] = [];
  if (!siteUrl) missing.push("METABASE_SITE_URL");
  if (!embedSecret) missing.push("METABASE_EMBED_SECRET");
  if (!dashboardId) {
    missing.push(
      scope === "ubs"
        ? "METABASE_UBS_DASHBOARD_ID"
        : "METABASE_PROFESSIONAL_DASHBOARD_ID"
    );
  }
  if (!ubsId) missing.push("UBS vinculada ao perfil");

  const externalUrl =
    siteUrl && dashboardId
      ? `${siteUrl}/dashboard/${encodeURIComponent(dashboardId)}`
      : siteUrl;

  if (missing.length > 0 || !siteUrl || !embedSecret || !dashboardId || !ubsId) {
    return {
      configured: false,
      embedUrl: null,
      externalUrl,
      dashboardId,
      missing,
    };
  }

  const parsedDashboardId = Number(dashboardId);
  if (!Number.isInteger(parsedDashboardId) || parsedDashboardId <= 0) {
    return {
      configured: false,
      embedUrl: null,
      externalUrl,
      dashboardId,
      missing: ["ID numérico válido do dashboard Metabase"],
    };
  }

  const params: Record<string, string> = {
    ubs_id: ubsId,
  };

  if (scope === "profissional") {
    params.profissional_id = userId;
  }

  const token = signJwt(
    {
      resource: { dashboard: parsedDashboardId },
      params,
      exp: Math.floor(Date.now() / 1000) + 10 * 60,
    },
    embedSecret
  );

  return {
    configured: true,
    dashboardId,
    externalUrl,
    embedUrl:
      `${siteUrl}/embed/dashboard/${token}` +
      "#bordered=false&titled=false",
    missing: [],
  };
}
