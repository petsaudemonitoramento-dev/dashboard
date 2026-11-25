import Link from "next/link";
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
      "nome_completo, email, cargo_funcao, matricula, ubs_id, status, aprovacao_status, perfil"
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

  const initials=String(profile.nome_completo??"").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
  const fields=(rows:Array<[string,string|null|undefined]>)=><dl className="ga-fields">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||"Não informado"}</dd></div>)}</dl>;
  return <>
    <section className="heading"><p>GESTÁRIO APS · MINHA CONTA</p><h1>Meu perfil</h1><span>Seus dados profissionais, vínculo e acesso em um só lugar.</span></section>
    <section className="ga-profile-hero"><div className="ga-avatar" aria-hidden="true">{initials}</div><div><h2>{profile.nome_completo}</h2><p>{profile.perfil==="equipe_ubs"?"Profissional da Atenção Primária à Saúde":"Administrador"} · Gestário APS</p></div></section>
    <div className="ga-profile-grid">
      <div className="ga-profile-stack"><section className="ga-profile-card" id="dados"><h3>Dados pessoais e contato</h3><p>Informações para identificação profissional.</p>{fields([["Nome completo",profile.nome_completo],["E-mail profissional",profile.email],["Cargo / função",profile.cargo_funcao],["Matrícula",profile.matricula]])}<p>Alterações de identificação e vínculo devem ser validadas pela administração.</p></section>
      <section className="ga-profile-card"><h3>Vínculo e atuação</h3><p>Unidade e permissões vinculadas ao perfil.</p>{fields([["UBS vinculada",ubs?.nome],["Equipe",profile.perfil==="equipe_ubs"?"Equipe UBS":"Administrador"],["Status",profile.status],["Aprovação",profile.aprovacao_status]])}<p>A visibilidade das fichas depende do perfil autorizado e do vínculo.</p></section></div>
      <div className="ga-profile-stack"><section className="ga-profile-card"><h3>Avisos e preferências</h3><p>Os avisos de acompanhamento estão disponíveis no sino do cabeçalho. As preferências individuais de notificação ainda não são configuráveis.</p></section><section className="ga-profile-card" id="seguranca"><h3>Segurança da conta</h3><p>O acesso aos cadastros é condicionado às permissões da equipe. Utilize a opção de sair no cabeçalho para encerrar a sessão.</p><div className="ga-links"><Link href="/recuperar-senha">Alterar senha</Link></div></section></div>
    </div>{profile.perfil==="equipe_ubs"&&<section className="ga-profile-card" style={{marginTop:18}}><h3>Acessos rápidos do meu trabalho</h3><p>Retome suas tarefas sem voltar ao menu principal.</p><div className="ga-links"><Link href="/dashboard/gestantes">Minhas gestantes →</Link><Link href="/dashboard/atendimentos">Abrir agenda →</Link><Link href="/dashboard/importacoes">Importar PEC →</Link></div></section>}
  </>;
}
