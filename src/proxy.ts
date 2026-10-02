import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { mutationRequestError } from "@/lib/security/request";

function clientAddress(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

async function protectPublicSignup(
  request: NextRequest
): Promise<NextResponse | null> {
  if (
    request.method !== "POST" ||
    request.nextUrl.pathname !== "/api/auth/cadastro"
  ) {
    return null;
  }

  const requestError = mutationRequestError(request, {
    maxBytes: 32 * 1024,
    contentTypes: ["application/json"],
  });
  if (requestError) return requestError;

  try {
    const allowed = await consumeRateLimit({
      scope: "public-signup",
      actorKey: clientAddress(request),
      limit: 10,
      windowSeconds: 3600,
    });

    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "Muitas tentativas de cadastro. Tente novamente mais tarde.",
        },
        { status: 429 }
      );
    }
  } catch {
    return NextResponse.json(
      {
        error:
          "Cadastro temporariamente indisponível. Tente novamente mais tarde.",
      },
      { status: 503 }
    );
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const signupError = await protectPublicSignup(request);
  if (signupError) return signupError;

  let response = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return response;
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(
          ({ name, value, options }) => {
            response.cookies.set(name, value, options);
          }
        );
      },
    },
  });

  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
