import { createHash } from "node:crypto";
import { getPostgresClient } from "@/lib/db/postgres";

type RateLimitOptions = {
  scope: string;
  actorKey: string;
  limit: number;
  windowSeconds: number;
};

export async function consumeRateLimit({
  scope,
  actorKey,
  limit,
  windowSeconds,
}: RateLimitOptions): Promise<boolean> {
  const actorHash = createHash("sha256")
    .update(`${scope}:\0${actorKey}`)
    .digest("hex");

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
