import { redirect } from "next/navigation";
import {
  UbsManager,
  type ManagedUbs,
} from "@/components/admin/ubs-manager";
import { getActiveProfileContext } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type UbsRow = {
  id: string;
  nome: string;
  ativa: boolean;
};

type MicroareaRow = {
  id: string;
  ubs_id: string;
  codigo: string;
  nome: string | null;
  ativa: boolean;
};

export default async function UbsPage() {
  const context = await getActiveProfileContext();

  if (
    !context ||
    !["administrador", "gestao_municipal"].includes(context.profile.perfil)
  ) {
    redirect("/dashboard");
  }

  const { profile, sql } = context;

  const [ubsRows, microareaRows] = await Promise.all([
    sql<UbsRow[]>`
      select id, nome, ativa
      from public.ubs
      order by ativa desc, nome
    `,
    sql<MicroareaRow[]>`
      select id, ubs_id, codigo, nome, ativa
      from public.microareas
      order by ubs_id, ativa desc, codigo
    `,
  ]);

  const units: ManagedUbs[] = ubsRows.map((unit) => ({
    id: unit.id,
    nome: unit.nome,
    ativa: unit.ativa,
    microareas: microareaRows
      .filter((microarea) => microarea.ubs_id === unit.id)
      .map((microarea) => ({
        id: microarea.id,
        codigo: microarea.codigo,
        nome: microarea.nome,
        ativa: microarea.ativa,
      })),
  }));

  return (
    <>
      <section className="heading">
        <p>PET-Saúde UFCG</p>
        <h1>UBS e microáreas</h1>
        <span>
          Gestão das unidades, territórios e opções usadas nos cadastros.
        </span>
      </section>

      <UbsManager
        readOnly={profile.perfil === "gestao_municipal"}
        units={units}
      />
    </>
  );
}
