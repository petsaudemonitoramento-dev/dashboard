import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_DESTINATIONS = new Set([
  "/completar-cadastro",
  "/redefinir-senha",
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const next =
    requestedNext && ALLOWED_DESTINATIONS.has(requestedNext)
      ? requestedNext
      : "/completar-cadastro";

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?auth_error=1", url.origin)
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(
    code
  );

  if (error) {
    return NextResponse.redirect(
      new URL("/login?auth_error=1", url.origin)
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
