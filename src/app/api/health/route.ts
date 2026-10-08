import { NextResponse } from "next/server";
import {
  logServerFailure,
  requestIdFrom,
} from "@/lib/security/request";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("ubs")
      .select("id")
      .eq("ativa", true)
      .limit(1);

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        status: "ok",
        ...(requestId ? { requestId } : {}),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    logServerFailure("health-check", error, requestId);

    return NextResponse.json(
      {
        status: "degraded",
        ...(requestId ? { requestId } : {}),
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }
}
