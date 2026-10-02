"use client";

import {
  CheckCircle2,
  LoaderCircle,
  PencilLine,
  UserRoundCheck,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { BirthDateField } from "@/components/auth/birth-date-field";

type UbsOption = {
  id: string;
  nome: string;
};

type Props = {
  email: string;
  suggestedName: string;
  ubsOptions: UbsOption[];
};

export function CompleteProfileForm({
  email,
  suggestedName,
  ubsOptions,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/perfil/completar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomeCompleto: String(form.get("nomeCompleto") ?? ""),
          dataNascimento: String(form.get("dataNascimento") ?? ""),
          perfilSolicitado: "equipe_ubs",
          ubsId: String(form.get("ubsId") ?? ""),
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Não foi possível completar o cadastro.");
      }

      window.location.href = "/aguardando-aprovacao";
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
              Antes de acessar o sistema, informe seu perfil e a UBS de
              vínculo.
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
              <label htmlFor="email">E-mail da conta Google</label>
              <input disabled id="email" value={email} />
            </div>

            <div className="v20-field">
              <BirthDateField />
            </div>

            <div className="v20-field">
              <label>Perfil</label>
              <input
                disabled
                value="Profissional da UBS"
                aria-label="Perfil Profissional da UBS"
              />
            </div>

            <div className="v20-field v20-field-wide">
              <label htmlFor="ubsId">UBS de vínculo</label>
              <select defaultValue={ubsOptions[0]?.id ?? ""} id="ubsId" name="ubsId" required>
                <option disabled value="">
                  Selecione a UBS
                </option>
                {ubsOptions.map((ubs) => (
                  <option key={ubs.id} value={ubs.id}>
                    {ubs.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="v20-message v20-message-success">
            <CheckCircle2 size={17} />
            Nada do sistema será exibido até o cadastro ser completado e
            aprovado pela gestão.
          </div>

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
              {loading ? "Salvando..." : "Enviar para aprovação"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
