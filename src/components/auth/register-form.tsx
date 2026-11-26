"use client";

import Link from "next/link";
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

export function RegisterForm({ ubsOptions, autonomous = false, optionalUbs = false, previewOtherUbs = false }: { ubsOptions: UbsOption[]; autonomous?: boolean; optionalUbs?: boolean; previewOtherUbs?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Não foi possível criar a conta.");
      }

      setSuccess(true);
      setMessage(
        autonomous ? "Se o cadastro puder ser concluído, enviaremos a confirmação por e-mail. Depois, entre para completar o cadastro e acessar a demonstração." : "Se o cadastro puder ser concluído, enviaremos a confirmação por e-mail. Após confirmar, entre para acessar a demonstração."
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
          <div className="v20-form-actions">
            <Link className="v20-primary-button" href="/login">
              Ir para o login
            </Link>
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
              {autonomous ? "Crie sua conta e confirme seu e-mail. A demonstração é livre; dados reais exigem autorização." : "Preencha os dados profissionais. A demonstração está disponível após confirmar o e-mail; o acesso clínico exige autorização."}
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
                  minLength={10}
                  name="password"
                  placeholder="Mínimo de 10 caracteres"
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
                minLength={10}
                name="passwordConfirmation"
                required
                type="password"
              />
            </div>
          </div>

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
