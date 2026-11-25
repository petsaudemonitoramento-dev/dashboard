import Link from "next/link";

export function ClinicalAccessError({ title }: { title: string }) {
  return <>
    <section className="heading">
      <p>GESTÁRIO APS · ACOMPANHAMENTO</p>
      <h1>{title}</h1>
    </section>
    <div className="pec-error" role="alert">
      <p>Não foi possível abrir esta ficha. Verifique se o registro está ativo e autorizado para sua conta. Se o problema persistir, procure o suporte.</p>
      <Link href="/dashboard/gestantes" className="pec-secondary-button">Voltar para Minhas gestantes</Link>
    </div>
  </>;
}
