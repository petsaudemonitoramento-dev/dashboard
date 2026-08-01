"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut, Search } from "lucide-react";
import { profileLabel } from "@/lib/auth/roles";

export function AppHeader({
  name,
  profile,
}: {
  name: string;
  profile: string;
}) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="app-header">
      <div className="search">
        <Search />
        <input
          aria-label="Pesquisar no sistema"
          placeholder="Pesquisar no sistema..."
        />
      </div>

      <div className="user">
        <span>
          <b>{name}</b>
          <small>{profileLabel(profile)}</small>
        </span>

        <button
          aria-label="Sair da conta"
          onClick={signOut}
          title="Sair"
          type="button"
        >
          <LogOut />
        </button>
      </div>
    </header>
  );
}
