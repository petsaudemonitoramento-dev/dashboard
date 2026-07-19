import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "Configure SUPABASE_DATABASE_URL no arquivo .env.local."
  );
}

const sql = postgres(databaseUrl, {
  ssl: "require",
  max: 1,
  prepare: false,
});

try {
  const migration = await readFile(
    new URL(
      "../database/003_cadastro_clinico_v16.sql",
      import.meta.url
    ),
    "utf8"
  );

  await sql.unsafe(migration);
  console.log(
    "Migração V16 do cadastro clínico aplicada com sucesso."
  );
} finally {
  await sql.end();
}
