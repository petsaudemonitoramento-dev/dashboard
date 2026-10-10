import postgres from "postgres";

declare global {
  var __dashboardPostgres:
    | ReturnType<typeof postgres>
    | undefined;
}

export function getPostgresClient() {
  const databaseUrl = process.env.SUPABASE_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "SUPABASE_DATABASE_URL não foi configurada no arquivo .env.local."
    );
  }

  if (!globalThis.__dashboardPostgres) {
    globalThis.__dashboardPostgres = postgres(databaseUrl, {
      ssl: "require",
      max: 2,
      idle_timeout: 20,
      connect_timeout: 20,
      prepare: false,
    });
  }

  return globalThis.__dashboardPostgres;
}
