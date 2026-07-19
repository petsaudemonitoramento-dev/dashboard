"use client";

import { LogOut, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ApprovalActions() {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="v20-form-actions">
      <button
        className="v20-secondary-button"
        onClick={signOut}
        type="button"
      >
        <LogOut size={17} />
        Sair
      </button>

      <button
        className="v20-primary-button"
        onClick={() => router.refresh()}
        type="button"
      >
        <RefreshCw size={17} />
        Verificar aprovação
      </button>
    </div>
  );
}
