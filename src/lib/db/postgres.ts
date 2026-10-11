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
    const parsedUrl = new URL(databaseUrl);
    const ephemeralCiDatabase =
      process.env.CI === "true" &&
      parsedUrl.hostname === "127.0.0.1" &&
      parsedUrl.port === "54322";

    globalThis.__dashboardPostgres = postgres(databaseUrl, {
      // The Supabase CLI Postgres container has no TLS listener. Keep the
      // exception fail-closed to the exact disposable CI endpoint.
      ssl: ephemeralCiDatabase ? false : "require",
      max: 2,
      idle_timeout: 20,
      connect_timeout: 20,
      prepare: false,
    });
  }

  return globalThis.__dashboardPostgres;
}
