import { redirect } from "next/navigation";
import { ImportacaoPecForm } from "@/components/importacao-pec/importacao-pec-form";
import { getClinicalTeamContext } from "@/lib/auth/guards";

export default async function ImportacoesPage() {
  const context = await getClinicalTeamContext();
  if (!context || !context.profile.ubs_id) {
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

  const ubsRows = await context.sql<{ nome: string }[]>`
    select nome
    from public.ubs
    where id = ${context.profile.ubs_id}::uuid
      and ativa = true
    limit 1
  `;
  const ubs = ubsRows[0];
  if (!ubs) redirect("/dashboard");

  return (
    <>
      <section className="heading">
        <p>PET-Saúde UFCG</p>
        <h1>Importação adaptável do PEC</h1>
        <span>
          Anexe um CSV ou XLSX exportado do PEC/e-SUS APS.
        </span>
      </section>

      <ImportacaoPecForm ubsName={ubs.nome} />
    </>
  );
}
