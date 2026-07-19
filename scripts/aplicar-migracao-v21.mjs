import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Configure SUPABASE_DATABASE_URL no arquivo .env.local.");
}

const sql = postgres(databaseUrl, {
  ssl: "require",
  max: 1,
  prepare: false,
});

try {
  const migration = await readFile(
    new URL(
      "../database/008_perfis_acs_autorizacoes_v21.sql",
      import.meta.url
    ),
    "utf8"
  );

  await sql.unsafe(migration);
  console.log(
    "Migração V21 de cadastros, autorizações e painel ACS aplicada com sucesso."
  );
} finally {
  await sql.end();
}
