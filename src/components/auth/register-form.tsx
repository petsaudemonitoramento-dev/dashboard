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
import { BirthDateField } from "@/components/auth/birth-date-field";
import {
  PROFILE_LABELS,
  PUBLIC_REQUESTABLE_PROFILES,
} from "@/lib/auth/roles";
import {
  BRAZILIAN_STATES,
  credentialForPosition,
  type ProfessionalPosition,
} from "@/lib/auth/professional-credentials";

type UbsOption = {
  id: string;
  nome: string;
};

export function RegisterForm({ ubsOptions }: { ubsOptions: UbsOption[] }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [requestedProfile, setRequestedProfile] = useState("");
  const [position, setPosition] = useState<ProfessionalPosition>("medico");
  const credential = credentialForPosition(position);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const form = new FormData(event.currentTarget);
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
          email: String(form.get("email") ?? ""),
          password,
          perfilSolicitado: String(form.get("perfilSolicitado") ?? ""),
          ubsId: String(form.get("ubsId") ?? ""),
          cargoFuncao: String(form.get("cargoFuncao") ?? ""),
          conselho: String(form.get("conselho") ?? ""),
          conselhoUf: String(form.get("conselhoUf") ?? ""),
          numeroRegistro: String(form.get("numeroRegistro") ?? ""),
          categoriaConselho: String(
            form.get("categoriaConselho") ?? ""
          ),
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Não foi possível criar a conta.");
      }

      setSuccess(true);
      setMessage(
        "Conta criada. Entre com seu e-mail e aguarde a aprovação da gestão."
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
              Preencha os dados profissionais. O acesso será liberado após
              aprovação da gestão.
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

            <div className="v20-field">
              <BirthDateField />
            </div>

            <div className="v20-field">
              <label htmlFor="perfilSolicitado">Perfil solicitado</label>
              <select
                id="perfilSolicitado"
                name="perfilSolicitado"
                onChange={(event) => setRequestedProfile(event.target.value)}
                required
                value={requestedProfile}
              >
                <option disabled value="">
                  Selecione
                </option>
                {PUBLIC_REQUESTABLE_PROFILES.map((profile) => (
                  <option key={profile} value={profile}>
                    {PROFILE_LABELS[profile]}
                  </option>
                ))}
              </select>
            </div>

            {requestedProfile === "equipe_ubs" && (
              <>
                <div className="v20-field">
                  <label htmlFor="cargoFuncao">Função profissional</label>
                  <select
                    id="cargoFuncao"
                    name="cargoFuncao"
                    onChange={(event) =>
                      setPosition(event.target.value as ProfessionalPosition)
                    }
                    value={position}
                  >
                    <option value="medico">Médico</option>
                    <option value="enfermeiro">Enfermeiro</option>
                  </select>
                </div>

                <div className="v20-field">
                  <label htmlFor="conselhoUf">UF do {credential.conselho}</label>
                  <select defaultValue="PB" id="conselhoUf" name="conselhoUf">
                    {BRAZILIAN_STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="v20-field v20-field-wide">
                  <label htmlFor="numeroRegistro">
                    Número do {credential.conselho}
                  </label>
                  <input
                    autoComplete="off"
                    id="numeroRegistro"
                    inputMode="numeric"
                    maxLength={20}
                    name="numeroRegistro"
                    placeholder="Somente o número do registro"
                    required
                  />
                  <input name="conselho" type="hidden" value={credential.conselho} />
                  <input
                    name="categoriaConselho"
                    type="hidden"
                    value={credential.categoria}
                  />
                </div>
              </>
            )}

            <div className="v20-field v20-field-wide">
              <label htmlFor="ubsId">UBS</label>
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
                  minLength={8}
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
                minLength={8}
                name="passwordConfirmation"
                required
                type="password"
              />
            </div>
          </div>

          {message && (
            <div className="v20-message v20-message-error">{message}</div>
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
