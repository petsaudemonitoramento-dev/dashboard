import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("perfis")
    .select(
      "nome_completo, email, cargo_funcao, matricula, ubs_id, status, aprovacao_status"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/login");

  const { data: ubs } = profile.ubs_id
    ? await supabase
        .from("ubs")
        .select("nome")
        .eq("id", profile.ubs_id)
        .maybeSingle()
    : { data: null };

  const rows = [
    ["Nome", profile.nome_completo],
    ["E-mail", profile.email],
    ["Cargo/Função", profile.cargo_funcao || "Não informado"],
    ["Matrícula", profile.matricula || "Não informada"],
    ["UBS vinculada", ubs?.nome || "Não vinculada"],
    ["Status", profile.status],
  ];

  return (
    <>
      <section className="heading">
        <p>PET-Saúde UFCG</p>
        <h1>Perfil</h1>
        <span>
          Dados da conta profissional utilizada neste sistema.
        </span>
      </section>

      <section
        style={{
          marginTop: 24,
          padding: 24,
          border: "1px solid #dedbea",
          borderRadius: 18,
          background: "white",
          maxWidth: 760,
        }}
      >
        <dl
          style={{
            display: "grid",
            gap: 18,
            margin: 0,
          }}
        >
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt
                style={{
                  color: "#686276",
                  fontSize: 13,
                  marginBottom: 4,
                }}
              >
                {label}
              </dt>
              <dd
                style={{
                  margin: 0,
                  fontWeight: 700,
                }}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
