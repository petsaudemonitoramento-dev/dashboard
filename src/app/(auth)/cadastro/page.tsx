import { RegisterForm } from "@/components/auth/register-form";
import { getPostgresClient } from "@/lib/db/postgres";

export const dynamic = "force-dynamic";

export default async function CadastroPage() {
  const sql = getPostgresClient();
  const ubsOptions = await sql<{ id: string; nome: string }[]>`
    select id, nome
    from public.ubs
    where ativa = true
    order by nome
  `;

  return <RegisterForm ubsOptions={ubsOptions} />;
}
