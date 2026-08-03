import { redirect } from "next/navigation";
import { getActiveProfileContext } from "@/lib/auth/guards";

export default async function AttendancesPage() {
  const context = await getActiveProfileContext();

  if (!context) {
    redirect("/login");
  }

  if (context.profile.perfil === "equipe_ubs") {
    redirect("/dashboard/gestantes");
  }

  redirect("/dashboard");
}
