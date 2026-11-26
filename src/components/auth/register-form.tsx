"use client";

import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "@/lib/validation/password-policy";

import Link from "next/link";
import { WORKSPACE_NOTICE } from "@/lib/validation/workspace-notice";
import { ResendConfirmation } from "@/components/auth/resend-confirmation";
import {
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  Mail,
  UserPlus,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { OTHER_UBS } from "@/lib/validation/ubs-choice";
import { ProfessionField } from "@/components/auth/profession-field";
import { BirthDateField } from "@/components/auth/birth-date-field";

type UbsOption = {
  id: string;
  nome: string;
};

export function RegisterForm({ ubsOptions, autonomous = false, optionalUbs = false, previewOtherUbs = false, selfService = false }: { ubsOptions: UbsOption[]; autonomous?: boolean; optionalUbs?: boolean; previewOtherUbs?: boolean; selfService?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

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
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("passwordConfirmation") ?? "");

    if (password !== confirmation) {
      setMessage("As senhas não coincidem.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/cadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomeCompleto: String(form.get("nomeCompleto") ?? ""),
          dataNascimento: String(form.get("dataNascimento") ?? ""),
          profissao: String(form.get("profissao") ?? ""),
          email: String(form.get("email") ?? ""),
          password,
          ubsId: String(form.get("ubsId") ?? ""),
          workspaceNoticeAccepted: form.get("workspaceNoticeAccepted") === "on",
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Não foi possível criar a conta.");
      }

      setRegisteredEmail(String(form.get("email") ?? "").trim());
      setSuccess(true);
      setMessage(
        selfService ? "Confira seu e-mail para confirmar a conta. Depois, entre diretamente no seu espaço individual, sem aprovação manual." : (autonomous || body.completeAfterConfirmation === true) ? "Confira seu e-mail (inclusive o spam) para confirmar o cadastro. Se necessário, solicite um novo link abaixo. Depois, entre para completar o cadastro e acessar a demonstração." : "Confira seu e-mail (inclusive o spam) para confirmar o cadastro. Após confirmar, entre para acessar a demonstração. Se necessário, solicite um novo link abaixo."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível criar a conta."
      );
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="v20-auth-page">
        <section className="v20-auth-card v20-status-card">
          <div className="v20-auth-icon">
            <CheckCircle2 size={27} />
          </div>
          <h1>Solicitação enviada</h1>
          <p>{message}</p>
          <div className="v20-form-actions v20-confirmation-actions">
            <Link className="v20-primary-button" href="/login">
              Ir para o login
            </Link>
            <ResendConfirmation email={registeredEmail} />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="v20-auth-page">
      <section className="v20-auth-card">
        <header>
          <div className="v20-auth-icon">
            <UserPlus size={26} />
          </div>
          <div>
            <h1>Criar conta</h1>
            <p>
              {selfService ? "Crie sua conta e confirme seu e-mail para acessar seu espaço individual." : autonomous ? "Crie sua conta e confirme seu e-mail. A demonstração é livre; dados reais exigem autorização." : "Preencha os dados profissionais. A demonstração está disponível após confirmar o e-mail; o acesso clínico exige autorização."}
            </p>
          </div>
        </header>

        <form onSubmit={submit}>
          <div className="v20-form-grid">
            <div className="v20-field v20-field-wide">
              <label htmlFor="nomeCompleto">Nome completo</label>
              <input
                autoComplete="name"
                id="nomeCompleto"
                name="nomeCompleto"
                placeholder="Digite seu nome completo"
                required
              />
            </div>

            {autonomous ? <ProfessionField /> : <>
              <div className="v20-field"><BirthDateField /></div>
              <div className="v20-field"><label>Perfil</label><input disabled value="Profissional da UBS" aria-label="Perfil Profissional da UBS" /></div>
            </>}

            <div className="v20-field v20-field-wide">
              <label htmlFor="ubsId">UBS</label>
              <select defaultValue="" id="ubsId" name="ubsId" required={!autonomous}>
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
              {(autonomous || optionalUbs || previewOtherUbs) && <small>Se sua UBS não estiver na lista, selecione Outra UBS. Não precisa informar o nome; o vínculo assistencial será verificado separadamente. {previewOtherUbs && !autonomous && !optionalUbs && "Nesta prévia, a opção ainda não permite concluir o cadastro."}</small>}
            </div>

            <div className="v20-field v20-field-wide">
              <label htmlFor="email">E-mail</label>
              <div className="v20-input-icon">
                <Mail size={17} />
                <input
                  autoComplete="email"
                  id="email"
                  name="email"
                  placeholder="seuemail@exemplo.com"
                  required
                  type="email"
                />
              </div>
            </div>

            <div className="v20-field">
              <label htmlFor="password">Senha</label>
              <div className="v20-input-icon">
                <LockKeyhole size={17} />
                <input
                  autoComplete="new-password"
                  id="password"
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  name="password"
                  placeholder="Mínimo de 8 caracteres"
                  required
                  type="password"
                />
              </div>
            </div>

            <div className="v20-field">
              <label htmlFor="passwordConfirmation">Confirmar senha</label>
              <input
                autoComplete="new-password"
                id="passwordConfirmation"
                minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                name="passwordConfirmation"
                required
                type="password"
              />
            </div>
          </div>

          {selfService && <div className="v20-field"><p>{WORKSPACE_NOTICE}</p><label><input type="checkbox" name="workspaceNoticeAccepted" required /> Li e compreendi as condições de uso.</label></div>}

          {message && (
            <div
              className="v20-message v20-message-error"
              role="alert"
              aria-live="assertive"
            >
              {message}
            </div>
          )}

          <div className="v20-form-actions">
            <Link className="v20-secondary-button" href="/login">
              Voltar
            </Link>

            <button
              className="v20-primary-button"
              disabled={loading}
              type="submit"
            >
              {loading ? (
                <LoaderCircle className="v20-spin" size={18} />
              ) : (
                <UserPlus size={18} />
              )}
              {loading ? "Criando..." : "Criar conta"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
