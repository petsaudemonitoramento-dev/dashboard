import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type AlertRow = {
  gestante_id: string;
  codigo: string;
  nome_visual: string;
  risco_gestacional: string | null;
  pendencias_count: number;
  dias_ultima_visita: number | null;
  ultima_consulta_pre_natal: string | Date | null;
};

function riskPriority(value: string | null): number {
  const risk = (value ?? "").toLowerCase();
  if (risk.includes("alto")) return 1;
  if (risk.includes("médio") || risk.includes("medio")) return 2;
  return 3;
}

export default async function AlertasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: listData, error: listError } =
    await supabase.rpc(
      "profissionais_listar_gestantes_v30",
      { p_exibir_identidade: true }
    );

  if (listError) {
    throw listError;
  }

  const rows = ((listData ?? []) as Array<
    AlertRow & { alta_ativa: boolean }
  >).filter((row) => !row.alta_ativa);

  const alerts = rows
    .filter(
      (row) =>
        Number(row.pendencias_count ?? 0) > 0 ||
        Number(row.dias_ultima_visita ?? 0) >= 30 ||
        riskPriority(row.risco_gestacional) <= 2
    )
    .sort((a, b) => {
      const byRisk =
        riskPriority(a.risco_gestacional) -
        riskPriority(b.risco_gestacional);
      if (byRisk !== 0) return byRisk;

      return (
        Number(b.pendencias_count ?? 0) -
        Number(a.pendencias_count ?? 0)
      );
    });

  return (
    <>
      <section className="heading">
        <p>PET-Saúde UFCG</p>
        <h1>Alertas</h1>
        <span>
          Pendências assistenciais somente das gestantes sob sua
          responsabilidade.
        </span>
      </section>

      <div
        style={{
          display: "grid",
          gap: 14,
          marginTop: 24,
        }}
      >
        {alerts.length === 0 ? (
          <div
            style={{
              padding: 24,
              border: "1px solid #dedbea",
              borderRadius: 18,
              background: "white",
            }}
          >
            Nenhum alerta prioritário no momento.
          </div>
        ) : (
          alerts.map((row) => {
            const signals: string[] = [];
            if (riskPriority(row.risco_gestacional) <= 2) {
              signals.push(
                row.risco_gestacional ?? "Risco informado"
              );
            }
            if (Number(row.pendencias_count ?? 0) > 0) {
              signals.push(
                `${row.pendencias_count} pendência(s) de exame`
              );
            }
            if (Number(row.dias_ultima_visita ?? 0) >= 30) {
              signals.push(
                `${row.dias_ultima_visita} dias desde a última visita`
              );
            }

            return (
              <article
                key={row.gestante_id}
                style={{
                  padding: 20,
                  border: "1px solid #dedbea",
                  borderRadius: 18,
                  background: "white",
                }}
              >
                <strong>{row.nome_visual}</strong>
                <div
                  style={{
                    color: "#686276",
                    margin: "6px 0 12px",
                  }}
                >
                  {row.codigo} · {signals.join(" · ")}
                </div>
                <Link
                  href={`/dashboard/cadastro-clinico?gestante=${row.gestante_id}`}
                >
                  Abrir acompanhamento
                </Link>
              </article>
            );
          })
        )}
      </div>
    </>
  );
}
