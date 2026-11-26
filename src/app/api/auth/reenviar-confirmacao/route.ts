import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { confirmationRedirectUrl } from "@/lib/auth/confirmation-origin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { logServerFailure, mutationRequestError, readJsonObject } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const neutralMessage = "Se houver uma confirmação pendente, enviaremos um novo e-mail. Confira também a caixa de spam.";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const requestError = mutationRequestError(request, { maxBytes: 4096, contentTypes: ["application/json"] });
  if (requestError) return requestError;
  const body = await readJsonObject(request, 4096);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400, headers });
  }

  try {
    const ip = (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip")?.trim() || "unknown").slice(0, 128);
    const [emailAllowed, networkAllowed] = await Promise.all([
      consumeRateLimit({ scope: "confirmation-resend-email", actorKey: email, limit: 3, windowSeconds: 3600 }),
      consumeRateLimit({ scope: "confirmation-resend-network", actorKey: ip, limit: 20, windowSeconds: 3600 }),
    ]);
    if (!emailAllowed || !networkAllowed) {
      return NextResponse.json({ error: "Muitas solicitações. Aguarde e tente novamente mais tarde." }, { status: 429, headers });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      logServerFailure("confirmation-resend-config");
      return NextResponse.json({ error: "Reenvio temporariamente indisponível. Tente mais tarde." }, { status: 503, headers });
    }
    const auth = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { error } = await auth.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: confirmationRedirectUrl(request.url) },
    });
    // Do not disclose whether an address exists or is already confirmed.
    if (error) logServerFailure("confirmation-resend", error);
    return NextResponse.json({ ok: true, message: neutralMessage }, { headers });
  } catch (error) {
    logServerFailure("confirmation-resend", error);
    return NextResponse.json({ error: "Reenvio temporariamente indisponível. Tente mais tarde." }, { status: 503, headers });
  }
}
