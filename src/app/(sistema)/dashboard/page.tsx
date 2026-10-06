import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type HomeRow = {
  gestante_id: string;
  risco_gestacional: string | null;
  pendencias_count: number;
  dias_ultima_visita: number | null;
  alta_ativa: boolean;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("perfis")
    .select(
      "nome_completo, perfil, status, ativo, cadastro_completo, aprovacao_status, perfil_excluido_em"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (
    !profile ||
    profile.perfil !== "equipe_ubs" ||
    profile.status !== "ativo" ||
    !profile.ativo ||
    profile.cadastro_completo !== true ||
    profile.aprovacao_status !== "aprovado" ||
    profile.perfil_excluido_em
  ) {
    redirect("/aguardando-aprovacao");
  }

  const { data: listData, error: listError } =
    await supabase.rpc(
      "profissionais_listar_gestantes_v30",
      { p_exibir_identidade: false }
    );

  if (listError) {
    throw listError;
  }

  const rows = (listData ?? []) as HomeRow[];

  const active = rows.filter((row) => !row.alta_ativa);
  const highRisk = active.filter((row) =>
    (row.risco_gestacional ?? "")
      .toLowerCase()
      .includes("alto")
  ).length;
  const examPending = active.filter(
    (row) => Number(row.pendencias_count ?? 0) > 0
  ).length;
  const visitPending = active.filter(
    (row) => Number(row.dias_ultima_visita ?? 0) >= 30
  ).length;

  const cards = [
    ["Minhas gestantes", active.length, "/dashboard/gestantes"],
    ["Alto risco", highRisk, "/dashboard/alertas"],
    ["Com exames pendentes", examPending, "/dashboard/alertas"],
    ["Sem visita há 30+ dias", visitPending, "/dashboard/alertas"],
  ] as const;

  return (
    <>
      <section className="heading">
        <p>PET-Saúde UFCG</p>
        <h1>Olá, {profile.nome_completo}</h1>
        <span>
          Resumo somente das gestantes vinculadas à sua
          responsabilidade profissional.
        </span>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 16,
          marginTop: 24,
        }}
      >
        {cards.map(([label, value, href]) => (
          <Link
            href={href}
            key={label}
            style={{
              padding: 22,
              border: "1px solid #dedbea",
              borderRadius: 18,
              background: "white",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <span
              style={{
                display: "block",
                color: "#686276",
                marginBottom: 8,
              }}
            >
              {label}
            </span>
            <strong style={{ fontSize: 30 }}>{value}</strong>
          </Link>
        ))}
      </section>

      <section
        style={{
          marginTop: 20,
          padding: 22,
          border: "1px solid #dedbea",
          borderRadius: 18,
          background: "white",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Acesso rápido</h2>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <Link href="/dashboard/gestantes">
            Abrir minhas gestantes
          </Link>
          <Link href="/dashboard/importacoes">
            Importar relatório PEC
          </Link>
          <Link href="/dashboard/alertas">
            Revisar alertas
          </Link>
        </div>
      </section>
    </>
  );
}
