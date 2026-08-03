import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Erro ao encerrar sessão:", error);
    return NextResponse.json(
      { error: "Não foi possível encerrar a sessão." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
