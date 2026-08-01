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
    .select(
      "perfil, ubs_id, status, ativo, cadastro_completo, aprovacao_status, ubs:ubs_id(id, nome)"
    )
    .eq("id", user.id)
    .single();

  const ubsRelation = Array.isArray(profile?.ubs)
    ? profile.ubs[0]
    : profile?.ubs;

  const canImport =
    profile?.perfil === "equipe_ubs" &&
    profile.ativo === true &&
    profile.status === "ativo" &&
    profile.cadastro_completo === true &&
    profile.aprovacao_status === "aprovado" &&
    Boolean(profile.ubs_id) &&
    Boolean(ubsRelation);

  if (!canImport || !ubsRelation) {
    return (
      <section className="module-page">
        <p>Importação PEC</p>
        <h1>Acesso não autorizado</h1>
        <span>
          Este recurso está disponível somente para integrantes autorizados
          da equipe da UBS.
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

      <ImportacaoPecForm ubsName={ubsRelation.nome} />
    </>
  );
}
