"use client";

import {
  CheckCircle2,
  LoaderCircle,
  PencilLine,
  UserRoundCheck,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { OTHER_UBS } from "@/lib/validation/ubs-choice";
import { ProfessionField } from "@/components/auth/profession-field";
import { WORKSPACE_NOTICE } from "@/lib/validation/workspace-notice";
import { DEMO_NOTICE } from "@/lib/validation/demo-onboarding";
import { BirthDateField } from "@/components/auth/birth-date-field";

type UbsOption = {
  id: string;
  nome: string;
};

type Props = {
  email: string;
  suggestedName: string;
  ubsOptions: UbsOption[];
  autonomous?: boolean;
  selfService?: boolean;
  optionalUbs?: boolean;
  previewOtherUbs?: boolean;
  suggestedProfession?: string;
  suggestedUbs?: string;
  suggestedBirthDate?: string;
};

export function CompleteProfileForm({
  email,
  suggestedName,
  ubsOptions,
  autonomous = false,
  selfService = false,
  optionalUbs = false,
  previewOtherUbs = false,
  suggestedProfession = "",
  suggestedUbs = "",
  suggestedBirthDate = "",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    if (form.get("ubsId") === OTHER_UBS && previewOtherUbs && !autonomous && !optionalUbs) {
      setMessage("A opção Outra UBS está disponível para avaliação visual nesta prévia. A gravação sem UBS ainda não foi liberada.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/perfil/completar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomeCompleto: String(form.get("nomeCompleto") ?? ""),
          dataNascimento: String(form.get("dataNascimento") ?? ""),
          profissao: String(form.get("profissao") ?? ""),
          demoNoticeAccepted: form.get("demoNoticeAccepted") === "on",
          workspaceNoticeAccepted: form.get("workspaceNoticeAccepted") === "on",
          ubsId: String(form.get("ubsId") ?? ""),
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Não foi possível completar o cadastro.");
      }

      window.location.href = selfService ? "/dashboard?entrada=1" : autonomous ? "/demonstracao" : "/aguardando-aprovacao";
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível completar o cadastro."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="v20-auth-page">
      <section className="v20-auth-card">
        <header>
          <div className="v20-auth-icon">
            <UserRoundCheck size={27} />
          </div>
          <div>
            <h1>Complete seu cadastro</h1>
            <p>
              {selfService ? "Confira os dados já informados e acesse seu espaço individual." : autonomous ? "Informe sua profissão. A UBS é opcional." : "Antes de acessar o sistema, informe seu perfil e a UBS de vínculo."}
            </p>
          </div>
        </header>

        <form onSubmit={submit}>
          <div className="v20-form-grid">
            <div className="v20-field v20-field-wide">
              <label htmlFor="nomeCompleto">
                Nome completo
                <PencilLine aria-hidden="true" size={13} />
              </label>
              <input
                defaultValue={suggestedName}
                id="nomeCompleto"
                name="nomeCompleto"
                required
              />
            </div>

            <div className="v20-field v20-field-wide">
              <label htmlFor="email">E-mail da conta</label>
              <input disabled id="email" value={email} />
            </div>

            {autonomous ? <ProfessionField initial={suggestedProfession} /> : <>
              <div className="v20-field"><BirthDateField defaultValue={suggestedBirthDate} /></div>
              <div className="v20-field"><label>Perfil</label><input disabled value="Profissional da UBS" aria-label="Perfil Profissional da UBS" /></div>
            </>}

            <div className="v20-field v20-field-wide">
              <label htmlFor="ubsId">UBS de vínculo</label>
              <select defaultValue={ubsOptions.some(u => u.id === suggestedUbs) || (optionalUbs && suggestedUbs === OTHER_UBS) ? suggestedUbs : ""} id="ubsId" name="ubsId" required={!autonomous}>
                <option disabled={!autonomous} value="">
                  {autonomous ? "Não informar (opcional)" : "Selecione a UBS"}
                </option>
                {ubsOptions.map((ubs) => (
                  <option key={ubs.id} value={ubs.id}>
                    {ubs.nome}
                  </option>
                ))}
                {(autonomous || optionalUbs || previewOtherUbs) && <option value={OTHER_UBS}>Outra UBS / unidade não cadastrada</option>}
              </select>
              {(autonomous || optionalUbs || previewOtherUbs) && <small>{selfService ? "Se sua UBS não estiver na lista, selecione Outra UBS. Seu espaço individual será criado sem vincular uma unidade real." : "Se sua UBS não estiver na lista, selecione Outra UBS. Não precisa informar o nome; o vínculo assistencial será verificado separadamente."} {previewOtherUbs && !autonomous && !optionalUbs && "Nesta prévia, a opção ainda não permite concluir o cadastro."}</small>}
            </div>
          </div>

          <div className="v20-message v20-message-success">
            <CheckCircle2 size={17} />
            {selfService ? WORKSPACE_NOTICE : autonomous ? DEMO_NOTICE : "A demonstração fica disponível após completar o cadastro. Dados clínicos exigem autorização."}
          </div>

          {selfService && <label className="v20-field"><span><input type="checkbox" name="workspaceNoticeAccepted" required /> Li e compreendi as condições de uso.</span></label>}
          {autonomous && <label className="v20-field"><span><input type="checkbox" name="demoNoticeAccepted" required /> Li e compreendi as condições de uso da demonstração.</span></label>}

          {message && (
            <div className="v20-message v20-message-error">{message}</div>
          )}

          <div className="v20-form-actions">
            <span />
            <button
              className="v20-primary-button"
              disabled={loading}
              type="submit"
            >
              {loading ? (
                <LoaderCircle className="v20-spin" size={18} />
              ) : (
                <UserRoundCheck size={18} />
              )}
              {loading ? "Salvando..." : autonomous ? "Acessar demonstração" : "Concluir cadastro"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
