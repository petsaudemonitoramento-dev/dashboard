import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type AttendanceRow = {
  gestante_id: string;
  codigo: string;
  nome_visual: string;
  atendimentos_pre_natal: number | null;
  ultima_consulta_pre_natal: string | Date | null;
  atualizado_em: string | Date;
};

function formatDate(value: string | Date | null): string {
  if (!value) return "Sem consulta registrada";

  const date =
    value instanceof Date
      ? value
      : new Date(`${String(value).slice(0, 10)}T12:00:00`);

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export default async function AtendimentosPage() {
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
    AttendanceRow & { alta_ativa: boolean }
  >)
    .filter((row) => !row.alta_ativa)
    .sort(
      (a, b) =>
        new Date(String(b.atualizado_em)).getTime() -
        new Date(String(a.atualizado_em)).getTime()
    );

  return (
    <>
      <section className="heading">
        <p>PET-Saúde UFCG</p>
        <h1>Atendimentos</h1>
        <span>
          Resumo individual das gestantes vinculadas ao seu
          acompanhamento.
        </span>
      </section>

      <div
        style={{
          display: "grid",
          gap: 14,
          marginTop: 24,
        }}
      >
        {rows.length === 0 ? (
          <div
            style={{
              padding: 24,
              border: "1px solid #dedbea",
              borderRadius: 18,
              background: "white",
            }}
          >
            Nenhuma gestante vinculada.
          </div>
        ) : (
          rows.map((row) => (
            <article
              key={row.gestante_id}
              style={{
                padding: 20,
                border: "1px solid #dedbea",
                borderRadius: 18,
                background: "white",
                display: "grid",
                gap: 8,
              }}
            >
              <strong>{row.nome_visual}</strong>
              <span style={{ color: "#686276" }}>
                {row.codigo} ·{" "}
                {row.atendimentos_pre_natal ?? 0} consulta(s) de
                pré-natal
              </span>
              <span style={{ color: "#686276" }}>
                Última consulta:{" "}
                {formatDate(row.ultima_consulta_pre_natal)}
              </span>
              <Link
                href={`/dashboard/cadastro-clinico?gestante=${row.gestante_id}`}
              >
                Registrar ou revisar atendimento
              </Link>
            </article>
          ))
        )}
      </div>
    </>
  );
}
