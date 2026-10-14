import { createHash } from "node:crypto";
import { getPostgresClient } from "@/lib/db/postgres";

type RateLimitOptions = {
  scope: string;
  actorKey: string;
  limit: number;
  windowSeconds: number;
};

/**
 * Fallback limitado ao ambiente fictício de smoke test.
 *
 * O banco V2 de homologação tem autenticação e RLS próprios, porém o Vercel
 * Preview não possui a credencial PostgreSQL de servidor. Jamais substituir
 * pelo SUPABASE_DATABASE_URL de produção. Enquanto se testa exclusivamente
 * a branch/ambiente abaixo, um limite em memória por instância evita falha
 * HTTP 500 no login. Não é um limitador distribuído nem substitui o banco
 * para produção.
 */
type TestEntry = { count: number; resetAt: number };
declare global {
  var __maeSmokeRateLimits: Map<string, TestEntry> | undefined;
}

function isIsolatedSmokePreview(): boolean {
  return (
    !process.env.SUPABASE_DATABASE_URL &&
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "feature/rotina-inteligente-profissionais-v1" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL === "https://bhkyfcnuxcvjgvusgpgm.supabase.co"
  );
}

function consumePreviewLimit(
  key: string,
  limit: number,
  windowSeconds: number
): boolean {
  const now = Date.now();
  const store = globalThis.__maeSmokeRateLimits ??
    (globalThis.__maeSmokeRateLimits = new Map<string, TestEntry>());
  if (store.size > 4000) {
    for (const [entryKey, entry] of store) {
      if (entry.resetAt <= now) store.delete(entryKey);
    }
    if (store.size > 4000) store.clear();
  }
  const previous = store.get(key);
  if (!previous || previous.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  if (previous.count >= limit) return false;
  previous.count += 1;
  return true;
}

export async function consumeRateLimit({
  scope,
  actorKey,
  limit,
  windowSeconds,
}: RateLimitOptions): Promise<boolean> {
  const actorHash = createHash("sha256")
    .update(`${scope}:\0${actorKey}`)
    .digest("hex");

  if (isIsolatedSmokePreview()) {
    // Somente Preview + projeto Supabase V2 vazio + branch isolada.
    // Supabase Auth possui proteções próprias contra abuso de autenticação.
    return consumePreviewLimit(actorHash, limit, windowSeconds);
  }

  const sql = getPostgresClient();
  const rows = await sql<{ allowed: boolean }[]>`
    select private.consumir_rate_limit_v30(
      ${scope},
      ${actorHash},
      ${limit},
      ${windowSeconds}
    ) as allowed
  `;
  return rows[0]?.allowed === true;
}
