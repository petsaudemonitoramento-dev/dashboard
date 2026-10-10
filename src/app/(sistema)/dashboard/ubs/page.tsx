import { redirect } from "next/navigation";
import {
  UbsManager,
  type ManagedUbs,
} from "@/components/admin/ubs-manager";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type UbsPayload = {
  ubs: Array<{
    id: string;
    nome: string;
    ativa: boolean;
  }>;
  microareas: Array<{
    id: string;
    ubs_id: string;
    codigo: string;
    nome: string | null;
    ativa: boolean;
  }>;
};

export default async function UbsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc(
    "profissionais_admin_listar_ubs_v30"
  );

  if (error || !data) {
    redirect("/dashboard");
  }

  const payload = data as UbsPayload;

  const units: ManagedUbs[] = payload.ubs.map((unit) => ({
    id: unit.id,
    nome: unit.nome,
    ativa: unit.ativa,
    microareas: payload.microareas
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
          Administração técnica das unidades usadas no cadastro.
        </span>
      </section>

      <UbsManager units={units} />
    </>
  );
}
