import { NextResponse } from "next/server";
import { activateIndividualWorkspace } from "@/lib/auth/individual-workspace";
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
  const { data, error } = await supabase.auth.exchangeCodeForSession(
    code
  );

  if (error) {
    return NextResponse.redirect(
      new URL("/login?auth_error=1", url.origin)
    );
  }

  if (next !== "/redefinir-senha") await activateIndividualWorkspace(supabase,data.user);
  return NextResponse.redirect(new URL(next, url.origin));
}
