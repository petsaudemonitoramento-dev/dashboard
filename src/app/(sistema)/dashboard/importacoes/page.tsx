import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ImportacaoPecForm } from "@/components/importacao-pec/importacao-pec-form";

export default async function ImportacoesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("perfis")
    .select("perfil, ubs_id, ubs:ubs_id(id, nome)")
    .eq("id", user.id)
    .single();

  const ubsRelation = Array.isArray(profile?.ubs)
    ? profile.ubs[0]
    : profile?.ubs;

  if (!profile?.ubs_id || !ubsRelation) {
    return (
      <section className="module-page">
        <p>Importação PEC</p>
        <h1>Usuário sem UBS vinculada</h1>
        <span>
          Vincule o profissional a uma UBS antes de importar o relatório.
        </span>
      </section>
    );
  }

  return (
    <>
      <section className="heading">
        <p>PET-Saúde UFCG</p>
        <h1>Importação adaptável do PEC</h1>
        <span>
          Anexe um CSV ou XLSX exportado do PEC/e-SUS APS.
        </span>
      </section>

      <ImportacaoPecForm
        ubsId={profile.ubs_id}
        ubsName={ubsRelation.nome}
      />
    </>
  );
}
