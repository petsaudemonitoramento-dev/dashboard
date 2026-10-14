import { redirect } from "next/navigation";

// Mantém links antigos funcionais sem manter uma segunda tela de avisos.
export default function LegacyAlertsPage() {
  redirect("/dashboard");
}
