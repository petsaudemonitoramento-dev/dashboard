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
    new URL("../database/005_indicadores_v18.sql", import.meta.url),
    "utf8"
  );

  await sql.unsafe(migration);
  console.log("Migração V18 dos indicadores aplicada com sucesso.");
} finally {
  await sql.end();
}
